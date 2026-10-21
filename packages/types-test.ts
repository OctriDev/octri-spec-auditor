import Auditor, {
  text,
  type AuditRequest,
  type AuditReport,
} from "@octri/spec-auditor-native";
import {
  initialize,
  Auditor as BrowserAuditor,
} from "@octri/spec-auditor-wasm";
import Native = require("@octri/spec-auditor-native");

const request: AuditRequest = {
  input: text("{}"),
  config: {
    profiles: ["docs", "sdk-python"],
    limits: { maxDocumentBytes: 1024 },
  },
};
const report: Promise<AuditReport> = Auditor.audit(request);
void report;
void Native.audit(request);
void BrowserAuditor.bundle(request);
void initialize();
