# Octri Spec Auditor for Dart

[Live demo](https://octri.dev/openapi-audit) · Score how well an OpenAPI 3.0, 3.1 or 3.2 document
will generate SDKs, docs and MCP tools, offline, with Octri's Rust auditor.

```sh
dart pub add octri_spec_auditor
```

```dart
import 'package:octri_spec_auditor/octri_spec_auditor.dart';

final report = Auditor().audit({'input': Auditor.text(specText)});
```

The package bundles the native library.
Supported platforms: Linux x64 and arm64 (glibc 2.36 or later) and macOS arm64. On other platforms, build
`liboctri_auditor_ffi` from [the repository](https://github.com/octridev/octri-spec-auditor) and pass its path to `Auditor`.

Runs on the Dart VM. A `dart compile exe` binary cannot read package files: ship the library beside it and pass its path to `Auditor`.

Requests, reports and the runtime contract are documented in the
[repository README](https://github.com/octridev/octri-spec-auditor#bindings). Licensed under Apache-2.0; the bundled library's
third-party notices ship with the package.
