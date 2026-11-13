import { axisKey, axisLayout, readAxis } from "./axes.js";
import {
  angularPeriod, longitudeOrigin, normalizeProjectionCenter, orthographicAtCenter,
} from "./coordinates.js";

const quarter = (period) => period / 4;
const rounded = (value) => Number(value.toFixed(2));

const onMultiple = (value, step) => Math.abs(value / step - Math.round(value / step)) < 1e-9;

// Axis layout works in source angular units here. The displayed globe frame is
// a projected disk, so its X/Y world ranges cannot be used as tick domains.
// `step`: the default graticule's, in place of an automatic one.
function geographicAxis(options, axis, bounds, pixels, step = 0) {
  const plot = options.child("plot"), stepped = step && Object.create(plot);
  if (stepped) stepped.get = (key) => key === axisKey(axis, "step") ? step : plot.get(key);
  const proxy = {
    get: (key) => key === "coordinates" ? "cartesian"
      : key === `${axis}bounds` || key === `${axis}range` ? bounds
      : key === `${axis}Transform` ? "linear" : options.get(key),
    child: (key) => key === "plot" && stepped ? stepped : options.child(key),
  };
  return axisLayout(proxy, axis, bounds, pixels);
}

// Where a line's label sits, in the overlay's pixels, from a coarse sampling of the visible line
// (labels only: the line itself is drawn on the GPU, globeGuides.svelte, TODO 141).
// `toward`: the latitude a meridian's label sits at (the view center's), or null for its point
// farthest from the disk's center; `face(point)`: its distance from the center in disk radii.
function labelAnchor(options, frame, width, height, line, toward, face) {
  const { axis, value, start, end } = line, count = 180, points = [];
  for (let i = 0; i <= count; i++) {
    const other = start + (end - start) * i / count;
    const world = orthographicAtCenter(axis === "x" ? [value, other, 0] : [other, value, 0], options);
    if (!world) continue;
    const point = {
      x: (world[0] - frame.x[0]) / (frame.x[1] - frame.x[0]) * width,
      y: (frame.y[1] - world[1]) / (frame.y[1] - frame.y[0]) * height,
      at: other,
    };
    if (Number.isFinite(point.x) && Number.isFinite(point.y)) points.push(point);
  }
  const inside = points.filter((point) => point.x >= 6 && point.x <= width - 6 &&
    point.y >= 6 && point.y <= height - 6 && (axis === "y" || face(point) <= 0.92));
  // A meridian's label where it crosses the view center's latitude, on the globe's face (along
  // the equator on a globe seen from it; at their lowest points all of them met at the pole,
  // TODO 135.5), or at its outer end when the center is near a pole (the meridians fan out from
  // it there, as a polar plot's angles); a parallel's at its leftmost point, outside the limb.
  const label = inside.length ? inside.reduce((best, point) =>
    axis === "y" ? point.x < best.x ? point : best
      : toward === null ? face(point) > face(best) ? point : best
      : Math.abs(point.at - toward) < Math.abs(best.at - toward) ? point : best) : null;
  return label && { x: label.x, y: label.y };
}

// Hide labels of the shown `axes` that would overlap one nearer the disk's center, as the overlay
// draws them: a meridian's centered above its anchor, a parallel's ending left of it. Those of an
// axis in `all` (labelOverlap "show") are all kept, and the others keep clear of them.
function separateLabels(guides, axes, all, center, fontSize, measure) {
  const boxes = [];
  const box = (axis, guide) => {
    const width = measure(String(guide.label)), { x, y } = guide.anchor;
    return axis === "x" ? [x - width / 2, y - 4 - fontSize, x + width / 2, y - 4]
      : [x - 5 - width, y - 0.8 * fontSize, x - 5, y + 0.2 * fontSize];
  };
  const labeled = axes.flatMap((axis) => guides[axis].major
    .filter((guide) => guide.showLabel && guide.anchor).map((guide) => ({ axis, guide, box: box(axis, guide) })))
    .map((item) => ({ ...item, keep: all.includes(item.axis) }))
    .sort((a, b) => Number(b.keep) - Number(a.keep) ||
      Math.hypot(a.guide.anchor.x - center.x, a.guide.anchor.y - center.y) -
      Math.hypot(b.guide.anchor.x - center.x, b.guide.anchor.y - center.y));
  for (const item of labeled) {
    const [x0, y0, x1, y1] = item.box;
    if (item.keep) { boxes.push(item.box); continue; }
    if (boxes.some(([a0, b0, a1, b1]) => x0 < a1 + 2 && a0 < x1 + 2 && y0 < b1 && b0 < y1))
      item.guide.showLabel = false;
    else boxes.push(item.box);
  }
}

/**
 * A 2D orthographic globe's guide lines in source angular units (TODO 141): meridians (x, a
 * fixed longitude from `start` to `end` latitude) and parallels (y, a fixed latitude across
 * longitudes), each axis's { major, minor, reference }. They do not depend on the view: the
 * GPU draws them through the live projection center (globeGuides.svelte), export samples
 * them at its resolution, and the overlay places only their labels (orthographicGuides).
 *
 * An axis with no step or tickCount draws the default graticule (TODO 135.5): a line every 15°
 * (a 24th of the period), unlabeled (as d3's and equal-earth's mapGuides; labels over the
 * globe's face cover its marks), meridians short of the poles except every 90° (as
 * d3.geoGraticule), no parallel at a pole. `width`/`height`: the pixels a tickCount spreads over.
 */
