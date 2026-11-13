// @ts-check
/**
 * Which channels a legend explains (TODO 136.13): a guide drawn for a mark's channel (a Legend, or
 * the Plot's automatic legend, whose guides are guideView's leaves) claims that channel of the
 * mark while it is mounted. A mark that maps color from data with no claim lints (plotLints.js):
 * nothing says which color is which.
 */

/** @type {WeakMap<object, Map<string, number>>} */
const claims = new WeakMap();
/** The marks with a claimed channel: a Facet's legend explains every cell's scale through one. */
const claimed = new Set();

/**
 * Claim `channel` of `mark` as explained; returns the release.
 * @param {object} mark @param {string} channel
 */
export function claimLegend(mark, channel) {
  let channels = claims.get(mark);
  if (!channels) claims.set(mark, (channels = new Map()));
  channels.set(channel, (channels.get(channel) ?? 0) + 1);
  claimed.add(mark);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = (channels.get(channel) ?? 1) - 1;
    if (count > 0) channels.set(channel, count);
    else channels.delete(channel);
    if (!channels.size) claimed.delete(mark);
  };
}

/** Whether a mounted legend explains `channel` of `mark`. @param {unknown} mark @param {string} channel */
export const legendExplains = (mark, channel) =>
  Boolean(mark && typeof mark === "object" && claims.get(mark)?.get(channel));

/** Every mark a mounted legend explains a channel of. */
export const legendClaimedMarks = () => [...claimed];
