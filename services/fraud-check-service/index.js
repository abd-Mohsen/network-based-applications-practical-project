import express from "express";

const PORT = process.env.PORT || 3002;

let down = false;
let latencyMs = 0;
const metrics = { requests: 0, forcedFailures: 0, approved: 0, declined: 0 };

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const app = express();
app.use(express.json());

// This is the sync, request/response edge of the system (lecture p.8): the
// caller (payment-service) waits on this, so it's also the target for the
// circuit breaker experiment. Chaos toggles below simulate it going down or
// going slow.
app.post("/check", async (req, res) => {
  metrics.requests++;
  if (latencyMs > 0) await sleep(latencyMs);
  if (down) {
    metrics.forcedFailures++;
    return res.status(503).json({ error: "fraud-check-service unavailable" });
  }
  await sleep(30 + Math.random() * 70);
  const approved = Math.random() > 0.05; // 5% organic decline, independent of chaos
  if (approved) metrics.approved++;
  else metrics.declined++;
  res.json({ approved });
});

app.post("/chaos/kill", (req, res) => {
  down = true;
  console.log("[fraud-check-service] chaos: killed");
  res.json({ down });
});

app.post("/chaos/restore", (req, res) => {
  down = false;
  latencyMs = 0;
  console.log("[fraud-check-service] chaos: restored");
  res.json({ down, latencyMs });
});

app.post("/chaos/latency", (req, res) => {
  latencyMs = Number(req.body?.ms) || 0;
  console.log(`[fraud-check-service] chaos: latency set to ${latencyMs}ms`);
  res.json({ latencyMs });
});

app.get("/metrics", (req, res) => res.json({ ...metrics, down, latencyMs }));
app.get("/health", (req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => console.log(`[fraud-check-service] listening on ${PORT}`));
