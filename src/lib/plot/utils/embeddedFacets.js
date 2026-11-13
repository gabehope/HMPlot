/**
 * Layout metadata only: observation partitioning remains in partitionFacets. `splitRow` and
 * `splitColumn` say which dimensions the cells split (normalizeFacetSpec). Cells that carry
 * 1-based gridRow/gridColumn (pairs) take those grid places; others fill the grid row-major.
 */
export function embeddedFacetLayout(cells, {splitRow = false, splitColumn = false, layout = "bands", wrap, bandPadding = .1, gap = 16, width = 1, height = 1}) {
  if (!["bands", "grid"].includes(layout)) throw Error('Facet.layout must be "bands" or "grid".');
  if (!Number.isFinite(bandPadding) || bandPadding < 0 || bandPadding >= 1) throw Error("Facet.bandPadding must be in [0, 1).");
  if (!Number.isFinite(gap) || gap < 0) throw Error("Facet.gap must be nonnegative.");
  if (layout === "bands" && wrap !== undefined) throw Error('Embedded Facet wrap requires layout="grid".');
  const rows = [...new Set(cells.map(c=>c.row))], columns = [...new Set(cells.map(c=>c.column))];
  const placed = layout === "grid" && cells.length > 0 && cells.every(c => c.gridRow && c.gridColumn);
  const nx = placed ? Math.max(...cells.map(c=>c.gridColumn)) : layout === "grid" ? (wrap ?? columns.length) : columns.length;
  const ny = placed ? Math.max(...cells.map(c=>c.gridRow)) : layout === "grid" ? Math.ceil(cells.length / Math.max(1,nx)) : rows.length;
  const px = layout === "bands" ? bandPadding : Math.min(.95, gap * nx / Math.max(1,width));
  const py = layout === "bands" ? bandPadding : Math.min(.95, gap * ny / Math.max(1,height));
  const splitX = layout === "grid" || splitColumn, splitY = layout === "grid" || splitRow;
  return {extent: {x: splitX ? [-.5,nx-.5] : null, y: splitY ? [-.5,ny-.5] : null},
    cells: cells.map((cell,i)=>{
      const x = placed ? cell.gridColumn-1 : layout === "grid" ? i%nx : columns.indexOf(cell.column);
      const y = placed ? ny-cell.gridRow : layout === "grid" ? ny-1-Math.floor(i/nx) : rows.indexOf(cell.row);
      return {cell, x: splitX ? {range:[x-.5+px/2,x+.5-px/2]} : {},
        y: splitY ? {range:[y-.5+py/2,y+.5-py/2]} : {}};
    })};
}

/**
 * Throw the first configuration error for a Facet, or return silently when valid. `scales` and
 * `layout` are the effective values (a spec's defaults applied); `splitRow`/`splitColumn` come
 * from normalizeFacetSpec.
 */
export function validateFacetConfig({ embedded, link, layout, scales, resolve, splitRow, splitColumn, wrap }) {
  // "auto" (the default) links the axes the cells share and label once (facetCore autoLink).
  if (link === "auto") link = "none";
  if (embedded && link !== "none") throw Error("Embedded facets share their View camera; use link=\"none\".");
  if (!embedded && layout === "bands") throw Error("Facet layout=bands requires an enclosing Plot or Frame.");
  if (!["shared", "field", "free", "free-x", "free-y", "free-z"].includes(scales))
    throw Error("Invalid facet scales.");
  if (resolve && (typeof resolve !== "object" || Array.isArray(resolve) || Object.entries(resolve).some(([key, value]) =>
    !["color", "size", "width", "shape"].includes(key) || !["shared", "independent"].includes(value))))
    throw Error("Facet resolve accepts color, size, width, and shape set to shared or independent.");
  if (!["none", "x", "y", "xy", "grid"].includes(link))
    throw Error("Invalid facet link.");
  if (link === "grid" && (!splitRow || !splitColumn || wrap !== undefined))
    throw Error('Facet link="grid" requires explicit row and column facets without wrap.');
  if (link !== "none" && (scales === "free" ||
      [..."xy"].some((a) => (link === "xy" || link === "grid" || link === a) && scales === "free-" + a)))
    throw Error("Linked facet dimensions require shared domains.");
}
