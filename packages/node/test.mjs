import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import test from "node:test";
import Auditor, {
  text,
  object,
  AuditError,
  stringifyJson,
  parseJson,
} from "./index.mjs";
import { createRequire } from "node:module";

test("Node native public methods agree with Rust and preserve source input", async () => {
  const source = readFileSync("fixtures/pets.yaml", "utf8");
  const request = { input: text(source) };
  const result = await Auditor.audit(request);
  const rust = JSON.parse(
    execFileSync("target/release/octri-spec-audit", ["execute"], {
      input: JSON.stringify({ abiVersion: 1, action: "audit", request }),
    }),
  );
  assert.deepEqual(result, rust.Ok);
  assert.equal(request.input.content, source);
  assert.equal(result.score, 10);
  assert.equal(
    (await Auditor.rules()).filter((rule) => rule.weight > 0).length,
    14,
  );
  assert.equal((await Auditor.compare(result, result)).added.length, 0);
  assert.match(await Auditor.export(result, "html"), /Octri Spec Audit/);
});

test("semantic action verbs survive every native audit and repair", async () => {
  const clean = JSON.parse(readFileSync("fixtures/clean.json", "utf8"));
  for (const [id, proposal] of [
    ["findPetsByTags", undefined],
    ["findPetsByStatus", undefined],
    ["getFindings", undefined],
    ["getFindPetsByTags", "findPetsByTags"],
    ["PetsByTagsFind", "findPetsByTags"],
  ]) {
    clean.paths["/pets"].get.operationId = id;
    const request = { input: object(clean) };
    const report = await Auditor.audit(request);
    const naming = report.findings.filter(
      (f) => f.ruleId === "operation-id-naming",
    );
    assert.equal(naming.length, proposal === undefined ? 0 : 1, id);
    if (proposal !== undefined) {
      const fixed = await Auditor.fix({
        request,
        keys: [naming[0].key],
        expectedFiles: Object.fromEntries(
          report.manifest.files.map((f) => [f.uri, f.sha256]),
        ),
      });
      assert.equal(
        JSON.parse(fixed.revised.input.content).paths["/pets"].get.operationId,
        proposal,
      );
    }
  }
});

test("OpenAPI 3.2 audits and fixes preserve the version; Swagger requires Spec Converter", async () => {
  const request = {
    input: text(readFileSync("fixtures/openapi32.json", "utf8")),
  };
  const report = await Auditor.audit(request);
  assert.equal(report.valid, true);
  assert.equal(report.complete, true);
  assert.equal(report.surface.operations, 2);
  const finding = report.findings.find(
    (finding) => finding.ruleId === "operation-id-present",
  );
  const fixed = await Auditor.fix({
    request,
    keys: [finding.key],
    expectedFiles: Object.fromEntries(
      report.manifest.files.map((file) => [file.uri, file.sha256]),
    ),
  });
  assert.equal(fixed.report.valid, true);
  assert.equal(JSON.parse(fixed.revised.input.content).openapi, "3.2.1");
  const legacy = await Auditor.audit({
    input: text(
      '{"swagger":"2.0","info":{"title":"Legacy","version":"1"},"paths":{}}',
    ),
  });
  assert.equal(legacy.complete, false);
  assert.ok(
    legacy.findings.some(
      (finding) => finding.code === "SWAGGER_CONVERSION_REQUIRED",
    ),
  );
});

test("Invalid configuration raises structured errors; invalid source returns diagnostics", async () => {
  await assert.rejects(
    Auditor.audit({ input: text("{}"), config: { profiles: ["invented"] } }),
    (error) => error instanceof AuditError && error.code === "UNKNOWN_PROFILE",
  );
  const report = await Auditor.audit({ input: text("{") });
  assert.equal(report.valid, false);
  assert.equal(report.policyPassed, false);
});

test("Concurrent native calls retain independent state", async () => {
  const results = await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      Auditor.audit({
        input: text(
          index % 2 ? "{" : readFileSync("fixtures/pets.yaml", "utf8"),
        ),
      }),
    ),
  );
  for (let index = 0; index < results.length; index++)
    assert.equal(results[index].valid, index % 2 === 0);
});

test("Raw JSON transport preserves integers beyond JavaScript's numeric range", async () => {
  const content =
    '{"openapi":"3.1.2","info":{"title":"Numbers","version":"1.0.0"},"paths":{"/numbers":{"get":{"operationId":"getNumbers","responses":{"200":{"description":"Exact integer","x-counter":18446744073709551615}}}}}}';
  const result = await Auditor.executeJson(
    JSON.stringify({
      abiVersion: 1,
      action: "audit",
      request: { input: text(content) },
    }),
  );
  assert.ok(result.includes("18446744073709551615"));
  assert.equal(JSON.parse(result).Ok.valid, true);
  const decoded = await Auditor.audit({ input: text(content) });
  assert.deepEqual(decoded, parseJson(result).Ok);
  assert.ok(stringifyJson(decoded).includes("18446744073709551615"));
  assert.equal(
    decoded.findings.find((finding) => finding.ruleId === "response-schema").fix
      .before["x-counter"],
    18446744073709551615n,
  );
});

test("CommonJS facade uses the same native worker and rejects lossy object sources", async () => {
  const cjs = createRequire(import.meta.url)("./index.cjs");
  assert.deepEqual(
    await cjs.audit({
      input: text(readFileSync("fixtures/pets.yaml", "utf8")),
    }),
    await Auditor.audit({
      input: text(readFileSync("fixtures/pets.yaml", "utf8")),
    }),
  );
  for (const value of [
    { x: NaN },
    { x: undefined },
    { x: new Date() },
    Object.defineProperty({}, "x", {
      get() {
        throw new Error("Accessor must not run");
      },
      enumerable: true,
    }),
  ])
    assert.throws(() => object(value));
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => object(cyclic));
});
