import { EngineJob } from "./job.mjs";
import { parseJson, stringifyJson } from "../packages/browser/client.mjs";
import {
  DEFAULT_URI,
  checkFiles,
  sourceFiles,
  requestFrom,
  download,
  fileName,
  selectLocation,
} from "./artifact.mjs";
import { element, renderFindings, renderRules } from "./render.mjs";

const $ = (id) => document.getElementById(id);
// Hosts may opt into a same-origin source adapter. The engine remains offline.
const endpointSetting = new URLSearchParams(location.search).get(
  "sourceEndpoint",
);
const sourceEndpoint =
  endpointSetting && /^\/api\/[a-zA-Z0-9/_-]+$/.test(endpointSetting)
    ? endpointSetting
    : null;
if (sourceEndpoint) {
  $("network-note").textContent =
    "Explicit network access. Octri's server fetches this public URL without your cookies or credentials. Source is returned to this browser for local auditing; no report is published. Referenced URLs are never fetched automatically.";
  $("network-label").textContent = "Allow Octri to fetch this public URL";
}
const engine = new EngineJob();
const state = {
  files: new Map([[DEFAULT_URI, ""]]),
  root: DEFAULT_URI,
  active: DEFAULT_URI,
  report: null,
  request: null,
  original: null,
  preview: null,
  lastPatch: null,
  history: [],
  selected: new Set(),
  view: "integrity",
  stale: false,
  busy: false,
  handoff: false,
  handoffSourceSpecId: null,
  urlController: null,
  revision: 0,
  authored: new Map(),
};

function failure(error) {
  $("error").hidden = false;
  $("error").textContent = error.message || String(error);
}
function clearError() {
  $("error").hidden = true;
  $("error").textContent = "";
}
function config() {
  const value = JSON.parse($("config").value);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Configuration must be a JSON object.");
  return value;
}
function setConfig(value) {
  $("config").value = JSON.stringify(value, null, 2);
  $("fail-new").checked = value.failOnNew === true;
  syncProfiles(value);
  markStale();
}
function syncProfiles(policy) {
  for (const input of $("sdk-profiles").querySelectorAll("input")) {
    const profiles = policy.profiles ?? ["docs", "sdk", "mcp"];
    input.checked =
      profiles.includes("sdk") || profiles.includes(`sdk-${input.value}`);
  }
}
function busy(value) {
  state.busy = value;
  $("audit").disabled = value;
  $("cancel").hidden = !value;
  $("progress").hidden = !value;
  $("fetch-url").disabled = value;
  $("sample").disabled = value;
  $("upload").disabled = value;
  $("upload-folder").disabled = value;
  $("preview").disabled = value || state.stale || state.selected.size === 0;
}
function currentRequest() {
  return requestFrom(state.files, state.root, config());
}
function markStale() {
  state.revision++;
  if (state.report) {
    state.stale = true;
    $("status").textContent =
      "Source or policy changed. Run the audit again before using this report.";
    $("status").classList.add("stale");
    state.selected.clear();
    state.preview = null;
    $("patch-preview").hidden = true;
    renderFiltered();
  }
}

function renderSources() {
  for (const id of ["root", "active-file"]) {
    const select = $(id);
    select.replaceChildren();
    for (const uri of state.files.keys()) {
      const option = element("option", fileName(uri), { value: uri });
      select.append(option);
    }
    select.value = id === "root" ? state.root : state.active;
  }
  $("source").value = state.files.get(state.active) ?? "";
  $("source-name").textContent = fileName(state.active);
}

function loadRequest(request) {
  state.files = sourceFiles(request);
  state.root = request.input.uri;
  state.active = state.root;
  $("config").value = JSON.stringify(request.config ?? {}, null, 2);
  syncProfiles(request.config ?? {});
  renderSources();
  const limits = request.config?.limits ?? {};
  $("input-limits").textContent =
    `${(limits.maxDocumentBytes ?? 5 * 1024 * 1024) / 1024 / 1024} MiB per file · ${limits.maxDocuments ?? 100} files · ${(limits.maxTotalBytes ?? 20 * 1024 * 1024) / 1024 / 1024} MiB total. References resolve only within supplied files. Source stays on this device.`;
}

async function execute(action, fields) {
  if (state.busy)
    throw new Error("Wait for the current operation or cancel it first.");
  busy(true);
  clearError();
  try {
    return await engine.run({ abiVersion: 1, action, ...fields });
  } finally {
    busy(false);
  }
}

