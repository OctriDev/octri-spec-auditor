# Octri Spec Auditor for PHP

[Live demo](https://octri.dev/openapi-audit) · Score how well an OpenAPI 3.0, 3.1 or 3.2 document
will generate SDKs, docs and MCP tools, offline, with Octri's Rust auditor.

```sh
composer require octri/spec-auditor
```

```php
$auditor = new \Octri\Audit\Auditor();
$report = $auditor->audit((object) [
    "input" => (object) ["uri" => "memory://audit/openapi.yaml", "content" => $specText],
]);
```

The package bundles the native library.
Supported platforms: Linux x64 and arm64 (glibc 2.36 or later) and macOS arm64. On other platforms, build
`liboctri_auditor_ffi` from [the repository](https://github.com/octridev/octri-spec-auditor) and pass its path to `Auditor`.

Requires PHP 8.1 or later with the FFI extension enabled (`ffi.enable`) for the SAPI that runs it.

Requests, reports and the runtime contract are documented in the
[repository README](https://github.com/octridev/octri-spec-auditor#bindings). Licensed under Apache-2.0; the bundled library's
third-party notices ship with the package.
