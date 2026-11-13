import { framePoint, framePointOperations, placedFrame, resolvePlacement } from "../framePlacement.js";
import { frameDimensionStages } from "../frameMapping.js";
import { aspect3dMetric } from "../aspect3d.js";
import { Matrix4, Vector3, Vector4 } from "three/webgpu";
import { prismFootprint } from "../rectangles.js";
import { buildCoordinateOperations } from "../coordinateOperations.js";
import { curved, refinesPieces } from "../curves.js";
import { fieldValue, liveRows, element, finite, captureMarkRows, sizeValue, color } from "./capture.js";
import { exportCurve, CONTROL_FIELDS, dashPattern, toleranceOf, lineDashStarts, localPathSource, pixelDistance, pointSymbol, labelElements, labelBox, TRIANGLE_FIELDS, dashedRun, pathData, joinHalves } from "./geometry.js";
import { vectorCandidate } from "./twoDimensional.js";
import { markBinding } from "../markBinding.js";
import { coordinateView } from "../viewContext.js";
import { TEMPLATES } from "../../../templates/builtins.js";
import { mainKind } from "../../../templates/instantiate.js";
// ---------------------------------------------------------------------------
// 2D marks in a 3D view (TODO 70.6). A 3D view exports as vectors only when every mark in it
// can: flat Points symbols, Text, Line, Segments, GeoJSON boundaries, Arrows, ErrorBars, Area,
// Area, flat Rects (a Histogram's, a Bar's and a BoxPlot's boxes too) and Polygon, unlit, in a
// Cartesian chain; otherwise its marks stay one
// image, since an image and depth-sorted vectors cannot hide one another correctly. Each
// primitive is projected through the export camera as the GPU projects it and cut at the near
// and far planes, and all of them are drawn back to front by depth (painter's order, as
// matplotlib's mplot3d draws), strokes and fills in short pieces so that a line passing in front
// of another sorts piece by piece. Where primitives intersect, which one hides the other is
// approximate.

/** The 2D mark kinds (exportKind) a 3D view draws as vectors; a Prism object only as a 2D mark's flat footprint. */
const VIEW3D_KINDS = new Set(["points", "labels", "line", "segments", "geo-segments", "billboard-arrows", "errorbars",
  "band", "prism", "triangles"]);
// A stroke piece's and a fill piece's longest side in CSS pixels: short enough that its depth
// stands for all of it where it crosses a point or another piece. Doubled until the pieces fit
// the primitive budget.
const STROKE_PIECE = 8, FILL_PIECE = 16;
const THREE_D_MARKS = new Set(["Points3D", "Arrows3D", "Surface", "Prism"]);
// The 2D compounds that draw their boxes through a Prism object (namedMark sets the binding's
// compound): the built-in templates whose main part is a Prism or Rect endpoint (TODO 130.2).
const FOOTPRINT_COMPOUNDS = new Set(
  TEMPLATES.filter((definition) => definition.endpoint && ["Prism", "Rect"].includes(mainKind(definition) ?? ""))
    .map((definition) => definition.kind),
);

/** Whether the export camera shows a 3D view (a 3D Plot's scene, whatever its projection). */
export function isView3D(marks, camera) {
  return !!camera?.isPerspectiveCamera || marks.some((mark) => coordinateView(mark.options) === "3d");
}

/**
 * Why a mark keeps its 3D view one image, or null when it exports there as depth-sorted vectors
 * (TODO 70.6). Messages put the mark's name first ("Points3D is a 3D mark").
 */
export function view3DIssue(mark) {
  const o = mark.options, name = mark.exportKind, component = mark.componentName ?? mark.constructor?.componentName;
  // A Rect (a Histogram's too) or a Bar's or BoxPlot's box draws through a Prism object as its
  // flat footprint; extruded, or a Prism mark written as such (flat or not), it is a 3D mark.
  const footprint = name === "prism" && o.get("flat") && (component === "Rect" || FOOTPRINT_COMPOUNDS.has(markBinding(mark)?.compound));
  if (!mark.isPlotObject || !VIEW3D_KINDS.has(name) || name === "prism" && !footprint)
    // Points3D, Arrows3D, Text3D, Surface, a Prism, an extruded Rect; or Heatmap, Image, GeoJSON fills, ...
    return THREE_D_MARKS.has(component) || mark.isGuideText || name === "prism" ? "is a 3D mark" : "has no vector form";
  if (mark.hasOutlines && ["prism", "band", "triangles"].includes(name) &&
      (mark.fields.get("outlineWidth")?.isBufferNode || Number(o.get("outlineWidth") ?? 0) > 0))
    return "has pixel borders retained in the rendered depth layer";
  if (o.get("lit") === true) return "is lit";
  if (name === "points" && o.get("depthWrite") === false)
    return "disables depth writes, requiring the rendered draw order";
  if (mark.surface) return "lies on a surface";
  if (mark.sampling?.active) return "draws a sample of its rows";
  let operations;
  try { operations = buildCoordinateOperations(o); } catch { return "has no frame to map it"; }
  if (operations.some((op) => op.kind === "polar" || op.kind.startsWith("spherical"))) return "is in a polar or spherical frame";
  // A fill is flat between its mapped corners; where a log or sqrt axis bends its edges the GPU refines it into pieces.
  if ((name === "band" || name === "prism" || name === "triangles") && refinesPieces(mark)) return "has edges a log or sqrt axis bends";
  const blend = o.has?.("blend") ? o.get("blend") : "normal";
  if (blend === "additive" || blend === "subtractive") return `uses ${blend} blending, which has no vector form`;
  if (mark.shade?.applied) return `is shaded by ${mark.shade.kind}, which has no vector form`;
  return null;
}

/** A mark's outcome in a 3D view: "empty", "vector", or "raster" (view3DIssue says why). */
export function view3DKind(mark) {
  if (mark.exportKind === "axis-rules" || mark.exportKind === "axis-bands") return vectorCandidate(mark);
  if (!mark.visible || mark.options?.get?.("visible") === false || mark.isPlotObject && !mark.count) return "empty";
  return view3DIssue(mark) ? "raster" : "vector";
}

/**
 * The export camera as the GPU applies it in a 3D view: world to view space (a point's depth is
 * its distance in front of the camera, -z), view to clip space through the projection matrix,
 * perspective or orthographic, and clip space to SVG pixels. Depths from the near to the far
 * plane are drawn.
 */
