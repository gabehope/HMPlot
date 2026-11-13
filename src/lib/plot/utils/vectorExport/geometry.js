import { DEFAULT_FONT } from "../defaultFont.js";
import { labelSide } from "../labelSide.js";
import { jointProjection } from "../mapProjections.js";
import { framePoint, placedFrame, resolvePlacement } from "../framePlacement.js";
import { Vector3 } from "three/webgpu";
import { symbolVertices } from "../symbols.js";
import { contourPath } from "../shapePaths.js";
import { isShape, shapeNames, shapeVertices, shapeOutline } from "../shapes.js";
import { angularFactor, angularPeriod, greatCircle, longitudeRadians, latitudeRadians, inverseLongitude, inverseLatitude, longitudeOrigin } from "../coordinates.js";
import { buildCoordinateOperations, resolveCoordinateOperations, pathOperationFlags, repeatingRootMap, wrapsWithRoot, bendingOperation, applyCoordinateOperations, inverseCoordinateOperations } from "../coordinateOperations.js";
import { operationSampler } from "../operationTable.js";
import { interpolationOf } from "../curves.js";
import { finite, color, element } from "./capture.js";
import { filledOutlineColor } from "./outlines.js";
import { coordinateView } from "../viewContext.js";
/** A 2D path whose chain bends it (polar, spherical or log/sqrt ancestors,
 * beyond a lone root operation) exports through chainPolyline. */
export function chainedPath(options, { root = false } = {}) {
  try {
    const operations = buildCoordinateOperations(options);
    if (operations.some((op) => op.kind === "spherical-globe" || op.kind === "spherical-map3d")) return false;
    const bending = operations.some((op) => bendingOperation(op, options));
    // A root joint-projection map (equal-earth, albers, ...) is one extent cut at its seam,
    // as a nested map is: its paths export through the chain.
    const joint = operations.length === 1 && operations[0].kind === "spherical-map2d" &&
      jointProjection(operations[0].options?.get?.("projection")) && coordinateView(operations[0].options) !== "chart";
    // Root polar and orthographic Lines keep their own exporters; a band, an error
    // bar or a Segments has no other curved exporter, so a lone root operation qualifies.
    return bending && (operations.length > 1 || (root || joint) && !repeatingRootMap(operations));
  } catch { return false; }
}
/** A mark the GPU repeats across a periodic 2D root map (equirectangular,
 * Mercator or equal-area; utils/wrappedRender.js). It exports through the
 * unwrapped chain like a nested path, once per wrap tile (see vectorMark). */
export function wrappedRootMark(mark) {
  const o = mark.options;
  return !!o && !!mark.longitudeShift && coordinateView(o) === "2d" && mark.positionSpace !== "world" &&
    wrapsWithRoot(o);
}
/** Options that sample a mark's pieces as the GPU interpolates them: a Rect,
 * band or error bar in its own spherical frame runs along meridians and
 * parallels (interpolationOf), whatever the frame's Line interpolation. */
export function pieceOptions(mark) {
  const interpolation = interpolationOf(mark), options = mark.options;
  return interpolation === (options.get("interpolation") ?? "great-circle") ? options
    : { get: (key) => key === "interpolation" ? interpolation : options.get(key), has: (key) => options.has?.(key) };
}
// A curve's data-space Bézier controls (curveControls), by field name.
export const CONTROL_FIELDS = ["control1", "control2"];
/** A Line, Segments or arrow curve the exporter evaluates like the GPU: a step,
 * or a cubic through the mark's data-space control points (in source space, as
 * the refinement pass evaluates it), on any 2D map included (TODO 70.4). A
 * `basis` Line's rows are already its B-spline's cubic Béziers (curves.js
 * basisPath: three rows per span, those outside the path not finite). */
export function exportCurve(mark) {
  const curve = mark.options?.get("curve") ?? "linear";
  if (curve === "linear") return false;
  return curve.startsWith("step") || !!(mark.fields?.get(CONTROL_FIELDS[0])?.isBufferNode && mark.fields?.get(CONTROL_FIELDS[1])?.isBufferNode);
}
export const hasNestedFrame = (options) => {
  for (let node = options; node; node = node.defaults)
    if (node.frameDefinition?.parent) return true;
  return false;
};

export function project(position, options, camera, width, height, world = false, context = null) {
  if (!position || !finite(position[0]) || !finite(position[1])) return null;
  if (!["cartesian", "polar", "spherical"].includes(options.get("coordinates"))) return null;
  // World-space marks (connection-backed) are already mapped; only their frame's placement applies.
  const placement = world ? placedFrame(options) : null;
  const mapped = world
    ? (placement ? new Vector3(...position).applyMatrix4(resolvePlacement(placement, camera, width, height)) : new Vector3(...position))
    : framePoint(options, position, context ?? {camera,width,height});
  if (!mapped) return null;
  const worldPoint = mapped instanceof Vector3 ? mapped : new Vector3(...mapped), at = worldPoint.toArray();
  const point = worldPoint.project(camera);
  if (![point.x, point.y, point.z].every(Number.isFinite)) return null;
  return withWorld([(point.x + 1) * width / 2, (1 - point.y) * height / 2], at);
}
/** A pixel point carrying its world position (an Arrows3D tube is drawn from it, TODO 70.2). */
export function withWorld(pixel, world) {
  pixel.world = world;
  return pixel;
}

/** Polygon's triangle fields besides position (objects/triangles.js). */
export const TRIANGLE_FIELDS = ["cornerB", "cornerC", "edges"];

