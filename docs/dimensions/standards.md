# Research dimension: Standards (معيار)

Pick this if you'd rather focus on "what does adopting a real standard buy
you over a one-off format" (lecture p.13) as the core question.

## 1. Choice & framing

**Requirement under test:** RideFlow uses three real standards —
OpenAPI (REST contracts), AsyncAPI (event contracts), and JWT/OAuth2-style
bearer tokens (gateway auth) — instead of ad-hoc equivalents. What would
each have cost to replace with something custom, and what would that
custom version have been missing?

**Question:** for each standard in use, what concrete tooling or guarantee
came "for free," and what would a hand-rolled alternative have had to
reimplement?

**Measurable goal:** a filled-in table (below) naming, for each standard,
at least one artifact in this repo that was generated or validated
*mechanically* from it — not just described in prose.

## 2. "Experiment"

This dimension is more inspection than fault injection, but there's one
concrete check worth running:

```bash
# the OpenAPI schema is not just documentation -- it's machine-checked
node docs/contracts/contract-test.js

# the JWT is not just a string -- try the protected route without one
curl -i -X POST http://localhost:3080/trips \
  -H 'content-type: application/json' \
  -d '{"origin":"A","destination":"B","fare":10}'
# expect 401, then compare to a request with a token from POST /auth/token
```

| Standard | Used for | What came "for free" | What a custom format would have needed to rebuild |
|---|---|---|---|
| OpenAPI (`contracts/openapi-v1.yaml`) | REST contract for `trip-service` | Machine-checkable schema, `contract-test.js` validates against it directly | A hand-written schema validator, kept in sync by hand |
| AsyncAPI (`contracts/asyncapi.yaml`) | Event contract for the two queues | A standard place a new consumer reads before writing a listener | Tribal knowledge / reading `payment-service`'s source to learn the event shape |
| JWT (gateway `/auth/token`) | Identity/authorization at the gateway | Signature verification via a standard library (`jsonwebtoken`), expiry built into the token format | Custom token format, custom expiry logic, custom signature scheme — all unaudited |

## 3. Presentation & discussion

- Pick one row above and make the "cost of not standardizing" concrete:
  if `trip-service` and a hypothetical partner each used their own
  ad-hoc JSON shape instead of OpenAPI, what exactly would you have had
  to write to integrate them? (p.13: "المعيار... هو ما يغنيك عن كتابة
  محوّ لٍ لكل شريك" — the standard is what saves you from writing a
  converter for every partner.)
- Which sector-specific standards from the slide (ISO 20022/SWIFT for
  finance, HL7 FHIR for health, GS1/EDIFACT for logistics) would apply if
  RideFlow actually processed card payments or cross-border fares? Name
  the one most relevant and what it would replace in `payment-service`.
