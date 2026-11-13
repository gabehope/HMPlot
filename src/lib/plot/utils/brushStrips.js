/**
 * Pixel geometry for brushing on axis strips. All rects are in canvas-host pixels,
 * the same space as the root plot rectangle and child frame layouts.
 *
 * A child frame's "strip" is the band where its ticks and labels are actually drawn,
 * just outside its rect. Strip brushes draw only inside that band; they never extend
 * across the child's or the plot's interior.
 */

/** @param {number[]} point */
const contains = (rect, point) => rect && point[0] >= rect.left && point[0] <= rect.right && point[1] >= rect.top && point[1] <= rect.bottom;

/**
 * Strip rects {x, y} covering the ticks and labels an axis overlay draws for one frame, so strips
 * exist only where something is drawn. Each axis spec describes the drawing:
 *   line      the axis line's position across the axis (a y pixel for x, an x pixel for y),
 *             including any placement offset
 *   from, to  the line's extent along the axis
 *   sign      +1 when ticks grow toward larger pixels (down for x, right for y), -1 otherwise;
 *             it already folds in the side and "inside"/"outside" label placement
 *   tickSize, labelOffset, angle (tick label rotation in degrees)
 *   labels    the tick label strings actually drawn (empty when labels are off)
 * A null axis (hidden, or not drawn at all) gives a null strip. `measure(text)` returns a label's
 * width in pixels.
 */
export function drawnStrips({ x = null, y = null } = {}, { fontSize = 11, measure = (text) => 0.6 * fontSize * String(text).length } = {}) {
  const strip = (axis, spec) => {
    if (!spec || !(spec.to > spec.from) || !Number.isFinite(spec.line)) return null;
    const theta = (spec.angle ?? 0) * Math.PI / 180, sin = Math.abs(Math.sin(theta)), cos = Math.abs(Math.cos(theta));
    const lineHeight = 1.2 * fontSize, labels = spec.labels ?? [];
    // How far the widest (possibly rotated) label reaches across the axis.
    const across = labels.length ? Math.max(...labels.map((label) => {
      const width = measure(label);
      return axis === "x" ? width * sin + lineHeight * cos : width * cos + lineHeight * sin;
    })) : 0;
    const depth = Math.max(0, spec.tickSize ?? 0) + (labels.length ? (spec.labelOffset ?? 0) + across : 0);
    if (!(depth >= 1)) return null;
    const near = spec.line, far = spec.line + (spec.sign < 0 ? -depth : depth);
    const low = Math.min(near, far), high = Math.max(near, far);
    return axis === "x" ? { left: spec.from, right: spec.to, top: low, bottom: high } : { left: low, right: high, top: spec.from, bottom: spec.to };
  };
  return { x: strip("x", x), y: strip("y", y) };
}

/**
 * The innermost frame strip containing `point` ({frame, axis}), or null. A frame's `depth` (its
 * nesting level) decides; among equal depths the later frame wins, and x before y in one frame.
 */
export function stripAt(point, frames) {
  let found = null;
  for (let index = frames.length - 1; index >= 0; index--) {
    const frame = frames[index];
    if (found && (frame.depth ?? 0) <= (found.frame.depth ?? 0)) continue;
    for (const axis of ["x", "y"]) if (contains(frame.strips?.[axis], point)) { found = { frame, axis }; break; }
  }
  return found;
}

/**
 * How a press at `point` edits `rect`: "move", "resize-<top|bottom><left|right>", or null.
 * Edges can be grabbed from `outer` px outside the rect. Each edge zone is at most 8 px or a
 * third of the extent, so thin strip bands keep a middle "move" zone. Only edges along the
 * brushed `axis` resize; a strip band's cross edges are its thickness and are inert.
 */
export function brushHitMode(rect, point, { outer = 6, axis = "xy" } = {}) {
  const [x, y] = point;
  if (!rect || x < rect.left - outer || x > rect.right + outer || y < rect.top - outer || y > rect.bottom + outer) return null;
  const edgeX = Math.min(8, (rect.right - rect.left) / 3), edgeY = Math.min(8, (rect.bottom - rect.top) / 3);
  const horizontal = !axis.includes("x") ? ""
    : x <= rect.left + edgeX ? "left" : x >= rect.right - edgeX ? "right" : "";
  const vertical = !axis.includes("y") ? ""
    : y <= rect.top + edgeY ? "top" : y >= rect.bottom - edgeY ? "bottom" : "";
  if (horizontal || vertical) return `resize-${vertical}${horizontal}`;
  return contains(rect, [x, y]) ? "move" : null;
}

