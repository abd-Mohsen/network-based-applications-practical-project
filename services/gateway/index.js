import express from "express";
import jwt from "jsonwebtoken";
import { createProxyMiddleware } from "http-proxy-middleware";

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const TRIP_SERVICE_URL = process.env.TRIP_SERVICE_URL || "http://localhost:3001";

const metrics = { tokensIssued: 0, requestsProxied: 0, authFailures: 0, rateLimited: 0 };

const app = express();

// OAuth2/OIDC-style token issuance (lecture p.13), simplified for the lab:
// any client gets a signed JWT scoped to trips:write.
app.post("/auth/token", express.json(), (req, res) => {
  const clientId = req.body?.clientId || "demo-client";
  const token = jwt.sign({ clientId, scope: "trips:write" }, JWT_SECRET, { expiresIn: "1h" });
  metrics.tokensIssued++;
  res.json({ token, expiresIn: 3600 });
});

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    metrics.authFailures++;
    return res.status(401).json({ error: "missing bearer token" });
  }
  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    metrics.authFailures++;
    res.status(401).json({ error: "invalid or expired token" });
  }
}

// Fixed-window rate limiter per client -- the gateway's other job besides auth.
const WINDOW_MS = 10000;
const MAX_PER_WINDOW = 30;
const buckets = new Map();
function rateLimit(req, res, next) {
  const key = req.auth?.clientId || req.ip;
  const now = Date.now();
  const bucket = buckets.get(key) || { count: 0, resetAt: now + WINDOW_MS };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + WINDOW_MS;
  }
  bucket.count++;
  buckets.set(key, bucket);
  if (bucket.count > MAX_PER_WINDOW) {
    metrics.rateLimited++;
    return res.status(429).json({ error: "rate limit exceeded" });
  }
  next();
}

// Note: no express.json() ahead of the proxy route on purpose -- parsing the
// body here would consume the stream and break the forwarded POST.
app.use(
  "/trips",
  requireAuth,
  rateLimit,
  (req, res, next) => {
    metrics.requestsProxied++;
    next();
  },
  createProxyMiddleware({
    target: TRIP_SERVICE_URL,
    changeOrigin: true,
    // Express's app.use("/trips", ...) already strips "/trips" from req.url
    // before this middleware sees it, so the rewrite target is "/", not
    // "/trips" -- e.g. POST /trips arrives here as "/", GET /trips/abc as "/abc".
    pathRewrite: { "^/": "/v1/trips/" },
  })
);

app.get("/metrics", (req, res) => res.json(metrics));
app.get("/health", (req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => console.log(`[gateway] listening on ${PORT}`));
