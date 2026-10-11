# RideFlow — an integration & interoperability lab

A small, Uber-flavored distributed system built to demonstrate — and let you
measure — the concepts from "التكامل والتشغيل البيني" (Lecture 7, Distributed
Network Applications, Damascus University). It is deliberately **not** a
full ride-hailing platform: seven small services, each one mapping to a
specific slide, wired so you can break any of them on purpose, watch it
happen in a browser, and read the numbers.

**بالعربية:** شرح كامل للمشروع في [`docs/README.ar.md`](docs/README.ar.md) — والواجهة الرسومية نفسها (`/`, `/driver`, `/dashboard`, `/control`) معرَّبة بالكامل من اليمين إلى اليسار.

See the architecture diagram: `docs/diagrams/rideflow-architecture.png`, or
trace the flow below.

## Architecture

```
Rider GUI → edge (Nginx) → gateway (JWT · rate limit) → trip-service (REST · OpenAPI · outbox)
                                            requested ──/accept──▶ accepted ──/complete──▶ completed
                                                                                 │ publishes trip.completed
                                                                                 ▼
                                          RabbitMQ queue ──(retries exhausted)──▶ trip.completed.dlq
                                                                                 │ consumes
                                                                                 ▼
                                   payment-service ⇄ fraud-check-service
                                   (idempotency ·      (sync REST, flaky,
                                    retry + breaker)     chaos-toggleable)
                                                                                 │ publishes payment.completed
                                                                                 ▼
                                                                          RabbitMQ queue
                                                                                 │ consumes
                                                                                 ▼
                                                        notification-service → signed webhook → driver app (mock)

web (GUI + BFF) polls trip-service/payment-service/notification-service/monitor
every 1s and pushes a live snapshot to the browser over SSE; rider/driver
writes go back out through the gateway, same as any other client.
```

| Service | Port | Role |
|---|---|---|
| `web` | **8080** | **Start here.** Rider + driver GUI, live dashboard, control room — see below |
| `edge` | 3080 (host) → 80 (container) | Real Nginx reverse proxy in front of `gateway` — the literal "API Gateway (Nginx)" edge. Stock error pages left untouched: stop `gateway` and this returns Nginx's own 502, not a custom one. Also does connection-count limiting (`limit_conn`), independent of the gateway's per-user rate limit. |
| `gateway` | internal only, 3000 (container) | JWT issuance/verification + per-user rate limiting (2 requests/minute/user), proxies `/trips*` → `trip-service`. No longer reachable directly from the host — everything goes through `edge` first, same as production. |
| `trip-service` | 3001 | Contract-first REST (`/v1` with a real requested→accepted→completed lifecycle, frozen breaking `/v2`), Outbox pattern for crash-safe publishing |
| `fraud-check-service` | 3002 | Flaky synchronous dependency — the circuit-breaker target |
| `payment-service` | 3003 | Async consumer: idempotency key, retry+backoff, circuit breaker, DLQ routing |
| `notification-service` | 3004 | Async consumer that fires a signed webhook |
| `monitor` | 4000 | Polls every service's `/metrics` + RabbitMQ's queue depths every 2s |
| `rabbitmq` | 5672 / 15672 | Broker + management UI (`guest`/`guest`) |
| `jaeger` | 16686 | Distributed tracing UI — see one request's actual journey across services |

## Distributed tracing (Jaeger)

Every service (except `monitor`, which is pure polling noise) is instrumented
with OpenTelemetry auto-instrumentation, loaded via `node --import ./tracing.js`
ahead of the app code — zero route handlers touched. Traces export over OTLP
to the `jaeger` container. Open **http://localhost:16686**, pick a service,
and look at a recent `POST` trace: you'll see the actual waterfall — gateway's
proxy hop, the synchronous `payment-service → fraud-check-service` call
(with its retries visible as sibling spans), and the RabbitMQ
publish/consume pair connecting services across the async boundary.

**One honest caveat:** the `trip-service → payment-service` hop specifically
goes through the Outbox pattern's background poller (a 1s timer, decoupled
from the original HTTP request by design — that's the whole point of
Outbox). Auto-instrumentation can't always carry the original request's
trace context across that timer boundary, so that one hop's linkage is
sometimes present, sometimes not — every other hop (sync and async both)
connects reliably every time. Properly fixing this is a one-line addition
(an OpenTelemetry *Link*, not parent-child, added where the poller publishes)
if you want to chase it further; it doesn't block anything documented above.

## Run it

```bash
docker compose up --build
```

