// @ts-check
// Labels spread apart along one axis (EndLabels, TODO 136.16): positions `at` (pixels, any
// order) moved by the least total distance that leaves `gap` between neighbours, as ggrepel and
// directlabels spread end labels: sorted, each pushed past the one before, then the whole run
// shifted back by its mean displacement, so the labels stay centred on their points.
/**
 * @param {number[]} at
 * @param {number} gap
 * @returns {number[]} each position's offset, in `at`'s order
 */
export function spreadOffsets(at, gap) {
  const order = at.map((_, i) => i).filter((i) => Number.isFinite(at[i])).sort((a, b) => at[a] - at[b]);
  const offsets = at.map(() => 0);
  // Runs of labels closer than gap move together: each run is placed at its mean, as tightly as
  // the gap allows, and merged with the run before while they still overlap.
  /** @type {{ members: number[], start: number }[]} */
  const runs = [];
  for (const i of order) {
    runs.push({ members: [i], start: at[i] });
    while (runs.length > 1) {
      const last = runs[runs.length - 1], before = runs[runs.length - 2];
      if (before.start + before.members.length * gap <= last.start) break;
      const members = [...before.members, ...last.members];
      const centre = members.reduce((sum, m, k) => sum + at[m] - k * gap, 0) / members.length;
      runs.splice(runs.length - 2, 2, { members, start: centre });
    }
  }
  for (const run of runs) run.members.forEach((m, k) => { offsets[m] = run.start + k * gap - at[m]; });
  return offsets;
}
