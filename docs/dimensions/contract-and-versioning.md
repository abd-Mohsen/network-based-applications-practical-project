# Research dimension: Contract & versioning (عقد · إصدارات)

Pick this if you'd rather focus on "does the message get understood, not
just delivered" (lecture p.12) as the core question.

## 1. Choice & framing

**Requirement under test:** `trip-service` ships a breaking change (`fare`
→ `price`) as `/v2/trips`, alongside the still-running `/v1/trips`. Can a
contract test catch that break mechanically, before a real consumer does?

**Question:** does validating live responses against the schema a consumer
was written against (`TripV1` in `openapi-v1.yaml`) correctly pass for
`/v1/trips` and correctly fail for `/v2/trips`?

**Measurable goal:** the contract test exits `0` (pass) for v1 and reports
a specific, readable validation error for v2 — not a generic crash.

## 2. Experiment & measurement

```bash
docker compose up --build -d
npm install
node docs/contracts/contract-test.js
```

Record the two outcomes and the exact Ajv error text for v2 (it should name
`fare` as a missing required property).

### A real non-breaking change, already in this repo

When the rider/driver GUI shipped, `/v1/trips` genuinely changed: `status`
grew from a single always-`"completed"` value to a real lifecycle enum
(`requested → accepted → completed`), and `riderId`/`driverId`/three
timestamps were added to the response. No version bump — it's an additive
change, so the v1 consumer contract was simply widened in place (see
`TripV1` in `openapi-v1.yaml`).

Run the contract test now and it still **passes**, even though
`POST /v1/trips` returns `status: "requested"` by default instead of
`"completed"` — because validating a string against a wider enum isn't a
different kind of check:

```bash
node docs/contracts/contract-test.js
```

This is the control case the lecture's rule (p.12: "الإضافة الاختيارية لا
تُكسر أحداً فلا تستحقّ إصداراً") predicts: an optional, additive change
shouldn't trip the test, and it doesn't. Compare that to what `/v2/trips`
does to the exact same test — a renamed field fails immediately.

## 3. Presentation & discussion

- Show the three outcomes side by side: v1 (pass), v2 breaking (fail, with
  the specific error), the real `status`-enum widening above (pass).
- What would have happened to a real consumer of `/v1/trips` if
  `trip-service` had changed `fare` to `price` **in place**, without a new
  `/v2` route, and without this test running in CI? Trace it through:
  which field would their code read, what would it get instead, how far
  would the bad data travel before anyone noticed?
- Compare to `docs/versioning-policy.md` — which of that policy's rules did
  `/v2/trips` follow, and which did it skip? What's the cost of each
  skipped rule, concretely (not just "it's bad practice")?