export function viewCamera(camera, width, height) {
  camera.updateMatrixWorld?.();
  const view = new Matrix4().copy(camera.matrixWorld).invert(), projection = camera.projectionMatrix,
    e = projection.elements, v3 = new Vector3(), v4 = new Vector4();
  // A perspective projection's w is the view depth (the shader's element(2).element(3) === -1 test).
  const perspective = e[11] === -1;
  return {
    camera, near: Number(camera.near), far: Number(camera.far), width, height, perspective,
    toView: (world) => { v3.set(world[0], world[1], world[2] ?? 0).applyMatrix4(view); return [v3.x, v3.y, v3.z]; },
    toScreen: (point) => {
      v4.set(point[0], point[1], point[2], 1).applyMatrix4(projection);
      return Math.abs(v4.w) > 1e-12 && Number.isFinite(v4.x / v4.w) && Number.isFinite(v4.y / v4.w)
        ? [(v4.x / v4.w + 1) * width / 2, (1 - v4.y / v4.w) * height / 2] : null;
    },
    /** CSS pixels a world unit spans at a depth, at most (curve refinement's tolerance). */
    pixelsPerWorld: (depth) => {
      const across = Math.max(Math.abs(e[0]) * width, Math.abs(e[5]) * height) / 2;
      return perspective ? across / Math.max(depth, Number(camera.near) || 1e-9) : across;
    },
    /** CSS pixels a data unit of x spans for a point in data units: the GPU's pixelsPerDataUnit in 3D,
     * the projection's x scale whatever the depth (Points draw without perspective attenuation). */
    pointScale: Math.abs(e[0]) * width / 2,
    /** The world displacement the GPU adds for a pixel offset (base.js applyPixelOffset): along world x and y. */
    pixelOffset: (dx, dy) => [dx * 2 / (width * e[0]), dy * 2 / (height * e[5]), 0],
  };
}

/** The part of a view-space segment from the near to the far plane, as parameters [t0, t1], or null. */
export function clipDepth(a, b, near, far) {
  let t0 = 0, t1 = 1;
  for (const [plane, sign] of [[near, 1], [far, -1]]) {
    const fa = sign * (-a[2] - plane), fb = sign * (-b[2] - plane);
    if (fa < 0 && fb < 0) return null;
    if (fa < 0) t0 = Math.max(t0, fa / (fa - fb));
    else if (fb < 0) t1 = Math.min(t1, fa / (fa - fb));
  }
  return t1 > t0 ? [t0, t1] : null;
}

/** A convex view-space polygon cut to the depths from the near to the far plane (empty when none is left). */
export function clipPolygonDepth(points, near, far) {
  let polygon = points;
  for (const [plane, sign] of [[near, 1], [far, -1]]) {
    const out = [];
    for (let k = 0; k < polygon.length; k++) {
      const p = polygon[k], q = polygon[(k + 1) % polygon.length], fp = sign * (-p[2] - plane), fq = sign * (-q[2] - plane);
      if (fp >= 0) out.push(p);
      if ((fp >= 0) !== (fq >= 0)) out.push(lerp3(p, q, fp / (fp - fq)));
    }
    polygon = out;
    if (polygon.length < 3) return [];
  }
  return polygon;
}

const lerp3 = (p, q, t) => [0, 1, 2].map((k) => (p[k] ?? 0) + ((q[k] ?? 0) - (p[k] ?? 0)) * t);
/** A world point's view position, pixel (carrying the world point, for dashes) and depth, or null. */
function viewVertex(cam, world, view = cam.toView(world)) {
  const pixel = cam.toScreen(view);
  if (!pixel) return null;
  pixel.world = world;
  return { world, view, pixel, depth: -view[2] };
}

/**
 * A world polyline's visible runs from the near to the far plane, each { vertices, cut }: `cut`
 * says whether a plane cuts its start or end (the GPU ends a Line flat there). A null point (one
 * the frame cannot map) ends a run.
 */
export function depthRuns(points, cam) {
  const runs = [];
  let run = null;
  const close = () => { if (run && run.vertices.length > 1) runs.push(run); run = null; };
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1], b = points[k];
    const va = a && cam.toView(a), vb = b && cam.toView(b), span = va && vb ? clipDepth(va, vb, cam.near, cam.far) : null;
    if (!span) { close(); continue; }
    const [t0, t1] = span,
      start = t0 > 0 ? viewVertex(cam, lerp3(a, b, t0), lerp3(va, vb, t0)) : viewVertex(cam, a, va),
      end = t1 < 1 ? viewVertex(cam, lerp3(a, b, t1), lerp3(va, vb, t1)) : viewVertex(cam, b, vb);
    if (!start || !end) { close(); continue; }
    if (!run || t0 > 0) { close(); run = { vertices: [start], cut: [t0 > 0, false] }; }
    run.vertices.push(end);
    if (t1 < 1) { run.cut[1] = true; close(); }
  }
  close();
  return runs;
}

/**
 * A row's world polyline along a curve (its data-space controls, a step) or bent by a log or
 * sqrt axis: refined, as the GPU's refinement pass refines it, until each chord lies within
 * `tolerance` CSS pixels of the path at its depth. `source` gives the path's point at t in the
 * mark's space, `map` its world point (null where the frame cannot map it).
 */
function sampledPath(source, map, cam, tolerance) {
  const at = (t) => { const point = map(source(t)); return point && point.every(Number.isFinite) ? point : null; };
  const first = at(0), points = [first], stack = [{ a: 0, b: 1, p: first, q: at(1), depth: 0 }];
  while (stack.length) {
    const { a, b, p, q, depth } = stack.pop(), m = (a + b) / 2,
      probes = [(3 * a + b) / 4, m, (a + 3 * b) / 4].map(at);
    let deviation = Infinity;
    if (p && q && probes.every(Boolean))
      deviation = Math.max(...probes.map((probe, k) => {
        const chord = lerp3(p, q, (k + 1) / 4);
        return Math.hypot(probe[0] - chord[0], probe[1] - chord[1], probe[2] - chord[2]) *
          cam.pixelsPerWorld(-cam.toView(probe)[2]);
      }));
    if (deviation > tolerance && depth < 12) {
      stack.push({ a: m, b, p: probes[1], q, depth: depth + 1 });
      stack.push({ a, b: m, p, q: probes[1], depth: depth + 1 });
    } else points.push(q);
  }
  return points;
}

/**
 * A stroke mark's paths in world space (Line, Segments, GeoJSON boundaries, Arrows' shafts, error
 * bars): one per row, a Line's consecutive rows of one style joined into one path (TODO 70.2),
 * each with its style, its ends' caps ("round", "butt", or "join" where the next row continues
 * it in another style) and its dash distance at the start.
 */