async function run() {
  try {
    const request = currentRequest();
    const revision = state.revision;
    if (!request.input.content.trim())
      throw new Error(
        "Paste or upload a specification, or choose Load sample.",
      );
    $("status").textContent =
      "Parsing, resolving supplied files and checking readiness…";
    const report = await execute("audit", { request });
    if (!report) return;
    state.request = structuredClone(request);
    state.report = report;
    state.original ??= structuredClone(request);
    state.stale = revision !== state.revision;
    state.selected.clear();
    state.preview = null;
    $("status").classList.remove("stale");
    $("patch-preview").hidden = true;
    $("status").textContent =
      `Audit complete. ${report.findings.length} findings. ${report.valid ? "Integrity checks passed." : "Integrity is blocked; correct the source diagnostics."}`;
    state.view = report.valid ? "sdk" : "integrity";
    renderReport();
    if (state.stale) {
      $("status").textContent =
        "Source changed during processing. Run the audit again before using this report.";
      $("status").classList.add("stale");
    }
  } catch (error) {
    failure(error);
    $("status").textContent =
      "Audit did not complete. Your source is unchanged.";
  }
}

function renderReport() {
  const report = state.report;
  const conversionRequired = report.findings.some(
    (finding) => finding.code === "SWAGGER_CONVERSION_REQUIRED",
  );
  $("empty").hidden = true;
  $("report").hidden = false;
  $("score").textContent = report.complete
    ? `${report.score.toFixed(1)}/10`
    : "Blocked";
  $("score").parentElement.classList.toggle(
    "blocked",
    !report.complete ||
      report.findings.some((finding) => finding.severity === "high"),
  );
  $("report-state").textContent = conversionRequired
    ? "Use Spec Converter first"
    : !report.complete
      ? "Integrity or coverage needs attention"
      : report.findings.length
        ? "Review the next actions"
        : "All available checks passed";
  if (conversionRequired)
    $("status").textContent =
      "Swagger input requires conversion. Use Spec Converter to convert it to OpenAPI, review the converted document, then run the audit.";
  $("report-summary").textContent =
    `${report.surface.operations} operations · ${report.surface.models} models · ${report.manifest.files.length} source files. CI threshold: ${report.manifest.config.failOn}. ${report.policyPassed ? "Policy passed." : "Policy failed."}`;
  $("engine-version").textContent =
    `Engine ${report.manifest.engineVersion} · Rules ${report.manifest.rulesetVersion}`;
  renderViews();
  renderFiltered();
  renderRules($("rule-results"), report.byRule);
  $("coverage").replaceChildren(
    ...report.coverage.map((text) => element("li", text)),
  );
  $("profiles").replaceChildren(
    ...report.manifest.profiles.map((profile) =>
      element(
        "p",
        `${profile.id} @ ${profile.version}: ${profile.evidence}; executed verification ${profile.executedVerification}. ${profile.limitations.join(" ")}`,
      ),
    ),
  );
  $("ignored").replaceChildren(
    ...report.ignoredFindings.map((finding) =>
      element(
        "p",
        `${finding.ruleId} · ${finding.target}: ${finding.exclusionReason}`,
      ),
    ),
  );
  if (!report.ignoredFindings.length)
    $("ignored").append(element("p", "No excluded findings."));
  $("manifest").textContent = JSON.stringify(report.manifest, null, 2);
  $("undo").disabled = state.history.length === 0;
  $("download-revised").disabled = !state.lastPatch;
  $("download-patch").disabled = !state.lastPatch;
}

function renderViews() {
  $("views").replaceChildren();
  for (const view of state.report.views) {
    const button = element("button", undefined, {
      "aria-pressed": view.category === state.view,
    });
    button.append(
      element(
        "span",
        view.category === "sdk"
          ? "SDK"
          : view.category === "mcp"
            ? "MCP"
            : view.category[0].toUpperCase() + view.category.slice(1),
      ),
    );
    button.append(
      element("small", `${view.failed} failed · ${view.checked} checked`),
    );
    button.append(
      element(
        "small",
        `${view.skipped} skipped · ${view.unsupported} unsupported`,
      ),
    );
    button.onclick = () => {
      state.view = view.category;
      renderViews();
      renderFiltered();
    };
    $("views").append(button);
  }
}

