import express from "express";
import amqp from "amqplib";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import fs from "fs";

const PORT = process.env.PORT || 3001;
const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost";
const OUTBOX_ENABLED = (process.env.OUTBOX_ENABLED ?? "true") === "true";

fs.mkdirSync("./data", { recursive: true });
const db = new Database("./data/trip-service.sqlite");
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    fare REAL NOT NULL,
    rider_id TEXT,
    driver_id TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    accepted_at TEXT,
    completed_at TEXT
  );
  CREATE TABLE IF NOT EXISTS outbox (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    published INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
`);

const metrics = {
  tripsCreated: 0,
  tripsAccepted: 0,
  tripsCompleted: 0,
  outboxPublished: 0,
  publishFailedLost: 0,
  chaosDuplicatesSent: 0,
  outboxEnabled: OUTBOX_ENABLED,
};

let channel = null;
let duplicateNextN = 0;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// trip-service and payment-service both declare the "trip.completed" queue
// independently (each is an independent process/container), so both MUST use
// the identical arguments below -- RabbitMQ rejects a re-declaration that
// doesn't match the arguments of an existing queue.
async function connectMQ() {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const conn = await amqp.connect(RABBITMQ_URL);
      channel = await conn.createChannel();
      await channel.assertExchange("dlx", "fanout", { durable: true });
      await channel.assertQueue("trip.completed.dlq", { durable: true });
      await channel.bindQueue("trip.completed.dlq", "dlx", "");
      await channel.assertQueue("trip.completed", {
        durable: true,
        arguments: { "x-dead-letter-exchange": "dlx" },
      });
      console.log("[trip-service] connected to RabbitMQ");
      conn.on("close", () => {
        console.error("[trip-service] RabbitMQ connection closed, reconnecting...");
        channel = null;
        setTimeout(connectMQ, 2000);
      });
      return;
    } catch (err) {
      console.log(`[trip-service] RabbitMQ not ready (${err.message}), retrying...`);
      await sleep(2000);
    }
  }
  console.error("[trip-service] giving up on RabbitMQ after 30 attempts");
}
connectMQ();

async function publishDirect(payload) {
  if (!channel) throw new Error("no channel");
  channel.sendToQueue("trip.completed", Buffer.from(payload), { persistent: true });
}

// Outbox poller: this is what makes publishing crash-safe. The event row was
// already committed to SQLite in the same transaction as the trip row, so a
// RabbitMQ outage just delays publishing -- it never loses the event.
async function outboxLoop() {
  while (true) {
    await sleep(1000);
    if (!channel) continue;
    const rows = db
      .prepare("SELECT * FROM outbox WHERE published = 0 ORDER BY created_at LIMIT 20")
      .all();
    for (const row of rows) {
      try {
        channel.sendToQueue("trip.completed", Buffer.from(row.payload), {
          persistent: true,
          messageId: row.id,
        });
        if (duplicateNextN > 0) {
          channel.sendToQueue("trip.completed", Buffer.from(row.payload), {
            persistent: true,
            messageId: row.id,
          });
          duplicateNextN--;
          metrics.chaosDuplicatesSent++;
        }
        db.prepare("UPDATE outbox SET published = 1 WHERE id = ?").run(row.id);
        metrics.outboxPublished++;
      } catch (err) {
        console.error("[trip-service] outbox publish failed, will retry:", err.message);
        break;
      }
    }
  }
}
if (OUTBOX_ENABLED) outboxLoop();

// --- trip lifecycle: requested -> accepted -> completed --------------------
//
// The "trip.completed" event only ever fires out of /complete (or out of
// this helper when autoComplete short-circuits straight to completed). That
// keeps the Outbox pattern meaningful: the event is tied to a real state
// transition, not an artifact of the HTTP call that created the row.
//
// `autoComplete` exists so chaos/chaos.js (bulk load generation for fault
// injection) can keep producing an instant trip.completed per trip, exactly
// like this service did before the GUI/lifecycle work -- without it, every
// existing experiment in docs/dimensions/ would need a driver to actually
// accept and complete each generated trip before anything would flow.
function insertTrip({ origin, destination, fare, riderId, autoComplete }) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const rider_id = riderId || "anonymous";
  let status = "requested";
  let driver_id = null;
  let accepted_at = null;
  let completed_at = null;
  let eventId = null;
  let payload = null;

  if (autoComplete) {
    status = "completed";
    driver_id = "auto-driver";
    accepted_at = now;
    completed_at = now;
    eventId = randomUUID();
    payload = JSON.stringify({ eventId, tripId: id, fare, occurredAt: now });
  }

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO trips (id, origin, destination, fare, rider_id, driver_id, status, created_at, accepted_at, completed_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(id, origin, destination, fare, rider_id, driver_id, status, now, accepted_at, completed_at);
    if (autoComplete && OUTBOX_ENABLED) {
      db.prepare(
        "INSERT INTO outbox (id, event_type, payload, published, created_at) VALUES (?,?,?,0,?)"
      ).run(eventId, "trip.completed", payload, now);
    }
  });
  tx();

  metrics.tripsCreated++;
  if (autoComplete) {
    metrics.tripsAccepted++;
    metrics.tripsCompleted++;
    if (!OUTBOX_ENABLED) {
      publishDirect(payload).catch((err) => {
        metrics.publishFailedLost++;
        console.error("[trip-service] direct publish failed, event LOST:", err.message);
      });
    }
  }

  return { id, origin, destination, fare, rider_id, driver_id, status, created_at: now, accepted_at, completed_at };
}

function toV1Response(row) {
  return {
    id: row.id,
    origin: row.origin,
    destination: row.destination,
    fare: row.fare,
    status: row.status,
    riderId: row.rider_id,
    driverId: row.driver_id,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
    completedAt: row.completed_at,
  };
}

const app = express();
app.use(express.json());

// v1: full lifecycle, contract field is "fare" -----------------------------

app.post("/v1/trips", (req, res) => {
  const { origin, destination, fare, riderId, autoComplete } = req.body || {};
  if (!origin || !destination || typeof fare !== "number") {
    return res.status(400).json({ error: "origin, destination and numeric fare are required" });
  }
  const trip = insertTrip({ origin, destination, fare, riderId, autoComplete: autoComplete === true });
  res.status(201).json(toV1Response(trip));
});

app.get("/v1/trips", (req, res) => {
  const { status, riderId, driverId } = req.query;
  let sql = "SELECT * FROM trips WHERE 1=1";
  const params = [];
  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }
  if (riderId) {
    sql += " AND rider_id = ?";
    params.push(riderId);
  }
  if (driverId) {
    sql += " AND driver_id = ?";
    params.push(driverId);
  }
  sql += " ORDER BY created_at DESC LIMIT 200";
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(toV1Response));
});

app.get("/v1/trips/:id", (req, res) => {
  const trip = db.prepare("SELECT * FROM trips WHERE id = ?").get(req.params.id);
  if (!trip) return res.status(404).json({ error: "trip not found" });
  res.json(toV1Response(trip));
});

app.post("/v1/trips/:id/accept", (req, res) => {
  const { driverId } = req.body || {};
  if (!driverId) return res.status(400).json({ error: "driverId is required" });
  const trip = db.prepare("SELECT * FROM trips WHERE id = ?").get(req.params.id);
  if (!trip) return res.status(404).json({ error: "trip not found" });
  if (trip.status !== "requested") {
    return res.status(409).json({ error: `trip is "${trip.status}", cannot accept` });
  }
  const now = new Date().toISOString();
  db.prepare("UPDATE trips SET status = 'accepted', driver_id = ?, accepted_at = ? WHERE id = ?").run(
    driverId,
    now,
    trip.id
  );
  metrics.tripsAccepted++;
  res.json(toV1Response({ ...trip, status: "accepted", driver_id: driverId, accepted_at: now }));
});

app.post("/v1/trips/:id/complete", (req, res) => {
  const trip = db.prepare("SELECT * FROM trips WHERE id = ?").get(req.params.id);
  if (!trip) return res.status(404).json({ error: "trip not found" });
  if (trip.status !== "accepted") {
    return res.status(409).json({ error: `trip is "${trip.status}", cannot complete` });
  }
  const now = new Date().toISOString();
  const eventId = randomUUID();
  const payload = JSON.stringify({ eventId, tripId: trip.id, fare: trip.fare, occurredAt: now });

  const tx = db.transaction(() => {
    db.prepare("UPDATE trips SET status = 'completed', completed_at = ? WHERE id = ?").run(now, trip.id);
    if (OUTBOX_ENABLED) {
      db.prepare(
        "INSERT INTO outbox (id, event_type, payload, published, created_at) VALUES (?,?,?,0,?)"
      ).run(eventId, "trip.completed", payload, now);
    }
  });
  tx();

  metrics.tripsCompleted++;
  if (!OUTBOX_ENABLED) {
    publishDirect(payload).catch((err) => {
      metrics.publishFailedLost++;
      console.error("[trip-service] direct publish failed, event LOST:", err.message);
    });
  }

  res.json(toV1Response({ ...trip, status: "completed", completed_at: now }));
});

// v2: deliberate breaking change -- "fare" renamed to "price" in the
// response. Frozen on purpose (always auto-completes, no lifecycle, no new
// fields) -- it exists only for the contract/versioning demo. See
// docs/contracts/openapi-v2-breaking.yaml and contract-test.js.
app.post("/v2/trips", (req, res) => {
  const { origin, destination, fare } = req.body || {};
  if (!origin || !destination || typeof fare !== "number") {
    return res.status(400).json({ error: "origin, destination and numeric fare are required" });
  }
  const trip = insertTrip({ origin, destination, fare, riderId: null, autoComplete: true });
  res.status(201).json({ id: trip.id, origin: trip.origin, destination: trip.destination, price: trip.fare, status: trip.status });
});

app.get("/v2/trips/:id", (req, res) => {
  const trip = db.prepare("SELECT * FROM trips WHERE id = ?").get(req.params.id);
  if (!trip) return res.status(404).json({ error: "trip not found" });
  res.json({ id: trip.id, origin: trip.origin, destination: trip.destination, price: trip.fare, status: trip.status });
});

app.post("/chaos/duplicate-next", (req, res) => {
  const n = Number(req.body?.n) || 0;
  duplicateNextN += n;
  console.log(`[trip-service] chaos: will duplicate next ${duplicateNextN} outbox publishes`);
  res.json({ duplicateNextN });
});

app.get("/metrics", (req, res) => {
  const pending = db.prepare("SELECT COUNT(*) c FROM outbox WHERE published = 0").get().c;
  res.json({ ...metrics, outboxPending: pending, duplicateNextN });
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => console.log(`[trip-service] listening on ${PORT}`));