/** Subdivide a polar source segment until each projected chord meets the
 * requested screen-space tolerance. Quarter probes also catch complete turns
 * whose endpoints and midpoint happen to coincide. */
export function polarPolyline(from, to, options, camera, width, height, tolerance, budget,
  projectPoint = (point) => project(point, options, camera, width, height)) {
  const source = (t) => [0, 1, 2].map((axis) =>
    Number(from[axis] ?? 0) + (Number(to[axis] ?? 0) - Number(from[axis] ?? 0)) * t);
  const sample = (t) => projectPoint(source(t));
  const first = sample(0), last = sample(1);
  if (!first || !last) return null;
  const points = [first], stack = [{ a: 0, b: 1, first, last, depth: 0 }];
  const angle = Math.abs(Number(to[0]) - Number(from[0])) * angularFactor(options);
  while (stack.length) {
    const { a, b, first: start, last: end, depth } = stack.pop(),
      mid = (a + b) / 2, middle = sample(mid),
      quarter = sample((3 * a + b) / 4), threeQuarter = sample((a + 3 * b) / 4);
    if (!middle || !quarter || !threeQuarter) return null;
    const chord = (t) => [start[0] + (end[0] - start[0]) * t,
      start[1] + (end[1] - start[1]) * t];
    const deviation = Math.max(...[[quarter, .25], [middle, .5], [threeQuarter, .75]]
      .map(([point, t]) => Math.hypot(point[0] - chord(t)[0], point[1] - chord(t)[1])));
    if (deviation > tolerance || angle * (b - a) > Math.PI / 2) {
      if (depth >= 16) return { overflow: true };
      stack.push({ a: mid, b, first: middle, last: end, depth: depth + 1 });
      stack.push({ a, b: mid, first: start, last: middle, depth: depth + 1 });
    } else {
      points.push(end);
      if (points.length - 1 > budget) return { overflow: true };
    }
  }
  return { points, count: points.length - 1 };
}

/** Sample a geographic segment in source space, retaining separate visible
 * arcs and bisecting the orthographic horizon instead of bridging its back. */
export function orthographicPolyline(from, to, options, camera, width, height, tolerance, budget,
  projectPoint = (point) => project(point, options, camera, width, height)) {
  if (![from?.[0], from?.[1], to?.[0], to?.[1]].every(finite) ||
      ![from?.[2], to?.[2]].every((value) => value === undefined || finite(value)))
    return { paths: [], ranges: [], count: 0 };
  const interpolation = options.get("interpolation") ?? "great-circle";
  const factor = angularFactor(options);
  const direction = (point) => {
    const lon = longitudeRadians(point[0], options), lat = latitudeRadians(point[1], options);
    return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
  };
  const firstDirection = direction(from), lastDirection = direction(to);
  const source = (t) => {
    if (interpolation === "angular") return [0, 1, 2].map((axis) =>
      Number(from[axis] ?? 0) + (Number(to[axis] ?? 0) - Number(from[axis] ?? 0)) * t);
    const q = greatCircle(firstDirection, lastDirection, t);
    return [inverseLongitude(Math.atan2(q[0], q[2]), options),
      inverseLatitude(Math.asin(Math.max(-1, Math.min(1, q[1]))), options),
      Number(from[2] ?? 0) + (Number(to[2] ?? 0) - Number(from[2] ?? 0)) * t];
  };
  const sample = (t) => projectPoint(source(t));
  const span = Math.max(Math.abs(Number(to[0]) - Number(from[0])) * factor,
    Math.abs(Number(to[1]) - Number(from[1])) * factor);
  const radius = Math.max(Number(options.get("baseRadius") ?? 1) +
    Number(options.get("radialScale") ?? 1) * Number(from[2] ?? 0),
    Number(options.get("baseRadius") ?? 1) +
    Number(options.get("radialScale") ?? 1) * Number(to[2] ?? 0));
  const pixelRadius = radius * Math.max(width * Math.abs(camera.projectionMatrix.elements[0]),
    height * Math.abs(camera.projectionMatrix.elements[5])) / 2;
  const step = Math.min(Math.PI / 180, Math.sqrt(8 * tolerance / Math.max(1, pixelRadius)));
  const samples = Math.max(16, Math.ceil(span / step));
  if (!Number.isFinite(samples) || samples > 8192) return { overflow: true };
  const boundary = (visible, hidden) => {
    let a = visible, b = hidden;
    for (let i = 0; i < 24; i++) {
      const middle = (a + b) / 2;
      if (sample(middle)) a = middle;
      else b = middle;
    }
    return sample(a);
  };
  // `ranges`: each run's parameter span; a bound inside (0, 1) is a horizon cut.
  const paths = [], ranges = [];
  let active = [], activeStart = 0, previousT = 0, previous = sample(0), count = 0;
  if (previous) active.push(previous);
  for (let i = 1; i <= samples; i++) {
    const t = i / samples, current = sample(t);
    if (previous && !current) {
      const edge = boundary(previousT, t);
      if (edge) active.push(edge);
      if (active.length > 1) { paths.push(active); ranges.push([activeStart, previousT]); count += active.length - 1; }
      active = [];
    } else if (!previous && current) {
      const edge = boundary(t, previousT);
      active = edge ? [edge, current] : [current];
      activeStart = t;
    } else if (current) active.push(current);
    if (count + active.length - 1 > budget) return { overflow: true };
    previousT = t;
    previous = current;
  }
  if (active.length > 1) { paths.push(active); ranges.push([activeStart, 1]); count += active.length - 1; }
  return count > budget ? { overflow: true } : { paths, ranges, count };
}

