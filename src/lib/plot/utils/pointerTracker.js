// Pointer columns (TODO 45): @pointer_x and @pointer_y are the pointer's position in the reading
// frame's data, and @view_* its visible domain (TODO 19). A view keeps one tracker
// (viewCore.svelte, the view's navigation). Readers
// subscribe with their frame; the tracker converts the pointer only for frames that are read,
// once per move (memoized until the next), and tells the readers after each animation frame
// with a move, so a view without readers does nothing and one at rest does nothing either.

const MISSING = Object.freeze({ x: NaN, y: NaN });

/**
 * @param {object} options
 * @param {(point: number[], frame: any) => ({ x: any, y: any } | null)} options.convert The canvas
 *   point (CSS pixels) in `frame`'s data, { x, y } (NaN off the frame), or null.
 * @param {(frame: any) => ({ x: number[], y: number[] } | null)} [options.extent] The frame's
 *   visible domain (TODO 19), read by the same readers.
 * @param {(update: () => Promise<any>) => void} [options.schedule] Runs `update` at the next
 *   animation frame (it returns a promise of the readers' updates).
 * @param {() => boolean} [options.gate] Whether the readers may re-run now (the view's loop
 *   guard, TODO 136.8: false while it holds a cycle stopped).
 */
export function createPointerTracker({ convert, extent = () => null, schedule = (update) => { requestAnimationFrame(() => update()); }, gate = () => true }) {
  let point = null, pending = false, revision = 0;
  const readers = new Set(), memo = new Map(), extents = new Map();
  const tracker = {
    /** How many readers there are (none: moves cost nothing). */
    get size() { return readers.size; },
    /** Bumps with every move that reaches readers. */
    get revision() { return revision; },
    /** The canvas point (null when the pointer is off the canvas or lifted). */
    get point() { return point; },
    /**
     * A reader of the pointer in `frame` (a frame's options node): `changed()` runs after each
     * move (and each change of the view, `refresh`), once per animation frame. Returns the
     * unsubscribe function.
     */
    subscribe(frame, changed) {
      const reader = { frame, changed };
      readers.add(reader);
      return () => readers.delete(reader);
    },
    /** The pointer in `frame`'s data: { x, y }, missing (NaN) off the frame or without a pointer. */
    at(frame) {
      if (!point || !frame) return MISSING;
      let value = memo.get(frame);
      if (!value) memo.set(frame, (value = convert(point, frame) ?? MISSING));
      return value;
    },
    /** `frame`'s visible domain: { x: [min, max], y: [min, max] }, or null. */
    visible(frame) {
      if (!frame) return null;
      if (!extents.has(frame)) extents.set(frame, extent(frame) ?? null);
      return extents.get(frame);
    },
    /** The pointer is at `next` ([x, y] in canvas pixels), or left (null). */
    move(next) {
      const same = next === point || (next && point && next[0] === point[0] && next[1] === point[1]);
      point = next;
      if (same || !readers.size) {
        if (!same) memo.clear();
        return;
      }
      tracker.refresh();
    },
    /** The same pointer means other data (a pan, a zoom, a resize): convert again. */
    refresh() {
      memo.clear();
      extents.clear();
      if (!readers.size || pending) return;
      pending = true;
      schedule(() => {
        pending = false;
        revision++;
        memo.clear();
        extents.clear();
        if (!gate()) return Promise.resolve([]);
        // The readers' updates, as one promise (the view waits for them in whenSettled).
        return Promise.allSettled([...readers].map((reader) => reader.changed()));
      });
    },
  };
  return tracker;
}
