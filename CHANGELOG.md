# Changelog

## 0.1.3

- Preserve authored operation IDs with unfamiliar leading actions, regardless of HTTP method, casing or matching tags. Naming suggestions no longer infer a missing action from an incomplete verb vocabulary.
- Retain recognized leading actions when removing duplicate namespace words. Keep duplicate-action repairs, schema conventions and collision protection.
- Advance the ruleset to `1.0.3`; npm bindings and browser assets ship as `0.1.6`.

## 0.1.0

- Offline OpenAPI 3.0, 3.1 and 3.2 readiness auditing with physical source findings.
- Integrity, documentation, SDK and MCP views with transparent scoring and versioned static compatibility profiles.
- Policies, exclusions, baselines, comparison, SARIF and guarded fixes with exact undo.
- CLI, GitHub Action, browser worker, optional HTTP host and language bindings sharing one Rust engine.

Static compatibility findings do not certify execution of generated clients.