/** A path's source point at `t`, interpolated in its own Frame as the GPU
 * refinement pass does (utils/curvedPathShader.js `local`): a step curve's
 * corners, or a cubic through `controls` (every other Line or Link curve's
 * data-space Bézier, from curveControls). */
export function localPathSource(from, to, options, controls = null) {
  const a = [0, 1, 2].map((axis) => Number(from[axis] ?? 0)),
    b = [0, 1, 2].map((axis) => Number(to[axis] ?? 0));
  const linear = (t) => a.map((v, axis) => v + (b[axis] - v) * t);
  const curve = options.get("curve") ?? "linear", mix = (p, q, t) => p + (q - p) * t;
  if (curve === "step") return (t) => {
    const x = mix(a[0], b[0], 0.5);
    return t < 1 / 3 ? [mix(a[0], x, 3 * t), a[1], a[2]] : t < 2 / 3 ? [x, mix(a[1], b[1], 3 * t - 1), a[2]]
      : [mix(x, b[0], 3 * t - 2), b[1], a[2]];
  };
  if (curve === "step-before") return (t) => t < 0.5 ? [a[0], mix(a[1], b[1], 2 * t), a[2]]
    : [mix(a[0], b[0], 2 * t - 1), b[1], a[2]];
  if (curve === "step-after") return (t) => t < 0.5 ? [mix(a[0], b[0], 2 * t), a[1], a[2]]
    : [b[0], mix(a[1], b[1], 2 * t - 1), a[2]];
  if (curve !== "linear" && controls) {
    const [c, d] = controls.map((point) => [0, 1, 2].map((axis) => Number(point?.[axis] ?? 0)));
    return (t) => {
      const u = 1 - t;
      return a.map((v, axis) => v * u * u * u + c[axis] * 3 * u * u * t + d[axis] * 3 * u * t * t + b[axis] * t * t * t);
    };
  }
  const interpolation = options.get("interpolation") ?? "great-circle";
  if (options.get("coordinates") !== "spherical" || interpolation === "angular") return linear;
  const factor = angularFactor(options), origin = longitudeOrigin(options),
    base = Number(options.get("baseRadius") ?? 1), radial = Number(options.get("radialScale") ?? 1);
  const direction = (p) => {
    const lon = (p[0] - origin) * factor, lat = p[1] * factor;
    return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
  };
  const u = direction(a), v = direction(b);
  if (interpolation === "cartesian") {
    const ru = base + radial * a[2], rv = base + radial * b[2];
    return (t) => {
      const q = u.map((value, axis) => value * ru + (v[axis] * rv - value * ru) * t),
        length = Math.max(Math.hypot(...q), 1e-20);
      return [Math.atan2(q[0], q[2]) / factor + origin,
        Math.asin(Math.max(-1, Math.min(1, q[1] / length))) / factor,
        (length - base) / Math.max(radial, 1e-20)];
    };
  }
  const start = (a[0] - origin) * factor;
  return (t) => {
    const q = greatCircle(u, v, t),
      turn = Math.atan2(q[0], q[2]) - start + Math.PI,
      lon = start + (turn - Math.floor(turn / (2 * Math.PI)) * 2 * Math.PI) - Math.PI;
    return [lon / factor + origin, Math.asin(Math.max(-1, Math.min(1, q[1]))) / factor,
      a[2] + (b[2] - a[2]) * t];
  };
}

/** The path's pixel point and seam tile at `t`, or null where the chain
 * cannot map it (behind a horizon, a negative radius). */
export function chainPoint(from, to, options, sampler, projectWorld, controls = null) {
  const source = localPathSource(from, to, options, controls);
  return (t) => {
    const mapped = sampler(source(t));
    if (!mapped.valid) return null;
    const point = projectWorld(mapped.point);
    return point ? { point, seam: mapped.seam } : null;
  };
}

/** The packed table, flags and seam tiles of the GPU refinement pass, and a
 * world-to-SVG-pixel projection, for a mark's complete chain. */
export function chainContext(options, camera, width, height) {
  const operations = resolveCoordinateOperations(options, { matrixFor: (definition) =>
    resolvePlacement(definition, camera, width, height) });
  return { sampler: operationSampler(operations, pathOperationFlags(operations)), projectWorld: worldProjector(camera, width, height) };
}
/** World point to SVG pixels (with its world position attached), or null off the camera. */
export function worldProjector(camera, width, height) {
  return (point) => {
    const screen = new Vector3(...point).project(camera);
    return [screen.x, screen.y, screen.z].every(Number.isFinite)
      ? withWorld([(screen.x + 1) * width / 2, (1 - screen.y) * height / 2], [...point]) : null;
  };
}
/** The sampler of a connector's world-space path: only its Frame's placement applies (project). */
export function worldSampler(options, camera, width, height) {
  const placement = placedFrame(options), matrix = placement ? resolvePlacement(placement, camera, width, height) : null;
  return (point) => ({ valid: point.every(Number.isFinite), seam: 0,
    point: matrix ? new Vector3(...point).applyMatrix4(matrix).toArray() : point });
}

