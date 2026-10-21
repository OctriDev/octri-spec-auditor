const native = require("./load-native.cjs")();
const {
  createClient,
  AuditError,
  LosslessNumber,
  text,
  object,
  parseJson,
  stringifyJson,
} = require("./client.mjs");
const Auditor = createClient(native.execute);
module.exports = {
  ...Auditor,
  Auditor,
  AuditError,
  LosslessNumber,
  text,
  object,
  parseJson,
  stringifyJson,
  default: Auditor,
};