export function globeGuideLines(options, { width = 400, height = 400 } = {}) {
  const period = angularPeriod(options), origin = longitudeOrigin(options);
  const lonBounds = [origin - period / 2, origin + period / 2];
  const latBounds = [-quarter(period), quarter(period)];
  const step = period / 24;
  const configs = { x: readAxis(options, "x"), y: readAxis(options, "y") };
  const automatic = Object.fromEntries(["x", "y"].map((axis) =>
    [axis, !(configs[axis].step > 0) && !(configs[axis].tickCount > 0)]));
  const axes = {
    x: geographicAxis(options, "x", lonBounds, width, automatic.x ? step : 0),
    y: geographicAxis(options, "y", latBounds, height, automatic.y ? step : 0),
  };
  /** @type {Record<string, any>} */
  const lines = { configs };
  for (const axis of ["x", "y"]) {
    const bounds = axis === "x" ? latBounds : lonBounds;
    const seen = new Set();
    const make = (tick, graticule = false) => {
      // The two seam meridians are the same great circle.
      const key = axis === "x" ? Math.round((((tick.value - origin) % period + period) % period) * 1e9) : tick.value;
      if (seen.has(key)) return null;
      seen.add(key);
      if (graticule && axis === "y" && Math.abs(tick.value) >= quarter(period) - 1e-9) return null;
      if (axis === "y" && Math.abs(tick.value) > quarter(period) + 1e-9) return null;
      const short = graticule && axis === "x" && !onMultiple(tick.value, quarter(period));
      const [start, end] = short ? [bounds[0] + step, bounds[1] - step] : bounds;
      const shown = axis === "x"
        ? normalizeProjectionCenter([tick.value, 0], options)[0] : tick.value;
      return { ...tick, axis, start, end,
        // Thinned by overlap on the disk, not along a straight axis.
        showLabel: !graticule,
        label: tick.label ?? `${Number(shown.toPrecision(8))}${options.get("angleUnit") === "degrees" ? "°" : ""}` };
    };
    // Reference rules take precedence over a coincident grid line, as they do
    // on Cartesian axes. They share the same geographic projection and horizon.
    const reference = axes[axis].reference.map((tick) => make(tick)).filter(Boolean);
    lines[axis] = {
      major: axes[axis].config.major ? axes[axis].major.map((tick) => make(tick, automatic[axis])).filter(Boolean) : [],
      minor: axes[axis].config.minor ? axes[axis].minor.map((tick) => make(tick)).filter(Boolean) : [],
      reference,
    };
  }
  return lines;
}

/**
 * A 2D orthographic globe's guides as the overlay places them, in its pixels: the lines of
 * globeGuideLines with their labels' anchors (`anchor`, null where a line shows no label on the
 * face), and the sphere's outline. The lines themselves are drawn on the GPU.
 *
 * `shown`: the axes drawn, whose labels are kept apart (an axis with labelOverlap "show" keeps
 * all of its own); `fontSize` and `measure(text)` (a label's width in pixels; about 0.6 em a
 * character without one) size the labels at the disk's drawn size; `lines`: globeGuideLines'
 * (computed when not given).
 */
export function orthographicGuides(options, frame, width, height, {
  shown = { x: true, y: true }, fontSize = options.child("plot")?.get?.("axisFontSize") ?? 11,
  measure = (text) => 0.6 * fontSize * text.length, lines = globeGuideLines(options, { width, height }),
} = {}) {
  const period = angularPeriod(options);
  const center = normalizeProjectionCenter(options.get("projectionCenter") ?? [0, 0], options);
  // Meridians' labels at the center's latitude while it is within 60° of the equator.
  const toward = Math.abs(center[1]) <= period / 6 + 1e-9 ? center[1] : null;
  // The sphere's outline: its limb, a circle of the base radius about the globe's center.
  const sx = width / (frame.x[1] - frame.x[0]), sy = height / (frame.y[1] - frame.y[0]),
    radius = options.get("baseRadius") ?? 1,
    outline = { cx: -frame.x[0] * sx, cy: frame.y[1] * sy, rx: radius * sx, ry: radius * sy },
    face = (point) => Math.hypot((point.x - outline.cx) / outline.rx, (point.y - outline.cy) / outline.ry);
  /** @type {Record<string, any>} */
  const guides = { outline };
  // Only a label's line is sampled on the CPU, and only while its axis shows.
  const place = (axis, line, labeled) => ({ ...line,
    anchor: shown[axis] && labeled ? labelAnchor(options, frame, width, height, line, toward, face) : null });
  for (const axis of ["x", "y"]) guides[axis] = {
    major: lines[axis].major.map((line) => place(axis, line, line.showLabel)),
    minor: lines[axis].minor,
    reference: lines[axis].reference.map((line) => place(axis, line, !!line.label)),
  };
  const drawn = ["x", "y"].filter((axis) => shown[axis]);
  separateLabels(guides, drawn, drawn.filter((axis) => lines.configs[axis].labelOverlap === "show"),
    { x: outline.cx, y: outline.cy }, fontSize, measure);
  return guides;
}
