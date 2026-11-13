import { Array as JaxArray, numpy as np } from "@hmplot/jax";
import { asArray } from "./data.js";
import { finiteExtents } from "./dataView.js";

const NO_MASK = {}, UNSCOPED = {};

/**
 * Bounded investigation helper: share ready/in-flight extent work, keeping only the latest
 * revision for each input/mask/transform/column. Cache values are host numbers, never retained
 * device arrays. Mutable producers must supply revisions; an ordinary JAX value is immutable.
 * A batch groups requests already ready in one microtask, with the same publication owner and
 * mask, reshaped the same way. It never waits for another plot, a future preparation, or an
 * optional consumer.
 */
export function createExtentSummary({ read = finiteExtents, schedule = queueMicrotask } = {}) {
  const cache = new WeakMap();
  let pending = new Map();
  const same = (a, b) => a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

  async function flush() {
    const ready = pending;
    pending = new Map();
    const batches = [...ready.values()].flatMap(masks =>
      [...masks.values()].flatMap(revisions => [...revisions.values()].flatMap(shapes => [...shapes.values()])));
    await Promise.all(batches.map(async (requests) => {
      try {
        const extents = await read(requests.map(({ array, transform, column }) => ({ array, transform, column })),
          requests[0].valid, { missing: null });
        requests.forEach((request, i) => request.resolve(extents[i]));
      } catch (error) {
        requests.forEach((request) => request.reject(error));
      } finally {
        for (const { array, valid } of requests) { array.dispose(); valid?.dispose(); }
      }
    }));
  }

  return {
    /**
     * @param {unknown} input An array, or a mutable host column read at `valueRevision`.
     * @param {{ transform?: string, column?: number | null, valid?: unknown,
     *   valueRevision?: unknown, maskRevision?: unknown, batch?: object }} [options]
     */
    request(input, { transform = "linear", column = null, valid = null,
      valueRevision, maskRevision, batch = UNSCOPED } = {}) {
      if (input instanceof JaxArray && input.refCount <= 0)
        return Promise.reject(Error("Cannot infer an extent from a disposed column."));
      const mutableInput = !(input instanceof JaxArray);
      const mutableMask = valid && !(valid instanceof JaxArray);
      const eligible = input && typeof input === "object" &&
        (!mutableInput || valueRevision !== undefined) && (!mutableMask || maskRevision !== undefined);
      const key = JSON.stringify([transform, column]);
      const revision = [valueRevision, maskRevision];
      let entries, previous;
      if (eligible) {
        let masks = cache.get(input);
        if (!masks) cache.set(input, masks = new WeakMap());
        entries = masks.get(valid ?? NO_MASK);
        if (!entries) masks.set(valid ?? NO_MASK, entries = new Map());
        previous = entries.get(key);
        if (previous && same(previous.revision, revision)) return previous.work;
      }

      // Retain immediately, before yielding: superseded/disposed preparations may release their
      // inputs while another consumer still awaits this shared summary.
      let array = asArray(input), heldMask = valid ? asArray(valid) : null, maskShape = "rows";
      if (column === null && array.shape.length !== 1) {
        const shape = array.shape;
        if (heldMask && shape.length === 0) {
          const previous = heldMask;
          heldMask = np.any(previous.ref.greater(0)).reshape([1]);
          previous.dispose();
          maskShape = "any";
        } else if (heldMask && shape.length > 1 && heldMask.shape[0] === shape[0]) {
          const previous = heldMask, cells = shape.slice(1).reduce((a, b) => a * b, 1);
          heldMask = np.repeat(previous.ref, cells);
          previous.dispose();
          maskShape = `repeat:${cells}`;
        }
        array = array.reshape([-1]);
      }
      let resolve, reject;
      const work = new Promise((yes, no) => { resolve = yes; reject = no; });
      const entry = { revision, work };
      if (eligible) {
        entries.set(key, entry);
        work.catch(() => { if (entries.get(key) === entry) entries.delete(key); });
      }
      const first = pending.size === 0;
      let masks = pending.get(batch);
      if (!masks) pending.set(batch, masks = new Map());
      // A host mask may change between requests queued in the same microtask. Only
      // certified equal revisions can share its snapshot; unversioned host masks are private.
      const maskKey = mutableMask && maskRevision === undefined ? {} : valid ?? NO_MASK;
      let revisions = masks.get(maskKey);
      if (!revisions) masks.set(maskKey, revisions = new Map());
      let shapes = revisions.get(maskRevision);
      if (!shapes) revisions.set(maskRevision, shapes = new Map());
      // The batch reads one mask: a scalar's or raster's reshaped mask cannot stand in for a column's.
      let requests = shapes.get(maskShape);
      if (!requests) shapes.set(maskShape, requests = []);
      requests.push({ array, valid: heldMask, column, transform, resolve, reject });
      if (first) schedule(flush);
      return work;
    },
  };
}

export const extentSummary = createExtentSummary();
