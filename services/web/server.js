import express from "express";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
import { trace } from "@opentelemetry/api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;

const GATEWAY_URL = process.env.GATEWAY_URL || "http://edge:80";
const TRIP_SERVICE_URL = process.env.TRIP_SERVICE_URL || "http://trip-service:3001";
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || "http://payment-service:3003";
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || "http://notification-service:3004";
const FRAUD_CHECK_URL = process.env.FRAUD_CHECK_URL || "http://fraud-check-service:3002";
const MONITOR_URL = process.env.MONITOR_URL || "http://monitor:4000";

// --- gateway token (BFF-side auth, see README) ------------------------------
// Writes initiated from the GUI go through the gateway with this token, so
// the JWT-auth-and-rate-limit path is genuinely exercised by real usage, not
// just curl. The browser never sees it.
let cachedToken = null;
let tokenExpiresAt = 0;
async function getToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) return cachedToken;
  const res = await fetch(`${GATEWAY_URL}/auth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId: "web-bff" }),
  });
  const data = await res.json();
  cachedToken = data.token;
  tokenExpiresAt = Date.now() + data.expiresIn * 1000;
  return cachedToken;
}

// --- internal poll loop: builds the snapshot every page reads live ---------
// Reads go direct to trip-service (server-to-server, same pattern `monitor`
// already uses) -- only user-initiated writes go through the gateway.
let snapshot = { updatedAt: null, trips: [], outbox: [], processedEvents: [], metrics: {}, queues: {} };
const timelineCache = new Map(); // tripId -> { payment, notification }

function isSettled(entry) {
  if (!entry) return false;
  const { payment, notification } = entry;
  if (!payment || payment.approved === null || payment.approved === undefined) return false;
  if (payment.approved === false) return true; // declined -> nothing more will ever happen
  return Boolean(notification); // approved -> only settled once the webhook landed
}

async function resolveTimeline(tripId) {
  const existing = timelineCache.get(tripId);
  if (isSettled(existing)) return existing;

  const entry = { payment: existing?.payment ?? null, notification: existing?.notification ?? null };
  try {
    const r = await fetch(`${PAYMENT_SERVICE_URL}/payments/trip/${tripId}`, { signal: AbortSignal.timeout(1500) });
    if (r.ok) entry.payment = await r.json();
  } catch {
    // leave as-is, try again next tick
  }
  if (entry.payment?.approved) {
    try {
      const r = await fetch(`${NOTIFICATION_SERVICE_URL}/webhook/trip/${tripId}`, { signal: AbortSignal.timeout(1500) });
      if (r.ok) entry.notification = await r.json();
    } catch {
      // leave as-is, try again next tick
    }
  }
  timelineCache.set(tripId, entry);
  return entry;
}

async function pollOnce() {
  let trips = [];
  try {
    const res = await fetch(`${TRIP_SERVICE_URL}/v1/trips`, { signal: AbortSignal.timeout(2000) });
    trips = await res.json();
  } catch (err) {
    console.error("[web] trip-service poll failed:", err.message);
  }

  let outbox = [];
  try {
    const res = await fetch(`${TRIP_SERVICE_URL}/v1/outbox`, { signal: AbortSignal.timeout(2000) });
    outbox = await res.json();
  } catch (err) {
    console.error("[web] trip-service outbox poll failed:", err.message);
  }

  let processedEvents = [];
  try {
    const res = await fetch(`${PAYMENT_SERVICE_URL}/v1/processed-events`, { signal: AbortSignal.timeout(2000) });
    processedEvents = await res.json();
  } catch (err) {
    console.error("[web] payment-service processed-events poll failed:", err.message);
  }

  const completed = trips.filter((t) => t.status === "completed");
  await Promise.all(completed.map((t) => resolveTimeline(t.id)));

  let metricsSnapshot = { services: {}, queues: {} };
  try {
    const res = await fetch(`${MONITOR_URL}/data`, { signal: AbortSignal.timeout(2000) });
    metricsSnapshot = await res.json();
  } catch (err) {
    console.error("[web] monitor poll failed:", err.message);
  }

  snapshot = {
    updatedAt: new Date().toISOString(),
    trips: trips.map((t) => ({ ...t, timeline: timelineCache.get(t.id) || { payment: null, notification: null } })),
    outbox,
    processedEvents,
    metrics: metricsSnapshot.services || {},
    queues: metricsSnapshot.queues || {},
  };
  broadcast();
}
setInterval(pollOnce, 1000);
pollOnce();

// --- SSE: one shared stream, every connected page reads the slice it needs -
const sseClients = new Set();
function broadcast() {
  const payload = `data: ${JSON.stringify(snapshot)}\n\n`;
  for (const res of sseClients) res.write(payload);
}

const app = express();
app.use(express.json());

// Surfaces the OTel trace id for every request on this BFF as a response
// header -- the browser is where the trace starts for any user-initiated
// write, so this is the one place that needs to read it. Paste the value
// into Jaeger's search (service "web") to see the full cross-service trace.
app.use((req, res, next) => {
  const span = trace.getActiveSpan();
  if (span) res.setHeader("X-Trace-Id", span.spanContext().traceId);
  next();
});

app.get("/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

// --- rider/driver writes -- through the edge (Nginx) + gateway -------------
// Each browser tab now holds its OWN JWT (see app.js's token panel, fetched
// via /api/auth/token below and editable in the UI) and sends it as a normal
// Authorization header on every write. This function is a pure pass-through
// for that header -- it does NOT substitute the BFF's own service token --
// so editing/breaking the token in the browser genuinely changes what the
// gateway sees and genuinely gets that request rejected. getToken() (the
// BFF's own cached service token) is still used, but only by the
// control-room/chaos endpoints further down, which have no per-user token.
async function proxyToGateway(req, res, method, gatewayPath) {
  try {
    const authHeader = req.headers.authorization;
    const userId = req.body?.riderId || req.body?.driverId;
    const r = await fetch(`${GATEWAY_URL}${gatewayPath}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(authHeader ? { authorization: authHeader } : {}),
        ...(userId ? { "x-user-id": userId } : {}),
      },
      body: method === "GET" ? undefined : JSON.stringify(req.body || {}),
    });
    const contentType = r.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      // Edge (Nginx) or gateway is down/unreachable and returned its own
      // HTML error page instead of JSON -- surface that plainly rather than
      // forwarding an empty body.
      return res.status(r.status || 502).json({
        error: `gateway unreachable (HTTP ${r.status}) -- the API gateway or its edge proxy may be down`,
      });
    }
    const data = await r.json().catch(() => ({}));
    res.status(r.status).json(data);
  } catch (err) {
    res.status(502).json({ error: `upstream call failed: ${err.message}` });
  }
}