async function strokePaths3D(mark, rows, cam, map, detail) {
  const { positions, ends, colorAt, strokeWidthAt, opacityAt, shown, displayScale } = rows;
  const o = mark.options, name = mark.exportKind, world = mark.positionSpace === "world";
  const curve = name !== "geo-segments" && name !== "errorbars" && exportCurve(mark), bent = curve || !world && curved(o);
  const [controls1, controls2] = curve && !(o.get("curve") ?? "").startsWith("step")
    ? [await fieldValue(mark.fields.get(CONTROL_FIELDS[0])), await fieldValue(mark.fields.get(CONTROL_FIELDS[1]))] : [null, null];
  // A connector's start and end offsets in CSS pixels (Dodge), added in world x and y as the GPU adds them.
  const offsets = mark.endpointOffsetActive && !(world && curve) ? await liveRows(mark, "endpointOffset", 4) : null;
  const dash = dashPattern(mark, displayScale);
  const tolerance = toleranceOf(mark, detail), join = name === "line" || name === "geo-segments";
  const trueEnd = dash || name === "billboard-arrows" ? "butt" : "round";
  const displace = (points, i) => {
    if (!offsets) return points;
    const offset = element(offsets, i, 4) ?? [];
    for (const [k, dx, dy] of [[0, offset[0], offset[1]], [points.length - 1, offset[2], offset[3]]])
      if (points[k] && (dx || dy)) points[k] = points[k].map((v, axis) => v + cam.pixelOffset(dx || 0, dy || 0)[axis]);
    return points;
  };
  // A straight Line's dash distance where each row starts, in CSS pixels on the page (TODO 73.2).
  const lineStarts = dash && !bent && name === "line"
    ? lineDashStarts(mark.count, positions, ends, (i, from, to) => displace([map(from), map(to)], i).map((point) => screenPixel(cam, point)))
    : null;
  const paths = [];
  let previousTo = null;
  for (let i = 0; i < mark.count; i++) {
    if (shown && !(shown[i] > 0)) { previousTo = null; continue; }
    const from = element(positions, i, 3), to = element(ends, i, 3), stroke = colorAt(i), strokeWidth = strokeWidthAt(i);
    const continues = join && !!previousTo && !!from && from.every((v, k) => v === previousTo[k]);
    previousTo = to;
    if (!from || !to || !stroke || !finite(strokeWidth) || strokeWidth <= 0) { previousTo = null; continue; }
    let points;
    if (bent) {
      const controls = controls1 ? [element(controls1, i, 3), element(controls2, i, 3)] : null;
      points = sampledPath(localPathSource(from, to, o, controls), map, cam, tolerance);
    } else points = [map(from), map(to)];
    displace(points, i);
    const attrs = { stroke, "stroke-width": strokeWidth, opacity: opacityAt(i) };
    const last = paths.at(-1), same = last && ["stroke", "stroke-width", "opacity"].every((key) => last.attrs[key] === attrs[key]);
    if (continues && last?.row === i - 1 && same) { last.points.push(...points.slice(1)); last.row = i; continue; }
    const path = { row: i, points, attrs, caps: [trueEnd, trueEnd], distance: lineStarts?.[i] ?? 0 };
    if (continues && last?.row === i - 1) {
      // The previous row continues into this one in another style: they meet at a join.
      last.caps[1] = path.caps[0] = "join";
      last.after = points[1];
      path.before = last.points.at(-2);
      if (dash) path.distance = last.distance + screenLength(cam, last.points);
    }
    paths.push(path);
  }
  return { paths, dash, miter: name === "line" };
}
/** A world point's pixel on the page, or null behind the camera. */
const screenPixel = (cam, point) => { const vertex = point && viewVertex(cam, point); return vertex && vertex.depth > 0 ? vertex.pixel : null; };
/** The CSS pixels between two world points on the page: a dash's distance along a 3D path (TODO 73.2). */
const screenStep = (cam, p, q) => { const a = screenPixel(cam, p), b = screenPixel(cam, q); return a && b ? pixelDistance(a, b) : 0; };
const screenLength = (cam, points) => points.slice(1).reduce((sum, q, k) => sum + screenStep(cam, points[k], q), 0);

/**
 * Each mark's primitives for the depth sort: points' symbols and labels at their anchors' depths,
 * stroke runs and flat fills in view space (cut into pieces later), arrow heads and error-bar
 * caps where the GPU draws them in screen space.
 */
