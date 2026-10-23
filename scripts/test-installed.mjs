import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { rustEnvironment } from "./toolchain.mjs";
import { version } from "./native-build.mjs";

const directory = mkdtempSync(join(tmpdir(), "octri-auditor-consumer-"));
try {
  execFileSync(process.execPath, ["scripts/package-node-native.mjs"], {
    stdio: "inherit",
  });
  const nativeOutput = resolve(
    "artifacts/npm-native",
    `${process.platform}-${process.arch}`,
  );
  const nativeManifest = JSON.parse(
    readFileSync(join(nativeOutput, "manifest.json"), "utf8"),
  );
  const browserVersion = JSON.parse(
    readFileSync("packages/browser/package.json", "utf8"),
  ).version;
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({ name: "private-install-check", private: true }),
  );
  execFileSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      join(nativeOutput, nativeManifest.packages[1].filename),
      join(nativeOutput, nativeManifest.packages[0].filename),
      resolve(
        `artifacts/releases/octri-spec-auditor-wasm-${browserVersion}.tgz`,
      ),
    ],
    { cwd: directory, stdio: "inherit" },
  );
  const require = createRequire(join(directory, "consumer.cjs"));
  writeFileSync(
    join(directory, "types-test.mts"),
    readFileSync("packages/types-test.ts"),
  );
  execFileSync(
    process.execPath,
    [
      resolve("node_modules/typescript/bin/tsc"),
      "--noEmit",
      "--strict",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--target",
      "ES2022",
      "--lib",
      "ES2022,DOM",
      join(directory, "types-test.mts"),
    ],
    { stdio: "inherit" },
  );
  const native = require("@octri/spec-auditor-native");
  const content = readFileSync("fixtures/pets.yaml", "utf8");
  const report = await native.audit({ input: native.text(content) });
  assert.equal(report.score, 10);
  assert.equal(report.complete, true);
  const browserEntry = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      'console.log(import.meta.resolve("@octri/spec-auditor-wasm"))',
    ],
    { cwd: directory, encoding: "utf8" },
  ).trim();
  assert.ok(browserEntry.includes(directory));
  const build = JSON.parse(
    readFileSync("artifacts/bindings/build.json", "utf8"),
  );
  execFileSync(
    "python3",
    [
      "-m",
      "pip",
      "install",
      "--no-deps",
      "--target",
      join(directory, "python"),
      resolve(
        `artifacts/releases/octri_spec_auditor-${version}-py3-none-any.whl`,
      ),
    ],
    { stdio: "inherit" },
  );
  execFileSync(
    "python3",
    [
      "-c",
      'import json,sys;from octri_auditor import Auditor;r=Auditor(sys.argv[1]).audit(json.load(sys.stdin));assert r["complete"] and r["score"]==10',
      build.library,
    ],
    {
      input: JSON.stringify({
        input: { uri: "memory://audit/api.yaml", content },
      }),
      env: { ...process.env, PYTHONPATH: join(directory, "python") },
      stdio: ["pipe", "inherit", "inherit"],
    },
  );
  const release = resolve("artifacts/releases");
  execFileSync("tar", [
    "-xzf",
    join(
      release,
      `octri-spec-auditor-${version}-${process.platform}-${process.arch}.tar.gz`,
    ),
    "-C",
    directory,
  ]);
  const installed = join(directory, "octri-spec-auditor");
  const suffix = process.platform === "darwin" ? "dylib" : "so";
  const library = join(installed, `liboctri_auditor_ffi.${suffix}`);
  const jni = join(installed, `liboctri_auditor_jni.${suffix}`);
  const envelope = JSON.stringify({
    abiVersion: 1,
    action: "audit",
    request: {
      input: { uri: "memory://audit/openapi.yaml", content, generated: false },
    },
  });
  const expected = JSON.parse(
    execFileSync(join(installed, "octri-spec-audit"), ["execute"], {
      input: envelope,
    }),
  );
  const env = {
    ...process.env,
    CC: process.env.CC ?? "clang",
    CGO_ENABLED: "1",
    CGO_LDFLAGS: `-L${installed} -Wl,-rpath,${installed}`,
    GOWORK: "off",
  };
  const run = (command, args, options = {}) =>
    execFileSync(command, args, {
      cwd: installed,
      env,
      stdio: "inherit",
      ...options,
    });
  const check = (language, command, args, options = {}) => {
    const actual = JSON.parse(
      execFileSync(command, args, {
        cwd: installed,
        env,
        encoding: "utf8",
        input: envelope,
        maxBuffer: 128 * 1024 * 1024,
        ...options,
      }),
    );
    assert.deepEqual(
      actual,
      expected,
      `Installed ${language} consumer differs from Rust`,
    );
    console.log(`Installed ${language}: complete audit result matches Rust`);
  };
  const gems = join(directory, "gems");
  run("gem", [
    "install",
    "--local",
    // Its dependencies come from the host Ruby; release-verify.mjs resolves them.
    "--ignore-dependencies",
    "--no-document",
    "--install-dir",
    gems,
    join(release, `octri-spec-auditor-${version}.gem`),
  ]);
  const gemPaths = execFileSync(
    "ruby",
    ["-e", "puts Gem.path.join(File::PATH_SEPARATOR)"],
    { encoding: "utf8" },
  ).trim();
  check(
    "Ruby gem",
    "ruby",
    [
      "-r",
      "octri_auditor",
      "-e",
      'puts OctriExactJSON.generate({"Ok"=>OctriAuditor::Auditor.new(ARGV[0]).audit(OctriExactJSON.parse(STDIN.read)["request"])})',
      library,
    ],
    {
      env: {
        ...env,
        GEM_HOME: gems,
        GEM_PATH: [gems, gemPaths].join(delimiter),
      },
    },
  );
  run(
    "composer",
    ["install", "--no-dev", "--no-plugins", "--no-scripts", "--no-interaction"],
    { cwd: join(installed, "bindings/php") },
  );
  check("PHP Composer", "php", [
    "-d",
    "ffi.enable=true",
    "-r",
    "require $argv[1];$a=new \\Octri\\Audit\\Auditor($argv[2]);echo $a->callJson(json_decode(stream_get_contents(STDIN)));",
    join(installed, "bindings/php/vendor/autoload.php"),
    library,
  ]);
  run(
    "go",
    ["build", "-o", join(directory, "go-consumer"), "./cmd/bindingcheck"],
    { cwd: join(installed, "bindings/go") },
  );
  check("Go module", join(directory, "go-consumer"), []);
  const java = join(build.javaHome, "bin/java");
  const classpath = [
    join(release, `spec-auditor-${version}.jar`),
    join(release, `spec-auditor-kotlin-${version}.jar`),
    build.javaDependencies,
  ].join(delimiter);
  run(join(build.javaHome, "bin/javac"), [
    "--release",
    "11",
    "-cp",
    classpath,
    "-d",
    directory,
    "bindings/java/src/test/java/BindingCheck.java",
  ]);
  check("Java JAR/JNI", java, [
    "-Xcheck:jni",
    "-cp",
    [directory, classpath].join(delimiter),
    "BindingCheck",
    library,
    jni,
  ]);
  const kotlin = join(directory, "kotlin-consumer.jar");
  run("kotlinc", [
    "bindings/kotlin/src/test/kotlin/BindingCheck.kt",
    "-jvm-target",
    "11",
    "-classpath",
    classpath,
    "-include-runtime",
    "-d",
    kotlin,
  ]);
  check("Kotlin JAR", java, [
    "-Xcheck:jni",
    "-cp",
    [kotlin, classpath].join(delimiter),
    "BindingCheckKt",
    library,
    jni,
  ]);
  run("dart", ["pub", "get", "--offline"], {
    cwd: join(installed, "bindings/dart"),
  });
  check("Dart package", "dart", ["run", "bin/check.dart", library], {
    cwd: join(installed, "bindings/dart"),
  });
  // Swift loads the C ABI at runtime, so only the Linux segment policy applies.
  const swiftArgs =
    process.platform === "linux"
      ? ["-Xlinker", "-z", "-Xlinker", "separate-code"]
      : [];
  run("swift", [
    "build",
    "-c",
    "release",
    "--package-path",
    "bindings/swift",
    "--product",
    "BindingCheck",
    ...swiftArgs,
  ]);
  const swiftDirectory = execFileSync(
    "swift",
    [
      "build",
      "-c",
      "release",
      "--package-path",
      "bindings/swift",
      "--show-bin-path",
    ],
    { cwd: installed, encoding: "utf8" },
  ).trim();
  check("Swift package", join(swiftDirectory, "BindingCheck"), [library]);
  const rustConsumer = join(directory, "rust-consumer");
  mkdirSync(join(rustConsumer, "src"), { recursive: true });
  writeFileSync(
    join(rustConsumer, "Cargo.toml"),
    `[package]\nname="installed-consumer"\nversion="0.0.0"\nedition="2024"\n[dependencies]\noctri-auditor={path="${installed}/crates/octri-auditor"}\nserde_json="1"\n`,
  );
  writeFileSync(
    join(rustConsumer, "src/main.rs"),
    'use std::io::Read;fn main()->Result<(),Box<dyn std::error::Error>>{let mut text=String::new();std::io::stdin().read_to_string(&mut text)?;let value:serde_json::Value=serde_json::from_str(&text)?;let request=serde_json::from_value(value["request"].clone())?;let report=octri_auditor::audit(&request)?;assert!(report.complete);Ok(())}',
  );
  run("cargo", ["run", "--quiet", "--offline"], {
    cwd: rustConsumer,
    env: {
      ...rustEnvironment(),
      CARGO_TARGET_DIR: resolve("target/installed-consumer"),
    },
    input: envelope,
    stdio: ["pipe", "inherit", "inherit"],
  });
  console.log(
    "All packed language artifacts installed and exercised in clean consumers",
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
