# Octri Spec Auditor for Swift

[Live demo](https://octri.dev/openapi-audit) · Score how well an OpenAPI 3.0, 3.1 or 3.2 document
will generate SDKs, docs and MCP tools, offline, with Octri's Rust auditor.

```sh
# Package.swift
.package(url: "https://github.com/octridev/octri-spec-auditor-swift", from: "0.1.3")
```

```swift
import OctriSpecAuditor

let report = try Auditor().audit(.object(["input": Auditor.text(specText)]))
```

The package bundles the native library as a resource.
Supported platforms: Linux x64 and arm64 (glibc 2.36 or later) and macOS arm64. On other platforms, build
`liboctri_auditor_ffi` from [the repository](https://github.com/octridev/octri-spec-auditor) and pass its path to `Auditor(library:)`.

macOS consumers declare macOS 13 or later. Linux executables should link with lld and separate code segments:
`-Xswiftc -use-ld=lld -Xlinker -z -Xlinker separate-code`.

Requests, reports and the runtime contract are documented in the
[repository README](https://github.com/octridev/octri-spec-auditor#bindings). Licensed under Apache-2.0; the bundled library's
third-party notices ship with the package.