async function view3DSources(mark, cam, width, height, detail) {
  const rows = await captureMarkRows(mark), o = mark.options, name = mark.exportKind, world = mark.positionSpace === "world";
  // Data to world as mapPosition maps it: through the frame chain, or (a connector's gathered
  // world positions) only through its frame's placement.
  const operations = world ? null : framePointOperations(o, { camera: cam.camera, width, height }),
    placement = world ? placedFrame(o) : null,
    matrix = placement ? resolvePlacement(placement, cam.camera, width, height) : null;
  const map = (point) => {
    if (!point || !point.slice(0, 2).every(finite)) return null;
    const mapped = world ? (matrix ? new Vector3(point[0], point[1], point[2] ?? 0).applyMatrix4(matrix).toArray() : [point[0], point[1], point[2] ?? 0])
      : framePoint(o, point, { operations });
    return mapped && mapped.every(Number.isFinite) ? [...mapped] : null;
  };
  const { positions, shown, colorAt, opacityAt, displayScale, sizes, offsetsX, offsetsY } = rows;
  const blend = o.has?.("blend") ? o.get("blend") : "normal", style = blend === "screen" || blend === "multiply" ? `mix-blend-mode: ${blend}` : null;
  const out = { glyphs: [], runs: [], fills: [], style };
  const visible = (at, reach) => at[0] > -reach && at[0] < width + reach && at[1] > -reach && at[1] < height + reach;
  if (name === "points" || name === "labels") {
    const codes = name === "labels" ? await fieldValue(mark.fields.get("textCode")) : null;
    // A point in data units spans its x size at the projection's scale (the GPU's pixelsPerDataUnit in 3D).
    const stage = frameDimensionStages(o, "x")[0], bounds = stage.source.get("xbounds") ?? [0, 1], range = stage.source.get(stage.rangeKey) ?? [0, 1];
    const dataPixels = Math.abs((range[1] - range[0]) / ((bounds[1] - bounds[0]) || 1e-8)) * cam.pointScale *
      (placedFrame(o) ? 1 : aspect3dMetric(o).scale[0]);
    for (let i = 0; i < mark.count; i++) {
      if (shown && !(shown[i] > 0)) continue;
      let point = map(element(positions, i, 3));
      const fill = colorAt(i);
      if (!point || !fill) continue;
      if (name === "points") {
        // A point's pixel offset moves it along world x and y, as the shader adds it.
        const ox = Number(element(offsetsX, i) ?? 0), oy = Number(element(offsetsY, i) ?? 0);
        if (ox || oy) point = point.map((v, axis) => v + cam.pixelOffset(ox, oy)[axis]);
      }
      const view = cam.toView(point), depth = -view[2];
      if (!(depth >= cam.near && depth <= cam.far)) continue;
      const at = cam.toScreen(view);
      if (!at) continue;
      if (name === "points") {
        const size = sizeValue(mark, element(sizes, i, 3)) * (o.get("sizeUnits") === "data" ? dataPixels : 1) * displayScale;
        if (!finite(size) || size <= 0 || !visible(at, size)) continue;
        out.glyphs.push({ depth, count: 1, elements: [pointSymbol(mark, rows, i, at, size, fill)],
          box: [at[0] - size / 2 - 1, at[1] - size / 2 - 1, at[0] + size / 2 + 1, at[1] + size / 2 + 1] });
      } else {
        const code = Math.round(Number(element(codes, i))), size = Number(element(sizes, i) ?? 12) * displayScale,
          reach = (mark.exportWidths?.[code] ?? 0) * size + 2 * size + Math.abs(Number(element(offsetsX, i) ?? 0)) +
            Math.abs(Number(element(offsetsY, i) ?? 0)) + 16;
        if (!visible(at, reach)) continue;
        const elements = labelElements(mark, rows, i, at, code, fill);
        if (elements.length) out.glyphs.push({ depth, count: elements.length, elements, box: labelBox(mark, rows, i, at, code) });
      }
    }
    return out;
  }
  if (name === "band" || name === "prism" || name === "triangles") {
    const polygons = [];
    if (name === "band") {
      const ends = rows.ends, upper0 = await fieldValue(mark.fields.get("previous")), upper1 = await fieldValue(mark.fields.get("next")),
        component = o.get("uncertaintyAxis") === 0 ? 0 : 1;
      for (let i = 0; i < mark.count; i++) {
        if (shown && !(shown[i] > 0)) continue;
        const [s, e, n, p] = [element(positions, i, 3), element(ends, i, 3), element(upper1, i, 3), element(upper0, i, 3)];
        if (![s, e, n, p].every(Boolean)) continue;
        // Where the upper edge crosses the lower one inside the interval, each side is its own
        // triangle, as the GPU splits it (TODO 67.1).
        const a = p[component] - s[component], b = n[component] - e[component];
        if (a * b < 0) {
          const m = lerp3(s, e, a / (a - b));
          polygons.push({ row: i, corners: [s, m, p] }, { row: i, corners: [m, e, n] });
        } else polygons.push({ row: i, corners: [s, e, n, p] });
      }
    } else if (name === "prism") {
      const extents = await liveRows(mark, "extent"), turns = await fieldValue(mark.fields.get("turn")),
        footprint = prismFootprint(o.get("shape") ?? "rectangle");
      for (let i = 0; i < mark.count; i++) {
        if (shown && !(shown[i] > 0)) continue;
        const lo = element(positions, i, 3), hi = element(extents, i, 3), turn = Number(element(turns, i) ?? 0) * Math.PI / 180;
        if (!lo || !hi) continue;
        const center = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2], c = Math.cos(turn), s = Math.sin(turn);
        polygons.push({ row: i, corners: footprint.map(([u, v]) => {
          const a = u * (hi[0] - lo[0]), b = v * (hi[1] - lo[1]);
          return [center[0] + a * c - b * s, center[1] + a * s + b * c, lo[2]];
        }) });
      }
    } else {
      // A Polygon's triangles at z = 0, as the GPU maps them; the outline strokes its own edges.
      const [cornersB, cornersC, flags] = await Promise.all(TRIANGLE_FIELDS.map((key) => fieldValue(mark.fields.get(key))));
      const outlineWidth = Number(o.get("outlineWidth") ?? 0) * displayScale, outlineColor = color(o.get("outlineColor")) ?? "#ffffff";
      for (let i = 0; i < mark.count; i++) {
        if (shown && !(shown[i] > 0)) continue;
        const corners = [element(positions, i, 3), element(cornersB, i, 3), element(cornersC, i, 3)];
        if (corners.some((corner) => !corner)) continue;
        const flat = corners.map((corner) => [corner[0], corner[1], 0]);
        polygons.push({ row: i, corners: flat });
        const edges = Number(element(flags, i) ?? 0);
        if (outlineWidth > 0)
          for (let k = 0; k < 3; k++)
            if (Math.floor(edges / 2 ** k) % 2)
              out.runs.push(...strokeRuns([map(flat[k]), map(flat[(k + 1) % 3])], { stroke: outlineColor, "stroke-width": outlineWidth,
                opacity: opacityAt(i) }, ["round", "round"], cam, { style }));
      }
    }
    for (const { row, corners } of polygons) {
      const fill = colorAt(row), points = corners.map(map);
      if (!fill || points.some((point) => !point)) continue;
      const view = clipPolygonDepth(points.map(cam.toView), cam.near, cam.far);
      if (view.length >= 3) out.fills.push({ view, attrs: { fill, opacity: opacityAt(row) }, style });
    }
    return out;
  }
  // Strokes: Line, Segments, GeoJSON boundaries, Arrows' shafts and error bars.
  const { paths, dash, miter } = await strokePaths3D(mark, rows, cam, map, detail);
  for (const path of paths) {
    const runs = strokeRuns(path.points, path.attrs, path.caps, cam, { dash, miter, distance: path.distance, style,
      before: path.before, after: path.after });
    if (name === "billboard-arrows") {
      // The head at the path's true end (not one the near plane cuts), along the final chord, the
      // shaft stopping at its base (materials/arrowCap.js).
      const run = runs.at(-1);
      if (run && !run.cut[1]) out.glyphs.push(...arrowHead3D(run, path.attrs, o, displayScale, cam, style));
    }
    if (mark.capActive)
      // A cap across the bar on screen at each end it reaches, capSize pixels long (the line
      // material's caps); none where the near plane cuts it.
      for (const run of runs) for (const [end, inner] of [!run.cut?.[0] && [run.vertices[0], run.vertices[1]],
        !run.cut?.[1] && [run.vertices.at(-1), run.vertices.at(-2)]].filter(Boolean)) {
        const dx = inner.pixel[0] - end.pixel[0], dy = inner.pixel[1] - end.pixel[1], length = Math.hypot(dx, dy),
          cap = Number(o.get("capSize") ?? 6) * displayScale / 2;
        if (!(length > 1e-9)) continue;
        const nx = -dy / length * cap, ny = dx / length * cap;
        out.runs.push(screenRun([[end.pixel[0] - nx, end.pixel[1] - ny], [end.pixel[0] + nx, end.pixel[1] + ny]], end.depth, path.attrs, style));
      }
    out.runs.push(...runs);
  }
  return out;
}

