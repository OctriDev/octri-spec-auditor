import type * as API from './index.d.ts' with { 'resolution-mode': 'import' };
declare const bindings: typeof API.Auditor & {
  Auditor: typeof API.Auditor;
  AuditError: typeof API.AuditError;
  LosslessNumber: typeof API.LosslessNumber;
  text: typeof API.text;
  object: typeof API.object;
  parseJson: typeof API.parseJson;
  stringifyJson: typeof API.stringifyJson;
  default: typeof API.Auditor;
};
export = bindings;
