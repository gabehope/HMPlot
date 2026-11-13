// @ts-check
/**
 * The loop guard (TODO 136.8). A mark that draws a view-reading transform's output (a column
 * computed from @view_x_max) and sets an axis's automatic domain moves the view it was computed
 * from, and the view re-runs the transform: a cycle that runs while nobody touches the plot.
 * Domains from the transform's input break the common cases (transform.svelte domainSource); the
 * guard catches the rest. Such a mark's domain publications are counted (`derived`), each
 * followed by the view changing (`allow`, before the view's readers re-run); input (the pointer,
 * a gesture, a view set by code) resets the count. Past `limit` rounds, each within `quiet` ms of
 * the last, the guard stops the view's readers and reports the cycle by name; the next input
 * resumes them.
 */
export const LOOP_ROUNDS = 40;
export const LOOP_QUIET_MS = 1000;

/**
 * @param {{ report: (error: Error | null) => void, limit?: number, quiet?: number,
 *   now?: () => number }} options `report` shows the cycle (null withdraws it).
 */
export function createLoopGuard({
  report,
  limit = LOOP_ROUNDS,
  quiet = LOOP_QUIET_MS,
  now = () => performance.now(),
}) {
  /** Reader -> mark -> axes, since the last round, and over the rounds counted. */
  /** @type {Map<string, Map<string, Set<string>>>} */
  let pending = new Map();
  /** @type {Map<string, Map<string, Set<string>>>} */
  const cycle = new Map();
  let rounds = 0,
    last = -Infinity,
    stopped = false;
  const merge = () => {
    for (const [reader, marks] of pending) {
      const into = cycle.get(reader) ?? new Map();
      cycle.set(reader, into);
      for (const [mark, axes] of marks)
        into.set(mark, new Set([...(into.get(mark) ?? []), ...axes]));
    }
    pending = new Map();
  };
  const message = () => {
    const parts = [...cycle].map(([reader, marks]) => {
      const drawn = [...marks].map(
        ([mark, axes]) => `${mark} (${[...axes].join(", ")})`,
      );
      return `${reader} reads the view (@view_* or @pointer), and the ${drawn.join(" and ")} drawing its output set${marks.size === 1 ? "s" : ""} the axes' domains, which move the view`;
    });
    const axes = [
      ...new Set(
        [...cycle.values()].flatMap((marks) =>
          [...marks.values()].flatMap((set) => [...set]),
        ),
      ),
    ];
    const error =
      /** @type {Error & { code?: string, diagnostic?: object }} */ (
        Error(
          `${parts.join("; ")}: a cycle, stopped after ${rounds} rounds without input. Give the Plot's ${axes.join(" and ")} axis${axes.length > 1 ? "es" : ""} a domain, or plot columns the view does not change.`,
        )
      );
    error.code = "view.cycle";
    error.diagnostic = { code: "view.cycle", component: [...cycle.keys()][0] };
    return error;
  };
  return {
    /** Whether the guard stopped the view's readers. */
    get stopped() {
      return stopped;
    },
    /** Input: the view's next changes are the viewer's (or code's), not the cycle's. */
    input() {
      rounds = 0;
      pending = new Map();
      cycle.clear();
      if (!stopped) return;
      stopped = false;
      report(null);
    },
    /**
     * A mark drawing `reader`'s view-derived output published domains for `axes`.
     * @param {string} reader @param {string} mark @param {string[]} axes
     */
    derived(reader, mark, axes) {
      if (!axes.length) return;
      const marks = pending.get(reader) ?? new Map();
      pending.set(reader, marks);
      marks.set(mark, new Set([...(marks.get(mark) ?? []), ...axes]));
    },
    /** The view changed: whether its readers may re-run. */
    allow() {
      if (stopped) return false;
      if (!pending.size) return true;
      const time = now();
      if (time - last > quiet) {
        rounds = 0;
        cycle.clear();
      }
      last = time;
      merge();
      if (++rounds < limit) return true;
      stopped = true;
      report(message());
      return false;
    },
  };
}
