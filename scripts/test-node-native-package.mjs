/** Install the packed platform addon and facade outside the source checkout. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const output = resolve(
  "artifacts/npm-native",
  `${process.platform}-${process.arch}`,
);
const manifest = JSON.parse(
  readFileSync(join(output, "manifest.json"), "utf8"),
);
const directory = mkdtempSync(join(tmpdir(), "octri-native-npm-"));
try {
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({ private: true }),
  );
  execFileSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      ...manifest.packages.map((pkg) => join(output, pkg.filename)),
    ],
    { cwd: directory, stdio: "inherit" },
  );
  const packageName = manifest.packages[1].name;
  const script = `const api = require(${JSON.stringify(packageName)}); assert(typeof api === "object" || typeof api === "function");`;
  const check = `const assert = require("node:assert/strict"); ${script} api.Auditor.audit({input:api.text(JSON.stringify({openapi:"3.1.2",info:{title:"Package",version:"1"},paths:{}}))}).then(r=>assert(Array.isArray(r.findings))).catch(e=>{console.error(e);process.exit(1)});`;
  execFileSync(process.execPath, ["-e", check], {
    cwd: directory,
    stdio: "inherit",
  });
  console.log(
    "Installed native platform package and facade passed outside checkout",
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