function renderFiltered() {
  if (!state.report) return;
  const severity = $("severity").value;
  const search = $("search").value.toLowerCase();
  const findings = state.report.findings.filter(
    (finding) =>
      finding.categories.includes(state.view) &&
      (severity === "all" || finding.severity === severity) &&
      `${finding.ruleId} ${finding.target} ${finding.message} ${finding.location.uri} ${finding.location.pointer}`
        .toLowerCase()
        .includes(search),
  );
  $("finding-count").textContent =
    `${findings.length} matching findings · ${state.selected.size} patches selected`;
  $("preview").disabled =
    state.busy || state.stale || state.selected.size === 0;
  renderFindings($("findings"), findings, state.selected, state.stale, {
    authored: state.authored,
    onAuthor: (key, text, kind) => {
      state.authored.set(key, { text, kind });
      state.preview = null;
      $("patch-preview").hidden = true;
    },
    onLocate: locate,
    onSelect: (key, checked) => {
      if (checked) state.selected.add(key);
      else state.selected.delete(key);
      $("finding-count").textContent =
        `${findings.length} matching findings · ${state.selected.size} patches selected`;
      $("preview").disabled = state.stale || state.selected.size === 0;
    },
    onExclude: async (finding, reason, expiresOn) => {
      try {
        const policy = config();
        policy.exclusions ??= [];
        policy.exclusions.push({
          ruleId: finding.ruleId,
          key: finding.key,
          uri: finding.location.uri,
          pointer: finding.location.pointer,
          reason,
          ...(expiresOn ? { expiresOn } : {}),
        });
        if (expiresOn) policy.asOf = new Date().toISOString().slice(0, 10);
        setConfig(policy);
        await run();
      } catch (error) {
        failure(error);
      }
    },
  });
}

function locate(location) {
  let uri = location.uri;
  if (!state.files.has(uri)) {
    uri = [...state.files.keys()].find((candidate) => {
      try {
        return new URL(candidate, state.root).href === location.uri;
      } catch {
        return false;
      }
    });
  }
  if (!uri) {
    failure(
      new Error(
        "This source was not supplied. Add the referenced file, then run the audit again.",
      ),
    );
    return;
  }
  state.active = uri;
  renderSources();
  selectLocation($("source"), location);
  $("source-position").textContent =
    `${location.line ?? "?"}:${location.column ?? "?"} · ${location.pointer}`;
  if (innerWidth < 780) $("source").scrollIntoView({ block: "center" });
}

$("source").oninput = () => {
  state.files.set(state.active, $("source").value);
  markStale();
};
$("config").oninput = () => {
  try {
    syncProfiles(config());
  } catch {}
  markStale();
};
$("root").onchange = () => {
  state.root = $("root").value;
  state.active = state.root;
  renderSources();
  markStale();
};
$("active-file").onchange = () => {
  state.active = $("active-file").value;
  renderSources();
};
$("audit").onclick = run;
$("cancel").onclick = () => {
  engine.cancel();
  state.urlController?.abort();
};
$("severity").onchange = renderFiltered;
$("search").oninput = renderFiltered;

$("sample").onclick = async () => {
  try {
    const response = await fetch(
      new URL("../fixtures/pets.yaml", import.meta.url),
    );
    if (!response.ok)
      throw new Error(
        "Sample is unavailable. Paste or upload a specification.",
      );
    state.files = new Map([
      [
        DEFAULT_URI,
        (await response.text())
          .replace("      operationId: listPets\n", "")
          .replace("      summary: List pets\n", ""),
      ],
    ]);
    state.root = DEFAULT_URI;
    state.active = DEFAULT_URI;
    state.original = null;
    state.history = [];
    state.lastPatch = null;
    renderSources();
    markStale();
    $("status").textContent =
      "Illustrative Pets sample loaded. Audit to inspect its intentional gaps.";
  } catch (error) {
    failure(error);
  }
};

