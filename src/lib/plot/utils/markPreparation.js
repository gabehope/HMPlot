// @ts-check
import { currentCause, mountCause, trackPreparation, publishWithCause } from '../rendering/viewSettlement.js';

/**
 * Request bookkeeping for one named mark. This does not own displayed transition frames or
 * BufferedField versions. Readback-only work may finish after cancellation: accepting the
 * newest completed result keeps continuously changing simulations drawing.
 * @template {{dispose(): void}} T
 * @param {import('./internalTypes.js').ViewServices} view The view the mark draws in.
 * @param {{publish(entry: T, cause: number): void, report(error: unknown): void}} handlers
 */
export function createMarkPreparation(view, { publish, report }) {
  /** @type {Map<import('./internalTypes.js').PreparationJob, AbortController>} */
  const requests = new Map();
  let order = 0, published = 0, destroyed = false;
  /** @type {number | undefined} */
  let pendingCause;

  /** @param {import('./internalTypes.js').PreparationJob['policy']} policy */
  function begin(policy) {
    const cause = Math.min(currentCause(view), pendingCause ?? Infinity,
      (order ? undefined : mountCause(view)) ?? Infinity);
    const controller = new AbortController();
    const request = { order: ++order, cause, policy, signal: controller.signal };
    requests.set(request, controller);
    pendingCause = cause;
    return request;
  }

  /** @param {import('./internalTypes.js').PreparationJob} request */
  function cancel(request) { requests.get(request)?.abort(); }

  /**
   * A successful in-place update is a publication too. Its fields already landed, so it
   * advances the completed order without replacing an entry or waiting for another draw.
   * @param {import('./internalTypes.js').PreparationJob} request
   */
  function accept(request) {
    requests.delete(request);
    if (destroyed || request.order < published ||
        (request.policy === "current-request" && (request.signal.aborted || request.order !== order))) return false;
    published = request.order;
    pendingCause = undefined;
    return true;
  }

  /**
   * Synchronous work publishes immediately unless an in-flight curve frame must draw first.
   * All success/failure/late cleanup takes this same path; cause tracking surrounds the
   * complete job, including its publication.
   * @param {import('./internalTypes.js').PreparationJob} request
   * @param {T | undefined} [entry]
   * @param {Promise<unknown> | null} [work]
   */
  function finish(request, entry, work) {
    /** @returns {void | Promise<void>} */
    const complete = () => {
      // Let the geometry already being refined reach a canvas frame before
      // another input result replaces its source buffers. The publication
      // order check below still drops obsolete completed results.
      if (!destroyed && request.order >= published &&
          !(request.policy === "current-request" && request.signal.aborted) && view.lifecycle.geometryBusy &&
          !view.clock.held && view.lifecycle.completedFrame) {
        return new Promise(resolve => requestAnimationFrame(resolve)).then(complete);
      }
      requests.delete(request);
      if (!entry) return;
      if (destroyed || request.order < published ||
          (request.policy === "current-request" && (request.signal.aborted || request.order !== order))) {
        entry.dispose();
        return;
      }
      published = request.order;
      pendingCause = undefined;
      // The entry keeps the change it serves (its domains' hold, TODO 143.2).
      if (entry && typeof entry === "object") /** @type {any} */ (entry).cause = request.cause;
      publishWithCause(view, request.cause, () => publish(entry, request.cause));
    };
    /** @param {unknown} error */
    const failed = (error) => {
      cancel(request);
      requests.delete(request);
      entry?.dispose();
      if (request.order === order) pendingCause = undefined;
      if (!destroyed && request.order >= published &&
          (request.policy !== "current-request" || request.order === order) &&
          !(error instanceof Error && error.name === "AbortError"))
        report(error);
    };
    if (work) return trackPreparation(view, work.then(complete).catch(failed), request.cause);
    try {
      const completion = complete();
      if (completion) return trackPreparation(view, completion.catch(failed), request.cause);
    } catch (error) { failed(error); }
  }

  function destroy() {
    destroyed = true;
    for (const controller of requests.values()) controller.abort();
    // Each outstanding completion still owns its entry until its readers finish.
    requests.clear();
    pendingCause = undefined;
  }
  return { begin, finish, accept, cancel, destroy };
}
