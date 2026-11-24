# Changelog

## 0.2.0

- Vendors octri-parser 0.2.0. Requests that send a removed config field fail
  with `INVALID_REQUEST`.
- Removed `limits.maxDocuments` and `maxFindings`. Reports no longer stop at a
  finding count, so large specifications are no longer marked incomplete.
- Removed the policy ceilings: 32 profiles, 10,000 ignored keys, exclusions and
  baseline fingerprints, and the 24 MiB, 64 MiB, 1,000,000-node and depth-128
  caps on configured limits. The request byte cap still applies.
- `limits.maxNodes` bounds reference expansion only, as in the parser.
- Results larger than 128 MiB are returned instead of `LIMIT_OUTPUT_BYTES`.
- Build scripts call `cargo` directly; `scripts/cargo.mjs` and its
  `~/.cache/octri-rust` toolchain lookup are gone.
- `config.schema.json` accepts exported baselines: it required ruleset `1.0.0`
  while the engine writes and accepts `1.0.3`.
- npm packages and browser assets ship as `0.2.0`.

## 0.1.3

- Publish the language bindings: PyPI, RubyGems, Maven Central, pub.dev and crates.io packages, Go, PHP and Swift mirror repositories, and C archives on the GitHub release. Each package carries the native library for Linux x64 and arm64 (glibc 2.36+) and macOS arm64, and its no-argument constructor loads it.
- The Swift binding loads the library with `dlopen` instead of linking a system library, and the Go module path is `github.com/octridev/octri-spec-auditor-go`. The Ruby gem declares `bigdecimal` and `fiddle`, which leave Ruby's default gems in 3.4 and 4.0.
- Preserve authored operation IDs with unfamiliar leading actions, regardless of HTTP method, casing or matching tags. Naming suggestions no longer infer a missing action from an incomplete verb vocabulary.
- Retain recognized leading actions when removing duplicate namespace words. Keep duplicate-action repairs, schema conventions and collision protection.
- Advance the ruleset to `1.0.3`; npm bindings and browser assets ship as `0.1.6`.

## 0.1.0

- Offline OpenAPI 3.0, 3.1 and 3.2 readiness auditing with physical source findings.
- Integrity, documentation, SDK and MCP views with transparent scoring and versioned static compatibility profiles.
- Policies, exclusions, baselines, comparison, SARIF and guarded fixes with exact undo.
- CLI, GitHub Action, browser worker, optional HTTP host and language bindings sharing one Rust engine.

Static compatibility findings do not certify execution of generated clients.
