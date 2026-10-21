/** Disposable workers make cancellation terminate Rust execution and free state. */
export class EngineJob {
  #active;
  async run(envelope) {
    if (this.#active)
      throw new Error("Another audit operation is still running");
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL("./worker.mjs", import.meta.url), {
        type: "module",
      });
      let finished = false;
      const finish = (error, result) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        worker.terminate();
        this.#active = undefined;
        if (error) reject(error);
        else resolve(result);
      };
      const timer = setTimeout(
        () =>
          finish(
            new Error(
              "Processing exceeded 30 seconds. Reduce the input or split the specification.",
            ),
          ),
        30_000,
      );
      this.#active = () =>
        finish(new Error("Processing cancelled. Your source is unchanged."));
      worker.onmessage = ({ data }) =>
        data.ok
          ? finish(null, data.value)
          : finish(Object.assign(new Error(data.error.message), data.error));
      worker.onerror = (event) =>
        finish(
          new Error(
            event.message ||
              "Could not load the Rust engine. Reload the page, then try again.",
          ),
        );
      worker.postMessage(envelope);
    });
  }
  cancel() {
    this.#active?.();
  }
}