/** A world polyline's visible stroke runs, with their style and caps (a plane's cut is flat). */
function strokeRuns(points, attrs, caps, cam, { dash = null, miter = false, distance = 0, style = null, before = null, after = null } = {}) {
  const runs = depthRuns(points, cam);
  // A neighboring path's point beyond a join, on screen (the miter there needs its direction), if it is drawn.
  const neighbor = (world) => { const vertex = world && viewVertex(cam, world); return vertex && vertex.depth >= cam.near ? vertex.pixel : null; };
  // The dash distance at each run's start: the path's, carried along the polyline on the page.
  let carried = distance, k = 0;
  return runs.map((run, index) => {
    const first = run.vertices[0].world;
    for (; k + 1 < points.length && !(points[k] && points[k + 1] && onSegment(points[k], points[k + 1], first)); k++)
      carried += screenStep(cam, points[k], points[k + 1]);
    const start = carried + screenStep(cam, points[k], first);
    const end = (side) => run.cut[side] ? "butt" : side ? (index === runs.length - 1 ? caps[1] : "round") : (index === 0 ? caps[0] : "round");
    return { vertices: run.vertices, cut: run.cut, caps: [end(0), end(1)], attrs, dash, miter, distance: start, style,
      before: !run.cut[0] && index === 0 ? neighbor(before) : null, after: !run.cut[1] && index === runs.length - 1 ? neighbor(after) : null };
  });
}
const onSegment = (p, q, x) => {
  const d = [0, 1, 2].map((a) => q[a] - p[a]), e = [0, 1, 2].map((a) => x[a] - p[a]),
    length = Math.hypot(...d), cross = Math.hypot(d[1] * e[2] - d[2] * e[1], d[2] * e[0] - d[0] * e[2], d[0] * e[1] - d[1] * e[0]);
  const t = length > 0 ? (d[0] * e[0] + d[1] * e[1] + d[2] * e[2]) / (length * length) : 0;
  return cross <= 1e-9 * Math.max(1, length * length) && t >= -1e-9 && t <= 1 + 1e-9;
};

/** A stroke in screen space at one depth (an error bar's cap): never cut into pieces. */
function screenRun(pixels, depth, attrs, style) {
  return { vertices: pixels.map((pixel) => ({ pixel, depth })), cut: [false, false], caps: ["butt", "butt"], attrs, dash: null,
    miter: false, distance: 0, style, flat: true };
}

/**
 * An arrow-capped segment's head in a 3D view, as materials/arrowCap.js draws it: a triangle at the
 * shaft's last visible vertex along the final chord on screen, headLength pixels long (at most the
 * shaft's length) and headWidth wide; the shaft run is shortened to stop at its base.
 */
function arrowHead3D(run, attrs, o, displayScale, cam, style) {
  const vertices = run.vertices, total = vertices.slice(1).reduce((sum, v, k) => sum + Math.hypot(v.pixel[0] - vertices[k].pixel[0], v.pixel[1] - vertices[k].pixel[1]), 0);
  const tip = vertices.at(-1), previous = vertices.at(-2), dx = tip.pixel[0] - previous.pixel[0], dy = tip.pixel[1] - previous.pixel[1],
    chord = Math.hypot(dx, dy);
  if (!(chord > 1e-6)) return [];
  const ux = dx / chord, uy = dy / chord, nx = -uy, ny = ux,
    headLength = Math.min(total, Number(o.get("headLength") ?? 10) * displayScale), headWidth = Number(o.get("headWidth") ?? 8) * displayScale,
    bx = tip.pixel[0] - ux * headLength, by = tip.pixel[1] - uy * headLength;
  // Trim the shaft back by the head's length on screen; a cut inside a segment finds its world
  // point by bisection (perspective maps equal steps in world unevenly onto the screen).
  let remaining = headLength;
  while (vertices.length > 1 && remaining > 0) {
    const p = vertices.at(-1), q = vertices.at(-2), step = Math.hypot(p.pixel[0] - q.pixel[0], p.pixel[1] - q.pixel[1]);
    if (step <= remaining) { vertices.pop(); remaining -= step; continue; }
    let lo = 0, hi = 1, cut = null;
    for (let n = 0; n < 40; n++) {
      const t = (lo + hi) / 2, v = viewVertex(cam, lerp3(q.world, p.world, t), lerp3(q.view, p.view, t));
      if (!v) break;
      cut = v;
      if (Math.hypot(p.pixel[0] - v.pixel[0], p.pixel[1] - v.pixel[1]) > remaining) lo = t; else hi = t;
    }
    if (cut) vertices[vertices.length - 1] = cut;
    remaining = 0;
  }
  if (vertices.length < 2 || Math.hypot(vertices[1].pixel[0] - vertices[0].pixel[0], vertices[1].pixel[1] - vertices[0].pixel[1]) <= 1e-9)
    run.vertices = [];
  const head = { type: "path", attrs: { d: `M${tip.pixel[0]} ${tip.pixel[1]} L${bx + nx * headWidth / 2} ${by + ny * headWidth / 2} L${bx - nx * headWidth / 2} ${by - ny * headWidth / 2} Z`,
    fill: attrs.stroke, opacity: attrs.opacity, ...(style ? { style } : {}) } };
  // The head's depth: halfway from its base (the shaft's new end) to its tip.
  const xs = [tip.pixel[0], bx + nx * headWidth / 2, bx - nx * headWidth / 2], ys = [tip.pixel[1], by + ny * headWidth / 2, by - ny * headWidth / 2];
  return [{ depth: (tip.depth + (run.vertices.at(-1)?.depth ?? tip.depth)) / 2, count: 1, elements: [head],
    box: [Math.min(...xs) - 1, Math.min(...ys) - 1, Math.max(...xs) + 1, Math.max(...ys) + 1] }];
}

/**
 * The primitives to sort: glyphs (points, labels, arrow heads) at their depths; each stroke run
 * cut into pieces of at most `length` CSS pixels (in world space, so a piece's ends stay exact
 * under perspective), each carrying its dash distance; each fill cut into triangles whose sides
 * are at most `fillLength`. A piece wholly outside the view is left out. Stops early (count over
 * `limit`) when the pieces cannot fit.
 */
