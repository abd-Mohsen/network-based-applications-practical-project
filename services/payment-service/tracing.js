// Loaded via `node --import ./tracing.js index.js` (see Dockerfile) -- runs
// before the app code, so express/http/amqplib get auto-instrumented without
// touching a single route handler. This is what turns "gateway called
// trip-service" and "trip-service published to RabbitMQ, payment-service
// consumed it" into one connected trace in Jaeger instead of five services
// each seeing an isolated request.
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://jaeger:4318";
const serviceName = process.env.OTEL_SERVICE_NAME || "unknown-service";

const sdk = new NodeSDK({
  resource: new Resource({ [ATTR_SERVICE_NAME]: serviceName }),
  traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

process.on("SIGTERM", () => {
  sdk.shutdown().finally(() => process.exit(0));
});