async function uploadFiles(input) {
  try {
    const files = [...input.files];
    if (!files.length) return;
    const next = new Map(state.files);
    if (next.size === 1 && !next.get(state.root).trim()) next.clear();
    for (const file of files) {
      const perFile = Math.min(
        config().limits?.maxDocumentBytes ?? 5 * 1024 * 1024,
        24 * 1024 * 1024,
      );
      if (file.size > perFile)
        throw new Error(
          `${file.name} exceeds the configured ${perFile / 1024 / 1024} MiB limit.`,
        );
      const uri = new URL(file.webkitRelativePath || file.name, DEFAULT_URI)
        .href;
      if (next.has(uri))
        throw new Error(
          `Duplicate file ${file.name}. Edit its existing source or use a distinct file name.`,
        );
      next.set(
        uri,
        new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
          await file.arrayBuffer(),
        ),
      );
    }
    checkFiles(next, config().limits);
    state.files = next;
    if (!next.has(state.root)) state.root = next.keys().next().value;
    state.active = state.root;
    state.original = null;
    state.history = [];
    state.lastPatch = null;
    renderSources();
    markStale();
  } catch (error) {
    failure(error);
  } finally {
    input.value = "";
  }
}
$("upload").onchange = () => uploadFiles($("upload"));
$("upload-folder").onchange = () => uploadFiles($("upload-folder"));

$("preset").onchange = () => {
  try {
    const policy = config();
    const preset = $("preset").value;
    policy.profiles = ["all", "strict"].includes(preset)
      ? ["docs", "sdk", "mcp"]
      : [preset];
    policy.failOn = preset === "strict" ? "medium" : "high";
    setConfig(policy);
  } catch (error) {
    failure(error);
  }
};
$("fail-new").onchange = () => {
  try {
    const policy = config();
    policy.failOnNew = $("fail-new").checked;
    setConfig(policy);
  } catch (error) {
    failure(error);
  }
};
$("baseline").onchange = async () => {
  try {
    const file = $("baseline").files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) throw new Error("Baseline exceeds 5 MiB.");
    const policy = config();
    policy.baseline = JSON.parse(await file.text());
    setConfig(policy);
  } catch (error) {
    failure(error);
  } finally {
    $("baseline").value = "";
  }
};
$("download-config").onclick = () => {
  try {
    download("octri-audit-policy.json", config());
  } catch (error) {
    failure(error);
  }
};

$("preview").onclick = async () => {
  try {
    if (state.stale)
      throw new Error("Run the audit again before previewing patches.");
    const inputs = {};
    for (const key of state.selected) {
      const authored = state.authored.get(key);
      if (authored) {
        inputs[key] =
          authored.kind === "text"
            ? { description: authored.text }
            : { schemaJson: authored.text };
      }
    }
    const preview = await execute("fix", {
      request: {
        request: state.request,
        keys: [...state.selected],
        inputs,
        expectedFiles: Object.fromEntries(
          state.report.manifest.files.map((file) => [file.uri, file.sha256]),
        ),
      },
    });
    if (!preview || state.stale) return;
    state.preview = preview;
    $("patch-content").textContent = stringifyJson(preview.edits, 2);
    $("format-notice").textContent = preview.formatNotice;
    $("patch-preview").hidden = false;
    $("patch-preview").focus();
  } catch (error) {
    failure(error);
  }
};
$("dismiss-patch").onclick = () => {
  state.preview = null;
  $("patch-preview").hidden = true;
};
$("apply-patch").onclick = () => {
  if (!state.preview || state.stale) return;
  state.history.push({
    request: state.request,
    report: state.report,
    lastPatch: state.lastPatch,
  });
  while (
    state.history.length > 5 ||
    state.history.reduce(
      (sum, entry) =>
        sum +
        checkFiles(sourceFiles(entry.request), entry.request.config?.limits),
      0,
    ) >
      64 * 1024 * 1024
  )
    state.history.shift();
  const preview = state.preview;
  state.lastPatch = preview;
  state.request = preview.revised;
  state.report = preview.report;
  loadRequest(preview.revised);
  state.preview = null;
  state.selected.clear();
  $("patch-preview").hidden = true;
  $("status").textContent =
    "Reviewed patches applied and revalidated. Original bytes remain available for download.";
  renderReport();
};
$("undo").onclick = () => {
  const prior = state.history.pop();
  if (!prior) return;
  state.request = prior.request;
  state.report = prior.report;
  state.lastPatch = prior.lastPatch;
  state.stale = false;
  state.selected.clear();
  loadRequest(prior.request);
  $("status").textContent = "Patch undone. Previous source bytes restored.";
  renderReport();
};

for (const button of document.querySelectorAll("[data-export]"))
  button.onclick = async () => {
    try {
      if (state.stale)
        throw new Error("Run the audit again to export a current report.");
      const format = button.dataset.export;
      const output = await execute("export", { report: state.report, format });
      if (output === undefined) return;
      download(
        `octri-audit.${format === "html" ? "html" : format === "annotations" ? "txt" : `${format}.json`}`,
        output,
        format === "html"
          ? "text/html"
          : format === "annotations"
            ? "text/plain"
            : "application/json",
      );
    } catch (error) {
      failure(error);
    }
  };
