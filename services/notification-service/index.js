import express from "express";
import amqp from "amqplib";
import crypto from "crypto";

const PORT = process.env.PORT || 3004;
const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "dev-secret";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function sign(rawBody) {
  return crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");
}

const metrics = {
  consumed: 0,
  webhooksSent: 0,
  webhookSendFailures: 0,
  webhooksReceived: 0,
  webhookSignatureFailures: 0,
  consumerPaused: false,
};
const webhookLog = [];

let channel = null;
let consumerTag = null;

async function handleMessage(msg) {
  if (!msg) return;
  metrics.consumed++;
  const event = JSON.parse(msg.content.toString());

  // Webhook pattern (lecture p.9): the server (us) initiates the push; the
  // receiver trusts it only because the payload is signed.
  const rawBody = JSON.stringify({
    tripId: event.tripId,
    fare: event.fare,
    message: "Trip paid",
  });
  try {
    const res = await fetch(`http://localhost:${PORT}/mock/driver-webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-signature": sign(rawBody) },
      body: rawBody,
    });
    if (res.ok) metrics.webhooksSent++;
    else metrics.webhookSendFailures++;
  } catch (err) {
    metrics.webhookSendFailures++;
    console.error("[notification-service] webhook send failed:", err.message);
  }
  channel.ack(msg);
}

async function startConsuming() {
  const { consumerTag: tag } = await channel.consume("payment.completed", handleMessage);
  consumerTag = tag;
  metrics.consumerPaused = false;
}

async function connectMQ() {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const conn = await amqp.connect(RABBITMQ_URL);
      channel = await conn.createChannel();
      await channel.assertQueue("payment.completed", { durable: true });
      console.log("[notification-service] connected to RabbitMQ");
      await startConsuming();
      conn.on("close", () => {
        console.error("[notification-service] RabbitMQ connection closed, reconnecting...");
        channel = null;
        consumerTag = null;
        setTimeout(connectMQ, 2000);
      });
      return;
    } catch (err) {
      console.log(`[notification-service] RabbitMQ not ready (${err.message}), retrying...`);
      await sleep(2000);
    }
  }
  console.error("[notification-service] giving up on RabbitMQ after 30 attempts");
}
connectMQ();

const app = express();
app.use(express.json());

// Stands in for the "driver app" -- a separate party that only trusts the
// webhook because the signature checks out.
app.post("/mock/driver-webhook", (req, res) => {
  const signature = req.headers["x-signature"];
  const raw = JSON.stringify(req.body);
  if (signature !== sign(raw)) {
    metrics.webhookSignatureFailures++;
    return res.status(401).json({ error: "bad signature" });
  }
  webhookLog.unshift({ ...req.body, receivedAt: new Date().toISOString() });
  if (webhookLog.length > 50) webhookLog.pop();
  metrics.webhooksReceived++;
  res.json({ ok: true });
});

app.get("/webhook/log", (req, res) => res.json(webhookLog));

// Per-trip lookup -- the other half (with payment-service's /payments/trip/:id)
// of the rider timeline the web BFF assembles.
app.get("/webhook/trip/:tripId", (req, res) => {
  const entry = webhookLog.find((w) => w.tripId === req.params.tripId);
  if (!entry) return res.status(404).json({ error: "no webhook recorded for this trip yet" });
  res.json(entry);
});

app.post("/chaos/pause-consumer", async (req, res) => {
  if (channel && consumerTag) {
    await channel.cancel(consumerTag);
    consumerTag = null;
    metrics.consumerPaused = true;
  }
  res.json({ paused: metrics.consumerPaused });
});

app.post("/chaos/resume-consumer", async (req, res) => {
  if (channel && !consumerTag) await startConsuming();
  res.json({ paused: metrics.consumerPaused });
});

// Clears the in-memory webhook log -- backs the web table page's "delete
// all test data" button, so old trips' webhook records don't linger once
// the trips themselves are gone. Dev/demo-only: no auth, same trust level
// as /chaos/*.
app.post("/admin/reset", (req, res) => {
  const webhookLogCleared = webhookLog.length;
  webhookLog.length = 0;
  res.json({ webhookLogCleared });
});

app.get("/metrics", (req, res) => res.json(metrics));
app.get("/health", (req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => console.log(`[notification-service] listening on ${PORT}`));