/** A filled interval's closed outline through its source corners (four: lower
 * start, lower end, upper end, upper start; a seam's pieces have more), each
 * side refined through the chain. A side must be one complete run (or a
 * zero-length side between coincident corners); a fill cut by a periodic seam
 * splits into its pieces on either side (seamPieces, TODO 70.5), and one cut by
 * an orthographic horizon is joined along the limb (horizonOutline). Returns
 * { outlines: [pixel points...], count }, a raster reason where neither
 * applies, or null when nothing is visible. */
export function chainedOutline(corners, options, sampler, projectWorld, tolerance, budget, operations = null, split = true) {
  const n = corners.length, pixels = corners.map((corner) => {
    const mapped = sampler(corner);
    return mapped.valid ? projectWorld(mapped.point) : null;
  });
  const same = (p, q) => !!p && !!q && Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-3;
  const edges = [];
  let count = 0;
  for (let side = 0; side < n; side++) {
    const edge = chainPolyline(corners[side], corners[(side + 1) % n], options, sampler,
      projectWorld, tolerance, budget - count);
    if (edge.overflow) return { overflow: true };
    edges.push(edge);
    count += edge.count;
  }
  const limbOutline = () => {
    const limb = operations && horizonOutline(corners, edges, options, operations, projectWorld, tolerance);
    return limb?.empty ? null : limb ? { outlines: [limb.outline], count: limb.count }
      : { raster: "a filled boundary is cut by a horizon, an invalid radius or a map's seam more than once" };
  };
  // No boundary shows: on a globe the fill may still cover the whole disk.
  if (pixels.every((pixel) => !pixel) && edges.every((edge) => !edge.paths.length))
    return operations ? limbOutline() : null;
  const complete = edges.every((edge, side) => {
    const from = pixels[side], to = pixels[(side + 1) % n];
    if (!from || !to) return false;
    if (!edge.paths.length) return same(from, to);
    return edge.paths.length === 1 && same(edge.paths[0][0], from) && same(edge.paths[0].at(-1), to);
  });
  if (!complete) {
    const pieces = split && pixels.every(Boolean) ? seamPieces(corners, edges, options, sampler, projectWorld) : null;
    if (!pieces) return limbOutline();
    const outlines = [];
    for (const piece of pieces) {
      const shape = chainedOutline(piece, options, sampler, projectWorld, tolerance, budget - count, operations, false);
      if (shape?.overflow || shape?.raster) return shape;
      if (shape) { outlines.push(...shape.outlines); count += shape.count; }
    }
    return outlines.length ? { outlines, count } : null;
  }
  const outline = [pixels[0]];
  for (const edge of edges) outline.push(...(edge.paths[0]?.slice(1) ?? []));
  return outline.length < 3 ? null : { outlines: [outline], count: outline.length };
}

/** A fill whose boundary a periodic seam (a map's antimeridian) crosses once,
 * split in source space into its piece on each side, as the GPU's refined
 * pieces are cut there. The boundary's runs must abut (only the seam tile
 * changes between them, never visibility); the two cuts, each taken on its
 * own side of the seam, close each piece along the seam with a straight chord
 * in source space, so its sides stay in one tile. Null for anything else. */
function seamPieces(corners, edges, options, sampler, projectWorld) {
  const n = corners.length, cuts = [];
  for (let side = 0; side < n; side++) {
    const { ranges } = edges[side];
    if (!ranges.length || ranges[0][0] > 1e-5 || ranges.at(-1)[1] < 1 - 1e-5) return null;
    for (let k = 1; k < ranges.length; k++) {
      if (ranges[k][0] - ranges[k - 1][1] > 1e-5) return null;
      cuts.push({ side, before: ranges[k - 1][1], after: ranges[k][0] });
    }
  }
  if (cuts.length !== 2) return null;
  const at = (side, t) => localPathSource(corners[side], corners[(side + 1) % n], options)(t);
  // A piece: from a cut's far side along the boundary to the other cut's near side.
  const piece = (from, to) => {
    const points = [at(from.side, from.after)];
    let side = from.side;
    if (side !== to.side || from.after > to.before)
      do { side = (side + 1) % n; points.push(corners[side]); } while (side !== to.side);
    points.push(at(to.side, to.before));
    return points;
  };
  return [piece(cuts[0], cuts[1]), piece(cuts[1], cuts[0])];
}

/** The visible outline of a fill cut by an orthographic horizon: its visible
 * boundary runs, joined across each hidden stretch by the arc of the limb
 * between the exit and the next entry. The chain is split at its orthographic
 * operation, and every later operation must be affine, so the limb is that
 * operation's disk edge mapped through them. The arc goes the way whose
 * points, nudged inside the disk, map back inside the fill's source quad.
 * A cut off the limb (a seam, an invalid radius) or an ambiguous arc returns
 * null, and the caller rasterizes with a reason. */