$("download-original").onclick = () => {
  if (state.original)
    download(
      fileName(state.original.input.uri).split("/").pop(),
      state.original.input.content,
      "text/plain",
    );
};
$("download-revised").onclick = () => {
  if (state.lastPatch)
    download(
      "openapi.revised.json",
      state.lastPatch.revised.input.content,
      "application/json",
    );
};
$("download-patch").onclick = () => {
  if (state.lastPatch)
    download("octri-audit.patch.json", state.lastPatch.edits);
};
$("download-artifact").onclick = () =>
  download("octri-artifact.json", {
    schemaVersion: "1.0.0",
    original: state.original,
    request: state.request,
    report: state.report,
    patch: state.lastPatch?.edits ?? [],
  });
$("compare").onchange = async () => {
  try {
    const file = $("compare").files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024)
      throw new Error("Earlier report exceeds 20 MiB.");
    const input = parseJson(await file.text());
    const before = input.report ?? input;
    const result = await execute("compare", { before, after: state.report });
    if (!result) return;
    $("comparison-result").replaceChildren(
      element(
        "p",
        `${result.added.length} new · ${result.resolved.length} resolved · ${result.unchanged.length} unchanged. Score ${result.scoreBefore} → ${result.scoreAfter}.`,
      ),
      ...result.explanations.map((text) => element("p", text)),
    );
    for (const finding of result.added)
      $("comparison-result").append(
        element("p", `New: ${finding.ruleId} · ${finding.target}`),
      );
    for (const finding of result.resolved)
      $("comparison-result").append(
        element("p", `Resolved: ${finding.ruleId} · ${finding.target}`),
      );
    $("comparison").hidden = false;
  } catch (error) {
    failure(error);
  } finally {
    $("compare").value = "";
  }
};

$("fetch-url").onclick = async () => {
  try {
    clearError();
    if (state.busy)
      throw new Error("Wait for the current operation or cancel it first.");
    if (!$("allow-network").checked)
      throw new Error("Enable explicit network access before fetching a URL.");
    const url = new URL($("url").value);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error("Use an HTTP(S) URL without embedded credentials.");
    busy(true);
    $("status").textContent = "Fetching the URL you explicitly enabled…";
    state.urlController = new AbortController();
    const timer = setTimeout(
      () => state.urlController?.abort(),
      sourceEndpoint ? 45_000 : 15_000,
    );
    try {
      let response;
      try {
        response = await fetch(sourceEndpoint ?? url, {
          ...(sourceEndpoint
            ? {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: url.href }),
              }
            : {}),
          signal: state.urlController.signal,
          credentials: "omit",
          referrerPolicy: "no-referrer",
        });
      } catch (error) {
        if (state.urlController.signal.aborted)
          throw new Error(
            "Source fetch cancelled or timed out. Try again, or upload the file.",
          );
        throw new Error(
          sourceEndpoint
            ? "Octri's source fetch service could not be reached. Try again, or upload the file."
            : "Browser fetch failed: the host may not allow CORS, or the network is unavailable. Download the file and upload it instead.",
          { cause: error },
        );
      }
      if (!response.ok) {
        if (sourceEndpoint) {
          const error = await response.json().catch(() => null);
          throw new Error(
            error?.error?.message ??
              `Source fetch failed (${response.status}). Try again, or upload the file.`,
          );
        }
        await response.body?.cancel();
        throw new Error(
          response.status === 403
            ? "The spec host refused this request (403). Check its access rules, or download the file and upload it instead."
            : `The spec host returned HTTP ${response.status}. Check the URL, or download the file and upload it instead.`,
        );
      }
      if (!response.body)
        throw new Error(
          "The spec host returned no source. Check the URL, or upload the file.",
        );
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: true });
      let content = "";
      let bytes = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.length;
          if (bytes > 5 * 1024 * 1024)
            throw new Error("Fetched source exceeds 5 MiB.");
          content += decoder.decode(chunk.value, { stream: true });
        }
        content += decoder.decode();
      } finally {
        await reader.cancel();
      }
      const finalUrl = sourceEndpoint
        ? new URL(response.headers.get("x-spec-source-url") ?? url.href)
        : new URL(response.url || url.href);
      if (
        !["http:", "https:"].includes(finalUrl.protocol) ||
        finalUrl.username ||
        finalUrl.password
      )
        throw new Error(
          "The source fetch service returned an invalid source URL.",
        );
      state.files = new Map([[finalUrl.href, content]]);
      state.root = finalUrl.href;
      state.active = finalUrl.href;
      state.original = null;
      renderSources();
      markStale();
      $("status").textContent =
        `${sourceEndpoint ? "Public URL source fetched through Octri" : "URL source fetched explicitly"}. Audit runs locally; referenced URLs are not fetched.`;
    } finally {
      clearTimeout(timer);
      state.urlController = null;
      busy(false);
    }
  } catch (error) {
    failure(error);
  }
};

