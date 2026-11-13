// @ts-check
/** One cause tracker coordinates preparation and completed-draw barriers across linked views.
 * Views own their jobs/draw callbacks; this module records which changes those jobs serve.
 * Upload settlement and renderer teardown have separate owners. */
import { tick } from "svelte";

/*
 * SETTLING AS A BARRIER (TODO 17.15). Every tracked preparation carries a CAUSE: a tick of
 * settleClock() for the change it serves. Work started while a result is being published
 * (publishWithCause: a transform's output, a mark's prepared frame, a brush or pick applied a
 * frame after its pointer event) is a follow-up of that change and inherits its cause, in any
 * plot: a brush in one plot reruns the Filters of the plots linked to it. Any other work is a new
 * request and takes a new tick. settlePreparations(view, until) waits for the jobs caused at
 * or before `until`, including their follow-ups, but not for requests made later. So a plot whose
 * data changes every frame (a Slice at an animated `at`) still reveals, and whenSettled() still
 * resolves; a request that a newer one supersedes (its run dropped) hands its cause on.
 */
/** @typedef {import('../utils/internalTypes.js').ViewServices} ViewServices */
/** @typedef {import('../utils/internalTypes.js').ViewLifecycle} ViewLifecycle */
let clock = 0,
  contextEpoch = 0;
/** @type {number | undefined} */
let context;
/** Every view's tracked jobs (whenSettled waits across linked plots). */
/** @type {Map<Promise<unknown>, number>} */
const everywhere = new Map();
/** Frames' domain holds (changeSettled): never waited on by another hold. */
/** @type {Set<Promise<unknown>>} */
const holds = new Set();
/** The next cause tick. */
export const settleClock = () => ++clock;
/** The cause for work started now: the change being published, else a new request.
 * @param {unknown} [_view]
 */
export const currentCause = (_view = undefined) => context ?? settleClock();
/**
 * Run `write` (a state change that publishes a result) so that work it starts, until Svelte has
 * flushed the change, inherits `cause`. Overlapping publications keep the earliest cause.
 * @template T
 * @param {unknown} _view
 * @param {number | undefined} cause
 * @param {() => T} write
 * @returns {T}
 */
export function publishWithCause(_view, cause, write) {
  if (cause === undefined) return write();
  context = context === undefined ? cause : Math.min(context, cause);
  const epoch = ++contextEpoch;
  try {
    return write();
  } finally {
    tick().then(() => {
      if (contextEpoch === epoch) context = undefined;
    });
  }
}
/**
 * A plot's mount is a change too: until its first reveal, the first run of each of its transforms
 * and marks, and work started without a cause, serve it (a plot mounts its children only after an
 * asynchronous GPU init, so their work starts after the page asked the plot to settle).
 */
/** @param {ViewServices | null | undefined} view */
export const mountCause = (view) =>
  view?.lifecycle.mounting ? view.lifecycle.mountCause : undefined;
/** The cause for work started without one: the change being published, the mount, or new.
 * @param {ViewServices | null | undefined} view
 * @returns {number}
 */
export const defaultCause = (view) =>
  context ?? mountCause(view) ?? settleClock();
/** Continue, synchronously and through the update that follows, as part of `cause`'s change.
 * @param {unknown} view
 * @param {number | undefined} cause
 */
export const adoptCause = (view, cause) =>
  publishWithCause(view, cause, () => {});
/**
 * Loads of asynchronous data (Providers, TODO 20). A load is waited for by its own Provider, by
 * the plots below it (UPSTREAM_LOADS) and by the plot it sits in, never by other plots: a slow
 * API in one part of a page does not hold every plot's whenSettled(). Settling can leave loads out
 * ({ loads: false }: a scene update is applied while its Providers load).
 */
/** @type {WeakSet<Promise<unknown>>} */
const loadJobs = new WeakSet();
// Draw publication stays pending through atomic uploads, but cannot block their preparation:
// the update gate must release before another canvas frame can publish the guides. Both maps
// are keyed by the view's lifecycle.
/** @type {WeakMap<Promise<unknown>, ViewLifecycle>} */
const drawJobs = new WeakMap();
/** @type {WeakMap<ViewLifecycle, Set<() => void>>} */
const drawWaiters = new WeakMap();
/** @param {import("../utils/internalTypes.js").ViewLifecycle | undefined} lifecycle */
const drawPaused = (lifecycle) =>
  lifecycle?.renderHeld ||
  lifecycle?.drawable === false ||
  lifecycle?.deviceLost;
/**
 * Wake draw barriers when an atomic update or hidden container pauses rendering.
 * @param {import("../utils/internalTypes.js").ViewServices | undefined} view
 */
