/** Build local release candidates without registry publication. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { version } from "./native-build.mjs";

const root = process.cwd();
const release = resolve("artifacts/releases");
mkdirSync(release, { recursive: true });
const run = (command, args, options = {}) =>
  execFileSync(command, args, { stdio: "inherit", ...options });
for (const name of ["node", "browser"]) {
  const directory = join(root, "packages", name);
  copyFileSync("LICENSE", join(directory, "LICENSE"));
  copyFileSync(
    "THIRD-PARTY-NOTICES.md",
    join(directory, "THIRD-PARTY-NOTICES.md"),
  );
  run("npm", ["pack", "--ignore-scripts", "--pack-destination", release], {
    cwd: directory,
  });
}
run("python3", [
  "-m",
  "pip",
  "wheel",
  "--no-deps",
  "--wheel-dir",
  release,
  "./bindings/python",
]);
run(
  "gem",
  [
    "build",
    "octri-spec-auditor.gemspec",
    "--output",
    join(release, `octri-spec-auditor-${version}.gem`),
  ],
  { cwd: join(root, "bindings/ruby") },
);
for (const [source, output] of [
  [
    `bindings/java/target/spec-auditor-${version}.jar`,
    `spec-auditor-${version}.jar`,
  ],
  [
    `bindings/kotlin/target/spec-auditor-kotlin-${version}.jar`,
    `spec-auditor-kotlin-${version}.jar`,
  ],
])
  copyFileSync(source, join(release, output));
const staging = mkdtempSync(join(tmpdir(), "octri-auditor-release-"));
try {
  const bundle = join(staging, "octri-spec-auditor");
  mkdirSync(bundle);
  for (const file of [
    "LICENSE",
    "README.md",
    "SECURITY.md",
    "CONTRIBUTING.md",
    "CHANGELOG.md",
    "THIRD-PARTY-NOTICES.md",
    "vendor/PARSER-LICENSE",
    "vendor/PARSER-THIRD-PARTY-NOTICES.md",
    "vendor/snapshot.json",
  ])
    copyFileSync(file, join(bundle, file.split("/").at(-1)));
  for (const directory of ["bindings", "schemas", "crates", "vendor"])
    cpSync(directory, join(bundle, directory), {
      recursive: true,
      filter: (source) =>
        !source
          .split(/[\\/]/)
          .some((part) =>
            [
              "target",
              ".build",
              ".dart_tool",
              "__pycache__",
              ".swiftpm",
              "node_modules",
              "build",
              "dist",
            ].includes(part),
          ) &&
        !source.split(/[\\/]/).some((part) => part.endsWith(".egg-info")) &&
        !/\.(gem|class|pyc|node|dylib|so|dll)$/.test(source) &&
        !/\/(?:\._[^/]*|\.DS_Store)$/.test(source),
    });
  const build = JSON.parse(
    readFileSync("artifacts/bindings/build.json", "utf8"),
  );
  for (const file of ["Cargo.toml", "Cargo.lock", "rust-toolchain.toml"])
    copyFileSync(file, join(bundle, file));
  for (const source of [
    build.library,
    build.jni,
    "target/release/octri-spec-audit",
  ])
    copyFileSync(source, join(bundle, source.split("/").at(-1)));
  cpSync("artifacts/web", join(bundle, "web"), { recursive: true });
  run(
    "tar",
    [
      "--exclude=._*",
      "--exclude=.DS_Store",
      "--exclude=__MACOSX",
      "-czf",
      join(
        release,
        `octri-spec-auditor-${version}-${process.platform}-${process.arch}.tar.gz`,
      ),
      "-C",
      staging,
      "octri-spec-auditor",
    ],
    { env: { ...process.env, COPYFILE_DISABLE: "1" } },
  );
} finally {
  rmSync(staging, { recursive: true, force: true });
}
const files = readdirSync(release)
  .filter((name) => name !== "SHA256SUMS")
  .sort();
writeFileSync(
  join(release, "SHA256SUMS"),
  files
    .map(
      (name) =>
        `${createHash("sha256")
          .update(readFileSync(join(release, name)))
          .digest("hex")}  ${name}`,
    )
    .join("\n") + "\n",
);
console.log(`Release candidates: ${release}`);