function horizonOutline(corners, edges, options, operations, projectWorld, tolerance) {
  const k = operations.findIndex((op) => op.kind === "spherical-map2d" &&
    coordinateView(op.options) !== "chart" && op.options?.get("projection") === "orthographic");
  if (k < 0 || operations.slice(k + 1).some((op) => !(op.kind === "fit" || op.kind === "matrix" ||
      op.kind === "scale" && !bendingOperation(op, options)))) return null;
  const prefix = operations.slice(0, k + 1), suffix = operations.slice(k + 1),
    radius = Number(operations[k].options.get("baseRadius") ?? 1);
  const disk = (source) => { try { return applyCoordinateOperations(source, prefix); } catch { return null; } };
  const limb = (angle) => projectWorld(applyCoordinateOperations([radius * Math.cos(angle), radius * Math.sin(angle), 0], suffix));
  const angleOf = (source) => {
    const d = disk(source);
    return d && Math.abs(Math.hypot(d[0], d[1]) - radius) <= 1e-3 * radius ? Math.atan2(d[1], d[0]) : null;
  };
  // Even-odd containment in the fill's source quad (straight sides in source space).
  const inside = (angle) => {
    let p;
    try { p = inverseCoordinateOperations([radius * (1 - 1e-4) * Math.cos(angle), radius * (1 - 1e-4) * Math.sin(angle), 0], prefix); }
    catch { return false; }
    if (!p) return false;
    let hit = false;
    for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
      const [xi, yi] = corners[i], [xj, yj] = corners[j];
      if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  const size = (() => { const a = limb(0), b = limb(Math.PI); return a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) / 2 : 0; })();
  const step = size > 0 ? 2 * Math.acos(Math.max(-1, 1 - tolerance / size)) : Math.PI / 32;
  const arc = (from, delta) => {
    const n = Math.max(1, Math.ceil(Math.abs(delta) / step)), points = [];
    for (let j = 1; j < n; j++) points.push(limb(from + delta * j / n));
    return points.every(Boolean) ? points : null;
  };
  const runs = [];
  edges.forEach((edge, side) => edge.paths.forEach((points, index) =>
    runs.push({ points, side, t0: edge.ranges[index][0], t1: edge.ranges[index][1] })));
  if (!runs.length) {
    // Nothing of the boundary shows: the fill covers the whole disk or none of it.
    if (!inside(0) || !inside(Math.PI)) return { empty: true };
    const circle = [limb(0), ...(arc(0, 2 * Math.PI) ?? [])];
    return circle.every(Boolean) ? { outline: circle, count: circle.length } : null;
  }
  // A cut's parameter comes from the packed f32 table: it can fall a hair
  // past the horizon for the double-precision chain, so it is nudged toward
  // the visible side (inward along the run) until the chain maps it.
  const cutAngle = (side, t, inward) => {
    const at = localPathSource(corners[side], corners[(side + 1) % corners.length], options);
    for (const nudge of [0, 1e-7, 1e-6, 1e-5]) {
      const angle = angleOf(at(Math.min(1, Math.max(0, t + inward * nudge))));
      if (angle !== null) return angle;
    }
    return null;
  };
  const joined = (a, b) => a.t1 >= 1 && b.t0 <= 0 && b.side === (a.side + 1) % corners.length;
  const start = runs.findIndex((run, i) => !joined(runs[(i + runs.length - 1) % runs.length], run));
  if (start < 0) return null;
  const outline = [];
  for (let n = 0; n < runs.length; n++) {
    const run = runs[(start + n) % runs.length], next = runs[(start + n + 1) % runs.length];
    for (const point of run.points) {
      const last = outline.at(-1);
      if (!last || Math.hypot(last[0] - point[0], last[1] - point[1]) > 1e-6) outline.push(point);
    }
    if (joined(run, next)) continue;
    const exit = cutAngle(run.side, run.t1, -1), entry = cutAngle(next.side, next.t0, 1);
    if (exit === null || entry === null) return null;
    // The limb between the two cuts that lies inside the fill all along: a
    // fill across both limbs has an inside midpoint on the far arc as well.
    const turn = 2 * Math.PI, forward = ((entry - exit) % turn + turn) % turn,
      choices = [forward, forward - turn].filter((delta) =>
        [0.1, 0.3, 0.5, 0.7, 0.9].every((f) => inside(exit + delta * f)));
    if (choices.length !== 1) return null;
    const points = arc(exit, choices[0]);
    if (!points) return null;
    outline.push(...points);
  }
  return outline.length < 3 ? null : { outline, count: outline.length };
}

/** Sample a path through its complete coordinate chain. `sampler` evaluates
 * the packed operation table (operationSampler); `projectWorld` maps a world
 * point to SVG pixels. Visibility or seam changes are bisected into separate
 * runs, so a horizon, periodic seam or invalid radius is never bridged; each
 * run then refines until its chords meet the screen tolerance. */