function view3DPrimitives(sources, cam, length, fillLength, limit) {
  const primitives = [], { width, height } = cam;
  let count = 0;
  const outside = (points, reach) => points.every((p) => p[0] < -reach) || points.every((p) => p[0] > width + reach) ||
    points.every((p) => p[1] < -reach) || points.every((p) => p[1] > height + reach);
  for (const [order, source] of sources.entries()) {
    let seq = 0;
    for (const glyph of source.glyphs) {
      const depth = glyph.depth;
      primitives.push({ ...glyph, order, seq: seq++, center: [(glyph.box[0] + glyph.box[2]) / 2, (glyph.box[1] + glyph.box[3]) / 2],
        depthAt: () => depth });
      count += glyph.count;
    }
    for (const run of source.runs) {
      run.pieces = [];
      let distance = run.distance;
      // How far past each vertex the stroke reaches: half its width, or a Line's miter there.
      const half = run.attrs["stroke-width"] / 2, extent = run.vertices.map((v, k) => {
        const p = run.vertices[k - 1]?.pixel, q = run.vertices[k + 1]?.pixel;
        if (!run.miter || !p || !q) return half;
        const u = [v.pixel[0] - p[0], v.pixel[1] - p[1]], w = [q[0] - v.pixel[0], q[1] - v.pixel[1]],
          cosine = (u[0] * w[0] + u[1] * w[1]) / (Math.hypot(...u) * Math.hypot(...w) || 1), half2 = Math.sqrt(Math.max(0, (1 + cosine) / 2));
        return half2 >= 0.25 ? half / half2 : half;
      });
      for (let k = 1; k < run.vertices.length; k++) {
        const a = run.vertices[k - 1], b = run.vertices[k];
        const n = run.flat ? 1 : Math.max(1, Math.ceil(Math.hypot(b.pixel[0] - a.pixel[0], b.pixel[1] - a.pixel[1]) / length));
        let previous = a;
        for (let j = 1; j <= n; j++) {
          const next = j === n ? b : viewVertex(cam, lerp3(a.world, b.world, j / n), lerp3(a.view, b.view, j / n)) ?? b;
          run.pieces.push({ a: previous, b: next, distance, reach: Math.max(j === 1 ? extent[k - 1] : half, j === n ? extent[k] : half) });
          distance += pixelDistance(previous.pixel, next.pixel);
          previous = next;
        }
      }
      const reach = run.attrs["stroke-width"] / 2 + 1;
      run.pieces.forEach((piece, index) => {
        if (outside([piece.a.pixel, piece.b.pixel], reach)) return;
        primitives.push(piecePrimitive(run, index, piece, cam.perspective, order, seq++));
        count++;
      });
      if (count > limit) return { primitives, count };
    }
    for (const fill of source.fills) {
      const triangles = [];
      for (let k = 1; k + 1 < fill.view.length; k++)
        if (!subdivide([fill.view[0], fill.view[k], fill.view[k + 1]], cam, fillLength, triangles, limit - count)) return { primitives, count: Infinity };
      for (const triangle of triangles) {
        if (outside(triangle.pixels, 1)) continue;
        primitives.push(trianglePrimitive(fill, triangle, cam.perspective, order, seq++));
        count++;
      }
      if (count > limit) return { primitives, count };
    }
  }
  return { primitives, count };
}

// Depth between two depths a fraction t of the way across the screen: under perspective a depth's
// reciprocal is what varies linearly on screen.
const screenDepth = (perspective, depths, weights) => {
  if (!perspective) return depths.reduce((sum, d, k) => sum + d * weights[k], 0);
  const inverse = depths.reduce((sum, d, k) => sum + weights[k] / d, 0);
  return inverse > 0 ? 1 / inverse : NaN;
};

/** A stroke piece to order: its box (reaching past its ends by the stroke's cap or miter), its
 * centerline from `a` to `b` on screen, and its depth at a centerline point. */
function piecePrimitive(run, index, piece, perspective, order, seq) {
  const a = piece.a.pixel, b = piece.b.pixel, pad = piece.reach + 1, dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
  const along = (point) => length2 > 0 ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length2)) : 0;
  return { run, index, order, seq, depth: (piece.a.depth + piece.b.depth) / 2, segment: [a, b],
    box: [Math.min(a[0], b[0]) - pad, Math.min(a[1], b[1]) - pad, Math.max(a[0], b[0]) + pad, Math.max(a[1], b[1]) + pad],
    depthAt: (point) => { const t = along(point); return screenDepth(perspective, [piece.a.depth, piece.b.depth], [1 - t, t]); } };
}

/** The part of segment [a, b] inside a box, as its parameters [t0, t1], or null (Liang-Barsky). */
function clipToBox([a, b], box) {
  let t0 = 0, t1 = 1;
  const d = [b[0] - a[0], b[1] - a[1]];
  for (const [p, q] of [[-d[0], a[0] - box[0]], [d[0], box[2] - a[0]], [-d[1], a[1] - box[1]], [d[1], box[3] - a[1]]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [t0, t1];
}
const segmentPoint = ([a, b], t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** Where two segments cross on screen, or null. */
function crossing([a, b], [c, d]) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], denominator = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(denominator) < 1e-12) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / denominator, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / denominator;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? segmentPoint([a, b], t) : null;
}

/** A fill's triangle to order: its box, and its plane's depth at a screen point (inside it or not). */
function trianglePrimitive(fill, triangle, perspective, order, seq) {
  const [p, q, r] = triangle.pixels, xs = triangle.pixels.map((v) => v[0]), ys = triangle.pixels.map((v) => v[1]),
    area = (q[0] - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (q[1] - p[1]),
    depth = (triangle.depths[0] + triangle.depths[1] + triangle.depths[2]) / 3;
  return { fill, triangle, order, seq, depth, box: [Math.min(...xs) - 1, Math.min(...ys) - 1, Math.max(...xs) + 1, Math.max(...ys) + 1],
    depthAt: (point) => {
      if (Math.abs(area) < 1e-12) return depth;
      const u = ((q[0] - point[0]) * (r[1] - point[1]) - (r[0] - point[0]) * (q[1] - point[1])) / area,
        v = ((r[0] - point[0]) * (p[1] - point[1]) - (p[0] - point[0]) * (r[1] - point[1])) / area;
      const at = screenDepth(perspective, triangle.depths, [u, v, 1 - u - v]);
      return at > 0 && Number.isFinite(at) ? at : depth;
    } };
}

/**
 * The primitives in painter's order (TODO 70.6). Where two overlap on screen (their boxes), the
 * one behind the other there is drawn first, compared at one point of the overlap (a stroke's
 * centerline point nearest the overlap's middle): primitives on one plane (a Line on an Area,
 * points on a Polygon, every mark without z on its plane) tie there and keep the GPU's drawing
 * order (opaque marks before translucent ones, as three.js draws them; each in its own order).
 * The rest go farthest first. Where the comparisons form a cycle (primitives that intersect or
 * interleave), the farthest of them goes first. Returns the ordered primitives.
 */
export function orderPrimitives(primitives) {
  const n = primitives.length, rank = (p, q) => q.depth - p.depth || p.order - q.order || p.seq - q.seq;
  const CELL = 16, grid = new Map(), next = Array.from({ length: n }, () => []), indegree = new Int32Array(n),
    cellsOf = primitives.map((primitive) => primitive.box.map((v) => Math.max(-256, Math.min(16384, Math.floor(v / CELL)))));
  // A dense pile of primitives orders by depth alone past this many comparisons.
  let checks = 0;
  for (let i = 0; i < n; i++) {
    const [x0, y0, x1, y1] = cellsOf[i];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const key = x * 32768 + y;
      let list = grid.get(key);
      if (!list) grid.set(key, list = []);
      for (const j of list) {
        // A pair shares several cells: compared once, in the first of them.
        if (x !== Math.max(x0, cellsOf[j][0]) || y !== Math.max(y0, cellsOf[j][1])) continue;
        if (++checks > 20_000_000) return primitives.slice().sort(rank);
        const first = before(primitives[j], primitives[i]);
        if (first === 1) { next[j].push(i); indegree[i]++; } else if (first === -1) { next[i].push(j); indegree[j]++; }
      }
      list.push(i);
    }
  }
  // Kahn's algorithm, the farthest ready primitive first.
  const ready = new Heap((i, j) => rank(primitives[i], primitives[j])), all = new Heap((i, j) => rank(primitives[i], primitives[j])),
    done = new Uint8Array(n), out = [];
  for (let i = 0; i < n; i++) { all.push(i); if (!indegree[i]) ready.push(i); }
  while (out.length < n) {
    let i = ready.pop();
    if (i === undefined) do i = all.pop(); while (done[i]);
    if (done[i]) continue;
    done[i] = 1;
    out.push(primitives[i]);
    for (const j of next[i]) if (--indegree[j] === 0 && !done[j]) ready.push(j);
  }
  return out;
}

