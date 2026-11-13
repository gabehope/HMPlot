/**
 * Point-shape outlines (TODO 55). A shape is a polygon (vertex list) or SVG path data, in shape
 * space: the unit square [-1, 1] with y up, or any box a `viewBox` names (y down, as SVG draws
 * it), fitted into the unit square. Paths may curve (C, S, Q, T, A), have several subpaths and
 * holes, and cross themselves: `fillRule` ("nonzero", as SVG, or "evenodd") decides what is
 * inside. Quadratic curves and arcs become cubic Béziers, so legends and exports draw curves
 * as curves; the distance field reads the outline flattened into line segments.
 *
 * python/hmplot/data.py (`_normalize_shape`) mirrors this file, messages included.
 */

import { LIMITS, limitError } from "./limits.js";

/**
 * Line segments a shape may have after its curves are flattened (bounds the field's work):
 * LIMITS.shapeSegments, written as a literal because the Python API generator reads it unevaluated.
 */
export const MAX_SHAPE_SEGMENTS = 4096;
/** A simple polygon with at most this many vertices draws with the exact per-edge distance. */
export const EXACT_SHAPE_VERTICES = LIMITS.exactShapeVertices.value;
/** How far a flattened curve may stray from the curve, in shape units (the square spans 2). */
export const FLATTEN_TOLERANCE = 1e-3;

const COMMANDS = "MmLlHhVvCcSsQqTtAaZz";
const COUNTS = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;
const FILL_RULES = ["nonzero", "evenodd"];

/**
 * Parse SVG path data into contours in the path's own coordinates: `{ start, segments }` with
 * segments ["L", x, y] or ["C", x1, y1, x2, y2, x, y]. Every subpath is a contour (filling
 * closes it); quadratics and arcs are converted to cubics.
 */
export function parsePath(d) {
  if (typeof d !== "string") throw Error("A shape path must be a string.");
  const contours = [];
  let i = 0, command = null, current = [0, 0], start = [0, 0], contour = null, cubic = null, quad = null;
  const skip = () => { while (i < d.length && /[\s,]/.test(d[i])) i++; };
  const number = (letter) => {
    skip();
    NUMBER.lastIndex = i;
    const match = NUMBER.exec(d);
    if (!match) throw Error(`Shape path command ${letter} needs ${COUNTS[letter.toUpperCase()]} numbers per segment.`);
    i = NUMBER.lastIndex;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) throw Error("Shape path coordinates must be finite numbers.");
    return value;
  };
  // Arc flags are single characters, which SVG allows without separators ("a1 1 0 01.5.5").
  const flag = () => {
    skip();
    if (d[i] !== "0" && d[i] !== "1") throw Error("Shape path arc flags must be 0 or 1.");
    return d[i++] === "1";
  };
  const open = () => { if (!contour) { contour = { start: [...current], segments: [] }; contours.push(contour); } };
  const line = (x, y) => { open(); contour.segments.push(["L", x, y]); current = [x, y]; };
  const curve = (x1, y1, x2, y2, x, y) => { open(); contour.segments.push(["C", x1, y1, x2, y2, x, y]); current = [x, y]; };
  for (;;) {
    skip();
    if (i >= d.length) break;
    const c = d[i];
    if (COMMANDS.includes(c)) { command = c; i++; }
    else if (!/[-+.\d]/.test(c))
      throw Error(`Shape paths use SVG path commands (M, L, H, V, C, S, Q, T, A, Z); found ${JSON.stringify(c)}.`);
    else if (!command) throw Error(contours.length ? "Shape path numbers after Z need a command." : "A shape path must start with M.");
    const upper = command.toUpperCase(), relative = command !== upper;
    if (!contours.length && upper !== "M") throw Error("A shape path must start with M.");
    const [ox, oy] = relative ? current : [0, 0];
    let lastCubic = null, lastQuad = null;
    if (upper === "Z") {
      if (contour && contour.segments.length) contour.closed = true;
      current = [...start]; contour = null; command = null;
    } else if (upper === "M") {
      const x = number(command) + ox, y = number(command) + oy;
      current = [x, y]; start = [x, y]; contour = null; open();
      // Extra pairs after M are implicit line commands.
      command = relative ? "l" : "L";
    } else if (upper === "L") line(number(command) + ox, number(command) + oy);
    else if (upper === "H") line(number(command) + ox, current[1]);
    else if (upper === "V") line(current[0], number(command) + oy);
    else if (upper === "C") {
      const x1 = number(command) + ox, y1 = number(command) + oy, x2 = number(command) + ox,
        y2 = number(command) + oy, x = number(command) + ox, y = number(command) + oy;
      curve(x1, y1, x2, y2, x, y); lastCubic = [x2, y2];
    } else if (upper === "S") {
      // The first control reflects the previous cubic's second, or is the current point.
      const [x1, y1] = cubic ? [2 * current[0] - cubic[0], 2 * current[1] - cubic[1]] : current;
      const x2 = number(command) + ox, y2 = number(command) + oy, x = number(command) + ox, y = number(command) + oy;
      curve(x1, y1, x2, y2, x, y); lastCubic = [x2, y2];
    } else if (upper === "Q" || upper === "T") {
      let qx, qy;
      if (upper === "Q") { qx = number(command) + ox; qy = number(command) + oy; }
      else [qx, qy] = quad ? [2 * current[0] - quad[0], 2 * current[1] - quad[1]] : current;
      const x = number(command) + ox, y = number(command) + oy, [x0, y0] = current;
      // A quadratic is the cubic with controls two thirds of the way to its control point.
      curve(x0 + (2 / 3) * (qx - x0), y0 + (2 / 3) * (qy - y0), x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), x, y);
      lastQuad = [qx, qy];
    } else if (upper === "A") {
      const rx = number(command), ry = number(command), rotation = number(command), large = flag(), sweep = flag();
      const x = number(command) + ox, y = number(command) + oy;
      for (const segment of arcCubics(current, rx, ry, rotation, large, sweep, [x, y])) curve(...segment);
      if (current[0] !== x || current[1] !== y) line(x, y);
    }
    cubic = lastCubic; quad = lastQuad;
  }
  return contours;
}