export function chainPolyline(from, to, options, sampler, projectWorld, tolerance, budget, controls = null) {
  if (![from?.[0], from?.[1], to?.[0], to?.[1]].every(finite)) return { paths: [], ranges: [], count: 0 };
  const at = chainPoint(from, to, options, sampler, projectWorld, controls);
  const same = (p, q) => !!p && !!q && p.seam === q.seam;
  const boundary = (inside, outside, seam) => {
    let lo = inside, hi = outside;
    for (let i = 0; i < 24; i++) {
      const middle = (lo + hi) / 2, q = at(middle);
      if (q && q.seam === seam) lo = middle; else hi = middle;
    }
    return lo;
  };
  // Runs of one visibility and seam tile, found on a fixed scan.
  const scan = 256, runs = [];
  let open = null, previous = at(0), previousT = 0;
  if (previous) open = [0, previous.seam];
  for (let i = 1; i <= scan; i++) {
    const t = i / scan, current = at(t);
    if (open && !same(previous, current)) {
      runs.push([open[0], boundary(previousT, t, open[1])]);
      open = null;
    }
    if (!open && current) open = [same(previous, current) ? previousT : boundary(t, previousT, current.seam), current.seam];
    previous = current; previousT = t;
  }
  if (open) runs.push([open[0], 1]);
  const paths = [], ranges = [];
  let count = 0;
  for (const [a0, b0] of runs) {
    const first = at(a0), last = at(b0);
    if (!first || !last || b0 <= a0) continue;
    const points = [first.point], stack = [{ a: a0, b: b0, start: first, end: last, depth: 0 }];
    while (stack.length) {
      const { a, b, start, end, depth } = stack.pop(), mid = (a + b) / 2,
        probes = [(3 * a + b) / 4, mid, (a + 3 * b) / 4].map((t) => at(t));
      const chord = (t) => [start.point[0] + (end.point[0] - start.point[0]) * t,
        start.point[1] + (end.point[1] - start.point[1]) * t];
      const broken = probes.some((probe) => !same(probe, start));
      const deviation = broken ? Infinity : Math.max(...probes.map((probe, k) => {
        const expected = chord((k + 1) / 4);
        return Math.hypot(probe.point[0] - expected[0], probe.point[1] - expected[1]);
      }));
      if (deviation > tolerance) {
        if (depth >= 16) {
          if (broken) continue;
          return { overflow: true };
        }
        const middle = probes[1] && same(probes[1], start) ? probes[1] : null;
        if (!middle) continue;
        stack.push({ a: mid, b, start: middle, end, depth: depth + 1 });
        stack.push({ a, b: mid, start, end: middle, depth: depth + 1 });
      } else {
        points.push(end.point);
        if (count + points.length - 1 > budget) return { overflow: true };
      }
    }
    // A run that only touches a horizon or seam has no visible length.
    if (points.length > 1 && points.some((point) =>
      Math.hypot(point[0] - points[0][0], point[1] - points[0][1]) > 1e-6)) {
      paths.push(points); ranges.push([a0, b0]); count += points.length - 1;
    }
  }
  return count > budget ? { overflow: true } : { paths, ranges, count };
}

/** SVG element for a point symbol: a circle, or the shape's outline scaled to `size`. */
export function symbolPath(shape, x, y, size, rotation = 0) {
  if (shape === "circle") return { type: "circle", attrs: { cx: x, cy: y, r: size / 2 } };
  const vertices = symbolVertices(isShape(shape) ? shape : "square"),
    a = rotation * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  // A shape drawn from the distance field (curves, holes, several parts): its outline, with
  // curves as curves and its fill rule.
  if (isShape(shape) && shape !== "square" && !shapeVertices(shape)) {
    const { contours, fillRule } = shapeOutline(shape);
    const d = contourPath(contours, (vx, vy) => [x + (vx * c - vy * s) * size / 2, y - (vx * s + vy * c) * size / 2]);
    return { type: "path", attrs: { d, ...(fillRule === "evenodd" ? { "fill-rule": "evenodd" } : {}) } };
  }
  const points = vertices.map(([vx, vy]) => {
    // SVG's vertical direction is down, opposite to the shader's local Y.
    const scale = shape === "square" ? Math.abs(c) + Math.abs(s) : 1;
    return [x + (vx * c - vy * s) * size / (2 * scale), y - (vx * s + vy * c) * size / (2 * scale)];
  });
  return { type: "path", attrs: { d: `M${points.map(([px, py]) => `${px} ${py}`).join(" L")} Z` } };
}

export function localPixelsPerDataUnit(position, options, camera, width, height,
  projectPoint = (point) => project(point, options, camera, width, height)) {
  if (!Array.isArray(position)) return 0;
  const curved = options.get("coordinates") === "polar" || options.get("coordinates") === "spherical",
    bounds = options.get("xbounds") ?? [0, 1],
    span = curved ? angularPeriod(options) : Math.abs(bounds[1] - bounds[0]),
    epsilon = Math.max(1e-7, span * (curved ? 1e-4 : 1e-3)),
    at = projectPoint(position);
  if (!at || !Number.isFinite(epsilon)) return 0;
  const shifted = (delta) => projectPoint([Number(position[0]) + delta,
    Number(position[1]), Number(position[2] ?? 0)]);
  const ahead = shifted(epsilon), behind = ahead ? null : shifted(-epsilon),
    next = ahead ?? behind;
  return next ? Math.hypot(next[0] - at[0], next[1] - at[1]) / epsilon : 0;
}

function flattenRGBA(value) {
  const v = Array.isArray(value) || ArrayBuffer.isView(value) ? value : [value];
  return v.length >= 3 ? color(v) : null;
}
// Curve refinement tolerance in logical pixels. `detail` is the output's
// pixels per logical pixel, so a larger export refines to the same output error.
export const toleranceOf = (mark, detail = 1) =>
  Math.max(0.1, Number(mark.options.get("subdivisionTolerance") ?? 0.4)) / Math.max(1, detail);
export const same2 = (p, q) => !!p && !!q && Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6;
export const pathData = (parts) => parts.map((part) => `M${part.map((point) => `${point[0]} ${point[1]}`).join(" L")}`).join(" ");
/** CSS pixels between two exported points: a dash's distance along the drawn path (TODO 73.2). */
export const pixelDistance = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);
export const polylinePixels = (points) => points.slice(1).reduce((sum, q, k) => sum + pixelDistance(points[k], q), 0);

/** A dashed mark's pattern in CSS pixels (dash, gap), as the line material reads it, or null. */
export function dashPattern(mark, displayScale) {
  if (!["line", "segments", "geo-segments", "billboard-arrows"].includes(mark.exportKind) || !mark.options.get("dashed")) return null;
  const size = Number(mark.options.get("dashSize") ?? 1) * displayScale, gap = Number(mark.options.get("gapSize") ?? 1) * displayScale;
  return size > 0 && gap >= 0 && Number.isFinite(size + gap) ? { size, gap } : null;
}

