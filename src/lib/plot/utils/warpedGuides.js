import { axisLayout } from "./axes.js";
import { resolveCoordinateOperations, pathOperationFlags, buildCoordinateOperations } from "./coordinateOperations.js";
import { operationSampler } from "./operationTable.js";
import { chainPolyline } from "./vectorExport.js";

// Ticks in the Frame's own source units: axisLayout reads a Cartesian view of it.
function sourceAxis(options, axis, bounds, pixels) {
  const proxy = {
    get: (key) => key === "coordinates" ? "cartesian"
      : key === `${axis}bounds` || key === `${axis}range` ? bounds
      : key === `${axis}Transform` ? "linear" : options.get(key),
    child: (key) => options.child(key),
  };
  return axisLayout(proxy, axis, bounds, pixels);
}

const pathData = (paths) => paths.map((run) =>
  `M${run.map(([x, y]) => `${Number(x.toFixed(2))} ${Number(y.toFixed(2))}`).join(" L")}`).join(" ");

// Two label boxes closer than this many pixels collide.
const LABEL_GAP = 2;

/**
 * Guides of a warped Frame in overlay pixels: grid lines at the Frame's major
 * and minor ticks (x = v and y = v across its bounds), its two axis edges
 * (y = y0, or a polar Frame's outer ring y = y1, and x = x0), and tick labels
 * at the edges, each line refined through
 * the whole chain with the export sampler, so a horizon, seam or invalid radius
 * cuts it. A spherical Frame's lines follow meridians and parallels.
 * `frame` is the view's world extent; `show` selects the axes to draw.
 * `text` sizes the labels: `size` is the font size and `offset[axis]` the gap
 * from the edge to the nearest side of a label; `titles[axis]` names a bent
 * Cartesian chart's axis titles, drawn horizontally. Labels and titles are
 * centered at `x, y`.
 * One that would not fit on the canvas is dropped, and, unless its axis sets
 * `labelOverlap: "show"`, so is one whose box would overlap an earlier label
 * (X's first, in tick order).
 */
