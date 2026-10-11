import express from "express";
import amqp from "amqplib";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import fs from "fs";

const PORT = process.env.PORT || 3003;
const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost";
const FRAUD_CHECK_URL = process.env.FRAUD_CHECK_URL || "http://localhost:3002";
const IDEMPOTENCY_ENABLED = (process.env.IDEMPOTENCY_ENABLED ?? "true") === "true";

fs.mkdirSync("./data", { recursive: true });
const db = new Database("./data/payment-service.sqlite");
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS processed_events (
    event_id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL,
    approved INTEGER,
    processed_at TEXT NOT NULL
  );
`);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const metrics = {
  consumed: 0,
  duplicatesDetected: 0,
  processed: 0,
  declined: 0,
  failuresToDlq: 0,
  fraudCallFailures: 0,
  breakerOpens: 0,
  breakerShortCircuits: 0,
  consumerPaused: false,
  idempotencyEnabled: IDEMPOTENCY_ENABLED,
};

// --- hand-rolled circuit breaker (lecture p.14) ---------------------------
const FAILURE_THRESHOLD = 5;
const COOLDOWN_MS = 10000;
const breaker = { state: "closed", consecutiveFailures: 0, openedAt: 0 };

function breakerAllow() {
  if (breaker.state === "open") {
    if (Date.now() - breaker.openedAt > COOLDOWN_MS) {
      breaker.state = "half-open";
      return true;
    }
    return false;
  }
  return true;
}
function breakerSuccess() {
  breaker.consecutiveFailures = 0;
  breaker.state = "closed";
}
function breakerFailure() {
  breaker.consecutiveFailures++;
  // Concurrent consumers (prefetch > 1) can land a failure here after the
  // breaker is already open -- that shouldn't count as a new "open" event or
  // push the cooldown window back out, so only the actual transition does.
  const transitioningToOpen =
    breaker.state === "half-open" ||
    (breaker.state === "closed" && breaker.consecutiveFailures >= FAILURE_THRESHOLD);
  if (transitioningToOpen) {
    breaker.state = "open";
    breaker.openedAt = Date.now();
    metrics.breakerOpens++;
  }
}

// --- sync fraud-check call with retry + exponential backoff ---------------
async function checkFraud(tripId, fare) {
  if (!breakerAllow()) {
    metrics.breakerShortCircuits++;
    throw new Error("circuit open: skipping call to fraud-check-service");
  }
  const delays = [200, 400, 800];
  let lastErr;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const res = await fetch(`${FRAUD_CHECK_URL}/check`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tripId, fare }),
        signal: AbortSignal.timeout(1500),
      });
      if (!res.ok) throw new Error(`fraud-check-service responded ${res.status}`);
      const data = await res.json();
      breakerSuccess();
      return data;
    } catch (err) {
      lastErr = err;
      metrics.fraudCallFailures++;
      if (attempt < delays.length) await sleep(delays[attempt]);
    }
  }
  breakerFailure();
  throw lastErr;
}

// --- RabbitMQ: consumer side of the async spine + the sync fraud edge -----
let channel = null;
let consumerTag = null;

async function handleMessage(msg) {
  if (!msg) return;
  metrics.consumed++;

  let event;
  try {
    event = JSON.parse(msg.content.toString());
  } catch {
    channel.nack(msg, false, false); // malformed -> DLQ, not worth retrying
    return;
  }
  const { eventId, tripId, fare } = event;

  // Claim the event_id atomically *before* any `await` below. With
  // prefetch > 1, a duplicate delivery can be picked up concurrently with
  // the original -- checking "has this been processed?" with a SELECT and
  // only recording it after the (async) fraud check leaves a race window
  // where both copies pass the check before either writes its claim. A
  // synchronous INSERT OR IGNORE, with no `await` between the check and the
  // write, closes that window: SQLite's primary-key uniqueness constraint
  // settles the race even if both deliveries reach this line in the same
  // tick of the event loop.
  let claimed = false;
  if (IDEMPOTENCY_ENABLED) {
    const info = db
      .prepare("INSERT OR IGNORE INTO processed_events (event_id, trip_id, processed_at) VALUES (?,?,?)")
      .run(eventId, tripId, new Date().toISOString());
    if (info.changes === 0) {
      metrics.duplicatesDetected++;
      channel.ack(msg);
      return;
    }
    claimed = true;
  }

  try {
    const result = await checkFraud(tripId, fare);
    if (claimed) {
      db.prepare("UPDATE processed_events SET approved = ? WHERE event_id = ?").run(
        result.approved ? 1 : 0,
        eventId
      );
    }
    if (result.approved) {
      channel.sendToQueue(
        "payment.completed",
        Buffer.from(
          JSON.stringify({ eventId: randomUUID(), tripId, fare, occurredAt: new Date().toISOString() })
        ),
        { persistent: true }
      );
      metrics.processed++;
    } else {
      metrics.declined++;
    }
    channel.ack(msg);
  } catch (err) {
    // The event never actually completed, so release the claim -- otherwise
    // a legitimate reprocessing of this message from the DLQ would be
    // wrongly treated as a duplicate of a payment that never happened.
    if (claimed) db.prepare("DELETE FROM processed_events WHERE event_id = ?").run(eventId);
    metrics.failuresToDlq++;
    console.error(`[payment-service] giving up on trip ${tripId}, routing to DLQ:`, err.message);
    channel.nack(msg, false, false); // requeue=false -> dead-lettered (queue has x-dead-letter-exchange)
  }
}

async function startConsuming() {
  const { consumerTag: tag } = await channel.consume("trip.completed", handleMessage);
  consumerTag = tag;
  metrics.consumerPaused = false;
}

// See trip-service/index.js for why these arguments must match exactly.
async function connectMQ() {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const conn = await amqp.connect(RABBITMQ_URL);
      channel = await conn.createChannel();
      await channel.prefetch(5);
      await channel.assertExchange("dlx", "fanout", { durable: true });
      await channel.assertQueue("trip.completed.dlq", { durable: true });
      await channel.bindQueue("trip.completed.dlq", "dlx", "");
      await channel.assertQueue("trip.completed", {
        durable: true,
        arguments: { "x-dead-letter-exchange": "dlx" },
      });
      await channel.assertQueue("payment.completed", { durable: true });
      console.log("[payment-service] connected to RabbitMQ");
      await startConsuming();
      conn.on("close", () => {
        console.error("[payment-service] RabbitMQ connection closed, reconnecting...");
        channel = null;
        consumerTag = null;
        setTimeout(connectMQ, 2000);
      });
      return;
    } catch (err) {
      console.log(`[payment-service] RabbitMQ not ready (${err.message}), retrying...`);
      await sleep(2000);
    }
  }
  console.error("[payment-service] giving up on RabbitMQ after 30 attempts");
}
connectMQ();

const app = express();
app.use(express.json());

app.post("/chaos/pause-consumer", async (req, res) => {
  if (channel && consumerTag) {
    await channel.cancel(consumerTag);
    consumerTag = null;
    metrics.consumerPaused = true;
    console.log("[payment-service] chaos: consumer paused");
  }
  res.json({ paused: metrics.consumerPaused });
});

app.post("/chaos/resume-consumer", async (req, res) => {
  if (channel && !consumerTag) {
    await startConsuming();
    console.log("[payment-service] chaos: consumer resumed");
  }
  res.json({ paused: metrics.consumerPaused });
});

// Per-trip lookup -- what the web BFF uses to assemble the rider's
// cross-service timeline (lecture p.11: the rider's own view of a trip is
// itself an integration problem, pulled live from services that each own
// one piece of it).
app.get("/payments/trip/:tripId", (req, res) => {
  const row = db
    .prepare("SELECT * FROM processed_events WHERE trip_id = ? ORDER BY processed_at DESC LIMIT 1")
    .get(req.params.tripId);
  if (!row) return res.status(404).json({ error: "no payment record for this trip yet" });
  res.json({
    tripId: row.trip_id,
    eventId: row.event_id,
    approved: row.approved === null ? null : Boolean(row.approved),
    processedAt: row.processed_at,
  });
});

// Raw processed_events rows for the web control room's table view --
// read-only, mirrors trip-service's GET /v1/outbox in shape.
app.get("/v1/processed-events", (req, res) => {
  const rows = db.prepare("SELECT * FROM processed_events ORDER BY processed_at DESC LIMIT 200").all();
  res.json(
    rows.map((row) => ({
      eventId: row.event_id,
      tripId: row.trip_id,
      approved: row.approved === null ? null : Boolean(row.approved),
      processedAt: row.processed_at,
    }))
  );
});

app.get("/metrics", (req, res) => {
  res.json({ ...metrics, breakerState: breaker.state });
});

// Wipes processed_events -- backs the web table page's "delete all test
// data" button. Dev/demo-only: no auth, same trust level as /chaos/*.
app.post("/admin/reset", (req, res) => {
  const processedEvents = db.prepare("DELETE FROM processed_events").run().changes;
  res.json({ processedEvents });
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => console.log(`[payment-service] listening on ${PORT}`));
