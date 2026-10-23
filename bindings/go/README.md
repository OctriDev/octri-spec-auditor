# Octri Spec Auditor for Go

[Live demo](https://octri.dev/openapi-audit) · Score how well an OpenAPI 3.0, 3.1 or 3.2 document
will generate SDKs, docs and MCP tools, offline, with Octri's Rust auditor.

```sh
go get github.com/octridev/octri-spec-auditor-go
```

```go
import auditor "github.com/octridev/octri-spec-auditor-go"

report, err := auditor.Auditor{}.Audit(auditor.Request{Input: auditor.Text(specText, "memory://audit/openapi.yaml")})
```

The module bundles a static library.
Supported platforms: Linux x64 and arm64 (glibc 2.36 or later) and macOS arm64. On other platforms, build
`liboctri_auditor_ffi` from [the repository](https://github.com/octridev/octri-spec-auditor) and add its directory to `CGO_LDFLAGS` with `-L`.

Build with `CGO_ENABLED=1` and a C compiler. The library links statically, so binaries need nothing installed beside them.

Requests, reports and the runtime contract are documented in the
[repository README](https://github.com/octridev/octri-spec-auditor#bindings). Licensed under Apache-2.0; the bundled library's
third-party notices ship with the package.
