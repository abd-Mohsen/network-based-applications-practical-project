# Data dictionary (semantic interoperability layer)

Lecture p.11: the syntactic layer agrees on *format* (JSON Schema); this
layer agrees on *meaning* — the same word means the same thing to every
service that uses it. This is also the layer RideFlow deliberately violates
once, on purpose, so you can see what the violation costs.

| Field | Meaning | Type | Owned by | Notes |
|---|---|---|---|---|
| `tripId` | Unique identifier of a trip, assigned by trip-service | UUID string | trip-service | Never regenerated; carried unchanged through every downstream event. |
| `eventId` | Unique identifier of **one publish attempt**, not of the trip | UUID string | publisher of the event | Deliberately distinct from `tripId` — this is what makes idempotency possible. Two events with different `eventId` but the same `tripId` are a legitimate duplicate delivery, not two trips. |
| `fare` | The price the rider pays, in the account's base currency, before any adjustment | number | trip-service (v1 contract) | **Renamed to `price` in the v2 API with no transition period** — see `versioning-policy.md` and `contracts/openapi-v2-breaking.yaml`. This row itself is the semantic-layer failure the lecture warns about (p.11: "الرسائل تصل، والمعنى لا يصل" — messages arrive, meaning doesn't). |
| `price` | Same quantity as `fare`, v2 naming | number | trip-service (v2 contract) | Do not treat `fare` and `price` as different fields when reconciling data across versions. |
| `occurredAt` | When the business event happened (not when it was published or consumed) | ISO 8601 UTC string | event publisher | Distinct from a message broker's own timestamp, which only tells you when a copy was sent. |
| `status` | Trip lifecycle state | string enum: `requested`, `accepted`, `completed` | trip-service | `trip.completed` only ever fires at the `completed` transition — not at creation. `autoComplete: true` on `POST /v1/trips` skips straight there (see `riderId`/`autoComplete` row) for load-generation purposes only; real GUI-created trips always start at `requested`. |
| `riderId` | Identifies which rider a trip belongs to | string | trip-service, set by the caller | Defaults to `"anonymous"` if omitted. Generated client-side (`localStorage`) by the rider page — there's no real identity/auth system behind it, by design; this lab's auth boundary is the gateway's JWT, not per-user accounts. |
| `driverId` | Identifies which driver accepted a trip | string, nullable | trip-service, set by `/accept` | `null` until a driver accepts. `chaos/chaos.js generate-trips` and the control room's "Generate trips" button use the literal value `"auto-driver"` (via `autoComplete`), which is not a real driver and won't show up on the driver page's queue or history. |
| `approved` | Outcome of the fraud check | boolean, nullable | fraud-check-service via payment-service | `null` while a payment is still in flight. Declined (`false`) is a valid business outcome, not a failure — see `payment-service`'s `declined` metric vs. `failuresToDlq`. Exposed per-trip at `payment-service`'s `GET /payments/trip/:tripId`, which is how the rider's timeline resolves its "Fraud check"/"Paid" stages. |

## Why this file exists

A shared vocabulary is what the "semantic" layer (p.11) actually buys you.
Two services can speak perfect JSON (syntactic layer, solved) and still
disagree about what a field *means* — the `fare`/`price` rename above is
exactly that failure, left in the system intentionally so the contract test
(`contracts/contract-test.js`) has something real to catch.
