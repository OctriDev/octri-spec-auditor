# Security policy

Use GitHub private vulnerability reporting from this repository's Security tab.
If private reporting is unavailable, open an issue requesting a private contact
without including vulnerability details. Never put credentials, confidential
specifications or exploit payloads in a public issue.

## Trust boundaries

Specifications, reference URIs, examples, descriptions, policies and imported reports are untrusted input. The Rust engine has no filesystem or network capability. A `file:` or HTTP reference never authorizes retrieval; only explicitly supplied virtual files resolve. Example validation uses an offline registry with retrieval disabled.

Default source limits are 5 MiB per file, 20 MiB total, 100 documents, 300,000 nodes, nesting depth 64, 64 YAML aliases and 5,000 findings. Explicit advanced limits cap at 24 MiB per file, 64 MiB total, 100 documents, 1,000,000 nodes, depth 128 and 10,000 findings. Parser output caps at 64 MiB; binding envelopes/results at 128 MiB. These are resource bounds, not permission to execute untrusted code.

The browser runs each job in a disposable worker with a 30-second deadline. Cancel terminates that worker. Native bindings are synchronous except Node's worker-pool adapter; native hosts must isolate adversarial jobs in disposable processes and enforce deadlines, memory limits, input/output limits and concurrency limits.

Generated HTML contains no scripts and escapes input. DOM rendering uses text nodes. SARIF is data. Annotation escaping prevents embedded newlines or workflow properties from injecting commands. Fixes are guarded transactions, not executable scripts.

Local persistence is opt-in and removable in the browser. URL fetching requires explicit permission and uses browser CORS with no credentials or referrer. The local tool has no telemetry. Existing optional Octri hosted publication/email flows have their own explicit consent and server policies; local audit does not invoke them.

Applications exposing auditing over a network must implement authentication, authorization and request limits. Origin checks on browser messages are an additional UI boundary; server-side specification ingestion must always revalidate source.
