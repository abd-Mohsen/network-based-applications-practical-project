# Versioning & deprecation policy (organizational interoperability layer)

Lecture p.11 (organizational layer) and p.12 (contracts & versioning). This
is the policy RideFlow *should* follow — and the one `/v2/trips` violates on
purpose, so the violation has something concrete to be measured against.

## Semantic versioning rule

- A **breaking change** (removing a field, renaming a field, changing a
  field's type or meaning, removing an endpoint, tightening validation) → new
  **major** version. Old and new major versions are served side by side.
- A **non-breaking addition** (new optional field, new endpoint, relaxed
  validation) → does not require a new version at all. It must not break any
  consumer validating against the old schema.
- The rule in one line (p.12): *"إصدارٌ رئيسي جديد؛ والإضافة الاختيارية لا
  تُكسر أحداً فلا تستحقّ إصداراً"* — a breaking change earns a new major
  version; an optional addition breaks no one, so it doesn't earn one.

## What this repo actually does (and doesn't do)

| Rule | `/v1/trips` → `/v2/trips` | Compliant? |
|---|---|---|
| Breaking change gets a new major version | `fare` → `price` ships as `/v2` | ✅ |
| Old version stays served | `/v1/trips` is left running, unchanged | ✅ |
| Deprecation announced with a date | Nothing — `/v1` could disappear with no warning | ❌ (intentional, for the lab) |
| Contract test gates the release | `contracts/contract-test.js` exists but isn't wired into CI here | ❌ (intentional — run it manually to see what it would have caught) |

## Deprecation policy (the part that's missing above)

A version that will be retired must carry, from the day its replacement
ships:

1. A `Deprecation` / `Sunset` response header (or equivalent) on every
   response from the old version.
2. An announced retirement date, at least one full release cycle out.
3. A contract test running in CI against the *old* schema until the
   retirement date passes, so a regression in the old version is caught
   too — deprecated doesn't mean unmonitored.

RideFlow's `/v1/trips` has none of this. That's the point: it's what "لا
تكسر عقداً بلا إنذار" (don't break a contract without warning) looks like
when it's skipped, not just talked about.

## Service-level expectations (lightweight SLA)

| Service | Availability target | Notes |
|---|---|---|
| `trip-service` | Accepts writes even if RabbitMQ is briefly down (outbox pattern) | See `services/trip-service/index.js` |
| `payment-service` | Opens its circuit breaker after 5 consecutive `fraud-check-service` failures rather than queuing indefinitely | Cooldown: 10s |
| `fraud-check-service` | No availability target — it's the deliberately unreliable dependency in this lab | Controlled via `/chaos/*` |
