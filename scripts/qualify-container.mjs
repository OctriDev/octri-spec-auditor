/** Refresh a disposable Linux qualification image from a read-only /current mount. */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

if (process.platform !== "linux" || !existsSync("/current/Cargo.toml"))
  throw new Error(
    "Run only inside a disposable qualification container with the repository mounted read-only at /current",
  );
mkdirSync("/auditor", { recursive: true });
process.chdir("/auditor");
for (const path of [
  "Cargo.toml",
  "Cargo.lock",
  "rust-toolchain.toml",
  "package.json",
  "package-lock.json",
  ".prettierignore",
  ".github",
  "crates",
  "vendor",
  "fixtures",
  "scripts",
  "bindings",
  "packages",
  "server",
  "web",
  "schemas",
  "README.md",
  "LICENSE",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CHANGELOG.md",
]) {
  cpSync(join("/current", path), join("/auditor", path), {
    recursive: true,
    filter: (source) =>
      !source
        .split("/")
        .some((part) =>
          [
            "target",
            ".build",
            ".dart_tool",
            "__pycache__",
            ".swiftpm",
            "node_modules",
          ].includes(part),
        ) && !/\.(node|dylib|so|dll|pyc)$/.test(source),
  });
}
const run = (command, args) =>
  execFileSync(command, args, { stdio: "inherit" });
run("npm", ["ci", "--ignore-scripts"]);
for (const script of [
  "verify-vendor",
  "build-bindings",
  "test-bindings",
  "build-node",
  "contract-test",
  "performance",
])
  run(process.execPath, [`scripts/${script}.mjs`]);
run(process.execPath, ["--test", "packages/node/test.mjs"]);
run(process.execPath, [
  "scripts/cargo.mjs",
  "clippy",
  "--workspace",
  "--all-targets",
  "--",
  "-D",
  "warnings",
]);
run(process.execPath, ["scripts/cargo.mjs", "test", "--workspace"]);
console.log(`Current-source Linux ${process.arch} qualification passed`);
