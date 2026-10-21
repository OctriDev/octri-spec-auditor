# Octri Spec Auditor — Node.js

[Live demo](https://octri.dev/openapi-audit) · Free to try in your browser, no account required.

Audit OpenAPI documents for API readiness, inspect source-aware findings, and apply reviewed fixes through the same Rust engine used by the CLI.

Part of [octri-spec-auditor](https://github.com/octridev/octri-spec-auditor), maintained by [OctriDev](https://github.com/octridev). Licensed under Apache-2.0. Bundled dependencies retain their own licenses and notices.

## Install

```sh
npm install @octri/spec-auditor-native
```

## Example

```js
import { Auditor, text } from "@octri/spec-auditor-native";

const report = await Auditor.audit({
  input: text(
    JSON.stringify({
      openapi: "3.1.2",
      info: { title: "Example API", version: "1.0.0" },
      paths: {},
    }),
  ),
});
console.log(report.findings);
```

## Runtime and support

Requires Node.js 22.19 or later and a native addon matching your operating system and architecture. Published binaries cover macOS ARM64 and Linux x64/ARM64 with glibc 2.36 or later (Debian 12, Ubuntu 22.10 or newer). Alpine/musl and older glibc systems must use WASM or build from source. Native binaries and platform availability are separate from the portable WASM package. Apply process deadlines and memory limits when serving untrusted documents.

See the [project README](https://github.com/octridev/octri-spec-auditor#readme) for supported versions, capabilities, limits and complete API examples.

Browser and package wrappers may receive packaging-only patch releases while the embedded engine version stays unchanged. Inspect result/asset manifests for the engine version.

Issues and contributions: [octri-spec-auditor](https://github.com/octridev/octri-spec-auditor). Report security issues using [GitHub private vulnerability reporting](https://github.com/octridev/octri-spec-auditor/security/advisories/new).
