import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;

const GATEWAY_URL = process.env.GATEWAY_URL || "http://gateway:3000";
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
let snapshot = { updatedAt: null, trips: [], metrics: {}, queues: {} };
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

// --- rider/driver writes -- through the gateway -----------------------------
async function proxyToGateway(req, res, method, gatewayPath) {
  try {
    const token = await getToken();
    const r = await fetch(`${GATEWAY_URL}${gatewayPath}`, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: method === "GET" ? undefined : JSON.stringify(req.body || {}),
    });
    const data = await r.json().catch(() => ({}));
    res.status(r.status).json(data);
  } catch (err) {
    res.status(502).json({ error: `upstream call failed: ${err.message}` });
  }
}

app.post("/api/trips", (req, res) => proxyToGateway(req, res, "POST", "/trips"));
app.post("/api/trips/:id/accept", (req, res) => proxyToGateway(req, res, "POST", `/trips/${req.params.id}/accept`));
app.post("/api/trips/:id/complete", (req, res) => proxyToGateway(req, res, "POST", `/trips/${req.params.id}/complete`));

// --- control room -- mirrors chaos/chaos.js over HTTP -----------------------
const chaosTargets = {
  payment: PAYMENT_SERVICE_URL,
  notification: NOTIFICATION_SERVICE_URL,
};

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
app.get("/control", (req, res) => res.sendFile(path.join(__dirname, "public", "control.html")));
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => console.log(`[web] listening on ${PORT}`));