/** CSS cursor for a hit mode. */
export function brushCursor(mode) {
  if (!mode) return "";
  if (mode === "move") return "move";
  const vertical = /top|bottom/.test(mode), horizontal = /left|right/.test(mode);
  if (vertical && horizontal) return /topleft|bottomright/.test(mode) ? "nwse-resize" : "nesw-resize";
  return vertical ? "ns-resize" : "ew-resize";
}

/** Move the edges named by `mode` to `current`, clamped to `bounds`. */
export function resizedRect(rect, mode, current, bounds) {
  const next = { ...rect };
  if (mode.includes("left")) next.left = Math.max(bounds.left, Math.min(bounds.right, current[0]));
  if (mode.includes("right")) next.right = Math.max(bounds.left, Math.min(bounds.right, current[0]));
  if (mode.includes("top")) next.top = Math.max(bounds.top, Math.min(bounds.bottom, current[1]));
  if (mode.includes("bottom")) next.bottom = Math.max(bounds.top, Math.min(bounds.bottom, current[1]));
  if (next.left > next.right) [next.left, next.right] = [next.right, next.left];
  if (next.top > next.bottom) [next.top, next.bottom] = [next.bottom, next.top];
  return next;
}

/** Translate `rect` by the pointer delta along `axis`, keeping it inside `bounds`. */
export function translatedRect(rect, start, current, bounds, axis = "xy") {
  const width = rect.right - rect.left, height = rect.bottom - rect.top;
  const left = axis.includes("x") ? Math.max(bounds.left, Math.min(bounds.right - width, rect.left + current[0] - start[0])) : rect.left;
  const top = axis.includes("y") ? Math.max(bounds.top, Math.min(bounds.bottom - height, rect.top + current[1] - start[1])) : rect.top;
  return { ...rect, left, top, right: left + width, bottom: top + height };
}

/** The band a brushed interval [p0, p1] (pixels along `axis`) occupies in `strip`, or null if outside. */
export function bandInStrip(strip, axis, p0, p1) {
  if (!strip || Number.isNaN(p0) || Number.isNaN(p1)) return null;
  const [low, high] = axis === "x" ? [strip.left, strip.right] : [strip.top, strip.bottom];
  const a = Math.max(low, Math.min(high, Math.min(p0, p1))), b = Math.max(low, Math.min(high, Math.max(p0, p1)));
  if (b <= a) return null;
  return axis === "x"
    ? { left: a, right: b, top: strip.top, bottom: strip.bottom, axis }
    : { left: strip.left, right: strip.right, top: a, bottom: b, axis };
}

/** The same interval as bandInStrip without clipping along the axis: what an edit starts from. */
function spanInStrip(strip, axis, p0, p1) {
  const a = Math.min(p0, p1), b = Math.max(p0, p1);
  return axis === "x"
    ? { left: a, right: b, top: strip.top, bottom: strip.bottom, axis }
    : { left: strip.left, right: strip.right, top: a, bottom: b, axis };
}

const edges = (axis) => axis === "x" ? ["left", "right"] : ["top", "bottom"];
const fitsIn = (span, strip, axis) => { const [lo, hi] = edges(axis); return span[lo] >= strip[lo] - 0.5 && span[hi] <= strip[hi] + 0.5; };

/**
 * Drag a band's span (its unclipped interval) by the pointer delta. A span inside the strip stays
 * inside it; a wider one (a constraint that reaches past the strip) moves freely while it stays
 * visible, so the part beyond the strip is kept instead of cut off. Null when it would vanish.
 */
export function movedSpan(span, start, current, strip, axis) {
  if (fitsIn(span, strip, axis)) return translatedRect(span, start, current, strip, axis);
  const [lo, hi] = edges(axis), next = translatedRect(span, start, current, { left: -Infinity, right: Infinity, top: -Infinity, bottom: Infinity }, axis);
  return bandInStrip(strip, axis, next[lo], next[hi]) ? next : null;
}

/** Move a span `step` px along `axis` (only its trailing edge when `resizeOnly`), or null if refused. */
export function nudgedSpan(span, strip, axis, step, resizeOnly = false) {
  const [lo, hi] = edges(axis), next = { ...span, [hi]: span[hi] + step };
  if (!resizeOnly) next[lo] = span[lo] + step;
  if (next[hi] <= next[lo]) return null;
  if (fitsIn(span, strip, axis)) return next[lo] < strip[lo] || next[hi] > strip[hi] ? null : next;
  return bandInStrip(strip, axis, next[lo], next[hi]) ? next : null;
}

/**
 * Keys of the frames whose marks plot on `frameKey`'s `axis`: that frame, and every descendant that
 * inherits `axis` from it through each frame in between. A Frame inside a facet cell that owns x
 * but not y plots on the cell's y axis, so the cell's y strip brushes its marks. `frames` lists
 * {key, parentKey, inherits: {x, y}}.
 */
