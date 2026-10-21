# Octri Spec Auditor Web

Audit OpenAPI documents for API readiness, inspect source-aware findings, and apply reviewed fixes through the same Rust engine used by the CLI.

Part of [octri-spec-auditor](https://github.com/octridev/octri-spec-auditor), maintained by [OctriDev](https://github.com/octridev). Licensed under Apache-2.0. Bundled dependencies retain their own licenses and notices.

## Install

```sh
npm install @octri/spec-auditor-web
```

## Host the browser product

Serve the installed package directory using your static host. Open `web/index.html` within that directory. Keep `web/`, `packages/` and `vendor/` in their published relative layout; workers and WASM use those paths. Serve `.wasm` as `application/wasm` and JavaScript modules with a JavaScript MIME type.

`manifest.json` records SHA-256 hashes for every runtime asset. Verify those hashes before copying or serving the product. The package includes its Rust-compiled WASM engine, worker code, HTML/CSS and legal notices. Conversion or auditing runs locally in browser workers; this package does not require an Octri account or hosted Octri API. Optional URL retrieval and application handoff require an explicitly configured host integration.

## Runtime and support

See the [project README](https://github.com/octridev/octri-spec-auditor#readme) for supported versions, capabilities, limits and complete API examples.

Browser and package wrappers may receive packaging-only patch releases while the embedded engine version stays unchanged. Inspect result/asset manifests for the engine version.

Issues and contributions: [octri-spec-auditor](https://github.com/octridev/octri-spec-auditor). Report security issues using [GitHub private vulnerability reporting](https://github.com/octridev/octri-spec-auditor/security/advisories/new).