$("save-session").onclick = () => {
  try {
    localStorage.setItem(
      "octri-auditor-session-v1",
      JSON.stringify(currentRequest()),
    );
    $("status").textContent = "Source and policy saved on this device.";
  } catch (error) {
    failure(error);
  }
};
$("restore-session").onclick = () => {
  try {
    const saved = localStorage.getItem("octri-auditor-session-v1");
    if (!saved) throw new Error("No saved session on this device.");
    loadRequest(JSON.parse(saved));
    state.original = null;
    state.history = [];
    state.lastPatch = null;
    markStale();
    $("status").textContent =
      "Saved session restored. Run the audit to refresh its report.";
  } catch (error) {
    failure(error);
  }
};
$("delete-session").onclick = () => {
  try {
    localStorage.removeItem("octri-auditor-session-v1");
    $("status").textContent = "Saved session deleted from this browser.";
  } catch (error) {
    failure(error);
  }
};

window.addEventListener("message", async (event) => {
  if (
    event.origin !== location.origin ||
    event.source !== parent ||
    event.data?.type !== "octri-auditor:load"
  )
    return;
  try {
    if (state.busy)
      throw new Error(
        "Wait for the current operation or cancel it before loading another artifact.",
      );
    loadRequest(event.data.request);
    markStale();
    state.original = null;
    state.history = [];
    state.lastPatch = null;
    state.selected.clear();
    state.handoff = true;
    state.handoffSourceSpecId =
      typeof event.data.sourceSpecId === "string"
        ? event.data.sourceSpecId
        : null;
    $("handoff").hidden = false;
    await run();
  } catch (error) {
    failure(error);
  }
});
$("handoff").onclick = async () => {
  try {
    if (!state.handoff || state.stale || !state.report?.complete)
      throw new Error(
        "Resolve integrity and incomplete checks before preparing the Octri import.",
      );
    const request = await execute("bundle", { request: state.request });
    if (!request) return;
    parent.postMessage(
      {
        type: "octri-auditor:handoff",
        sourceSpecId: state.handoffSourceSpecId,
        request,
        report: state.report,
        patch: state.lastPatch?.edits ?? [],
      },
      location.origin,
    );
  } catch (error) {
    failure(error);
  }
};
if (parent !== window)
  parent.postMessage({ type: "octri-auditor:ready" }, location.origin);
if (parent !== window)
  new ResizeObserver(() =>
    parent.postMessage(
      { type: "octri-auditor:resize", height: document.body.scrollHeight },
      location.origin,
    ),
  ).observe(document.body);
for (const language of [
  "typescript",
  "python",
  "rust",
  "dart",
  "ruby",
  "php",
  "swift",
  "java",
  "kotlin",
  "go",
]) {
  const label = element("label", undefined, { class: "checkbox" });
  const input = element("input", undefined, {
    type: "checkbox",
    value: language,
  });
  input.checked = true;
  label.append(
    input,
    document.createTextNode(
      language === "typescript"
        ? "JavaScript / TypeScript"
        : language[0].toUpperCase() + language.slice(1),
    ),
  );
  input.onchange = () => {
    try {
      const policy = config();
      const current = policy.profiles ?? ["docs", "sdk", "mcp"];
      policy.profiles = [
        ...current.filter(
          (profile) => profile !== "sdk" && !profile.startsWith("sdk-"),
        ),
        ...[...$("sdk-profiles").querySelectorAll("input:checked")].map(
          (input) => `sdk-${input.value}`,
        ),
      ];
      setConfig(policy);
    } catch (error) {
      failure(error);
    }
  };
  $("sdk-profiles").append(label);
}
renderSources();
