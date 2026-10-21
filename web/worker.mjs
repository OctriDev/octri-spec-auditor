import Auditor from "../packages/browser/index.mjs";

self.onmessage = async ({ data }) => {
  try {
    self.postMessage({ ok: true, value: await Auditor.call(data) });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: {
        code: error.code ?? "WORKER_ERROR",
        message: error.message,
        diagnostics: error.diagnostics ?? [],
      },
    });
  }
};