/**
 * Whether `p` (1) or `q` (-1) is drawn first where their boxes overlap, or neither (0). They are
 * compared where they meet: two strokes where their centerlines cross (else their middles in the
 * overlap); a stroke and a glyph or fill in the middle of the stroke's part in the overlap (a
 * line leaving a point's center toward the camera covers it, one arriving from behind does not);
 * a glyph at its center; two fills in the overlap's middle. A fill's own triangles tile it and a
 * stroke's neighboring pieces only meet: neither pair needs an order (ordered, every stroke through
 * a fill's plane would make a cycle through its triangles).
 */
function before(p, q) {
  if (p.fill && p.fill === q.fill || p.run && p.run === q.run && Math.abs(p.index - q.index) === 1) return 0;
  const box = [Math.max(p.box[0], q.box[0]), Math.max(p.box[1], q.box[1]), Math.min(p.box[2], q.box[2]), Math.min(p.box[3], q.box[3])];
  if (box[0] > box[2] || box[1] > box[3]) return 0;
  const middle = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
  const inside = (piece) => { const span = clipToBox(piece.segment, box); return segmentPoint(piece.segment, span ? (span[0] + span[1]) / 2 : 0.5); };
  let at = p.center ?? q.center ?? middle, atQ = null;
  if (p.segment && q.segment) {
    const cross = crossing(p.segment, q.segment);
    if (cross) at = cross; else { at = inside(p); atQ = inside(q); }
  } else if (p.segment) at = inside(p);
  else if (q.segment) at = inside(q);
  const dp = p.depthAt(at), dq = q.depthAt(atQ ?? at);
  if (!Number.isFinite(dp) || !Number.isFinite(dq)) return 0;
  if (Math.abs(dp - dq) <= 1e-5 * Math.max(Math.abs(dp), Math.abs(dq))) return (p.order - q.order || p.seq - q.seq) < 0 ? 1 : -1;
  return dp > dq ? 1 : -1;
}

/** A binary heap of indices, the least by `compare` on top. */
class Heap {
  constructor(compare) { this.compare = compare; this.items = []; }
  push(item) {
    const items = this.items;
    let k = items.push(item) - 1;
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (this.compare(items[k], items[parent]) >= 0) break;
      [items[k], items[parent]] = [items[parent], items[k]];
      k = parent;
    }
  }
  pop() {
    const items = this.items;
    if (!items.length) return undefined;
    const top = items[0], last = items.pop();
    if (items.length) {
      items[0] = last;
      for (let k = 0; ;) {
        const left = 2 * k + 1, right = left + 1;
        let least = k;
        if (left < items.length && this.compare(items[left], items[least]) < 0) least = left;
        if (right < items.length && this.compare(items[right], items[least]) < 0) least = right;
        if (least === k) break;
        [items[k], items[least]] = [items[least], items[k]];
        k = least;
      }
    }
    return top;
  }
}

/** A view-space triangle cut across its longest side on screen until every side is at most
 * `length` CSS pixels; false once more than `limit` triangles would be needed. */
function subdivide(view, cam, length, out, limit, level = 0) {
  const pixels = view.map(cam.toScreen);
  if (pixels.some((p) => !p)) return true;
  const sides = [0, 1, 2].map((k) => Math.hypot(pixels[(k + 1) % 3][0] - pixels[k][0], pixels[(k + 1) % 3][1] - pixels[k][1])),
    k = sides.indexOf(Math.max(...sides));
  if (sides[k] <= length || level >= 32) {
    out.push({ pixels, depths: view.map((point) => -point[2]) });
    return out.length <= limit;
  }
  const a = view[k], b = view[(k + 1) % 3], c = view[(k + 2) % 3], m = lerp3(a, b, 0.5);
  return subdivide([a, m, c], cam, length, out, limit, level + 1) && subdivide([m, b, c], cam, length, out, limit, level + 1);
}

/**
 * The ordered primitives' elements (orderPrimitives), back to front. A piece
 * joins the path of its run's neighboring piece, and a fill's triangle the path of its fill's
 * last triangles, wherever nothing drawn after that path overlaps it on screen: drawing it there,
 * earlier than its depth, changes nothing visible. So a stroke keeps its joins and a fill has no
 * seams except where another mark passes between their pieces in depth.
 */
export function view3DElements(primitives) {
  const entries = [], grid = new Map(), CELL = 32;
  const cells = (box, visit) => {
    const [x0, x1, y0, y1] = [box[0], box[2], box[1], box[3]].map((v) => Math.max(-64, Math.min(4096, Math.floor(v / CELL))));
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) visit(x * 8192 + y);
  };
  const add = (entry, box) => cells(box, (key) => { let list = grid.get(key); if (!list) grid.set(key, list = []); list.push({ entry, box }); });
  // Whether anything placed after `entry` overlaps `box` on screen.
  const blocked = (entry, box) => {
    let hit = false;
    cells(box, (key) => {
      if (!hit) for (const item of grid.get(key) ?? [])
        if (item.entry.position > entry.position && item.box[0] <= box[2] && box[0] <= item.box[2] && item.box[1] <= box[3] && box[1] <= item.box[3]) { hit = true; break; }
    });
    return hit;
  };
  const place = (entry, box) => { entry.position = entries.length; entries.push(entry); add(entry, box); return entry; };
  for (const primitive of primitives) {
    if (primitive.run) {
      const { run, index, box } = primitive;
      run.groupOf ??= new Map();
      const group = [run.groupOf.get(index - 1), run.groupOf.get(index + 1)].find((candidate) => candidate && !blocked(candidate, box));
      if (group) {
        group.lo = Math.min(group.lo, index);
        group.hi = Math.max(group.hi, index);
        add(group, box);
        run.groupOf.set(index, group);
      } else run.groupOf.set(index, place({ run, lo: index, hi: index }, box));
    } else if (primitive.fill) {
      const { fill, triangle, box } = primitive;
      const group = fill.group && !blocked(fill.group, box) ? fill.group : null;
      if (group) { group.triangles.push(triangle); add(group, box); }
      else fill.group = place({ fill, triangles: [triangle] }, box);
    } else place({ elements: primitive.elements }, primitive.box);
  }
  for (const primitive of primitives) { if (primitive.run) primitive.run.groupOf = null; if (primitive.fill) primitive.fill.group = null; }
  return entries.flatMap((entry) => entry.run ? strokeGroup(entry.run, entry.lo, entry.hi)
    : entry.fill ? fillGroup(entry.fill, entry.triangles) : entry.elements);
}

