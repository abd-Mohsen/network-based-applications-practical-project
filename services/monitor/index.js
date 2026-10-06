import express from "express";

const PORT = process.env.PORT || 4000;

const targets = {
  gateway: process.env.GATEWAY_URL || "http://gateway:3000",
  "trip-service": process.env.TRIP_SERVICE_URL || "http://trip-service:3001",
  "fraud-check-service": process.env.FRAUD_CHECK_URL || "http://fraud-check-service:3002",
  "payment-service": process.env.PAYMENT_SERVICE_URL || "http://payment-service:3003",
  "notification-service": process.env.NOTIFICATION_SERVICE_URL || "http://notification-service:3004",
};

const RABBITMQ_MGMT_URL = process.env.RABBITMQ_MGMT_URL || "http://rabbitmq:15672";
const RABBITMQ_USER = process.env.RABBITMQ_USER || "guest";
const RABBITMQ_PASS = process.env.RABBITMQ_PASS || "guest";
const RABBITMQ_AUTH = "Basic " + Buffer.from(`${RABBITMQ_USER}:${RABBITMQ_PASS}`).toString("base64");
const QUEUES = ["trip.completed", "payment.completed", "trip.completed.dlq"];

let snapshot = { updatedAt: null, services: {}, queues: {} };

async function fetchQueueDepth(name) {
  const res = await fetch(`${RABBITMQ_MGMT_URL}/api/queues/%2F/${encodeURIComponent(name)}`, {
    headers: { authorization: RABBITMQ_AUTH },
    signal: AbortSignal.timeout(2000),
  });
  if (!res.ok) throw new Error(`rabbitmq management api responded ${res.status}`);
  const data = await res.json();
  return { messages: data.messages ?? 0, consumers: data.consumers ?? 0 };
}

async function poll() {
  const entries = await Promise.all(
    Object.entries(targets).map(async ([name, url]) => {
      try {
        const res = await fetch(`${url}/metrics`, { signal: AbortSignal.timeout(2000) });
        const data = await res.json();
        return [name, { ok: true, ...data }];
      } catch (err) {
        return [name, { ok: false, error: err.message }];
      }
    })
  );
  const queueEntries = await Promise.all(
    QUEUES.map(async (name) => {
      try {
        return [name, await fetchQueueDepth(name)];
      } catch (err) {
        return [name, { error: err.message }];
      }
    })
  );
  snapshot = {
    updatedAt: new Date().toISOString(),
    services: Object.fromEntries(entries),
    queues: Object.fromEntries(queueEntries),
  };
}
setInterval(poll, 2000);
poll();

const app = express();

app.get("/data", (req, res) => res.json(snapshot));
app.get("/health", (req, res) => res.json({ status: "ok" }));

app.get("/", (req, res) => {
  res.type("html").send(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>RideFlow Monitor</title>
<style>
  body { font-family: ui-monospace, "SF Mono", Consolas, monospace; background: #0f1115; color: #e6e9ef; margin: 0; padding: 24px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .ts { color: #8a93a1; font-size: 12px; margin-bottom: 20px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #2a2f3a; padding: 8px 10px; text-align: left; font-size: 12.5px; vertical-align: top; }
  th { background: #171a21; }
  .down { color: #e3a83b; }
</style>
</head>
<body>
  <h1>RideFlow &mdash; live service metrics</h1>
  <div class="ts" id="ts">loading&hellip;</div>
  <div id="root">loading&hellip;</div>
  <script>
    async function tick() {
      const r = await fetch('/data');
      const d = await r.json();
      document.getElementById('ts').textContent = 'updated ' + (d.updatedAt || '');
      const rows = Object.entries(d.services || {}).map(function (entry) {
        var name = entry[0], m = entry[1];
        var cells = Object.entries(m).filter(function (kv) { return kv[0] !== 'ok' && kv[0] !== 'error'; })
          .map(function (kv) { return kv[0] + '=' + JSON.stringify(kv[1]); }).join('  ');
        var label = name + (m.ok ? '' : ' <span class="down">(unreachable' + (m.error ? ': ' + m.error : '') + ')</span>');
        return '<tr><td>' + label + '</td><td>' + cells + '</td></tr>';
      }).join('');
      var qrows = Object.entries(d.queues || {}).map(function (entry) {
        var name = entry[0], q = entry[1];
        var cell = q.error ? '<span class="down">' + q.error + '</span>' : 'messages=' + q.messages + '  consumers=' + q.consumers;
        return '<tr><td>' + name + '</td><td>' + cell + '</td></tr>';
      }).join('');
      document.getElementById('root').innerHTML =
        '<table><tr><th>service</th><th>metrics</th></tr>' + rows + '</table>' +
        '<h1 style="margin-top:24px">RabbitMQ queues</h1>' +
        '<table><tr><th>queue</th><th>depth</th></tr>' + qrows + '</table>';
    }
    tick();
    setInterval(tick, 2000);
  </script>
</body>
</html>`);
});

app.listen(PORT, () => console.log(`[monitor] listening on ${PORT}`));
