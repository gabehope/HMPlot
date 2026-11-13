// @ts-check
// Counts of CPU work (TODO 143): how many axis layouts, plot layout solves and option snapshots
// an interaction costs, for tests and profiling. Off unless the page sets
// globalThis.__hmplotWork = {}; then each call adds one to its name.
/** @param {string} name */
export function countWork(name) {
  const counts = /** @type {Record<string, number> | undefined} */ (/** @type {any} */ (globalThis).__hmplotWork);
  if (counts) counts[name] = (counts[name] ?? 0) + 1;
}
