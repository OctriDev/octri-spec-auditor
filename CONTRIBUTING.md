# Contributing

Contributions are welcome. Preserve the project license and third-party notices, and include reproducible examples for behavior changes.

## Local checks

```sh
npm ci --ignore-scripts
node scripts/verify-vendor.mjs
node scripts/cargo.mjs fmt --all -- --check
node scripts/cargo.mjs clippy --workspace --all-targets -- -D warnings
node scripts/cargo.mjs test --workspace
npm run build:node
npm run test:node
node scripts/contract-test.mjs
node scripts/performance.mjs
npm run format:check
```

For browser changes, build WASM, install Playwright's Chromium/Firefox/WebKit browsers and run `npm run test:browser`. For any public Rust type or protocol change, build all bindings and run full-result parity. CI runs both Linux architectures. A build alone is not runtime evidence.

## Change a rule

1. Find its stable ID in `src/catalogue.rs` under the core crate. Explain the user-facing impact and precise applicability boundary.
2. Implement checks over parser inventory and physical sources. Follow references with `Sources`; do not dereference recursively or traverse examples as schema structure.
3. Add a failing fixture, a clear fixture and a boundary case. Include inherited or referenced variants when applicable. Check physical source locations and stable keys.
4. Changes to weights, denominators, normalization, IDs or fingerprint semantics require a ruleset version and explicit baseline/report migration notes.
5. Fixes require exact before-values, source hashes, deterministic output and revalidation. Prose and payload shapes require user input. Tests must prove stale/overlapping proposals cannot mutate an artifact.
6. Update the public rule catalogue and README when behavior changes; include tests and compatibility impact in the pull request.

## Review expectations

Keep one semantic implementation in Rust. Bindings handle serialization, ownership and host scheduling. Avoid parallel rule implementations in JavaScript or other languages. Prefer small named functions, explicit error codes and comments explaining invariants. Never catch an error and return a successful empty report. Never log specification bodies, credentials or raw worker stderr.

Performance-sensitive changes run the 500-operation benchmark. Resource-limit changes need adversarial input and host cancellation tests. Security-sensitive output requires escaping tests for HTML, command annotations and source filenames.

The vendored parser is an immutable snapshot. Update it as a reviewed dependency change, retain notices, regenerate hashes and rerun parser, auditor, binding and browser contracts. Do not quietly patch vendored source or edit a sibling checkout.
