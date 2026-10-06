# Research dimension: Synchrony (تزامن)

Pick this instead of (or alongside) resilience if you'd rather focus on
"does the sender wait for the answer?" (lecture p.8) as the core question.

## 1. Choice & framing

**Requirement under test:** the same system has one synchronous edge
(`payment-service → fraud-check-service`, request/response) and one
asynchronous edge (`trip-service → payment-service`, via queue) handling a
comparable job — a check that has to happen before money moves. What does
each coupling style cost when its downstream goes slow or down?

**Question:** when `fraud-check-service` is made slow or unavailable, how
does that show up differently depending on whether the caller is coupled to
it synchronously (blocks and retries) vs. asynchronously (queues and
moves on)?

**Measurable goal:** quantify the difference in caller-side latency and
failure rate between the sync edge under stress and the async edge under
equivalent stress.

## 2. Experiment & measurement

### Sync edge under stress

```bash
node chaos/chaos.js latency-fraud 2000   # fraud-check-service now takes +2s per call
node chaos/chaos.js generate-trips 10
node chaos/chaos.js status
```

Record `payment-service.fraudCallFailures` (timeouts at 1.5s < the induced
2s latency) and how many of the 10 trips ended up in
`payment-service.failuresToDlq` vs. `processed`.

```bash
node chaos/chaos.js kill-fraud
node chaos/chaos.js generate-trips 10
node chaos/chaos.js status
```

Record `payment-service.breakerOpens` and `breakerShortCircuits` — once the
breaker opens, later calls fail fast instead of waiting out the full
retry+timeout budget. Time how long the whole batch of 10 takes with the
breaker closed (first few requests) vs. open (later ones).

```bash
node chaos/chaos.js restore-fraud
```

### Async edge under equivalent stress

```bash
node chaos/chaos.js pause-consumer payment
node chaos/chaos.js generate-trips 10
node chaos/chaos.js status    # trip-service.tripsCreated succeeds immediately for all 10
node chaos/chaos.js resume-consumer payment
```

Record: did any of the 10 `POST /trips` calls through the gateway fail or
block? (They shouldn't — that's the entire point of decoupling via a
queue.) Compare the gateway-side latency of `generate-trips` here against
the sync-edge run above.

## 3. Presentation & discussion

- Table: sync edge vs. async edge, each under (a) added latency, (b) full
  outage — caller latency, caller failure rate, data loss.
- Where does the lecture's "مصير مشترك" (shared fate, p.8) actually show up
  in your numbers for the sync edge, and where does "لا يُسقِ ط" (doesn't
  bring the caller down, p.8) show up for the async edge?
- Trade-off you'd defend: why is `payment-service → fraud-check-service`
  sync at all, instead of also going through a queue? (Hint: a payment
  can't be marked complete before the fraud check resolves — the business
  logic has a genuine ordering dependency the async edges don't.)
