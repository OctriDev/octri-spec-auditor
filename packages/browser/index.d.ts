export class LosslessNumber {
  readonly token: string;
  constructor(token: string);
  toString(): string;
  valueOf(): never;
}
export type Json =
  | null
  | boolean
  | number
  | bigint
  | LosslessNumber
  | string
  | Json[]
  | { [key: string]: Json };
export type Severity = "high" | "medium" | "advice";
export type Category = "integrity" | "docs" | "sdk" | "mcp";
export interface Source {
  uri: string;
  content: string;
  generated?: boolean;
}
export interface Location {
  uri: string;
  pointer: string;
  line?: number;
  column?: number;
  offset?: number;
}
export interface Diagnostic {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  location: Location;
  related?: Location[];
}
export interface RuleSetting {
  enabled?: boolean;
  severity?: Severity;
}
export interface Exclusion {
  ruleId: string;
  key?: string;
  uri?: string;
  pointer?: string;
  reason: string;
  expiresOn?: string;
}
export interface Baseline {
  schemaVersion: string;
  rulesetVersion: string;
  fingerprints: string[];
}
export interface Limits {
  maxDocumentBytes: number;
  maxTotalBytes: number;
  maxDocuments: number;
  maxNodes: number;
  maxDepth: number;
}
export interface Config {
  rootFormat?: "auto" | "json" | "yaml";
  limits?: Partial<Limits>;
  profiles?: string[];
  rules?: Record<string, RuleSetting>;
  ignored?: string[];
  exclusions?: Exclusion[];
  baseline?: Baseline | null;
  failOnNew?: boolean;
  failOn?: Severity;
  asOf?: string | null;
  maxFindings?: number;
}
export interface AuditRequest {
  input: Source;
  files?: Record<string, string>;
  config?: Config;
}
export interface Edit {
  uri: string;
  pointer: string;
  before: Json | null;
  after: Json;
}
export interface Fix {
  label: string;
  kind: "deterministic" | "review-required" | "text" | "response-schema";
  edits: Edit[];
  field?: string;
  before?: Json;
  after?: Json;
  status?: string;
  mediaType?: string;
}
export interface Finding {
  key: string;
  fingerprint: string;
  ruleId: string;
  title: string;
  why: string;
  severity: Severity;
  target: string;
  message: string;
  fixable: boolean;
  ignorable: boolean;
  location: Location;
  related: Location[];
  categories: Category[];
  impact: string;
  evidence: string;
  remediation: string;
  code?: string;
  fix?: Fix;
  exclusionReason?: string;
  baseline: boolean;
}
export interface RuleResult {
  ruleId: string;
  title: string;
  weight: number;
  findings: number;
  deduction: number;
  denominator: number;
  status: "checked" | "failed" | "skipped" | "unsupported";
  reason: string | null;
}
export interface ReadinessView {
  category: Category;
  status: string;
  score: number | null;
  blockers: number;
  checked: number;
  failed: number;
  skipped: number;
  unsupported: number;
  findings: string[];
}
export interface Profile {
  id: string;
  version: string;
  evidence: string;
  executedVerification: string;
  limitations: string[];
}
export interface ArtifactFile {
  uri: string;
  sha256: string;
  bytes: number;
}
export interface AuditReport {
  schemaVersion: string;
  manifest: {
    engineVersion: string;
    rulesetVersion: string;
    scoreMethod: string;
    processingMode: string;
    root: string;
    files: ArtifactFile[];
    config: Config;
    profiles: Profile[];
  };
  valid: boolean;
  complete: boolean;
  status: string;
  dialect: string | null;
  score: number;
  maxScore: number;
  findings: Finding[];
  ignoredFindings: Finding[];
  appliedFindings: Finding[];
  byRule: RuleResult[];
  surface: { operations: number; models: number; paths: number };
  diagnostics: Diagnostic[];
  views: ReadinessView[];
  policyPassed: boolean;
  coverage: string[];
}
export interface FixRequest {
  request: AuditRequest;
  keys: string[];
  expectedFiles: Record<string, string>;
  inputs?: Record<string, Json>;
}
export interface FixResult {
  original: AuditRequest;
  revised: AuditRequest;
  edits: Edit[];
  appliedFindings: Finding[];
  report: AuditReport;
  formatNotice: string;
}
export interface ReportDiff {
  schemaVersion: string;
  rulesetVersion: string;
  added: Finding[];
  resolved: Finding[];
  unchanged: string[];
  scoreBefore: number;
  scoreAfter: number;
  scoreDelta: number;
  explanations: string[];
}
export interface Rule {
  id: string;
  title: string;
  weight: number;
  surface: string;
  categories: Category[];
  why: string;
  remediation: string;
}
export class AuditError extends Error {
  readonly code: string;
  readonly diagnostics: Diagnostic[];
}
export function text(content: string, uri?: string): Source;
export function parseJson(text: string): Json;
export function stringifyJson(value: unknown, space?: number): string;
export function object(document: Record<string, Json>, uri?: string): Source;
export const Auditor: {
  /** Lossless wire escape hatch for numeric values outside JavaScript's range. */
  executeJson(envelope: string): Promise<string>;
  call(envelope: Record<string, unknown>): Promise<Json>;
  audit(request: AuditRequest): Promise<AuditReport>;
  fix(request: FixRequest): Promise<FixResult>;
  compare(before: AuditReport, after: AuditReport): Promise<ReportDiff>;
  export(report: AuditReport, format: "html" | "annotations"): Promise<string>;
  export(
    report: AuditReport,
    format?: "sarif" | "json" | "baseline",
  ): Promise<Json>;
  rules(): Promise<Rule[]>;
  bundle(request: AuditRequest): Promise<AuditRequest>;
};
export default Auditor;

export function initialize(options?: unknown): Promise<void>;
