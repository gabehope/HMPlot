// What a docs Example needs before its live plot (TODO 68): whether this browser can draw live at
// all, a gate on the viewport, and a small queue so a page of examples starts its live plots a few
// at a time (the build's asset manifest is exampleBuilds.js's). Nothing here imports the plotting
// runtime.

let adapter;
/** Whether this browser has a WebGPU adapter (asked once). Without one, examples keep their previews. */
export function webgpuAvailable() {
  if (typeof navigator === "undefined" || !navigator.gpu) return Promise.resolve(false);
  adapter ??= navigator.gpu.requestAdapter().then((value) => Boolean(value)).catch(() => false);
  return adapter;
}

/**
 * Calls `callback` once, when `element` comes within `margin` of the viewport. Returns a function
 * that cancels it.
 */
export function nearViewport(element, callback, margin = "400px 0px") {
  if (typeof IntersectionObserver === "undefined") { callback(); return () => {}; }
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    observer.disconnect();
    callback();
  }, { rootMargin: margin });
  observer.observe(element);
  return () => observer.disconnect();
}

/**
 * A queue of at most `limit` tasks at a time. `run(task, cancelled)` starts `task` when a place is
 * free, unless `cancelled()` is true by then (it resolves undefined without running it); the place
 * frees when the task's promise settles or its AbortSignal fires. Cancelled work still has
 * rejection handlers, but cannot hold the next page's place while a download/settle finishes.
 */
export function createQueue(limit) {
  let active = 0;
  const waiting = [];
  const next = () => {
    while (active < limit && waiting.length) {
      const job = waiting.shift(), { task, cancelled, signal, finish } = job;
      if (cancelled() || signal?.aborted) { finish(); continue; }
      job.started = true;
      active++;
      Promise.resolve().then(() => signal?.aborted || cancelled() ? undefined : task()).then(value => finish(null, value), error => finish(error));
    }
  };
  return {
    run(task, cancelled = () => false, { signal } = {}) {
      return new Promise((resolve, reject) => {
        let done = false;
        const job = { task, cancelled, signal, started: false, finish(error, value) {
          if (done) return;
          done = true; signal?.removeEventListener("abort", abort);
          const at = waiting.indexOf(job); if (at >= 0) waiting.splice(at, 1);
          if (job.started) active--;
          if (error) reject(error); else resolve(value);
          next();
        } };
        const abort = () => job.finish();
        if (signal?.aborted) { job.finish(); return; }
        signal?.addEventListener("abort", abort, { once: true });
        waiting.push(job); next();
      });
    },
    get active() { return active; },
    get waiting() { return waiting.length; },
  };
}

/** The docs' live plots start two at a time: each compiles shaders and uploads its scene. */
export const liveQueue = createQueue(2);
