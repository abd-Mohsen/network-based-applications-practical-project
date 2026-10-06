# Research dimension: Resilience (صمود)

This is the headline experiment for "بحث المتطلب العملي" (slide 19) — the
one with a queue, a deliberately stopped consumer, and deliberately
duplicated messages. Fill in the blanks with your actual measured numbers;
everything else is already wired up to produce them.

## 1. Choice & framing

**Requirement under test:** does the `trip-service → payment-service` link
survive (a) the consumer going down and (b) the broker redelivering
messages, without losing or double-charging a trip?

**Question:** when `payment-service`'s consumer is paused for 2 minutes
while `trip-service` keeps publishing, and some of those events are
deliberately redelivered, how many trips are lost and how many are
double-processed — with the safeguards on, and with them off?

**Measurable goal:** `0` lost trips (outbox) and `0` double-processed trips
(idempotency) once the consumer resumes, for both the normal-publish and
duplicated-publish cases.

## 2. Experiment & measurement

### Setup

```bash
docker compose up --build -d
npm install            # once, for chaos.js and contract-test.js
node chaos/chaos.js status   # sanity check — all services should report ok
```

### Run A — safeguards ON (the default: `OUTBOX_ENABLED=true`, `IDEMPOTENCY_ENABLED=true`)

```bash
node chaos/chaos.js pause-consumer payment
node chaos/chaos.js duplicate-next 20
node chaos/chaos.js generate-trips 30
sleep 120
node chaos/chaos.js resume-consumer payment
sleep 15
node chaos/chaos.js status
```

Record from the `trip-service` and `payment-service` blocks in the status
output:

| Metric | Value |
|---|---|
| `trip-service.tripsCreated` | |
| `trip-service.outboxPublished` | |
| `trip-service.outboxPending` (should settle to 0) | |
| `trip-service.chaosDuplicatesSent` | |
| `payment-service.consumed` | |
| `payment-service.duplicatesDetected` | |
| `payment-service.processed` + `payment-service.declined` | |
| **Lost trips** = `tripsCreated` − (`processed` + `declined` + still-`outboxPending`) | |
| **Double-processed trips** (should be 0 — idempotency should have caught all of `chaosDuplicatesSent`) | |

### Run B — safeguards OFF (comparison)

Edit `docker-compose.yml`: set `OUTBOX_ENABLED: "false"` on `trip-service`
and `IDEMPOTENCY_ENABLED: "false"` on `payment-service`, then
`docker compose up --build -d` and repeat the same steps.

| Metric | Value |
|---|---|
| `trip-service.publishFailedLost` | |
| **Lost trips** | |
| **Double-processed trips** (now expected to be > 0) | |

### DLQ check (separate, short run)

```bash
node chaos/chaos.js kill-fraud
node chaos/chaos.js generate-trips 5
sleep 10
node chaos/chaos.js status     # payment-service.failuresToDlq should be 5
node chaos/chaos.js restore-fraud
```

Open the RabbitMQ management UI at `http://localhost:15672`
(guest/guest) → Queues → `trip.completed.dlq` and note the message count —
screenshot it for the report.

## 3. Presentation & discussion

Fill in once you have both runs' numbers:

- With safeguards on: lost = ___, duplicated-and-reprocessed = ___.
- With safeguards off: lost = ___, duplicated-and-reprocessed = ___.
- Where did you choose synchronous vs. queued, and why (see
  `synchrony.md`)? What would change if `payment-service → fraud-check`
  were made async instead?
- What did the circuit breaker actually buy you during the `kill-fraud`
  run — check `payment-service.breakerOpens` and
  `payment-service.breakerShortCircuits` in the status output, and compare
  how fast failures piled up before vs. after the breaker opened.
