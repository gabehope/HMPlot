// A transform's runs, independent of any component (TODO 142.2): what transform.svelte did inline.
// One runner owns one transform's sequence of runs over its input: each request snapshots
// nothing itself (the caller hands it the input it read), runs after the previous run settles,
// and publishes its output under the change it serves (rendering/viewSettlement.js), retiring
// the output it replaces one tick later, when its readers have moved on. A request superseded
// before it starts is dropped and hands its cause on; one already running finishes and
// publishes (TODO 17.15). The runner's output is read through `current()`; a component makes it
// reactive by publishing it into its own state (`publish`), so the transform's children and
// any explicit reference to it (Data value={handle}, TODO 142.3) follow the same output.
import { tick } from "svelte";
import { currentCause, mountCause, publishWithCause, settleClock, trackPreparation } from "../../rendering/viewSettlement.js";
import { initializePlot } from "../../../jaxExtensions/setup.js";
import { disposeTransformCache } from "./common.js";

/**
 * @param {{
 *   viewServices: any,
 *   publish: (next: any) => void,
 *   failed: (error: any) => void,
 *   pending: (value: boolean) => void,
 *   track?: (work: Promise<any>) => void,
 * }} hooks
 * `publish(next)`: make `next` the output (the component's state); `failed(e)`: a run's error;
 * `pending(value)`: whether a run is in flight; `track(work)`: an enclosing Facet's tracking.
 */
export function createTransformRunner({ viewServices, publish, failed, pending, track }) {
  let preparation = Promise.resolve(),
    revision = 0,
    alive = true,
    /** @type {number | undefined} */ droppedCause,
    output = /** @type {any} */ (null);
  // The runs and the change each serves: whenSettled waits for those caused before it was
  // called, not for later ones (a live transform re-runs every frame).
  const runs = new Map();
  /** @type {Set<AbortController>} */
  const running = new Set();
  // The cache its runs share (transforms/common.js), released after the last run.
  const cache = {};
  return {
    cache,
    current: () => output,
    get alive() { return alive; },
    /**
     * Run once on `input` (a snapshot the caller owns until the run ends; the runner disposes
     * it then). `run(signal)` computes the output; `accepted(next)` runs just before it publishes.
     * Returns the cleanup a superseding request calls: it drops this run if it has not started.
     * @param {any} input
     * @param {(signal: AbortSignal) => Promise<any>} run
     * @param {(next: any) => void} [accepted]
     */
    request(input, run, accepted) {
      const cancel = new AbortController();
      const id = ++revision;
      let started = false;
      // The change this run serves (TODO 17.15): its output is published under it, so the work
      // downstream counts as a follow-up for whenSettled(). A run dropped before it started
      // handed its cause on: this run's output carries that change too. The first run serves
      // the plot's mount (it may start after the plot was asked to settle).
      const cause = Math.min(currentCause(viewServices), droppedCause ?? Infinity,
        (id === 1 ? mountCause(viewServices) : undefined) ?? Infinity);
      droppedCause = undefined;
      pending(true);
      const work = preparation
        .catch(() => {})
        .then(() => {
          if (cancel.signal.aborted) throw new DOMException("Canceled", "AbortError");
          started = true;
          running.add(cancel);
          return initializePlot();
        })
        .then(() => run(cancel.signal))
        .then((next) => {
          if (cancel.signal.aborted || !alive) {
            next.dispose();
            return;
          }
          // Its own state first (a tween's schedule), outside the publication's cause, as the
          // component did before publishing.
          accepted?.(next);
          const old = output;
          publishWithCause(viewServices, cause, () => {
            output = next;
            publish(next);
          });
          tick().then(() => old?.dispose());
        })
        .catch((e) => {
          if (e.name !== "AbortError" && alive && !cancel.signal.aborted) failed(e);
        })
        .finally(() => {
          running.delete(cancel);
          input.dispose();
          if (id === revision) pending(false);
        });
      // Outside every Plot there is no renderer: the run is tracked across renderers, so a Plot
      // below it (Provider > Calculate > Plot) waits for it too (TODO 20).
      preparation = trackPreparation(viewServices, work, cause);
      runs.set(work, cause);
      work.finally(() => runs.delete(work));
      track?.(work);
      // A newer request supersedes this run. One that has not started is dropped; one already
      // running finishes and publishes (the newest output so far), and the newest waiting
      // request runs next. So a transform whose input changes every frame (a Slice at an
      // animated `at`) still draws, at the rate its runs complete (TODO 17.15).
      return () => {
        if (started) return;
        cancel.abort();
        droppedCause = Math.min(droppedCause ?? Infinity, cause);
      };
    },
    /** Wait for the runs caused before this call (and the ticks their publications take). */
    async settled() {
      const until = settleClock();
      for (let due = [...runs].filter(([, cause]) => cause <= until); due.length;
        due = [...runs].filter(([, cause]) => cause <= until)) {
        await Promise.allSettled(due.map(([work]) => work));
        await tick();
      }
    },
    /** Abort the runs in flight, release the cache after the last, and retire the output. */
    dispose() {
      alive = false;
      for (const run of running) run.abort();
      preparation.finally(() => disposeTransformCache(cache));
      output?.dispose();
      output = null;
    },
  };
}