export function axisFrameKeys(frames, frameKey, axis) {
  const byKey = new Map(frames.map((frame) => [frame.key, frame])), keys = new Set([frameKey]);
  for (const frame of frames) {
    let current = frame;
    for (let steps = 0; current && current.key !== frameKey && current.inherits?.[axis] && steps < 64; steps++)
      current = byKey.get(current.parentKey);
    if (current?.key === frameKey) keys.add(frame.key);
  }
  return keys;
}

/** The brushable bindings a frame's `axis` strip represents: those of the frames axisFrameKeys lists. */
export function stripBindings(bindings, frames, frameKey, axis) {
  const keys = axisFrameKeys(frames, frameKey, axis);
  return (bindings ?? []).filter((binding) => keys.has(binding.frameKey));
}

/**
 * The brushable column a strip represents, from the brushable marks that plot on its axis
 * (`bindings`, see stripBindings): {binding, column}, {ambiguous: true, names} when they plot
 * different columns on `axis`, or null.
 */
export function stripColumn(bindings, axis) {
  const matching = (bindings ?? []).filter((binding) => binding.brushAxis?.includes(axis) && binding.brushColumns?.[axis]);
  if (!matching.length) return null;
  const names = [...new Map(matching.map((binding) => [binding.brushColumns[axis].identity, binding.brushColumns[axis].name])).values()];
  return names.length === 1 ? { binding: matching[0], column: matching[0].brushColumns[axis] } : { ambiguous: true, names };
}

/**
 * Pixel interval [p0, p1] of `constraint` along an axis showing `column`, or null when the
 * constraint is on another column or a bound has no position (outside a log domain, say).
 * `world(value)` maps a data value to world coordinates and `pixel(world)` to canvas pixels.
 */
export function constraintPixels(constraint, column, world, pixel) {
  if (!constraint || !column || column.identity !== constraint.identity) return null;
  let bounds = constraint.bounds;
  if (constraint.categories?.length) {
    const codes = constraint.categories.map((value) => column.categories?.findIndex((item) => Object.is(item, value)) ?? -1).filter((code) => code >= 0);
    if (!codes.length) return null;
    bounds = [Math.min(...codes) - .5, Math.max(...codes) + .5];
  }
  if (!bounds) return null;
  const pixels = bounds.map((value) => pixel(world(value)));
  return pixels.some(Number.isNaN) ? null : pixels;
}

/**
 * Bands to draw on frame strips: for each strip whose column (`column(frameKey, axis)`, see
 * stripColumn) has a constraint (`constraint(binding, column)`), the interval `project(binding,
 * axis, constraint)` inside the strip. `rect` is clipped to the strip; `span` keeps the full
 * interval so edits never cut a constraint that reaches past the strip.
 */
export function bandsFor(frames, { column, constraint, project }) {
  const bands = [];
  for (const frame of frames) for (const axis of ["x", "y"]) {
    const strip = frame.strips?.[axis], found = strip && column(frame.key, axis);
    if (!found?.binding) continue;
    const value = constraint(found.binding, found.column), pixels = value && project(found.binding, axis, value);
    const rect = pixels && bandInStrip(strip, axis, pixels[0], pixels[1]);
    if (rect) bands.push({ key: `${frame.key}:${axis}:${found.column.identity}`, frameKey: frame.key, axis, rect,
      span: spanInStrip(strip, axis, pixels[0], pixels[1]), strip, binding: found.binding, identity: found.column.identity, name: found.column.name });
  }
  return bands;
}

/**
 * A column constraint from two data values (in either order). `where` records the frame, axis,
 * and origin ("plot" or "strip") so bands reproject without gesture state. Throws when a value is
 * not finite: axisValue maps through a degenerate domain (log over a range containing 0) to NaN.
 */
export function brushConstraint(column, where, a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) throw Error("This axis has no valid domain to brush.");
  const low = Math.min(a, b), high = Math.max(a, b);
  const described = { identity: column.identity, name: column.name, type: column.type, frame: where.frame, axis: where.axis, origin: where.origin ?? "plot" };
  if (column.categories) {
    const selected = column.categories.filter((_, index) => index >= Math.ceil(low - .5) && index <= Math.floor(high + .5));
    return { ...described, categories: selected, bounds: [low, high],
      evaluate: () => column.evaluateConstraint({ categories: selected }), release: () => {} };
  }
  return { ...described, bounds: [low, high],
    evaluate: () => column.evaluateConstraint({ bounds: [low, high] }), release: () => {} };
}