/** An elliptical arc as cubic Béziers of at most 90 degrees each (SVG 1.1, F.6.5 and F.6.6). */
function arcCubics([x0, y0], rx, ry, degrees, large, sweep, [x, y]) {
  if (x0 === x && y0 === y) return [];
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (!rx || !ry) return [];
  const phi = (degrees * Math.PI) / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (x0 - x) / 2, dy = (y0 - y) / 2, x1 = cos * dx + sin * dy, y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda); }
  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let root = Math.sqrt(Math.max(0, numerator / denominator));
  if (large === sweep) root = -root;
  const cx1 = (root * rx * y1) / ry, cy1 = (-root * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (x0 + x) / 2, cy = sin * cx1 + cos * cy1 + (y0 + y) / 2;
  const angle = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const theta = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const count = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9)), step = delta / count;
  const k = (4 / 3) * Math.tan(step / 4);
  const point = (t) => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
  const tangent = (t) => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
  const segments = [];
  for (let n = 0; n < count; n++) {
    const a = theta + n * step, b = a + step, [ax, ay] = point(a), [bx, by] = n === count - 1 ? [x, y] : point(b);
    const [tax, tay] = tangent(a), [tbx, tby] = tangent(b);
    segments.push([ax + k * tax, ay + k * tay, bx - k * tbx, by - k * tby, bx, by]);
  }
  return segments;
}

/** Flatten a cubic from (x0, y0) to within `tolerance`, appending end points to `out`. */
function flattenCubic(x0, y0, x1, y1, x2, y2, x3, y3, out, depth = 0) {
  const dx = x3 - x0, dy = y3 - y0, length = Math.hypot(dx, dy);
  const distance = (px, py) => length > 0 ? Math.abs((px - x0) * dy - (py - y0) * dx) / length : Math.hypot(px - x0, py - y0);
  if (depth >= 16 || Math.max(distance(x1, y1), distance(x2, y2)) <= FLATTEN_TOLERANCE) { out.push([x3, y3]); return; }
  // de Casteljau at t = 1/2.
  const ax = (x0 + x1) / 2, ay = (y0 + y1) / 2, bx = (x1 + x2) / 2, by = (y1 + y2) / 2, cx = (x2 + x3) / 2, cy = (y2 + y3) / 2;
  const abx = (ax + bx) / 2, aby = (ay + by) / 2, bcx = (bx + cx) / 2, bcy = (by + cy) / 2, mx = (abx + bcx) / 2, my = (aby + bcy) / 2;
  flattenCubic(x0, y0, ax, ay, abx, aby, mx, my, out, depth + 1);
  flattenCubic(mx, my, bcx, bcy, cx, cy, x3, y3, out, depth + 1);
}

