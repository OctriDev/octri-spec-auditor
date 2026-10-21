import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { Auditor } from "../packages/node/index.mjs";

const document = JSON.parse(readFileSync("fixtures/clean.json", "utf8"));
const operation = structuredClone(document.paths["/pets"].get);
document.paths = {};
for (let index = 0; index < 500; index++) {
  document.paths[`/pets${index}`] = {
    get: {
      ...operation,
      operationId: `listPets${index}`,
      description: "Contract documentation. ".repeat(75),
    },
  };
}
const request = {
  input: {
    uri: "memory://benchmark/api.json",
    content: JSON.stringify(document),
    generated: false,
  },
};
await Auditor.audit(request);
const timings = [];
for (let index = 0; index < 10; index++) {
  const started = performance.now();
  const report = await Auditor.audit(request);
  timings.push(performance.now() - started);
  assert.equal(report.surface.operations, 500);
  assert.equal(report.complete, true);
}
timings.sort((left, right) => left - right);
const result = {
  platform: process.platform,
  architecture: process.arch,
  node: process.version,
  bytes: Buffer.byteLength(request.input.content),
  operations: 500,
  samples: 10,
  p95Ms: timings[9],
  targetMs: 3000,
  timingsMs: timings,
};
mkdirSync("artifacts", { recursive: true });
writeFileSync(
  "artifacts/performance.json",
  JSON.stringify(result, null, 2) + "\n",
);
assert.ok(
  result.p95Ms < result.targetMs,
  `500-operation audit p95 ${result.p95Ms.toFixed(0)}ms exceeds 3000ms`,
);
console.log(
  `500 operations / ${result.bytes} bytes: p95 ${result.p95Ms.toFixed(0)}ms`,
);
