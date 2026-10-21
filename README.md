# Octri Spec Auditor

[Live demo](https://octri.dev/openapi-audit) · Free to try in your browser, no account required.

An offline OpenAPI readiness auditor written in Rust. The same engine powers the CLI, browser worker and every language binding. It uses the Octri Rust parser vendored in `vendor/octri-parser`.

Maintained by [OctriDev](https://github.com/octridev). Build from source or use platform-matched release artifacts. Licensed under [Apache-2.0](LICENSE); third-party components retain their own licenses.

## Npm packages

```sh
npm install @octri/spec-auditor-wasm
```

Use `@octri/spec-auditor-native` for Node.js with platform-matched native addons.
Native packages select a pinned optional binary dependency for macOS ARM64 or
Linux x64/ARM64 with glibc; other platforms can use WASM or build from source.
Keep optional dependencies enabled. Node.js requires version 22.19 or later.

The complete static browser product is `@octri/spec-auditor-web`.

Package READMEs contain installation examples and hosting requirements. Npm
wrapper patch versions can differ from the engine version recorded in results.
Other language registries are separate distribution targets; source-build
instructions remain below.

## Run locally

Requirements: Node.js 22.19 or newer and the pinned Rust 1.95 toolchain. The helper installs Rust into an isolated cache when no suitable toolchain exists.

```sh
npm ci --ignore-scripts
node scripts/cargo.mjs test --workspace
node scripts/cargo.mjs build --release -p octri-auditor-cli
target/release/octri-spec-audit audit fixtures/pets.yaml
npm run build:node
npm run test:node
```

For the browser, install `wasm-bindgen-cli` version **0.2.129**, then:

```sh
npm run build:wasm
npm run dev
# Open http://127.0.0.1:4178
```

The browser supports paste, multiple JSON/YAML files, folders with nested references, root selection, physical source navigation, four readiness views, search and severity filters, prioritized findings, reviewed fixes, exact undo, policy editing, SDK target selection, baselines, exclusions with reasons and expiry, comparison and downloads. Network retrieval and local persistence each require an explicit user action. Audits run in disposable workers with a 30-second deadline. Source is not sent to an audit server.

## Product contract

- OpenAPI **3.0.x, 3.1.x and 3.2.x** are audited without rewriting their dialect. Swagger input gets `SWAGGER_CONVERSION_REQUIRED`: use **Spec Converter** to convert it to OpenAPI, review the converted document, then audit it. No automatic conversion or downgrade runs in the auditor.
- Integrity errors, unresolved references, duplicate keys and resource exhaustion prevent a successful readiness result. A score of zero with `complete: false` means **blocked**, not a completed low score.
- Integrity, Docs, SDK and MCP views expose checked, failed, skipped and unsupported counts. Disabled checks and exclusions remain visible.
- Findings include stable rule IDs, keys, SHA-256 fingerprints, physical file/pointer/line locations, related locations, impact, evidence and remediation.
- Fourteen weighted rules retain Octri's ten-point score. Diagnostic rules can block policy without changing those historical weights. See scoring below.
- Rule policy, severity thresholds, versioned compatibility profiles, reasoned/expiring exclusions, version-matched baselines and fail-on-new behavior are shared by all entry points.
- Fix proposals are immutable transactions guarded by source hashes and before-values. Preview precedes browser apply. Descriptions and response schemas require authored input. No prose or payload schema is invented. Edited files export as formatted JSON; original YAML/JSON bytes remain available for exact undo.
- JSON, escaped standalone HTML, SARIF 2.1.0, GitHub annotations, baseline, original/revised files and patch artifacts are portable. Report comparison requires matching report/ruleset and rule/profile policy.
- Static compatibility is **not executed consumer conformance**. Every profile records its own version, static evidence and `executedVerification: "unknown"`. Composition, dynamic vocabularies and external example values disclose limitations instead of claiming a pass. Profiles describe static readiness, not executed clients.

## CLI and CI

```sh
# Default: fail on high findings; JSON on stdout, diagnostics on stderr.
octri-spec-audit audit api.yaml --output audit.json

# Dependencies are explicit; the auditor never discovers or downloads them.
octri-spec-audit audit api.yaml --file models.yaml=./models.yaml

octri-spec-audit audit api.yaml --format baseline --output baseline.json
octri-spec-audit audit api.yaml --baseline baseline.json --fail-on-new
octri-spec-audit audit api.yaml --config auditor.json --as-of 2026-10-16
octri-spec-audit audit api.yaml --format sarif --output audit.sarif
octri-spec-audit compare before.json after.json --output changes.json
octri-spec-audit bundle api.yaml --file models.yaml=./models.yaml --output portable.json
```

Exit codes: **0** policy passed; **1** completed audit failed the severity/new-finding policy; **2** invalid configuration, blocked coverage or processing failure. Output files are atomically created; overwriting requires `--force`. An output may never alias an input. `execute` transports one ABI-v1 JSON envelope and returns `Ok`/`Err` JSON for hosts and bindings.

The composite action in `.github/actions/audit` builds the locked CLI, evaluates the same policy, emits annotations and leaves JSON/SARIF artifact paths as step outputs. Check this repository out alongside the consumer and reference the local action path. It never uploads artifacts, publishes reports or sends specifications elsewhere. Consumers choose their own artifact retention and upload step.

Example policy:

```json
{
  "profiles": ["docs", "sdk-typescript", "sdk-python", "mcp"],
  "rules": { "operation-documented": { "severity": "high" } },
  "failOn": "high",
  "asOf": "2026-10-16",
  "exclusions": [
    {
      "ruleId": "operation-examples",
      "reason": "Real examples pending API team review",
      "expiresOn": "2026-11-01"
    }
  ]
}
```

Expiry is inclusive and evaluated against caller-supplied `asOf`; the core has no clock. Integrity cannot be disabled, downgraded, excluded or accepted through a baseline. Baselines identify findings, not permission to ignore invalid input.

## Bindings

All bindings expose `audit`, `fix`, `compare`, `export`, `rules` and `bundle` through ABI-v1 JSON. Rust calls the typed core directly. Native consumers load an explicitly supplied library path; C buffers must be released with the matching auditor allocator.

JavaScript decoded reports represent exact integers beyond `Number.MAX_SAFE_INTEGER` as `bigint`. Use exported `parseJson` / `stringifyJson` helpers when storing those reports, or `Auditor.executeJson` for raw JSON envelopes/results. PHP and Dart also expose raw JSON transport. Source text and Rust-produced revised source retain their numeric values; browser-authored schemas are sent as `schemaJson` text to Rust rather than parsed into JavaScript numbers. Current browser support requires lossless JSON source parsing and `JSON.rawJSON` for these exceptional numeric values; unsupported runtimes fail explicitly instead of rounding them.

Ruby decodes decimals as `BigDecimal`. Use the bundled `OctriExactJSON.parse`
and `OctriExactJSON.generate` helpers when reading or storing decoded reports;
Ruby's standard JSON serializer can turn `BigDecimal` values into strings.

| Consumer                | Package / entry point                | Runtime floor                |
| ----------------------- | ------------------------------------ | ---------------------------- |
| Rust                    | `crates/octri-auditor`               | Rust 1.95                    |
| JavaScript / TypeScript | `packages/node` (ESM + CommonJS)     | Node 22.19                   |
| Browser                 | `packages/browser`                   | WebAssembly + module workers |
| Python                  | `bindings/python`                    | Python 3.8                   |
| Go                      | `bindings/go`                        | Go 1.23, cgo                 |
| Java                    | `bindings/java`                      | JVM 11, JNI bridge           |
| Kotlin                  | `bindings/kotlin`                    | JVM 11, Java binding         |
| PHP                     | `bindings/php`                       | PHP 8.1, FFI enabled         |
| Ruby                    | `bindings/ruby`                      | Ruby 3.1, Fiddle             |
| Swift                   | `bindings/swift`                     | Swift 6, macOS 13 or Linux   |
| Dart                    | `bindings/dart`                      | Dart 3.4, dart:ffi           |
| C                       | `bindings/c/include/octri_auditor.h` | C11                          |

```js
import Auditor, { text } from "@octri/spec-auditor-native";
const report = await Auditor.audit({
  input: text(source, "memory://audit/api.yaml"),
});
if (!report.complete) throw new Error("Readiness could not be established");
```

```python
from octri_auditor import Auditor
auditor = Auditor('/absolute/path/liboctri_auditor_ffi.so')
report = auditor.audit({'input': {'uri': 'memory://audit/api.yaml', 'content': source}})
```

`npm run build:bindings && npm run test:bindings` builds and executes every native consumer and compares complete results against Rust. Java, Kotlin, Go, Swift, Dart, PHP, Ruby, Python and a C compiler must be installed. `Dockerfile.bindings` pins a Linux toolchain environment for arm64 and amd64. Native artifacts are platform-specific; do not copy a macOS library into a Linux deployment.

## Naming and scoring

Action words such as `find`, `get`, `fetch`, `create` and `cancel` are recognized
as complete identifier words. `findPetsByStatus` and `findPetsByTags` remain valid.
Repairs move misplaced verbs instead of producing stacked names such as
`getFindPetsByTags`. Compatible namespace/method conventions need at least two
supporting operations and a two-thirds majority. Valid authored verbs are
preserved; proposed IDs cannot collide with existing IDs or other selected repairs.
Renaming changes generated public APIs and always requires review.

Each enabled weighted rule deducts
`weight × (0.2 + 0.8 × min(1, live findings / max(surface, 1)))` from ten points.
Passing rules deduct zero. Integrity failures and incomplete coverage block the
score at zero. Severity thresholds control CI independently of numeric score.
Exclusions remain visible; fail-on-new requires a version-matched baseline.
Run `octri-spec-audit rules` for the complete rule catalogue and remediation.

Authentication readiness requires declared `components.securitySchemes`.
`security: []` declares public access; disable that readiness rule in policy when
an intentionally public API needs no SDK authentication configuration.

## Self hosting

`npm run package:web` produces a portable static application in `artifacts/web`.
Serve `.mjs` as JavaScript and `.wasm` as `application/wasm`; allow same-origin
workers and WebAssembly in CSP. URL fetching requires CORS or a host-controlled
source proxy. Local audits run offline and do not need an account.

The optional Docker host exposes `/execute`, `/audit`, `/audit/fix` and `/health`.
Set a strong `AUDITOR_INTERNAL_TOKEN` and send it as `X-Internal-Token`. Run on a
private network with read-only filesystem, dropped capabilities and process,
memory and CPU limits. Requests execute bounded disposable Rust processes.
Never log source documents or credentials.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
`vendor/snapshot.json` pins imported parser files and notices by hash;
`node scripts/verify-vendor.mjs` verifies them. Validation schemas come directly
from the OpenAPI Initiative and retain their Apache-2.0 notice.