/** Each contour as a ring of points: consecutive duplicates and the closing point dropped. */
function rings(contours) {
  return contours.map(({ start, segments }) => {
    const points = [start];
    let [x, y] = start;
    for (const s of segments) {
      if (s[0] === "L") points.push([s[1], s[2]]);
      else flattenCubic(x, y, s[1], s[2], s[3], s[4], s[5], s[6], points);
      [x, y] = [s.at(-2), s.at(-1)];
    }
    const ring = [];
    for (const p of points) if (!ring.length || ring.at(-1)[0] !== p[0] || ring.at(-1)[1] !== p[1]) ring.push(p);
    if (ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]) ring.pop();
    return ring;
  }).filter((ring) => ring.length);
}

// Inclusive segment intersection: touching or overlapping non-adjacent edges make a
// polygon non-simple too (figure-8s pinched at a vertex, edges that double back).
function segmentsMeet(a, b, c, d) {
  const orient = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const within = (p, q, r) => Math.min(p[0], q[0]) <= r[0] && r[0] <= Math.max(p[0], q[0]) &&
    Math.min(p[1], q[1]) <= r[1] && r[1] <= Math.max(p[1], q[1]);
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  return (o1 === 0 && within(a, b, c)) || (o2 === 0 && within(a, b, d)) ||
    (o3 === 0 && within(c, d, a)) || (o4 === 0 && within(c, d, b));
}
function simple(points) {
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++) {
      // Adjacent edges share a vertex and cannot cross.
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      if (segmentsMeet(points[i], points[(i + 1) % points.length], points[j], points[(j + 1) % points.length])) return false;
    }
  return true;
}
// Whether every point of a ring lies on one line (no area under any fill rule). A signed area
// would call a bowtie flat: its lobes cancel.
function flat(ring) {
  const [ax, ay] = ring[0];
  let far = ring[0], best = 0;
  for (const p of ring) { const d = Math.hypot(p[0] - ax, p[1] - ay); if (d > best) { best = d; far = p; } }
  if (best < 1e-9) return true;
  const [bx, by] = far;
  return ring.every(([x, y]) => Math.abs((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / best < 1e-9);
}

/**
 * Check a shape definition and return it normalized:
 * - `definition`: its canonical form (what registration compares and Python sends);
 * - `rings`: its outline as closed polygons (the distance field's input);
 * - `contours`: its outline as M/L/C commands in shape space, for legends and export;
 * - `fillRule`;
 * - `vertices`: the polygon when it is one simple ring of at most EXACT_SHAPE_VERTICES
 *   straight edges (drawn with the exact per-edge distance), else null.
 * A definition is a vertex list `[[x, y], ...]`, SVG path data, or
 * `{ path | vertices, fillRule?, viewBox? }` (viewBox: [minX, minY, width, height], paths only).
 */
export function normalizeShape(input, name = "shape") {
  let source = input, fillRule = "nonzero", viewBox = null;
  if (input && typeof input === "object" && !Array.isArray(input) && !ArrayBuffer.isView(input)) {
    const unknown = Object.keys(input).filter((key) => !["path", "vertices", "fillRule", "viewBox"].includes(key));
    if (unknown.length) throw Error(`Shape ${name} has unknown properties: ${unknown.join(", ")}. Use path or vertices, fillRule and viewBox.`);
    if ((input.path === undefined) === (input.vertices === undefined)) throw Error(`Shape ${name} needs a path or vertices, not both.`);
    source = input.path ?? input.vertices;
    if (input.fillRule !== undefined) {
      if (!FILL_RULES.includes(input.fillRule)) throw Error(`Shape ${name} fillRule must be "nonzero" or "evenodd".`);
      fillRule = input.fillRule;
    }
    if (input.viewBox !== undefined) {
      if (input.path === undefined) throw Error(`Shape ${name} viewBox applies to a path, not vertices.`);
      const box = input.viewBox;
      if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0)
        throw Error(`Shape ${name} viewBox must be [minX, minY, width, height] with a positive width and height.`);
      viewBox = [...box];
    }
  }
  const path = typeof source === "string";
  let contours;
  if (path) contours = parsePath(source);
  else {
    const list = ArrayBuffer.isView(source) ? null : source;
    if (!Array.isArray(list)) throw Error(`Shape ${name} must be a list of [x, y] vertices or SVG path data.`);
    for (const point of list)
      if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite))
        throw Error(`Shape ${name} vertices must be [x, y] pairs of finite numbers.`);
    contours = list.length ? [{ start: [...list[0]], segments: list.slice(1).map(([x, y]) => ["L", x, y]) }] : [];
  }
  if (viewBox) {
    // Fit the box into the unit square, centered, keeping its aspect ratio; SVG's y is down.
    const [minX, minY, width, height] = viewBox, scale = 2 / Math.max(width, height);
    const cx = minX + width / 2, cy = minY + height / 2, fit = (x, y) => [(x - cx) * scale, -(y - cy) * scale];
    contours = contours.map(({ start, segments }) => ({ start: fit(...start),
      segments: segments.map((s) => [s[0], ...s.slice(1).reduce((out, v, k, all) => k % 2 ? out : [...out, ...fit(v, all[k + 1])], [])]) }));
  }
  const outline = rings(contours);
  const points = outline.flat();
  if (!path && source.length < 3) throw Error(`Shape ${name} needs at least 3 vertices.`);
  if (points.length < 3) throw Error(path ? `Shape ${name} needs at least 3 vertices.` : `Shape ${name} needs at least 3 distinct vertices.`);
  const outside = points.some(([x, y]) => Math.abs(x) > 1 || Math.abs(y) > 1);
  if (outside && !path) throw Error(`Shape ${name} vertices must lie in the unit square [-1, 1].`);
  if (outside) throw Error(`Shape ${name} must lie in the unit square [-1, 1]; give a viewBox to fit a path drawn in other coordinates.`);
  const segments = outline.reduce((sum, ring) => sum + ring.length, 0);
  if (segments > MAX_SHAPE_SEGMENTS)
    throw limitError("shapeSegments", path ? { what: `shape ${name}'s outline, once its curves are flattened,`, count: segments }
      : { what: `shape ${name}'s outline`, count: segments, hint: "Use fewer vertices." });
  if (outline.every((ring) => ring.length < 3 || flat(ring)))
    throw Error(path ? `Shape ${name} has zero area.` : `Shape ${name} has zero area; its vertices are collinear.`);
  const straight = contours.every((c) => c.segments.every((s) => s[0] === "L"));
  const vertices = outline.length === 1 && straight && outline[0].length <= EXACT_SHAPE_VERTICES && simple(outline[0])
    ? outline[0] : null;
  const canonical = path
    ? (fillRule === "nonzero" && !viewBox ? source : { path: source, ...(fillRule !== "nonzero" ? { fillRule } : {}), ...(viewBox ? { viewBox } : {}) })
    : (fillRule === "nonzero" ? outline[0] : { vertices: outline[0], fillRule });
  return {
    definition: canonical, fillRule, vertices,
    rings: outline,
    contours: contours.filter((c) => c.segments.length),
  };
}

/**
 * SVG path data for contours (normalizeShape's), with every point mapped by `map(x, y)` to
 * [x, y]: legends and vector export draw a shape's curves as curves.
 */
export function contourPath(contours, map) {
  const f = (x, y) => map(x, y).map((v) => +v.toFixed(4)).join(" ");
  return contours.map(({ start, segments }) => `M${f(...start)} ` + segments.map((s) => s[0] === "L"
    ? `L${f(s[1], s[2])}` : `C${f(s[1], s[2])} ${f(s[3], s[4])} ${f(s[5], s[6])}`).join(" ") + " Z").join(" ");
}