export function rendererActivityChanged(view) {
  const lifecycle = view?.lifecycle;
  if (lifecycle && drawPaused(lifecycle))
    for (const resolve of drawWaiters.get(lifecycle) ?? []) resolve();
}
/** Yield a geometry publication until a completed draw; atomic updates and hidden views
 * must be able to prepare their next replacement without waiting for a paused renderer.
 * @param {import("../utils/internalTypes.js").ViewServices} view
 * @param {AbortSignal} [signal]
 * @returns {Promise<void>}
 */
export function afterCompletedFrame(view, signal) {
  const lifecycle = view.lifecycle;
  if (signal?.aborted || drawPaused(lifecycle)) return Promise.resolve();
  return new Promise((resolve) => {
    const callbacks = lifecycle.frameCallbacks;
    let waiters = drawWaiters.get(lifecycle);
    if (!waiters) drawWaiters.set(lifecycle, (waiters = new Set()));
    const done = () => {
      callbacks.delete(done);
      waiters.delete(done);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    callbacks.add(done);
    waiters.add(done);
    signal?.addEventListener("abort", done, { once: true });
  });
}
/** @param {Promise<unknown>} work */
function waitPreparation(work) {
  const lifecycle = drawJobs.get(work);
  if (!lifecycle) return work;
  if (drawPaused(lifecycle)) return Promise.resolve();
  let waiters = drawWaiters.get(lifecycle);
  if (!waiters) drawWaiters.set(lifecycle, (waiters = new Set()));
  /** @type {(() => void) | undefined} */
  let paused;
  /** @type {Promise<void>} */
  const suspension = new Promise((resolve) => {
    paused = resolve;
    waiters.add(resolve);
  });
  return Promise.race([work, suspension]).finally(() => {
    if (paused) waiters.delete(paused);
  });
}
/** Context: `(until) => Promise` waiting for the loads of the Providers above, caused by `until`. */
export const UPSTREAM_LOADS = Symbol("upstream-loads");
/**
 * Host geometry preparation is tracked separately from GPU upload settlement. Work outside every
 * Plot (a transform above it) has no view: it is tracked in the cross-view map only, which a
 * Plot's whenSettled waits on. A load is tracked only in its plot's own map.
 * @template {Promise<unknown>} T
 * @param {import("../utils/internalTypes.js").ViewServices | null | undefined} view The view the work
 *   serves (its lifecycle tracks it); no GPU capability is required.
 * @param {T} work
 * @param {number | undefined} [cause]
 */
export function trackPreparation(
  view,
  work,
  cause = undefined,
  { load = false, draw = false } = {},
) {
  cause ??= defaultCause(view);
  const jobs = view?.lifecycle.preparations;
  jobs?.set(work, cause);
  if (load) loadJobs.add(work);
  else everywhere.set(work, cause);
  if (draw && view) drawJobs.set(work, view.lifecycle);
  const done = () => {
    jobs?.delete(work);
    everywhere.delete(work);
    drawJobs.delete(work);
  };
  work.then(done, done);
  return work;
}
/**
 * Settles once no tracked job serving `cause` or an earlier change is pending, except those in
 * `except` (TODO 143.2: a frame applies the domains of one change once every mark and transform
 * serving it has published, its own hold excepted). Every frame's hold is excepted: two frames
 * holding for one change (Panels, linked plots) would otherwise each wait out the other's.
 * @param {number} cause @param {Set<Promise<unknown>>} except
 */
export async function changeSettled(cause, except) {
  for (const work of except) {
    holds.add(work);
    const release = () => holds.delete(work);
    work.then(release, release);
  }
  const due = () =>
    [...everywhere]
      .filter(([work, c]) => c <= cause && !holds.has(work))
      .map(([work]) => work);
  for (let jobs = due(); jobs.length; jobs = due()) {
    await Promise.allSettled(jobs);
    await tick();
  }
}
/**
 * Wait for the preparations caused at or before `until` (default: now) and their follow-ups:
 * this view's, or with `everywhere` every view's too (a change's follow-ups in linked plots).
 * With `loads: false`, not for loads.
 * @param {import("../utils/internalTypes.js").ViewServices | null | undefined} view
 */
export async function settlePreparations(
  view,
  until = settleClock(),
  { everywhere: all = false, loads = true } = {},
) {
  const due = () => {
    const entries = new Map([
      ...(view?.lifecycle.preparations ?? []),
      ...(all ? everywhere : []),
    ]);
    return [...entries]
      .filter(
        ([work, cause]) =>
          cause <= until &&
          (loads || !loadJobs.has(work)) &&
          !drawPaused(drawJobs.get(work)),
      )
      .map(([work]) => work);
  };
  for (let jobs = due(); jobs.length; jobs = due())
    await Promise.allSettled(jobs.map(waitPreparation));
}
