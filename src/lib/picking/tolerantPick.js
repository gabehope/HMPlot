// A tolerant pick (TODO 44, 72): while a plot has a mark with nearest (or a tooltip, which picks
// its row so), each pick reads a window of the pick buffer around the pointer instead of one
// pixel, and finds the nearest drawn row of such a mark within the radius: the row @nearest marks
// and a tooltip shows. Events other than nearest's keep the pixel under the pointer. Only what is
// drawn counts, so occlusion and hidden rows need nothing, and nothing runs per row.

/**
 * The pixel a pick takes in a window of the pick buffer ("output": objectId, instanceId, u, v
 * per pixel, row-major, `width` × `height`), given the pointer's pixel `center` in the window and
 * `radius` in device pixels (the window's: the largest mark's). `kindOf(objectId)` says what is drawn there: null (nothing pickable),
 * "row" (a mark without nearest), "nearest" (a mark with nearest, or a tooltip, that draws rows)
 * or "area" (Surface, Heatmap, Image, Area: a region, not rows).
 *
 * A row under the pointer wins (the exact pick); else the nearest pixel of a "nearest" mark
 * within its radius, `reachOf(objectId)` in device pixels (default `radius`; ties: the first in
 * scan order); else the pointer's own pixel, an area or nothing. Returns { x, y } in the window.
 */
export function nearestHit(pixels, width, height, center, radius, kindOf, reachOf = () => radius) {
  const [cx, cy] = center;
  const at = (x, y) => Math.round(pixels[(y * width + x) * 4]);
  const own = kindOf(at(cx, cy));
  if (own === "row" || own === "nearest") return { x: cx, y: cy };
  let best = null, distance = radius * radius;
  const x0 = Math.max(0, cx - radius), x1 = Math.min(width - 1, cx + radius);
  const y0 = Math.max(0, cy - radius), y1 = Math.min(height - 1, cy + radius);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (d > distance || (best && d === distance)) continue;
      const id = at(x, y);
      if (kindOf(id) !== "nearest" || d > reachOf(id) ** 2) continue;
      best = { x, y };
      distance = d;
    }
  return best ?? { x: cx, y: cy };
}

/** The window of device pixels a pick at (`x`, `y`) reads: `radius` around it, inside the buffer. */
export function pickWindow(x, y, radius, width, height) {
  const left = Math.max(0, x - radius), top = Math.max(0, y - radius);
  const right = Math.min(width, x + radius + 1), bottom = Math.min(height, y + radius + 1);
  return { left, top, width: right - left, height: bottom - top, center: [x - left, y - top] };
}

/**
 * Unified x (TODO 44.4): the hits in a vertical strip of the pick buffer (`width` × `height`,
 * `centerX` the pointer's column): for each object `accepts(objectId)` takes, each of its
 * instances with the pixel nearest the centre column ({ dx, x, y } in the strip; ties: the first
 * in scan order). Returns Map(objectId → Map(instanceId → hit)).
 */
export function stripHits(pixels, width, height, centerX, accepts) {
  const hits = new Map();
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4, id = Math.round(pixels[at]), instance = Math.round(pixels[at + 1]);
      if (instance < 0 || !accepts(id)) continue;
      let instances = hits.get(id);
      if (!instances) hits.set(id, (instances = new Map()));
      const dx = Math.abs(x - centerX), found = instances.get(instance);
      if (!found || dx < found.dx) instances.set(instance, { dx, x, y });
    }
  return hits;
}
