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
// Added after the original schema -- older data files won't have this
// column yet, so add it defensively and ignore the "duplicate column" error
// on every later boot once it's already there.
try {
  db.exec("ALTER TABLE trips ADD COLUMN cancelled_at TEXT");
} catch {
  // already present
}

const metrics = {
  tripsCreated: 0,
  tripsAccepted: 0,
  tripsCompleted: 0,
  tripsCancelled: 0,
  outboxPublished: 0,
  publishFailedLost: 0,
  chaosDuplicatesSent: 0,
  outboxEnabled: OUTBOX_ENABLED,
};

// Riders no longer type a fare -- it's predicted here from the route, the
// one place in the system that owns trip data. Deterministic per
// origin/destination pair (same route quotes the same fare, like a real
// estimator) with a bit of jitter so repeated requests aren't identical to
// the cent.
function estimateFare(origin, destination) {
  const route = `${origin}|${destination}`;
  let hash = 0;
  for (let i = 0; i < route.length; i++) {
    hash = (hash * 31 + route.charCodeAt(i)) >>> 0;
  }
  const base = 5 + (hash % 35); // $5-$40 band, stable per route
  const jitter = (hash % 100) / 100; // +$0.00-$0.99
  return Math.round((base + jitter) * 2) / 2; // nearest $0.50
}

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
//
// Once a row is confirmed published, it's deleted rather than flagged --
// the outbox table is a staging area for not-yet-delivered events, not a
// permanent log (that's what payment-service's processed_events is for on
// the consumer side). This keeps the table's row count equal to
// metrics.outboxPending at all times.
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
        db.prepare("DELETE FROM outbox WHERE id = ?").run(row.id);
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
    cancelledAt: row.cancelled_at ?? null,
  };
}

const app = express();
app.use(express.json());

// v1: full lifecycle, contract field is "fare" -----------------------------

app.post("/v1/trips", (req, res) => {
  const { origin, destination, riderId, autoComplete } = req.body || {};
  if (!origin || !destination) {
    return res.status(400).json({ error: "origin and destination are required" });
  }
  // fare is optional on purpose -- the rider GUI no longer sends one and gets
  // a predicted fare back; chaos/chaos.js and the v2 contract still pass an
  // explicit fare and that's honored as-is.
  const { fare: suppliedFare } = req.body || {};
  const fare = typeof suppliedFare === "number" ? suppliedFare : estimateFare(origin, destination);
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

// Cancel is only allowed while a trip is still unmatched -- once a driver
// has accepted it there's a real person already en route, so that's a
// different (unimplemented) flow, not a plain cancel.
app.post("/v1/trips/:id/cancel", (req, res) => {
  const trip = db.prepare("SELECT * FROM trips WHERE id = ?").get(req.params.id);
  if (!trip) return res.status(404).json({ error: "trip not found" });
  if (trip.status !== "requested") {
    return res.status(409).json({ error: `trip is "${trip.status}", cannot cancel (already accepted or completed)` });
  }
  const now = new Date().toISOString();
  db.prepare("UPDATE trips SET status = 'cancelled', cancelled_at = ? WHERE id = ?").run(now, trip.id);
  metrics.tripsCancelled++;
  res.json(toV1Response({ ...trip, status: "cancelled", cancelled_at: now }));
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

// Raw outbox rows for the web control room's table view -- read-only, mirrors
// GET /v1/trips in shape (most recent first, capped).
app.get("/v1/outbox", (req, res) => {
  const rows = db.prepare("SELECT * FROM outbox ORDER BY created_at DESC LIMIT 200").all();
  res.json(
    rows.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      payload: row.payload,
      published: Boolean(row.published),
      createdAt: row.created_at,
    }))
  );
});

// Wipes all rows from both tables -- backs the web table page's "delete all
// test data" button. Dev/demo-only: no auth, same trust level as /chaos/*.
app.post("/admin/reset", (req, res) => {
  const tx = db.transaction(() => {
    const trips = db.prepare("DELETE FROM trips").run().changes;
    const outbox = db.prepare("DELETE FROM outbox").run().changes;
    return { trips, outbox };
  });
  res.json(tx());
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => console.log(`[trip-service] listening on ${PORT}`));