/**
 * The pieces lo..hi of a stroke run as one path. A true end keeps the run's cap. Where the run
 * continues in another group (or, past a join, in another style), an opaque stroke ends round, so
 * the two overlap without a seam; a translucent one ends flat, with its half of the GPU's miter
 * where the path turns (joinWedge), so nothing is drawn twice. Dashed ends are flat.
 */
function strokeGroup(run, lo, hi) {
  const pieces = run.pieces, points = [pieces[lo].a.pixel, ...pieces.slice(lo, hi + 1).map((piece) => piece.b.pixel)];
  const opaque = run.attrs.opacity >= 1 && !run.style;
  const ends = [lo === 0 ? run.caps[0] : "cut", hi === pieces.length - 1 ? run.caps[1] : "cut"];
  // A round end at a cut stays inside what the rest of the run covers: it needs half the stroke's
  // width of the run beyond it, or a round end there (not a join to another style, nor a flat end).
  const room = (index, step) => {
    let length = 0;
    for (let k = index; k >= 0 && k < pieces.length; k += step) {
      length += Math.hypot(pieces[k].b.pixel[0] - pieces[k].a.pixel[0], pieces[k].b.pixel[1] - pieces[k].a.pixel[1]);
      if (length >= run.attrs["stroke-width"] / 2) return true;
    }
    return run.caps[step > 0 ? 1 : 0] === "round";
  };
  const caps = ends.map((end, side) => end === "round" || end === "butt" ? end : run.dash ? "butt"
    : end === "cut" && opaque && (side ? room(hi + 1, 1) : room(lo - 1, -1)) ? "round" : "butt");
  const attrs = { fill: "none", ...run.attrs, "stroke-linejoin": run.miter ? "miter" : "round",
    ...(run.miter ? { "stroke-miterlimit": 4 } : {}), ...(run.style ? { style: run.style } : {}) };
  const period = run.dash ? run.dash.size + run.dash.gap : 1,
    inDash = (distance) => !run.dash || ((distance % period) + period) % period <= run.dash.size;
  const elements = [];
  if (run.dash) elements.push(...dashedRun(points, pieces[lo].distance, run.dash, attrs));
  else if (caps[0] === caps[1]) elements.push({ type: "path", attrs: { d: pathData([points]), ...attrs, "stroke-linecap": caps[0] } });
  else {
    // One round end: the path ends flat, and the round end is a half disc beyond it (a full dot
    // would reach past a short group's other end), reaching back into the path where the stroke
    // is opaque, so no seam shows.
    elements.push({ type: "path", attrs: { d: pathData([points]), ...attrs, "stroke-linecap": "butt" } });
    const [end, inner] = caps[0] === "round" ? [points[0], points[1]] : [points.at(-1), points.at(-2)];
    const length = Math.hypot(end[0] - inner[0], end[1] - inner[1]), r = attrs["stroke-width"] / 2;
    if (length > 1e-9) {
      const u = [(end[0] - inner[0]) / length, (end[1] - inner[1]) / length], n = [-u[1], u[0]], back = opaque ? Math.min(r, length) : 0;
      const at = (side, along) => `${end[0] + n[0] * r * side + u[0] * along} ${end[1] + n[1] * r * side + u[1] * along}`;
      elements.push({ type: "path", attrs: { d: `M${at(1, -back)} L${at(1, 0)} A${r} ${r} 0 0 0 ${at(-1, 0)} L${at(-1, -back)} Z`,
        fill: attrs.stroke, opacity: attrs.opacity, ...(run.style ? { style: run.style } : {}) } });
    }
  }
  const styled = (half) => half && (run.style ? { ...half, attrs: { ...half.attrs, style: run.style } } : half);
  if (caps[0] === "butt" && (ends[0] === "cut" || ends[0] === "join")) {
    const half = styled(joinHalves(lo > 0 ? pieces[lo - 1].a.pixel : run.before, points[0], points[1], attrs, attrs)[1]);
    if (half && inDash(pieces[lo].distance)) elements.push(half);
  }
  if (caps[1] === "butt" && (ends[1] === "cut" || ends[1] === "join")) {
    const half = styled(joinHalves(points.at(-2), points.at(-1), hi < pieces.length - 1 ? pieces[hi + 1].b.pixel : run.after, attrs, attrs)[0]);
    if (half && inDash(hi < pieces.length - 1 ? pieces[hi + 1].distance : pieces[hi].distance + pixelDistance(pieces[hi].a.pixel, pieces[hi].b.pixel)))
      elements.push(half);
  }
  return elements;
}

/** A fill's triangles as one path (they tile its outline, so they fill once); an opaque one is
 * stroked with a hairline in its own color, so viewers' antialiasing leaves no seam where
 * another group of its triangles meets it. */
function fillGroup(fill, triangles) {
  const d = triangles.map(({ pixels }) => `M${pixels.map((p) => `${p[0]} ${p[1]}`).join(" L")} Z`).join(" ");
  const opaque = fill.attrs.opacity >= 1 && !fill.style;
  return [{ type: "path", attrs: { d, ...fill.attrs, ...(opaque ? { stroke: fill.attrs.fill, "stroke-width": 0.5, "stroke-linejoin": "round" } : {}),
    ...(fill.style ? { style: fill.style } : {}) } }];
}

/**
 * A 3D view's marks as vectors drawn back to front (TODO 70.6): every mark's primitives projected
 * through the export camera and sorted by depth together. `marks` are in their drawing order.
 * Pieces lengthen until they fit `budget`; past it, { overflow } (the view then exports as one
 * image). Returns { elements, count }.
 */
export async function view3DVectors(marks, camera, width, height, budget, detail = 1) {
  const cam = viewCamera(camera, width, height), sources = [];
  // Ties go in the GPU's drawing order: three.js draws opaque marks, then translucent ones.
  const ordered = [...marks.filter((mark) => !mark.material?.transparent), ...marks.filter((mark) => mark.material?.transparent)];
  for (const mark of ordered) sources.push(await view3DSources(mark, cam, width, height, detail));
  const glyphs = sources.reduce((sum, source) => sum + source.glyphs.reduce((total, glyph) => total + glyph.count, 0), 0);
  if (glyphs <= budget)
    for (let scale = 1; scale <= 1024; scale *= 2) {
      const { primitives, count } = view3DPrimitives(sources, cam, STROKE_PIECE * scale, FILL_PIECE * scale, budget);
      if (count <= budget) return { elements: view3DElements(orderPrimitives(primitives)), count };
    }
  return { overflow: true, count: Math.max(glyphs, budget + 1) };
}