// Issues a fresh per-user JWT on demand -- backs the token panel's "New
// token" button and the one-time fetch when a browser has none yet. Goes
// through the gateway like everything else (this route isn't rate-limited
// there, same as the BFF's own token fetch above).
app.post("/api/auth/token", async (req, res) => {
  try {
    const r = await fetch(`${GATEWAY_URL}/auth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: req.body?.clientId || "demo-client" }),
    });
    const data = await r.json().catch(() => ({}));
    res.status(r.status).json(data);
  } catch (err) {
    res.status(502).json({ error: `token service unreachable: ${err.message}` });
  }
});

app.post("/api/trips", (req, res) => proxyToGateway(req, res, "POST", "/trips"));
app.post("/api/trips/:id/accept", (req, res) => proxyToGateway(req, res, "POST", `/trips/${req.params.id}/accept`));
app.post("/api/trips/:id/complete", (req, res) => proxyToGateway(req, res, "POST", `/trips/${req.params.id}/complete`));
app.post("/api/trips/:id/cancel", (req, res) => proxyToGateway(req, res, "POST", `/trips/${req.params.id}/cancel`));

// --- control room -- mirrors chaos/chaos.js over HTTP -----------------------
const chaosTargets = {
  payment: PAYMENT_SERVICE_URL,
  notification: NOTIFICATION_SERVICE_URL,
};

// --- gateway stop/start -- real container control, not a software toggle --
// Every other chaos action above makes a service misbehave while it keeps
// running. This one is different on purpose: to show Nginx's own 502/504 at
// the edge (not a JSON error proxied through it), the gateway container has
// to actually stop being reachable. That means talking to the Docker Engine
// API over the socket mounted into this container (see docker-compose.yml)
// -- no "docker" CLI binary needed, just plain HTTP over a Unix socket.
function dockerRequest(method, apiPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath: "/var/run/docker.sock", path: apiPath, method }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

// Looked up by the compose-assigned label rather than a guessed container
// name, so this works regardless of the compose project name.
async function findGatewayContainerId() {
  const filters = encodeURIComponent(JSON.stringify({ label: ["com.docker.compose.service=gateway"] }));
  const { status, body } = await dockerRequest("GET", `/containers/json?all=1&filters=${filters}`);
  if (status !== 200) throw new Error(`docker API error ${status}: ${body}`);
  const containers = JSON.parse(body);
  if (!containers.length) throw new Error('no container found for compose service "gateway"');
  return containers[0].Id;
}

app.post("/api/chaos/stop-gateway", async (req, res) => {
  try {
    const id = await findGatewayContainerId();
    const { status, body } = await dockerRequest("POST", `/containers/${id}/stop?t=0`);
    if (status >= 400 && status !== 304) return res.status(502).json({ error: `docker stop failed (${status}): ${body}` });
    res.json({ gateway: "stopped" });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post("/api/chaos/start-gateway", async (req, res) => {
  try {
    const id = await findGatewayContainerId();
    const { status, body } = await dockerRequest("POST", `/containers/${id}/start`);
    if (status >= 400 && status !== 304) return res.status(502).json({ error: `docker start failed (${status}): ${body}` });
    res.json({ gateway: "started" });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post("/api/chaos/pause-consumer/:svc", async (req, res) => {
  const base = chaosTargets[req.params.svc];
  if (!base) return res.status(400).json({ error: "unknown service" });
  const r = await fetch(`${base}/chaos/pause-consumer`, { method: "POST" });
  res.status(r.status).json(await r.json());
});

app.post("/api/chaos/resume-consumer/:svc", async (req, res) => {
  const base = chaosTargets[req.params.svc];
  if (!base) return res.status(400).json({ error: "unknown service" });
  const r = await fetch(`${base}/chaos/resume-consumer`, { method: "POST" });
  res.status(r.status).json(await r.json());
});

app.post("/api/chaos/duplicate-next", async (req, res) => {
  const r = await fetch(`${TRIP_SERVICE_URL}/chaos/duplicate-next`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ n: Number(req.body?.n) || 0 }),
  });
  res.status(r.status).json(await r.json());
});

app.post("/api/chaos/kill-fraud", async (req, res) => {
  const r = await fetch(`${FRAUD_CHECK_URL}/chaos/kill`, { method: "POST" });
  res.status(r.status).json(await r.json());
});

app.post("/api/chaos/restore-fraud", async (req, res) => {
  const r = await fetch(`${FRAUD_CHECK_URL}/chaos/restore`, { method: "POST" });
  res.status(r.status).json(await r.json());
});

app.post("/api/chaos/latency-fraud", async (req, res) => {
  const r = await fetch(`${FRAUD_CHECK_URL}/chaos/latency`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ms: Number(req.body?.ms) || 0 }),
  });
  res.status(r.status).json(await r.json());
});

// Wipes all "test data" -- every row in trip-service's trips/outbox,
// payment-service's processed_events, plus notification-service's
// in-memory webhook log -- and drops this BFF's own per-trip timeline
// cache so nothing stale lingers. Backs the table page's delete button.
app.post("/api/test-data/clear", async (req, res) => {
  try {
    const [trip, payment, notification] = await Promise.all([
      fetch(`${TRIP_SERVICE_URL}/admin/reset`, { method: "POST" }).then((r) => r.json()),
      fetch(`${PAYMENT_SERVICE_URL}/admin/reset`, { method: "POST" }).then((r) => r.json()),
      fetch(`${NOTIFICATION_SERVICE_URL}/admin/reset`, { method: "POST" }).then((r) => r.json()),
    ]);
    timelineCache.clear();
    await pollOnce();
    res.json({ trip, payment, notification });
  } catch (err) {
    res.status(502).json({ error: `clearing test data failed: ${err.message}` });
  }
});

app.post("/api/chaos/generate-trips", async (req, res) => {
  const n = Number(req.body?.n) || 10;
  const token = await getToken();
  const statuses = [];
  for (let i = 0; i < n; i++) {
    const r = await fetch(`${GATEWAY_URL}/trips`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        origin: `origin-${i}`,
        destination: `dest-${i}`,
        fare: Math.round(10 + Math.random() * 40),
        autoComplete: true,
      }),
    });
    statuses.push(r.status);
  }
  res.json({ created: statuses.filter((s) => s === 201).length, statuses });
});

// --- pages -------------------------------------------------------------------
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "rider.html")));
app.get("/driver", (req, res) => res.sendFile(path.join(__dirname, "public", "driver.html")));
app.get("/dashboard", (req, res) => res.sendFile(path.join(__dirname, "public", "dashboard.html")));
app.get("/table", (req, res) => res.sendFile(path.join(__dirname, "public", "table.html")));
app.get("/control", (req, res) => res.sendFile(path.join(__dirname, "public", "control.html")));
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => console.log(`[web] listening on ${PORT}`));
