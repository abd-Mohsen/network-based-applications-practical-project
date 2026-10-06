#!/usr/bin/env node
// Fault injector for the RideFlow lab. Run with: node chaos/chaos.js <command> [args]
// This is what the assignment means by "deliberately break the other side and
// measure what happens to the data" (slide 19).

const BASE = {
  gateway: process.env.GATEWAY_URL || "http://localhost:3080",
  trip: process.env.TRIP_SERVICE_URL || "http://localhost:3001",
  fraud: process.env.FRAUD_CHECK_URL || "http://localhost:3002",
  payment: process.env.PAYMENT_SERVICE_URL || "http://localhost:3003",
  notification: process.env.NOTIFICATION_SERVICE_URL || "http://localhost:3004",
  monitor: process.env.MONITOR_URL || "http://localhost:4000",
};

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  console.log(res.status, await res.text());
}

async function getToken() {
  const res = await fetch(`${BASE.gateway}/auth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId: "chaos-cli" }),
  });
  const data = await res.json();
  return data.token;
}

async function generateTrips(n) {
  const token = await getToken();
  for (let i = 0; i < n; i++) {
    const res = await fetch(`${BASE.gateway}/trips`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        origin: `origin-${i}`,
        destination: `dest-${i}`,
        fare: Math.round(10 + Math.random() * 40),
        // Bulk load generation for fault injection has no real driver behind
        // it -- autoComplete skips straight to "completed" and fires the
        // trip.completed event immediately, exactly like every trip in this
        // system did before the rider/driver GUI added a real lifecycle.
        autoComplete: true,
      }),
    });
    console.log(i + 1, res.status);
  }
}

async function status() {
  const res = await fetch(`${BASE.monitor}/data`);
  console.log(JSON.stringify(await res.json(), null, 2));
}

const serviceArg = (name) => {
  const url = BASE[name];
  if (!url) throw new Error(`unknown service "${name}", expected one of: payment, notification`);
  return url;
};

const commands = {
  "pause-consumer": (svc) => post(`${serviceArg(svc)}/chaos/pause-consumer`),
  "resume-consumer": (svc) => post(`${serviceArg(svc)}/chaos/resume-consumer`),
  "duplicate-next": (n) => post(`${BASE.trip}/chaos/duplicate-next`, { n: Number(n) }),
  "kill-fraud": () => post(`${BASE.fraud}/chaos/kill`),
  "restore-fraud": () => post(`${BASE.fraud}/chaos/restore`),
  "latency-fraud": (ms) => post(`${BASE.fraud}/chaos/latency`, { ms: Number(ms) }),
  "generate-trips": (n) => generateTrips(Number(n) || 10),
  status: () => status(),
};

const [, , cmd, ...args] = process.argv;
const fn = commands[cmd];

if (!fn) {
  console.log("Usage: node chaos/chaos.js <command> [args]\n");
  console.log("Commands:");
  console.log("  pause-consumer <payment|notification>   stop a consumer mid-stream");
  console.log("  resume-consumer <payment|notification>  restart a stopped consumer");
  console.log("  duplicate-next <n>                      make trip-service redeliver the next n events");
  console.log("  kill-fraud                               take fraud-check-service down (503s)");
  console.log("  restore-fraud                            bring fraud-check-service back");
  console.log("  latency-fraud <ms>                       inject latency into fraud-check-service");
  console.log("  generate-trips <n>                       create n trips through the gateway");
  console.log("  status                                   print the monitor's current snapshot");
  process.exit(1);
}

fn(...args).catch((err) => {
  console.error(err);
  process.exit(1);
});
