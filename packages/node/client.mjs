/** Thin transport facade. Every semantic operation executes in Rust. */
import { encodeInput } from "./json.mjs";

export { parseJson, LosslessNumber } from "./numbers.mjs";
import { parseJson } from "./numbers.mjs";
export function stringifyJson(value, space) {
  return encodeInput(
    value,
    { maxDocumentBytes: 128 * 1024 * 1024, maxDepth: 256, maxNodes: 4_000_000 },
    space,
  );
}
export class AuditError extends Error {
  constructor(error) {
    super(error.message);
    this.name = "AuditError";
    this.code = error.code;
    this.diagnostics = error.diagnostics ?? [];
  }
}

export function createClient(execute) {
  const executeJson = async (input) => {
    if (typeof input !== "string")
      throw new TypeError("Raw envelope must be JSON text");
    if (new TextEncoder().encode(input).length > 128 * 1024 * 1024)
      throw new RangeError("Auditor envelope exceeds 128 MiB");
    return execute(input);
  };
  const call = async (envelope) => {
    const input = stringifyJson(envelope);
    if (new TextEncoder().encode(input).length > 128 * 1024 * 1024) {
      throw new RangeError("Auditor envelope exceeds 128 MiB");
    }
    const result = parseJson(await execute(input));
    if (result.Err) throw new AuditError(result.Err);
    if (!("Ok" in result)) throw new Error("Invalid auditor response envelope");
    return result.Ok;
  };
  return Object.freeze({
    executeJson,
    call,
    audit: (request) => call({ abiVersion: 1, action: "audit", request }),
    fix: (request) => call({ abiVersion: 1, action: "fix", request }),
    compare: (before, after) =>
      call({ abiVersion: 1, action: "compare", before, after }),
    export: (report, format = "json") =>
      call({ abiVersion: 1, action: "export", report, format }),
    rules: () => call({ abiVersion: 1, action: "rules" }),
    bundle: (request) => call({ abiVersion: 1, action: "bundle", request }),
  });
}

export function text(content, uri = "memory://audit/openapi.yaml") {
  if (typeof content !== "string")
    throw new TypeError("Source content must be a string");
  return { uri, content, generated: false };
}
export function object(document, uri = "memory://audit/openapi.json") {
  if (
    document === null ||
    typeof document !== "object" ||
    Array.isArray(document)
  )
    throw new TypeError("Source must be a JSON object");
  return {
    uri,
    content: encodeInput(document, { maxDocumentBytes: 24 * 1024 * 1024 }),
    generated: true,
  };
}
