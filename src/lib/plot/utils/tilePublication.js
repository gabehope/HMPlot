// A view owns one publication queue. A turn includes upload, graph construction and its
// first draw; another RAF alone does not mean the renderer has finished that work.
const queues = new WeakMap();

/**
 * @param {import("./internalTypes.js").ViewServices} view Its frames release the turns, and its
 *   diagnostics time them.
 * @param {() => boolean} stale
 * @param {() => number} [priority]
 */
export function tilePublication(view, stale, priority = () => 0) {
  let queue = queues.get(view);
  if (!queue) {
    const jobs = [], { diagnostics } = view;
    let active = false, drawing = false, scheduled = false, drawingStarted = 0, closed = false, frame;
    const callbacks = view.lifecycle.frameCallbacks;
    const pump = () => {
      scheduled = false;
      if (closed) return;
      for (let i = jobs.length - 1; i >= 0; i--)
        if (jobs[i].stale() || jobs[i].priority() < 0) jobs.splice(i, 1)[0].resolve(null);
      if (active || drawing || !jobs.length) return;
      jobs.sort((a, b) => a.priority() - b.priority());
      const job = jobs.shift();
      active = true;
      const started = performance.now();
      let released = false;
      job.resolve((drawn = true) => {
        if (released || closed) return;
        released = true;
        active = false;
        drawing = drawn;
        diagnostics?.instrumentation.current?.sample("tilePreparation", performance.now() - started);
        if (drawing) { drawingStarted = started; callbacks.add(completed); } else schedule();
      });
    };
    const schedule = () => {
      if (closed || scheduled || active || drawing || !jobs.length) return;
      scheduled = true;
      frame = requestAnimationFrame(pump);
    };
    const completed = () => {
      diagnostics?.instrumentation.current?.sample("tilePublication", performance.now() - drawingStarted);
      drawing = false;
      callbacks.delete(completed);
      // Yield the remainder of a costly completed frame to the browser. Never release two
      // preparations in the same frame, even when several VectorTile components share it.
      schedule();
    };
    queue = {
      add(job) { if (closed) job.resolve(null); else { jobs.push(job); schedule(); } },
      close() {
        closed = true;
        if (scheduled) globalThis.cancelAnimationFrame?.(frame);
        callbacks.delete(completed);
        for (const job of jobs.splice(0)) job.resolve(null);
      },
    };
    queues.set(view, queue);
    view.lifecycle.rendererResources.own(() => queue.close());
  }
  return new Promise((resolve) => queue.add({ stale, priority, resolve }));
}
