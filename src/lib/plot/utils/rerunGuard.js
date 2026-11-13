// @ts-check
/**
 * The re-run guard (2026-10-22). A transform that reads interaction state (@hovered, a brush, a
 * selection) or the view (@pointer_x, @time) re-runs each time it changes: on every pointer move
 * for a hover, on every frame for the clock. The chart works, and each run recomputes the rows
 * and re-prepares every mark below it, so a fade written as a Filter costs four times what
 * `respond=` does (docs/PERFORMANCE.md). Nothing showed that. The view counts each transform's
 * runs by cause and keeps the densest second; a transform that ran `BURST` times within a
 * second on an interaction or view cause lints by name (viewCore's listDiagnostics, so the
 * Svelte checker and hm.check report it). Runs a tween asks for are counted, not linted: they
 * end when the tween lands.
 */
export const RERUN_WINDOW_MS = 1000;
export const RERUN_BURST = 10;

/** @typedef {"data" | "settings" | "interaction" | "view" | "tween"} RunCause */
/** @typedef {{ kind: string, name?: string, cause: string, burst: number, times: number[] }} RerunEntry */

/**
 * Count one run of a transform in its view.
 * @param {{ diagnostics: { counters: { transformRuns: Record<string, number>, reruns: Map<object, RerunEntry> } } } | undefined} services
 * @param {object} owner the transform (its error owner)
 * @param {{ kind: string, name?: string, cause: RunCause, now?: number }} run
 */
export function noteTransformRun(services, owner, { kind, name, cause, now = performance.now() }) {
  const counters = services?.diagnostics?.counters;
  if (!counters) return;
  counters.transformRuns[cause] = (counters.transformRuns[cause] ?? 0) + 1;
  if (cause !== "interaction" && cause !== "view") return;
  let entry = counters.reruns.get(owner);
  if (!entry) counters.reruns.set(owner, (entry = { kind, name, cause, burst: 0, times: [] }));
  entry.times.push(now);
  while (entry.times.length && now - entry.times[0] > RERUN_WINDOW_MS) entry.times.shift();
  if (entry.times.length > entry.burst) {
    entry.burst = entry.times.length;
    entry.cause = cause;
  }
}

/**
 * The lints: each transform whose densest second held `BURST` runs or more.
 * @param {{ reruns: Map<object, RerunEntry> }} counters
 * @returns {import("./diagnostics.js").Diagnostic[]}
 */
export function rerunLints(counters) {
  /** @type {import("./diagnostics.js").Diagnostic[]} */
  const found = [];
  for (const entry of counters.reruns.values()) {
    if (entry.burst < RERUN_BURST) continue;
    const named = entry.name ? `${entry.kind} "${entry.name}"` : entry.kind;
    const why = entry.cause === "view"
      ? "the pointer or the clock moved (@pointer_x, @view_x_min, @time)"
      : "a selection, brush or hover changed";
    found.push({
      severity: "lint", code: "lint.rerun-per-pointer", component: entry.kind,
      message: `${named}: re-ran ${entry.burst} times within one second because ${why}. Each run recomputes its ` +
        `rows and re-prepares every mark below it. For a fade or a highlight, set respond= on the mark (it re-runs ` +
        `nothing); for a readout of the rows under the pointer, keep the Filter but draw it in a Title or TableView ` +
        `only; for a value that moves every frame, read it on a channel rather than in a transform.`,
    });
  }
  return found;
}
