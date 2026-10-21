/** Browser state preserves the original bytes alongside every reviewed revision. */
import { stringifyJson } from "../packages/browser/client.mjs";
export const DEFAULT_URI = "memory://audit/openapi.yaml";
const encoder = new TextEncoder();

export function checkFiles(files, limits = {}) {
  const perFile = Math.min(
    limits.maxDocumentBytes ?? 5 * 1024 * 1024,
    24 * 1024 * 1024,
  );
  const totalLimit = Math.min(
    limits.maxTotalBytes ?? 20 * 1024 * 1024,
    64 * 1024 * 1024,
  );
  if (files.size > Math.min(limits.maxDocuments ?? 100, 100))
    throw new Error("Input exceeds the configured file-count limit.");
  let total = 0;
  for (const [name, content] of files) {
    const bytes = encoder.encode(content).length;
    if (bytes > perFile)
      throw new Error(
        `${name} exceeds the configured ${perFile / 1024 / 1024} MiB per-file limit.`,
      );
    total += bytes;
  }
  if (total > totalLimit)
    throw new Error(
      `Expanded input exceeds ${totalLimit / 1024 / 1024} MiB. Supply fewer dependencies.`,
    );
  return total;
}

export function sourceFiles(request) {
  const files = new Map(Object.entries(request.files ?? {}));
  files.set(request.input.uri, request.input.content);
  checkFiles(files, request.config?.limits);
  return files;
}

export function requestFrom(files, root, config) {
  checkFiles(files, config.limits);
  return {
    input: { uri: root, content: files.get(root), generated: false },
    files: Object.fromEntries([...files].filter(([uri]) => uri !== root)),
    config,
  };
}

export function download(name, value, type = "application/json") {
  const data =
    typeof value === "string" ? value : stringifyJson(value, 2) + "\n";
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function fileName(uri) {
  try {
    return decodeURIComponent(new URL(uri).pathname).replace(/^\//, "") || uri;
  } catch {
    return uri;
  }
}

export function selectLocation(textarea, location) {
  const byteOffset = location.offset;
  let start;
  if (Number.isInteger(byteOffset)) {
    start = new TextDecoder().decode(
      encoder.encode(textarea.value).slice(0, byteOffset),
    ).length;
  } else {
    const lines = textarea.value.split("\n");
    start = lines
      .slice(0, Math.max(0, (location.line ?? 1) - 1))
      .reduce((sum, line) => sum + line.length + 1, 0);
  }
  let end = textarea.value.indexOf("\n", start);
  if (end < 0) end = textarea.value.length;
  textarea.focus();
  textarea.setSelectionRange(start, end);
  const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20;
  textarea.scrollTop = Math.max(0, ((location.line ?? 1) - 4) * lineHeight);
}
