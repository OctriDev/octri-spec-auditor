import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { rustEnvironment } from "./toolchain.mjs";

execFileSync(
  "cargo",
  ["build", "--release", "--locked", "-p", "octri-auditor-node"],
  { stdio: "inherit", env: rustEnvironment() },
);
const name =
  process.platform === "darwin"
    ? "liboctri_auditor_node.dylib"
    : process.platform === "win32"
      ? "octri_auditor_node.dll"
      : "liboctri_auditor_node.so";
const staging = mkdtempSync("packages/node/.native-build-");
try {
  const addon = join(staging, "octri-auditor.node");
  copyFileSync(`target/release/${name}`, addon);
  renameSync(addon, "packages/node/octri-auditor.node");
} finally {
  rmSync(staging, { recursive: true, force: true });
}
for (const folder of ["node"]) {
  copyFileSync("packages/shared/client.mjs", `packages/${folder}/client.mjs`);
  copyFileSync("packages/shared/numbers.mjs", `packages/${folder}/numbers.mjs`);
  copyFileSync("packages/shared/json.mjs", `packages/${folder}/json.mjs`);
  copyFileSync("packages/shared/index.d.ts", `packages/${folder}/index.d.ts`);
}