/**
 * A straight Line's dash distance where each of its `count` rows starts, in CSS pixels, as
 * utils/dashDistances.js measures it on the GPU: the screen length of its path so far, starting
 * over at the first row, after a row that maps nowhere, and where a row does not start where the
 * previous one ended. `ends(i, from, to)` is the row's two ends on the page, or nulls.
 */
export function lineDashStarts(count, positions, ends, project) {
  const starts = new Float64Array(count);
  let running = 0, previousValid = false, previousTo = null;
  for (let i = 0; i < count; i++) {
    const from = element(positions, i, 3), to = element(ends, i, 3);
    if (i === 0 || !previousValid || !from || !previousTo || from.some((v, k) => v !== previousTo[k])) running = 0;
    starts[i] = running;
    const [a, b] = from && to ? project(i, from, to) : [null, null];
    previousValid = !!a && !!b;
    if (previousValid) running += pixelDistance(a, b);
    previousTo = to;
  }
  return starts;
}

/**
 * A dashed run's path (TODO 70.3, 73.2). The GPU measures a dash in CSS pixels along the drawn path,
 * from `start`, the run's distance at its first point (where its path started over: its first
 * row, after a gap, or where a row does not continue the previous one), and drops a dashed line's
 * end caps: one stroke-dasharray along the run, its phase in stroke-dashoffset.
 */
export function dashedRun(points, start, dash, attrs) {
  if (points.length < 2) return [];
  const period = dash.size + dash.gap, phase = ((start % period) + period) % period;
  return [{ type: "path", attrs: { d: pathData([points]), ...attrs, "stroke-linecap": "butt",
    "stroke-dasharray": `${dash.size} ${dash.gap}`, "stroke-dashoffset": phase } }];
}

/**
 * The outer join between two pieces of a Line that meet at `vertex` in different styles: the
 * GPU's miter (a bevel past a miter limit of 4), split along its bisector, each half filled in
 * its own piece's color and half width (materials/lines.js). Empty where the path runs straight.
 */
export function joinWedge(before, vertex, after, first, second) {
  return joinHalves(before, vertex, after, first, second).filter(Boolean);
}
/** joinWedge's two halves, [the first piece's, the second's], each null where it draws nothing. */
export function joinHalves(before, vertex, after, first, second) {
  if (!before || !vertex || !after) return [null, null];
  const unit = (p, q) => { const dx = q[0] - p[0], dy = q[1] - p[1], length = Math.hypot(dx, dy); return length > 1e-9 ? [dx / length, dy / length] : null; };
  const incoming = unit(before, vertex), outgoing = unit(vertex, after);
  if (!incoming || !outgoing) return [null, null];
  const turn = incoming[0] * outgoing[1] - incoming[1] * outgoing[0];
  if (Math.abs(turn) < 1e-9) return [null, null];
  // Normals on the outer side of the turn.
  const side = turn > 0 ? -1 : 1, n0 = [-incoming[1] * side, incoming[0] * side], n1 = [-outgoing[1] * side, outgoing[0] * side];
  const sum = [n0[0] + n1[0], n0[1] + n1[1]], length = Math.hypot(...sum), miter = [sum[0] / length, sum[1] / length];
  const denominator = Math.max(1e-7, Math.abs(miter[0] * n0[0] + miter[1] * n0[1]));
  const at = (direction, scale) => [vertex[0] + direction[0] * scale, vertex[1] + direction[1] * scale];
  const halves = [[first, n0, 0], [second, n1, 1]].map(([attrs, normal, k]) => {
    const h = attrs["stroke-width"] / 2, corner = at(normal, h), tip = denominator < 0.25 ? null : at(miter, h / denominator);
    // Past the limit the bevel is the first piece's (the GPU's ending cap quad).
    const points = tip ? (k ? [vertex, tip, corner] : [vertex, corner, tip]) : k ? null : [vertex, corner, at(n1, h)];
    return points ? { type: "path", attrs: { d: `M${points.map((p) => `${p[0]} ${p[1]}`).join(" L")} Z`, fill: attrs.stroke, opacity: attrs.opacity } } : null;
  });
  return halves;
}