Then open **http://localhost:8080** — that's the GUI. Four pages, shared nav,
defaulting to Arabic (RTL) since that's this course's language, with an
**EN/ع toggle in the top-right** of every page (persisted per-browser,
flips `dir`/`lang` with no flash). Technical identifiers (service names,
metric keys, queue names) stay in English/monospace in both languages since
they're literal code/API tokens:

- **`/` (Rider)** — request a trip, watch your own trips move live through a
  six-stage timeline (Requested → Accepted → Completed → Fraud check → Paid
  → Notified), each stage lit by a different service.
- **`/driver`** — an incoming-requests queue with **Accept**, an active-trip
  panel with **Complete**. Nothing downstream fires until you complete one —
  that's the actual `trip.completed` event going out.
- **`/dashboard`** — every service's `/metrics`, redesigned as cards and
  big-number tiles, plus live RabbitMQ queue/DLQ depth.
- **`/control`** — every `chaos/chaos.js` command as a button: pause/resume
  a consumer, duplicate deliveries, kill/slow fraud-check-service, generate
  load. Run the experiments below by clicking instead of typing.

The CLI still works for scripted/reproducible runs:

```bash
npm install                       # once — installs js-yaml + ajv for the scripts below
node chaos/chaos.js generate-trips 5   # creates 5 already-completed trips (autoComplete)
node chaos/chaos.js status             # see every service's live metrics
```

## Run the experiments

The actual assignment ("بحث المتطلب العملي", slide 19) asks you to pick
**one** dimension, build a fault-injection experiment around it, and report
measured numbers. Four are written up, ready to run, in `docs/dimensions/`:

- **`resilience-experiment.md`** — the headline one: stop a consumer,
  duplicate messages on purpose, measure loss and double-processing with
  the safeguards on and off.
- **`synchrony.md`** — compare the system's one sync edge to its async
  edges under the same induced failure.
- **`contract-and-versioning.md`** — prove a breaking API change gets
  caught by a contract test before it reaches a consumer.
- **`standards.md`** — what OpenAPI/AsyncAPI/JWT bought you over a custom
  format, made concrete.

All four use `chaos/chaos.js` — see `node chaos/chaos.js` with no arguments
for the full command list (pause/resume a consumer, duplicate the next *n*
events, kill or slow `fraud-check-service`, generate load, or dump the
monitor's current snapshot).

## Where each lecture concept lives

| Concept (slide) | Where |
|---|---|
| Integration patterns (p.7) | Gateway (API Gateway), REST calls (point-to-point), RabbitMQ (queues), webhook (notification-service) |
| Sync vs. async (p.8) | `payment-service ↔ fraud-check-service` is sync; both RabbitMQ hops are async — see `docs/dimensions/synchrony.md` |
| Interface styles (p.9) | REST (`trip-service`), webhook (`notification-service`) |
| Interoperability layers (p.11) | `docs/interoperability-layers.md` |
| Contracts & versioning (p.12) | `docs/contracts/openapi-v1.yaml` vs. `openapi-v2-breaking.yaml`, `docs/contracts/contract-test.js`, `docs/versioning-policy.md` |
| Standards by sector (p.13) | `docs/dimensions/standards.md` |
| Resilience patterns (p.14) | Outbox (`trip-service`), idempotency + retry/backoff + circuit breaker + DLQ (`payment-service`) |
| Integration trade-offs (p.15) | Discussed in each `docs/dimensions/*.md` write-up |
| "Watch the connection, not just the endpoints" (p.17) | `monitor` service, and `/dashboard` in the GUI |
| A consumer's view spans services it doesn't own (p.11, semantic layer) | The rider's trip timeline on `/` — `web`'s BFF cross-references trip-service, payment-service and notification-service live to assemble one trip's story |
| gov.HealthCare.2013 lesson — someone must own the boundary (p.4) | Every cross-service edge in the architecture diagram has a named owner (the service that declares the queue/contract), on purpose |

## Repo layout

```
docker-compose.yml
services/
  trip-service/ fraud-check-service/ payment-service/
  notification-service/ gateway/ monitor/
  web/                       — GUI + backend-for-frontend (port 8080)
    server.js                — poll loop, SSE, gateway passthrough, control room
    public/                  — rider.html, driver.html, dashboard.html, control.html + JS/CSS
chaos/chaos.js              — fault injector (host-run; /control does the same over HTTP)
docs/
  data-dictionary.md        — semantic layer
  versioning-policy.md      — organizational layer
  interoperability-layers.md
  contracts/                — OpenAPI v1/v2, AsyncAPI, contract-test.js
  dimensions/                — the four experiment write-ups
```
