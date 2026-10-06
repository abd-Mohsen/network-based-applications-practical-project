// Contract test (lecture p.12): validates that trip-service still satisfies
// the schema a consumer was built against. Run against trip-service directly
// (bypassing the gateway, since auth isn't the point here):
//
//   npm install && node docs/contracts/contract-test.js
//
// Expected result: v1 PASSES against the v1 contract; v2 FAILS against the
// same contract, because it silently renamed "fare" to "price".

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRIP_SERVICE_URL = process.env.TRIP_SERVICE_URL || "http://localhost:3001";

function loadSchema(file, schemaName) {
  const doc = yaml.load(fs.readFileSync(path.join(__dirname, file), "utf8"));
  return doc.components.schemas[schemaName];
}

async function createTrip(route) {
  const res = await fetch(`${TRIP_SERVICE_URL}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ origin: "Damascus", destination: "Aleppo", fare: 18.5 }),
  });
  return res.json();
}

async function main() {
  const ajv = new Ajv();
  addFormats(ajv); // TripV1's acceptedAt/completedAt/createdAt use format: date-time
  // This is the contract a consumer wrote their integration against: TripV1,
  // which requires a numeric "fare" field.
  const consumerSchema = loadSchema("openapi-v1.yaml", "TripV1");
  const validate = ajv.compile(consumerSchema);

  console.log("Consumer contract: TripV1 (requires \"fare\")\n");

  const v1 = await createTrip("/v1/trips");
  const v1ok = validate(v1);
  console.log("POST /v1/trips ->", v1);
  console.log(v1ok ? "PASS\n" : `FAIL — ${ajv.errorsText(validate.errors)}\n`);

  const v2 = await createTrip("/v2/trips");
  const v2ok = validate(v2);
  console.log("POST /v2/trips ->", v2);
  console.log(
    v2ok
      ? "PASS (unexpected -- the break wasn't caught!)\n"
      : `FAIL (expected) — ${ajv.errorsText(validate.errors)}\n`
  );

  console.log(
    "This is the breaking change caught before deploy: v2 silently renamed\n" +
      '"fare" to "price", and a contract test against the old spec catches it\n' +
      "immediately instead of letting a consumer discover it in production."
  );

  if (v1ok && !v2ok) process.exit(0);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