export function warpedGuides(options, frame, width, height, show = { x: true, y: true }, tolerance = 0.5,
  text = { size: 11, offset: { x: 6, y: 6 } }) {
  const xb = options.get("xbounds"), yb = options.get("ybounds");
  if (!frame || !Array.isArray(xb) || !Array.isArray(yb) || ![...xb, ...yb].every(Number.isFinite)) return null;
  let operations;
  try { operations = resolveCoordinateOperations(options); } catch { return null; }
  const sampler = operationSampler(operations, pathOperationFlags(operations));
  const projectWorld = (point) => [
    (point[0] - frame.x[0]) / (frame.x[1] - frame.x[0]) * width,
    (frame.y[1] - point[1]) / (frame.y[1] - frame.y[0]) * height];
  const lineOptions = { get: (key) => key === "interpolation" ? "angular" : key === "curve" ? "linear" : options.get(key) };
  const line = (from, to) => {
    const path = chainPolyline(from, to, lineOptions, sampler, projectWorld, tolerance, 20000);
    return path.overflow ? [] : path.paths;
  };
  const at = (point) => {
    const mapped = sampler(point);
    return mapped.valid ? projectWorld(mapped.point) : null;
  };
  // A label sits outside its edge: away from the point a step inside the Frame.
  const outward = (edgePoint, insidePoint) => {
    const a = at(edgePoint), b = at(insidePoint);
    if (!a || !b) return null;
    const dx = a[0] - b[0], dy = a[1] - b[1], length = Math.hypot(dx, dy);
    return length > 1e-9 ? { point: a, direction: [dx / length, dy / length] } : null;
  };
  const span = { x: xb[1] - xb[0], y: yb[1] - yb[0] };
  // A polar Frame's angular axis runs along its outer ring (its inner edge
  // may be the center), labelled outside it; other axes use their lower edge.
  let polar = false;
  try { polar = buildCoordinateOperations(options)[0]?.kind === "polar"; } catch { /* straight */ }
  const edgeY = polar ? yb[1] : yb[0], inwardY = polar ? -1 : 1;
  // Tick density follows each axis edge's length on screen, not the canvas:
  // a short bent edge gets fewer ticks, so its labels do not collide.
  const edges = { x: line([xb[0], edgeY, 0], [xb[1], edgeY, 0]), y: line([xb[0], yb[0], 0], [xb[0], yb[1], 0]) };
  const length = (paths) => paths.reduce((sum, run) => sum + run.slice(1).reduce((total, point, k) =>
    total + Math.hypot(point[0] - run[k][0], point[1] - run[k][1]), 0), 0);
  const axes = { x: sourceAxis(options, "x", xb, Math.max(1, length(edges.x))),
    y: sourceAxis(options, "y", yb, Math.max(1, length(edges.y))) };
  // A point on an axis edge at source value `value`, and one a step inside the Frame.
  const onEdge = (axis, value) => axis === "x" ? [value, edgeY, 0] : [xb[0], value, 0];
  const inside = (axis, value) => axis === "x"
    ? [value, edgeY + inwardY * span.y * 1e-3, 0] : [xb[0] + span.x * 1e-3, value, 0];
  // Half a w x h box's extent along a unit direction.
  const extent = ([dx, dy], w, h) => Math.abs(dx) * w / 2 + Math.abs(dy) * h / 2;
  const fits = (box) => box.x - box.w / 2 >= 0 && box.x + box.w / 2 <= width &&
    box.y - box.h / 2 >= 0 && box.y + box.h / 2 <= height;
  const placed = [], collides = (box) => placed.some((other) =>
    Math.abs(other.x - box.x) * 2 < other.w + box.w + 2 * LABEL_GAP &&
    Math.abs(other.y - box.y) * 2 < other.h + box.h + 2 * LABEL_GAP);
  const guides = {};
  for (const axis of ["x", "y"]) {
    if (!show[axis]) continue;
    const layout = axes[axis];
    const across = (value) => axis === "x"
      ? line([value, yb[0], 0], [value, yb[1], 0]) : line([xb[0], value, 0], [xb[1], value, 0]);
    const grid = (ticks) => ticks.map((tick) => ({ ...tick, d: pathData(across(tick.value)) })).filter((tick) => tick.d);
    const edge = edges[axis];
    let depth = 0;
    const labels = (layout.config.major ? layout.major : []).flatMap((tick) => {
      const place = outward(onEdge(axis, tick.value), inside(axis, tick.value));
      if (!place || tick.showLabel === false) return [];
      // The box's near side sits `offset` from the edge along the outward direction.
      const w = String(tick.label).length * text.size * 0.6, h = text.size,
        [dx, dy] = place.direction, reach = text.offset[axis] + extent(place.direction, w, h),
        label = { value: tick.value, label: tick.label, ...place,
          x: place.point[0] + dx * reach, y: place.point[1] + dy * reach, w, h };
      if (!fits(label) || layout.config.labelOverlap !== "show" && collides(label)) return [];
      placed.push(label);
      depth = Math.max(depth, 2 * extent(place.direction, w, h));
      return [label];
    });
    guides[axis] = {
      config: layout.config,
      major: layout.config.major ? grid(layout.major) : [],
      minor: layout.config.minor ? grid(layout.minor) : [],
      edge: pathData(edge),
      labels,
      title: title(axis, layout.config, depth),
    };
  }
  return guides;

  // A bent Cartesian chart's axis title sits at its titlePosition along the
  // edge, inside the Frame (the default) or outside past the labels. At an
  // end it backs off along the edge so its box ends there. It is dropped where
  // it would overlap a label or leave the canvas. Polar and globe Frames draw
  // no titles, as at the root.
  function title(axis, config, depth) {
    const label = text.titles?.[axis];
    if (!label || options.get("coordinates") !== "cartesian") return null;
    const [lo, hi] = axis === "x" ? xb : yb, step = (hi - lo) * 1e-3,
      position = config.titlePosition ?? "end",
      value = position === "start" ? lo : position === "middle" ? (lo + hi) / 2 : hi;
    const place = outward(onEdge(axis, value), inside(axis, value)),
      a = at(onEdge(axis, position === "end" ? value - step : value)),
      b = at(onEdge(axis, position === "end" ? value : value + step));
    if (!place || !a || !b) return null;
    const run = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (run < 1e-9) return null;
    const tangent = [(b[0] - a[0]) / run, (b[1] - a[1]) / run],
      w = String(label).length * text.size * 0.6, h = text.size,
      outside = config.titlePlacement === "outside",
      reach = (outside ? text.offset[axis] + depth : 0) + (config.titleOffset ?? 7) + extent(place.direction, w, h),
      along = position === "middle" ? 0 : (position === "start" ? 1 : -1) * extent(tangent, w, h),
      sign = outside ? 1 : -1,
      box = { label, w, h,
        x: place.point[0] + sign * place.direction[0] * reach + tangent[0] * along,
        y: place.point[1] + sign * place.direction[1] * reach + tangent[1] * along };
    if (!fits(box) || collides(box)) return null;
    placed.push(box);
    return box;
  }
}
