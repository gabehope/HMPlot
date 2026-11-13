/**
 * Dodge's collision layout on the host (TODO 30.10). The layout is sequential by nature: each
 * glyph, in a seeded order, takes the offset nearest the baseline that clears every earlier glyph
 * of its group. On the GPU that was one pass per glyph and a wait per 128 earlier glyphs (about
 * n²/256 round trips); here it is one pass over the glyphs, each looking only at earlier glyphs
 * it can touch (an index by x), as Observable Plot's dodge does.
 *
 * The rule is the GPU one's: the candidates are 0 and each overlapping earlier glyph's offset ±
 * the clearance, the nearest valid one wins, and ties go to the GPU's candidate order (0, then
 * the + side by glyph order, then the - side). The GPU also offered every earlier glyph's offset,
 * however far in x; those never beat the nearest free offset, which is always 0 or the edge of
 * an overlapping glyph's clearance.
 *
 * `x`, `radius`, `group`: per glyph (nonfinite x and radius already replaced); `order`: glyph
 * indices in placement order. Returns each glyph's offset (Float32Array, glyph order).
 */
export function placeGlyphs(x, radius, group, order, padding) {
  const n = x.length, offsets = new Float32Array(n), ranks = new Int32Array(n);
  let widest = 0;
  for (let i = 0; i < n; i++) widest = Math.max(widest, radius[i]);
  const reach = 2 * widest + padding;
  if (!(reach > 0)) return offsets; // points that cannot touch stay on the baseline
  // Placed glyphs by (group, x cell): a glyph can only touch glyphs in its cell and the next.
  const cells = new Map();
  const cellOf = (value) => Math.floor(value / reach);
  const near = [];
  for (let k = 0; k < n; k++) {
    const i = order[k], xi = x[i], ri = radius[i], gi = group[i], at = cellOf(xi);
    near.length = 0;
    for (let c = at - 1; c <= at + 1; c++)
      for (const j of cells.get(`${gi}:${c}`) ?? []) {
        const dx = xi - x[j], clearance = ri + radius[j] + padding;
        const room = clearance * clearance - dx * dx;
        // Its placement rank orders ties as the GPU's candidates were.
        if (room > 0) near.push({ order: ranks[j], y: offsets[j], dx2: dx * dx, rr: clearance * clearance, dy: Math.sqrt(room) });
      }
    offsets[i] = nearestClear(near);
    const key = `${gi}:${at}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(i);
    ranks[i] = k;
  }
  return offsets;
}

/**
 * The candidate nearest 0 that clears every glyph in `near` ((c - y)² + dx² >= rr - 1e-4, the
 * GPU's tolerance), ties by the GPU's candidate order.
 */
function nearestClear(near) {
  const candidates = [{ value: 0, series: 0, order: -1 }];
  for (const g of near) {
    candidates.push({ value: g.y + g.dy, series: 1, order: g.order });
    candidates.push({ value: g.y - g.dy, series: 2, order: g.order });
  }
  candidates.sort((a, b) => Math.abs(a.value) - Math.abs(b.value) || a.series - b.series || a.order - b.order);
  for (const { value } of candidates) {
    let clear = true;
    for (const g of near) {
      const dy = value - g.y;
      if (dy * dy + g.dx2 < g.rr - 1e-4) { clear = false; break; }
    }
    if (clear) return value;
  }
  return 0;
}
