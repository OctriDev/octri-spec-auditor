# Octri Spec Auditor — Browser WASM

Audit OpenAPI documents for API readiness, inspect source-aware findings, and apply reviewed fixes through the same Rust engine used by the CLI.

Part of [octri-spec-auditor](https://github.com/octridev/octri-spec-auditor), maintained by [OctriDev](https://github.com/octridev). Licensed under Apache-2.0. Bundled dependencies retain their own licenses and notices.

## Install

```sh
npm install @octri/spec-auditor-wasm
```

## Example

```js
import { Auditor, text } from "@octri/spec-auditor-wasm";

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

Use a browser/bundler that supports ES modules and WebAssembly. WASM initializes on the first call; `initialize` accepts an explicit module/response for custom hosting. Keep work off the main thread for untrusted or large specifications. Core and WASM have no ambient filesystem or network access: provide referenced documents explicitly.

See the [project README](https://github.com/octridev/octri-spec-auditor#readme) for supported versions, capabilities, limits and complete API examples.

Browser and package wrappers may receive packaging-only patch releases while the embedded engine version stays unchanged. Inspect result/asset manifests for the engine version.

Issues and contributions: [octri-spec-auditor](https://github.com/octridev/octri-spec-auditor). Report security issues using [GitHub private vulnerability reporting](https://github.com/octridev/octri-spec-auditor/security/advisories/new).
