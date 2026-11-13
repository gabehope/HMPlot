// The live VectorTile workers (TODO 35): a small pool, shared by every VectorTile on the page,
// running tileMesh (vectorTileMesh.js); in-process where there are no workers (node).
import { diagnostic } from "./diagnostics.js";
import { tileMesh } from "./vectorTileMesh.js";
import { createLru } from "./vectorTileCache.js";

// The features of the tiles prepared last, for clicks: in process (node), as each worker keeps
// them (workers/vectorTile.worker.js); which worker prepared a tile, for as many tiles as they keep.
const RECENT = 96, RECENT_BYTES = 8 * 2 ** 20;
let workers = null, users = 0, jobs = 0;
const pending = new Map(), owners = createLru({ maxEntries: RECENT * 6 }),
  local = createLru({ maxEntries: RECENT, maxBytes: RECENT_BYTES, size: (entry) => entry.bytes });
// Tiles wait here, not in a worker's message queue: a worker takes one at a time, the most urgent
// first, and a tile no one wants any more is dropped before it runs (a quick zoom through levels
// otherwise left every worker preparing tiles of levels already gone).
let waiting = [], dispatching = false;
const aborted = () => new DOMException("The tile is no longer needed.", "AbortError");

function spawn() {
  const worker = new Worker(new URL("../workers/vectorTile.worker.js", import.meta.url), { type: "module" });
  const entry = { worker, active: 0 };
  worker.onmessage = ({ data }) => {
    const job = pending.get(data.id);
    if (!job) return;
    pending.delete(data.id);
    entry.active--;
    if (data.error) job.reject(diagnostic(data.error.code ?? "vectortile.data", data.error.message, { component: "VectorTile" }));
    else job.resolve(data.result ?? data.feature);
    dispatch();
  };
  // A worker that fails to load or crashes fails its jobs, and is replaced.
  worker.onerror = (event) => {
    event.preventDefault?.();
    for (const [id, job] of pending)
      if (job.entry === entry) { pending.delete(id); job.reject(Error(`VectorTile: the tile worker failed (${event.message ?? "no message"}).`)); }
    worker.terminate();
    if (workers) workers[workers.indexOf(entry)] = spawn();
    dispatch();
  };
  return entry;
}

function post(entry, message, resolve, reject) {
  const id = ++jobs;
  pending.set(id, { resolve, reject, entry });
  entry.active++;
  entry.worker.postMessage({ id, ...message });
}

// Once per microtask: the tiles asked for in one task are ranked together.
function dispatch() {
  if (dispatching) return;
  dispatching = true;
  queueMicrotask(() => {
    dispatching = false;
    if (!workers) return;
    let idle = workers.filter((entry) => entry.active === 0);
    if (!idle.length || !waiting.length) return;
    const ranked = [];
    for (const job of waiting) {
      let value;
      try { value = job.priority(); } catch { value = -1; }
      if (value >= 0) ranked.push({ job, value });
      else job.reject(aborted());
    }
    ranked.sort((a, b) => a.value - b.value);
    waiting = ranked.map(({ job }) => job);
    for (const entry of idle) {
      const job = waiting.shift();
      if (!job) break;
      owners.set(job.key, entry);
      post(entry, { key: job.key, job: job.job }, job.resolve, job.reject);
    }
  });
}

/**
 * Jobs shared while in flight (TODO 63.5): run(key, priority, ...args) starts one, and every call
 * with that key until it settles gets its promise (the first call's args run). The job's priority is the most urgent of its
 * callers' (a lower number first), and negative only when every caller's is: one caller dropping
 * a tile another still wants does not cancel it.
 * @param {(key: string, priority: () => number, ...args: any[]) => Promise<any>} run
 */
export function sharedJobs(run) {
  const inflight = new Map();
  return (key, priority = () => 0, ...args) => {
    let shared = inflight.get(key);
    if (!shared) {
      const callers = new Set();
      const urgency = () => {
        let best = -1;
        for (const each of callers) {
          let value;
          try { value = each(); } catch { value = -1; }
          if (value >= 0 && (best < 0 || value < best)) best = value;
        }
        return best;
      };
      shared = { callers };
      shared.promise = run(key, urgency, ...args).finally(() => inflight.delete(key));
      inflight.set(key, shared);
    }
    shared.callers.add(priority);
    return shared.promise;
  };
}

const queued = sharedJobs((key, priority, job) => new Promise((resolve, reject) => {
  waiting.push({ key, job, priority, resolve, reject });
  dispatch();
}));

/**
 * A handle on the tile workers: process(key, job, { priority }) prepares a tile (tileMesh's
 * result), lower priorities first; a negative one when a worker comes free drops the tile, which
 * rejects with an AbortError. Calls with one key share a job while it is in flight (sharedJobs).
 * feature(key, index, job) returns a feature of a tile prepared last; one forgotten is prepared
 * again from `job` (a function returning tileMesh's job, or null for none). Release the handle
 * when done: the workers end with their last user.
 */
export function acquireTileWorkers() {
  users++;
  const threads = typeof Worker === "undefined" ? 0 : Math.max(1, Math.min(6, (globalThis.navigator?.hardwareConcurrency ?? 4) - 1));
  if (threads && !workers) workers = Array.from({ length: threads }, spawn);
  let released = false;
  return {
    /** @param {string} key @param {any} job @param {{ priority?: () => number }} [options] */
    process(key, job, { priority = () => 0 } = {}) {
      if (!workers)
        return Promise.resolve().then(() => {
          const { result, features } = tileMesh(job);
          local.set(key, { features, bytes: job.bytes?.byteLength ?? 0 });
          return result;
        });
      return queued(key, priority, job);
    },
    async feature(key, index, job = () => null) {
      const ask = () => {
        if (!workers) return Promise.resolve(local.get(key)?.features[index] ?? null);
        const entry = owners.get(key);
        if (!entry || !workers.includes(entry)) return Promise.resolve(null);
        return new Promise((resolve, reject) => post(entry, { type: "feature", key, index }, resolve, reject));
      };
      const found = await ask();
      if (found !== null) return found;
      const again = await job();
      if (!again) return null;
      await this.process(key, again);
      return ask();
    },
    release() {
      if (released) return;
      released = true;
      if (--users > 0 || !workers) return;
      for (const entry of workers) entry.worker.terminate();
      for (const [id, job] of pending) { pending.delete(id); job.reject(new DOMException("The tile workers were released.", "AbortError")); }
      for (const job of waiting) job.reject(new DOMException("The tile workers were released.", "AbortError"));
      waiting = [];
      workers = null;
      owners.clear();
    },
  };
}
