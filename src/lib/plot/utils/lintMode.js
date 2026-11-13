// @ts-check
/**
 * What hm.check reads that a page skips (TODO 136.13): a mark reads its data's extent on an axis
 * with an explicit domain too, so a domain far wider than the data lints (plotLints.js
 * wideDomains); the domain drawn is the explicit one either way. The lints that follow the drawn
 * size (hidden category labels, points covering the plot) run on hm.check's page only, so a live
 * page does not re-send its diagnostics on every resize.
 */
let extents = false;
/** Whether marks read their extents on explicit axes (hm.check's page). */
export const lintExtents = () => extents;
/** @param {boolean} value */
export function setLintExtents(value) {
  extents = value;
}
