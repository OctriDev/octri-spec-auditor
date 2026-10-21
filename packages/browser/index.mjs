import init, { execute } from "./pkg/octri_auditor.js";
import { createClient } from "./client.mjs";
export {
  AuditError,
  LosslessNumber,
  text,
  object,
  parseJson,
  stringifyJson,
} from "./client.mjs";
let initialized;
export async function initialize(options) {
  initialized ??= init(options).catch((error) => {
    initialized = undefined;
    throw error;
  });
  await initialized;
}
export const Auditor = createClient(async (request) => {
  await initialize();
  return execute(request);
});
export default Auditor;