/** A point's symbol at pixel `at`, `size` CSS pixels across, in its row's shape, fill and outline. */
export function pointSymbol(mark, { symbolCodes, outlineColors, opacityAt, outlineAt }, i, at, size, fill) {
  const code = symbolCodes ? Math.round(Number(element(symbolCodes, i))) : -1;
  const shape = code >= 0 ? shapeNames()[code] ?? mark.options.get("shape") ?? "circle" : mark.options.get("shape") ?? "circle";
  const style = outlineAt ? outlineAt(i) : { color: outlineColors ? color(element(outlineColors, i, 3)) : color(mark.options.get("outlineColor")),
    width: Number(mark.options.get("outlineWidth") ?? 0) * Number(mark.options.get("displayScale") ?? 1), opacity: 1 };
  const outline = style.color, outlineWidth = style.width;
  // The shader draws the outline inside the glyph: a band outlineWidth CSS pixels wide (times
  // the display scale), at most the point's radius. SVG strokes straddle the path, so the path
  // is inset by half the band and stroked with the band's width: its outer edge is the glyph's.
  const band = outline && outlineWidth > 0 ? Math.min(outlineWidth, size / 2) : 0;
  const symbol = symbolPath(shape, at[0], at[1], size - band, Number(mark.options.get("rotation") ?? 0));
  symbol.attrs.fill = fill;
  symbol.attrs.opacity = opacityAt(i);
  if (band > 0) {
    symbol.attrs.stroke = outline;
    symbol.attrs["stroke-width"] = band;
    symbol.attrs["stroke-opacity"] = style.opacity;
  }
  if (band > 0 && style.opacity < 1 && fill !== "none" && fill !== "transparent") {
    const interior = symbolPath(shape, at[0], at[1], size, Number(mark.options.get("rotation") ?? 0));
    interior.attrs.fill = fill;
    symbol.attrs.fill = "none";
    symbol.attrs.stroke = filledOutlineColor(fill, style);
    symbol.attrs["stroke-opacity"] = 1;
    delete symbol.attrs.opacity;
    return { type: "g", attrs: { opacity: opacityAt(i) }, children: [interior, symbol] };
  }
  return symbol;
}

/** A label's text at pixel `at` (its point), with its box and leader when it has them; offsets
 * and sizes in CSS pixels, as the shader draws them in 2D and 3D alike. */
export function labelElements(mark,{sizes,offsetsX,offsetsY,displayScale,opacityAt},i,at,code,fill){
  const text=mark.exportLabels?.[code],result=[];
  if(text==null||code<0)return result;
  const size=Number(element(sizes,i)??12)*displayScale,ox=Number(element(offsetsX,i)??0)*displayScale,oy=Number(element(offsetsY,i)??0)*displayScale,align=labelSide(mark.options.get("align"),Number(element(offsetsX,i)??0));
  const box=mark.exportBox,leader=mark.exportLeader;
  if(box||leader){
    // The shader's box: the text's width and a line (1.2) tall, padded; its stroke inside the
    // edge. The leader runs from the point to the box's nearest point.
    const padding=(box?.padding??4)*displayScale,width=(mark.exportWidths?.[code]??0)*size,
      w=width+2*padding,h=1.2*size+2*padding,left=at[0]+ox-(align==="left"?0:align==="right"?width:width/2)-padding,top=at[1]+oy-h/2;
    if(leader&&leader.width>0){
      // From a gap at the point, in the text's color unless the leader has its own.
      const nx=Math.min(Math.max(at[0],left),left+w),ny=Math.min(Math.max(at[1],top),top+h),span=Math.hypot(nx-at[0],ny-at[1]),gap=(leader.gap??0)*displayScale;
      if(span-gap>0.5){
        const sx=at[0]+(nx-at[0])*gap/span,sy=at[1]+(ny-at[1])*gap/span;
        result.push({type:"path",attrs:{d:`M${sx} ${sy} L${nx} ${ny}`,fill:"none",stroke:leader.color??fill,"stroke-width":leader.width*displayScale,opacity:opacityAt(i)}});
      }
    }
    if(box){
      const sw=box.strokeWidth*displayScale,r=Math.min(box.radius*displayScale,w/2,h/2);
      result.push({type:"rect",attrs:{x:left+sw/2,y:top+sw/2,width:Math.max(0,w-sw),height:Math.max(0,h-sw),rx:Math.max(0,r-sw/2),fill:box.fill,stroke:sw>0?box.stroke:"none","stroke-width":sw>0?sw:undefined,opacity:box.opacity*opacityAt(i)}});
    }
  }
  // A halo where there is no box: the text's outline in the plot's background, under its fill.
  const halo=!box&&mark.exportHalo?{stroke:mark.exportHalo.color,"stroke-width":2*mark.exportHalo.width*displayScale,"stroke-linejoin":"round","paint-order":"stroke"}:{};
  result.push({type:"text",attrs:{x:at[0]+ox,y:at[1]+oy,"font-size":size,"font-family":mark.exportFont??DEFAULT_FONT,"text-anchor":align==="left"?"start":align==="right"?"end":"middle","dominant-baseline":"central",fill,...halo,opacity:opacityAt(i)},text});
  return result;
}

/** The screen box a label's elements cover (labelElements): its text (a line, 1.2 sizes tall),
 * padded by its box, and its point when a leader runs to it. */
export function labelBox(mark, { sizes, offsetsX, offsetsY, displayScale }, i, at, code) {
  const size = Number(element(sizes, i) ?? 12) * displayScale, ox = Number(element(offsetsX, i) ?? 0) * displayScale,
    oy = Number(element(offsetsY, i) ?? 0) * displayScale, align = labelSide(mark.options.get("align"), Number(element(offsetsX, i) ?? 0)),
    // A label's width from the atlas, else as wide as its characters at most.
    width = (mark.exportWidths?.[code] ?? String(mark.exportLabels?.[code] ?? "").length) * size,
    pad = (mark.exportBox ? (mark.exportBox.padding ?? 4) * displayScale : 0) + size * 0.2 + 1,
    left = at[0] + ox - (align === "left" ? 0 : align === "right" ? width : width / 2) - pad, top = at[1] + oy - 0.6 * size - pad;
  const box = [left, top, left + width + 2 * pad, top + 1.2 * size + 2 * pad];
  return mark.exportLeader ? [Math.min(box[0], at[0]), Math.min(box[1], at[1]), Math.max(box[2], at[0]), Math.max(box[3], at[1])] : box;
}
