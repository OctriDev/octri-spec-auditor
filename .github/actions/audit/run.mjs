import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const directory = mkdtempSync(
  join(process.env.RUNNER_TEMP ?? tmpdir(), "octri-audit-"),
);
const target = join(directory, "target");
const build = spawnSync(
  process.execPath,
  [
    join(root, "scripts/cargo.mjs"),
    "build",
    "--release",
    "--locked",
    "-p",
    "octri-auditor-cli",
  ],
  {
    cwd: root,
    env: { ...process.env, CARGO_TARGET_DIR: target },
    stdio: "inherit",
    timeout: 600_000,
    killSignal: "SIGKILL",
  },
);
if (build.status !== 0) process.exit(build.status ?? 2);
const binary = join(
  target,
  "release",
  process.platform === "win32" ? "octri-spec-audit.exe" : "octri-spec-audit",
);
const reportPath = join(directory, "audit.json");
const sarifPath = join(directory, "audit.sarif");
const args = [
  "audit",
  resolve(process.env.AUDITOR_SPEC),
  "--as-of",
  new Date().toISOString().slice(0, 10),
  "--output",
  reportPath,
];
if (process.env.AUDITOR_CONFIG)
  args.push("--config", resolve(process.env.AUDITOR_CONFIG));
const dependencies = JSON.parse(process.env.AUDITOR_FILES ?? "{}");
if (
  !dependencies ||
  typeof dependencies !== "object" ||
  Array.isArray(dependencies) ||
  Object.keys(dependencies).length > 99
)
  throw new Error("files must map at most 99 dependency URIs to local paths");
for (const [uri, path] of Object.entries(dependencies)) {
  if (typeof path !== "string" || !path || !uri || uri.includes("="))
    throw new Error("Each dependency needs a URI and local file path");
  args.push("--file", `${uri}=${resolve(path)}`);
}
if (process.env.AUDITOR_BASELINE)
  args.push("--baseline", resolve(process.env.AUDITOR_BASELINE));
if (process.env.AUDITOR_FAIL_NEW === "true") args.push("--fail-on-new");
const audit = spawnSync(binary, args, {
  stdio: "inherit",
  timeout: 35_000,
  killSignal: "SIGKILL",
});
if (![0, 1, 2].includes(audit.status)) process.exit(2);
let report;
try {
  report = JSON.parse(readFileSync(reportPath, "utf8"));
} catch {
  process.exit(audit.status || 2);
}
for (const format of ["annotations", "sarif"]) {
  const result = spawnSync(binary, ["execute"], {
    input: JSON.stringify({ abiVersion: 1, action: "export", format, report }),
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    timeout: 35_000,
    killSignal: "SIGKILL",
  });
  if (result.status !== 0) process.exit(2);
  const value = JSON.parse(result.stdout).Ok;
  if (format === "annotations") process.stdout.write(value);
  else writeFileSync(sarifPath, JSON.stringify(value) + "\n");
}
if (process.env.GITHUB_OUTPUT)
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `report=${reportPath}\nsarif=${sarifPath}\nscore=${report.score}\n`,
  );
process.exit(audit.status);
