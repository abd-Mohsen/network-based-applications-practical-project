# The four interoperability layers, mapped to this repo (lecture p.11)

The slide's warning: most integration projects stop at the bottom two layers
— they succeed technically and fail practically ("الرسائل تصل، والمعنى لا
يصل"). RideFlow has something concrete at all four.

| Layer | Question it answers | Where it lives in this repo |
|---|---|---|
| **Technical** | Is there a channel between the two systems at all? | HTTP between every REST pair (gateway↔trip-service, payment-service↔fraud-check-service, notification-service's webhook); AMQP between every queue pair (trip-service→payment-service, payment-service→notification-service). Ports and protocols only — see `docker-compose.yml`. |
| **Syntactic** | Do both sides agree on the message format? | `docs/contracts/openapi-v1.yaml`, `openapi-v2-breaking.yaml` (REST, JSON Schema) and `asyncapi.yaml` (events). Either side can parse the other's message — that's all this layer promises. |
| **Semantic** | Does the parsed message mean the same thing to both sides? | `docs/data-dictionary.md`. Also where the system's one deliberate failure lives: `fare` silently becomes `price` between v1 and v2 with the same meaning but a different name — a syntactic success and a semantic trap. |
| **Organizational** | Is the exchange backed by a policy both sides can rely on — versioning, deprecation, SLAs? | `docs/versioning-policy.md`. Also deliberately incomplete (no deprecation header, no announced sunset date on `/v1`) so you can see what's missing when this layer is skipped. |

## Reading the stack top-to-bottom

A request from the rider app to a confirmed, paid trip crosses all four
layers in order:

1. **Technical** — the HTTP connection from the gateway to `trip-service`
   succeeds (TCP handshake, TLS in a real deployment, port open).
2. **Syntactic** — `trip-service` parses the JSON body against
   `TripRequest` in `openapi-v1.yaml` without error.
3. **Semantic** — the `fare` value `trip-service` writes to its event is
   read by `payment-service` as the same quantity, in the same currency,
   meaning the same thing — not a different field it has to guess at.
4. **Organizational** — if `trip-service`'s contract ever has to change,
   the policy in `versioning-policy.md` determines whether that change is
   safe to ship without warning anyone (it mostly isn't).

Most of what fails in production fails at layer 3 or 4, after layers 1 and 2
already reported success — which is exactly why they're easy to miss until
something breaks silently.
