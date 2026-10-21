import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import Ajv from "ajv/dist/2020.js";
import SwaggerParser from "@apidevtools/swagger-parser";
import { Auditor } from "../packages/node/index.mjs";

const validate = new Ajv({ strict: false, allErrors: true }).compile(
  JSON.parse(readFileSync("schemas/report.schema.json", "utf8")),
);
const content = readFileSync("fixtures/clean.json", "utf8");
const request = {
  input: { uri: "memory://audit/api.json", content, generated: false },
};
for (const text of [
  content,
  "{",
  content.replace('"operationId": "listPets",', ""),
]) {
  const report = await Auditor.audit({
    ...request,
    input: { ...request.input, content: text },
  });
  assert.ok(validate(report), JSON.stringify(validate.errors));
  const keys = report.findings.map((finding) => finding.key);
  assert.equal(
    new Set(keys).size,
    keys.length,
    "Finding keys must identify one finding",
  );
}
await SwaggerParser.validate(JSON.parse(content));
const failing = {
  ...request,
  input: {
    ...request.input,
    content: content.replace('"operationId": "listPets",', ""),
  },
};
const report = await Auditor.audit(failing);
const selected = report.findings.find(
  (finding) => finding.ruleId === "operation-id-present",
);
const fixed = await Auditor.fix({
  request: failing,
  keys: [selected.key],
  expectedFiles: Object.fromEntries(
    report.manifest.files.map((file) => [file.uri, file.sha256]),
  ),
});
await SwaggerParser.validate(JSON.parse(fixed.revised.input.content));
assert.ok(validate(fixed.report), JSON.stringify(validate.errors));
const wire = JSON.parse(
  execFileSync("target/release/octri-spec-audit", ["execute"], {
    input: JSON.stringify({ abiVersion: 1, action: "audit", request }),
    maxBuffer: 128 * 1024 * 1024,
  }),
);
assert.deepEqual(wire.Ok, await Auditor.audit(request));
console.log(
  "Report schema, finding identity, independent OpenAPI validation, repaired artifact and CLI/Node parity passed",
);
