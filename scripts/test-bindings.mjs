import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";

const build = JSON.parse(readFileSync("artifacts/bindings/build.json", "utf8"));
const library = build.library;
const env = { ...process.env, PYTHONPATH: resolve("bindings/python/src") };
const java = join(build.javaHome, "bin/java");
const targets = [
  ["python", "python3", ["bindings/python/check.py", library]],
  ["go", build.goCheck, []],
  [
    "java",
    java,
    [
      "-cp",
      [
        resolve("bindings/java/target/test-classes"),
        build.javaJar,
        build.javaDependencies,
      ].join(delimiter),
      "BindingCheck",
      library,
      build.jni,
    ],
  ],
  [
    "kotlin",
    java,
    [
      "-cp",
      [
        build.kotlinCheck,
        build.kotlinJar,
        build.javaJar,
        build.javaDependencies,
      ].join(delimiter),
      "BindingCheckKt",
      library,
      build.jni,
    ],
  ],
  ["php", "php", ["-d", "ffi.enable=true", "bindings/php/check.php", library]],
  ["ruby", "ruby", ["bindings/ruby/check.rb", library]],
  ["swift", build.swiftCheck, [library]],
  ["dart", build.dartCheck, [library]],
];
const source = readFileSync("fixtures/pets.yaml", "utf8");
const request = {
  input: {
    uri: "memory://audit/openapi.yaml",
    content: source,
    generated: false,
  },
};
const auditEnvelope = { abiVersion: 1, action: "audit", request };
const rust = (envelope) => {
  const result = spawnSync("target/release/octri-spec-audit", ["execute"], {
    input: JSON.stringify(envelope),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.ok(
    [0, 2].includes(result.status),
    `Rust transport failed: ${result.stderr}`,
  );
  return JSON.parse(result.stdout);
};
const reference = rust(auditEnvelope).Ok;
const failing = structuredClone(request);
failing.input.content = source.replace("      operationId: listPets\n", "");
const failingReport = rust({ ...auditEnvelope, request: failing }).Ok;
const selected = failingReport.findings.find(
  (finding) => finding.ruleId === "operation-id-present",
).key;
const envelopes = [
  {
    abiVersion: 1,
    action: "audit",
    request: {
      input: {
        uri: "memory://audit/openapi32.json",
        content: readFileSync("fixtures/openapi32.json", "utf8"),
        generated: false,
      },
    },
  },
  {
    abiVersion: 1,
    action: "audit",
    request: {
      input: {
        uri: "memory://audit/swagger.json",
        content:
          '{"swagger":"2.0","info":{"title":"Legacy","version":"1"},"paths":{}}',
        generated: false,
      },
    },
  },
  auditEnvelope,
  ...[
    "findPetsByTags",
    "getFindPetsByTags",
    "PetsByTagsFind",
    "loginUser",
    "logoutUser",
    "placeOrder",
    "ProvisionGetToken",
  ].map((operationId) => {
    const document = JSON.parse(readFileSync("fixtures/clean.json", "utf8"));
    document.paths["/pets"].get.operationId = operationId;
    return {
      abiVersion: 1,
      action: "audit",
      request: {
        input: {
          uri: "memory://audit/naming.json",
          content: JSON.stringify(document),
        },
      },
    };
  }),
  { ...auditEnvelope, request: failing },
  { ...auditEnvelope, request: { input: { ...request.input, content: "{" } } },
  {
    abiVersion: 1,
    action: "fix",
    request: {
      request: failing,
      keys: [selected],
      expectedFiles: Object.fromEntries(
        failingReport.manifest.files.map((file) => [file.uri, file.sha256]),
      ),
    },
  },
  { abiVersion: 1, action: "compare", before: failingReport, after: reference },
  ...["html", "sarif", "baseline", "annotations"].map((format) => ({
    abiVersion: 1,
    action: "export",
    report: failingReport,
    format,
  })),
  { abiVersion: 1, action: "rules" },
  { abiVersion: 1, action: "bundle", request },
  {
    abiVersion: 1,
    action: "audit",
    request: {
      input: {
        uri: "memory://audit/openapi.json",
        generated: false,
        content: JSON.stringify({
          openapi: "3.1.0",
          info: { title: "猫 Café", version: "1" },
          paths: {
            "/猫": {
              get: {
                responses: {
                  200: {
                    description: "Café → 猫",
                    content: {
                      "application/json": {
                        schema: { $ref: "./schemas/pet.json" },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      },
      files: {
        "memory://audit/schemas/pet.json":
          '{"type":"object","properties":{"é":{"type":"string"},"é":{"type":"integer"}}}',
      },
    },
  },
  { abiVersion: 0, action: "audit", request },
  { abiVersion: 1, action: "unknown" },
];
let checks = 0;
for (const [language, command, args] of targets) {
  for (const envelope of envelopes) {
    const expected = rust(envelope);
    const actual = JSON.parse(
      execFileSync(command, args, {
        input: JSON.stringify(envelope),
        encoding: "utf8",
        env,
        timeout:
          process.arch === "x64" && process.platform === "linux"
            ? 90_000
            : 30_000,
        maxBuffer: 32 * 1024 * 1024,
      }),
    );
    if (expected.Err) {
      // Deserialization columns describe each transport's JSON serialization.
      // Whitespace/key ordering may differ while the structured error is equal.
      const semantic = (result) => ({
        ...result.Err,
        message: result.Err.message.replace(/ at line \d+ column \d+$/, ""),
      });
      assert.ok(actual.Err, `${language}: expected structured error`);
      assert.deepEqual(
        semantic(actual),
        semantic(expected),
        `${language}: ${envelope.action}`,
      );
    } else {
      assert.deepEqual(actual, expected, `${language}: ${envelope.action}`);
    }
    checks++;
  }
  console.log(
    `${language}: ${envelopes.length} complete engine results match Rust`,
  );
}
writeFileSync(
  "artifacts/bindings/parity.json",
  JSON.stringify(
    {
      checks,
      languages: targets.map(([language]) => language),
      actions: envelopes.length,
    },
    null,
    2,
  ) + "\n",
);
console.log(`${checks} cross-language runtime checks passed`);
