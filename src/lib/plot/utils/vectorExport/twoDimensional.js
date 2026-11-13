import { outlinedPath } from "./outlines.js";
import { jointProjection } from "../mapProjections.js";
import { framePointOperations, placedFrame } from "../framePlacement.js";
import { isDegenerateFrameError, nonlinearFrame } from "../frameMapping.js";
import { prismFootprint } from "../rectangles.js";
import { TAU, angularPeriod } from "../coordinates.js";
import { wrapTiles } from "../sphericalBudget.js";
import { refinesPieces } from "../curves.js";
import { varyingWidthOutline } from "./strokeOutline.js";
import { fieldValue, liveRows, element, finite, captureMarkRows, color, sizeValue } from "./capture.js";
import { chainedPath, wrappedRootMark, exportCurve, hasNestedFrame, toleranceOf, chainContext, worldSampler, worldProjector, CONTROL_FIELDS, withWorld, dashPattern, lineDashStarts, chainPolyline, orthographicPolyline, polarPolyline, polylinePixels, dashedRun, pathData, same2, joinWedge, project, chainedOutline, pieceOptions, TRIANGLE_FIELDS, chainPoint, labelElements, localPixelsPerDataUnit, pointSymbol } from "./geometry.js";
import { coordinateView } from "../viewContext.js";
import { frameEdgeData, atFrameEdges } from "../frameEdges.js";
/** A Segments in a root polar frame or map (an error bar's, TODO 130.3) exports through the
 * chain, as a band does; its straight pieces on a root log axis stay straight. */
const rootBent = (mark) => mark.exportKind === "segments" && ["polar", "spherical"].includes(mark.options?.get("coordinates"));
export function vectorCandidate(mark) {
  const name = mark.exportKind;
  const supportedChainedLine = ["line", "segments", "band", "errorbars"].includes(name) &&
    coordinateView(mark.options) === "2d" && mark.positionSpace !== "world" &&
    mark.options?.get("coordinates") !== "spherical" &&
    chainedPath(mark.options, { root: name === "band" || name === "errorbars" || rootBent(mark) }) ||
    (name === "line" || name === "segments") && coordinateView(mark.options) === "2d" &&
    mark.positionSpace !== "world" && chainedPath(mark.options) ||
    // GeoJSON boundaries on a globe or a nested map: each short worker
    // segment through the chain, cut at the horizon; a root flat map repeats.
    name === "geo-segments" && coordinateView(mark.options) === "2d" &&
    mark.options?.get("coordinates") === "spherical" && chainedPath(mark.options, { root: true }) ||
    ["line", "segments", "geo-segments"].includes(name) && wrappedRootMark(mark) ||
    // Bands, error bars and Segments in their own 2D spherical frame: lon/lat pieces (an error
    // bar is a Segments since TODO 130.3), or the frame's interpolation.
    (name === "band" || name === "errorbars" || name === "segments") && coordinateView(mark.options) === "2d" &&
    mark.positionSpace !== "world" && mark.options?.get("coordinates") === "spherical" &&
    (chainedPath(mark.options, { root: true }) || wrappedRootMark(mark)) ||
    // A curve on a root map (TODO 70.4): subdivided in data space through the chain.
    (name === "line" || name === "segments") && coordinateView(mark.options) === "2d" &&
    mark.positionSpace !== "world" && mark.options?.get("coordinates") === "spherical" && exportCurve(mark) &&
    chainedPath(mark.options, { root: true });
  // A flat Rect refined as a patch (a lon/lat box in a spherical frame included).
  const supportedPatch = name === "prism" && coordinateView(mark.options) === "2d" && refinesPieces(mark);
  if (!supportedChainedLine && nonlinearFrame(mark.options) &&
      ["line", "segments", "band", "billboard-arrows"].includes(mark.exportKind)) return "raster";
  if (name === "axis-rules" || name === "axis-bands" || name === "globe-guides") return "vector";
  if (!mark.visible || mark.options?.get("visible") === false) return "empty";
  if (mark.isPlotObject && !mark.count) return "empty";
  if (!mark.isPlotObject) return "raster";
  if (mark.hasOutlines && ["prism", "polar-rect", "band"].includes(name) && refinesPieces(mark) &&
      (mark.fields.get("outlineWidth")?.isBufferNode || Number(mark.options.get("outlineWidth") ?? 0) > 0)) return "raster";
  // Colors are evaluated per row on the host (exportColors): a category, or a number through
  // the mark's scale and colormap (TODO 70.1).
  if (name === "solid-arrows") {
    // A flat 2D arrow: a Cartesian one maps its ends; a bent or curved one
    // refines its shaft like a Line.
    const o = mark.options;
    return coordinateView(o) === "2d" && mark.positionSpace !== "world" && !mark.endpointOffsetActive &&
      ((o.get("curve") ?? "linear") === "linear" || exportCurve(mark)) &&
      (o.get("coordinates") === "cartesian" && !nonlinearFrame(o) || chainedPath(o, { root: true }) ||
        wrappedRootMark(mark)) ? "vector" : "raster";
  }
  if (name === "polar-rect") return mark.options?.get("coordinates") === "polar" && coordinateView(mark.options) === "2d" &&
    (!hasNestedFrame(mark.options) || !!placedFrame(mark.options) || refinesPieces(mark)) ? "vector" : "raster";
  const supportedPolarLine = name === "line" && mark.options?.get("coordinates") === "polar" &&
    coordinateView(mark.options) === "2d" &&
    (!hasNestedFrame(mark.options) || !!placedFrame(mark.options)) &&
    mark.positionSpace !== "world";
  const supportedOrthographicLine = name === "line" && mark.options?.get("coordinates") === "spherical" &&
    mark.options?.get("projection") === "orthographic" && coordinateView(mark.options) === "2d" &&
    !hasNestedFrame(mark.options) && mark.positionSpace !== "world" &&
    mark.options?.get("interpolation") !== "cartesian";
  const curvedGlyph = (name === "points" || name === "labels") &&
    coordinateView(mark.options) === "2d" &&
    (mark.options?.get("coordinates") === "polar" || wrappedRootMark(mark) ||
      mark.options?.get("coordinates") === "spherical" &&
        (mark.options?.get("projection") === "orthographic" || jointProjection(mark.options?.get("projection")) ||
          hasNestedFrame(mark.options))) &&
    mark.positionSpace !== "world";
  if (!supportedPolarLine && !supportedOrthographicLine && !curvedGlyph && !supportedChainedLine && !supportedPatch &&
      (mark.options?.get("coordinates") !== "cartesian" || coordinateView(mark.options) !== "2d")) return "raster";
  // A mark without a curve option (Rect, ErrorBars) draws straight pieces.
  if (mark.surface || mark.sampling?.active || mark.curvedPaths && (mark.options?.get("curve") ?? "linear") !== "linear" &&
    !exportCurve(mark)) return "raster";
  if (name === "points" || name === "triangles" || name === "labels" || name === "band" || name === "errorbars") return "vector";
  // Connectors (positionSpace "world") export from the gathered endpoints, displaced by their
  // pixel offsets (Dodge) where they have them (TODO 70.5).
  if ((name === "segments" || name === "line" || name === "geo-segments" || name === "billboard-arrows") &&
      (mark.options?.get("curve") === "linear" || exportCurve(mark))) return "vector";
  if (name === "prism") return (mark.options.get("extrusionAxis") ?? "z") === "z" ? "vector" : "raster";
  return "raster";
}

/**
 * A mark's vector elements for the export camera. A mark on a periodic root
 * map repeats, as the GPU draws it: one group per wrap tile the camera shows,
 * translated by the tile's longitude period.
 */
export async function vectorMark(mark, camera, width, height, budget, detail = 1) {
  const shifts = wrappedRootMark(mark) ? tileShifts(camera, width) : null;
  if (!shifts) return markVectors(mark, camera, width, height, budget, detail);
  const value = await markVectors(mark, camera, width, height, Math.floor(budget / shifts.length), detail);
  if (!value?.elements || value.overflow || value.raster) return value;
  return { ...value, count: value.count * shifts.length,
    elements: shifts.map((dx) => ({ type: "g", attrs: dx ? { transform: `translate(${dx} 0)` } : {}, children: value.elements })) };
}
// The pixel offsets of the wrap tiles an orthographic 2D camera shows
// (wrappedRender.js), one longitude period (TAU in world x) apart.
function tileShifts(camera, width) {
  if (!camera?.isOrthographicCamera) return null;
  const left = camera.position.x + camera.left / camera.zoom,
    right = camera.position.x + camera.right / camera.zoom, [first, last] = wrapTiles(left, right),
    period = TAU * width / (right - left);
  return Array.from({ length: last - first + 1 }, (_, k) => (first + k) * period);
}

/**
 * Line, Segments, GeoJSON boundaries and Arrows as stroked paths. Each row's path: through its
 * coordinate chain (nested frames, root maps, curves: chainPolyline), a root polar or
 * orthographic Line's own refinement, a connector's world-space curve, or its two mapped ends
 * (a connector's displaced by its endpoints' pixel offsets, TODO 70.5). Consecutive rows of a
 * Line or a GeoJSON boundary that continue one another in the same style join into one
 * polyline, so a Line colored per row splits into runs that meet at shared vertices (TODO
 * 70.2); a dashed one keeps its pattern's phase along the run (TODO 70.3).
 */
async function strokeVectors(mark, rows) {
  const { camera, width, height, budget, detail, positions, ends, colorAt, strokeWidthAt, opacityAt, shown, projectMark, displayScale } = rows;
  const name = mark.exportKind, o = mark.options, world = mark.positionSpace === "world";
  const curve = name !== "geo-segments" && exportCurve(mark);
  const chained = !world && (name === "line" || name === "segments") && (chainedPath(o, { root: rootBent(mark) }) || curve || wrappedRootMark(mark)) ||
    !world && name === "billboard-arrows" && curve ||
    name === "geo-segments" && o.get("coordinates") === "spherical" && (chainedPath(o, { root: true }) || wrappedRootMark(mark));
  const rooted = !chained && !world && name === "line" && ["polar", "spherical"].includes(o.get("coordinates"));
  const worldCurve = world && curve, refined = chained || rooted || worldCurve, tolerance = toleranceOf(mark, detail);
  // The same packed table, flags and seam tiles as the GPU refinement pass.
  const { sampler, projectWorld } = chained ? chainContext(o, camera, width, height)
    : worldCurve ? { sampler: worldSampler(o, camera, width, height), projectWorld: worldProjector(camera, width, height) } : {};
  const [controls1, controls2] = curve && !(o.get("curve") ?? "").startsWith("step")
    ? [await fieldValue(mark.fields.get(CONTROL_FIELDS[0])), await fieldValue(mark.fields.get(CONTROL_FIELDS[1]))] : [null, null];
  // A connector's start and end offsets in CSS pixels (x, y, x, y; y up), from points Dodge
  // displaced: the GPU adds them in screen space (base.js applyPixelOffset).
  const offsets = mark.endpointOffsetActive && !worldCurve ? await liveRows(mark, "endpointOffset", 4) : null;
  const unit = offsets && camera?.isOrthographicCamera
    ? [(camera.right - camera.left) / camera.zoom / width, (camera.top - camera.bottom) / camera.zoom / height] : [0, 0];
  const displaced = (point, dx, dy) => point && withWorld([point[0] + (dx || 0), point[1] - (dy || 0)],
    point.world && [point.world[0] + (dx || 0) * unit[0], point.world[1] + (dy || 0) * unit[1], point.world[2]]);
  const dash = dashPattern(mark, displayScale);
  // A straight row's two ends on the page, a connector's displaced by its offsets.
  const straight = (i, from, to) => {
    let a = projectMark(from, world), b = projectMark(to, world);
    if (offsets) {
      const offset = element(offsets, i, 4);
      a = displaced(a, offset?.[0], offset?.[1]);
      b = displaced(b, offset?.[2], offset?.[3]);
    }
    return [a, b];
  };
  // A dash's distance where each row starts (TODO 73.2): a straight Line's along its path so far,
  // as the GPU measures it (lineDashStarts); a refined row's continues the previous row's when it
  // starts where that one ended; a segment of its own starts at 0.
  const lineStarts = dash && !refined && name === "line" ? lineDashStarts(mark.count, positions, ends, straight) : null;
  // Ends at the frame edge, as the GPU reads them: the visible domain through this camera.
  const edges = mark.frameEdgesInShader?.() ? frameEdgeData(o, camera) : null;
  const edged = (point, codes) => {
    if (!point || !edges || !codes) return point;
    // An edge the chain cannot map back is not drawn, as on the GPU.
    const moved = atFrameEdges(point, codes, edges);
    return moved.some(Number.isNaN) ? null : moved;
  };
  const pieces = [];
  let primitives = 0, previousEnd = null, carried = 0;
  for (let i = 0; i < mark.count; i++) {
    if (shown && !(shown[i] > 0)) continue;
    const from = edged(element(positions, i, 3), mark.frameEdges?.start), to = edged(element(ends, i, 3), mark.frameEdges?.end);
    if (!from || !to) { previousEnd = null; continue; }
    const controls = controls1 ? [element(controls1, i, 3), element(controls2, i, 3)] : null;
    let path;
    if (chained || worldCurve) path = chainPolyline(from, to, o, sampler, projectWorld, tolerance, budget - primitives, controls);
    else if (rooted) path = o.get("coordinates") === "spherical"
      ? orthographicPolyline(from, to, o, camera, width, height, tolerance, budget - primitives, projectMark)
      : polarPolyline(from, to, o, camera, width, height, tolerance, budget - primitives, projectMark);
    else {
      const [a, b] = straight(i, from, to);
      path = a && b ? { paths: [[a, b]], ranges: [[0, 1]], count: 1 } : null;
    }
    if (path?.overflow) return { overflow: true, count: primitives + 1 };
    const parts = path ? path.paths ?? [path.points] : [];
    const length = parts.reduce((sum, part) => sum + polylinePixels(part), 0);
    const start = !dash ? 0 : refined ? (previousEnd && from.every((v, k) => v === previousEnd[k]) ? carried : 0)
      : lineStarts?.[i] ?? 0;
    carried = start + length;
    previousEnd = parts.length ? to : null;
    const stroke = colorAt(i), strokeWidth = strokeWidthAt(i);
    if (!parts.length || !stroke || !finite(strokeWidth) || strokeWidth <= 0) continue;
    primitives += path.count;
    // A refined segment's caps stand across its local tangent, as the GPU draws them (applyCaps).
    const at = chained && mark.capActive && !controls ? chainPoint(from, to, o, sampler, projectWorld) : null;
    pieces.push({ row: i, parts, ranges: path.ranges ?? parts.map(() => [0, 1]), start, at,
      attrs: { fill: "none", stroke, "stroke-width": strokeWidth, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: opacityAt(i) } });
  }
  const result = [], join = name === "line" || name === "geo-segments";
  // A Line's joins are the GPU's: mitered up to a limit of 4, then beveled (materials/lines.js),
  // as SVG's miter join with its default limit.
  const joins = name === "line" ? { "stroke-linejoin": "miter", "stroke-miterlimit": 4 } : {};
  let run = null;
  const close = (boundary = false) => {
    if (!run) return;
    run.round[1] = !boundary;
    const attrs = { ...run.attrs, ...joins };
    if (dash) result.push(...dashedRun(run.points, run.start, dash, attrs));
    else if (run.round[0] && run.round[1]) result.push({ type: "path", attrs: { d: pathData([run.points]), ...attrs } });
    else {
      // An end where the next color begins is flat (the join between them is drawn below);
      // a true end keeps its round cap, as a dot.
      result.push({ type: "path", attrs: { d: pathData([run.points]), ...attrs, "stroke-linecap": "butt" } });
      for (const end of [run.round[0] && run.points[0], run.round[1] && run.points.at(-1)].filter(Boolean))
        result.push({ type: "circle", attrs: { cx: end[0], cy: end[1], r: attrs["stroke-width"] / 2, fill: attrs.stroke, opacity: attrs.opacity } });
    }
    run = null;
  };
  const drawable = [];
  for (let i = 0; i < pieces.length;) {
    const first = pieces[i], group = [first];
    const whole = (p) => p.parts.length === 1 && p.ranges[0][0] === 0 && p.ranges[0][1] === 1;
    if (!dash && name === "line" && whole(first)) {
      while (i + group.length < pieces.length) {
        const next = pieces[i + group.length];
        if (!whole(next) || !same2(group.at(-1).parts[0].at(-1), next.parts[0][0]) ||
          next.attrs.stroke !== first.attrs.stroke || next.attrs.opacity !== first.attrs.opacity) break;
        group.push(next);
      }
    }
    const outline = varyingWidthOutline(group);
    drawable.push(...(outline ? [{ outline }] : group));
    i += group.length;
  }
  for (const piece of drawable) {
    if (piece.outline) { close(); result.push(piece.outline); continue; }
    const { parts, ranges, attrs } = piece, whole = parts.length === 1 && ranges[0][0] === 0 && ranges[0][1] === 1;
    const continues = join && whole && run && same2(run.points.at(-1), parts[0][0]);
    if (continues && ["stroke", "stroke-width", "opacity"].every((key) => run.attrs[key] === attrs[key])) {
      run.points.push(...parts[0].slice(1));
      continue;
    }
    // Where a Line's style changes at a vertex, the GPU's miter there is split along its bisector,
    // each half in its segment's style.
    const wedge = continues && name === "line" ? joinWedge(run.points.at(-2), run.points.at(-1), parts[0][1], run.attrs, attrs) : [];
    close(continues);
    if (!dash || (piece.start % (dash.size + dash.gap) + dash.size + dash.gap) % (dash.size + dash.gap) <= dash.size) result.push(...wedge);
    if (whole && name !== "billboard-arrows") { run = { points: parts[0].slice(), start: piece.start, attrs, round: [!continues, true] }; continue; }
    if (name === "billboard-arrows") {
      result.push(...arrowVectors(parts, ranges, attrs, o, displayScale, dash, piece.start));
      continue;
    }
    if (dash) {
      // A run cut at a horizon, seam or invalid radius: its distance runs on past the cut.
      let distance = piece.start;
      for (const part of parts) {
        result.push(...dashedRun(part, distance, dash, attrs));
        distance += polylinePixels(part);
      }
      continue;
    }
    // A run cut at a horizon, seam or invalid radius ends flat there, as the GPU draws it; the
    // path's true ends keep their round caps.
    const cut = ranges.some(([a, b]) => a > 0 || b < 1), shaft = { ...attrs };
    if (cut) {
      shaft["stroke-linecap"] = "butt";
      ranges.forEach(([a, b], k) => {
        for (const end of [a === 0 && parts[k]?.[0], b === 1 && parts[k]?.at(-1)].filter(Boolean))
          result.push({ type: "circle", attrs: { cx: end[0], cy: end[1], r: attrs["stroke-width"] / 2, fill: attrs.stroke, opacity: attrs.opacity } });
      });
    }
    result.push({ type: "path", attrs: { d: pathData(parts), ...shaft } });
  }
  close();
  if (mark.capActive) {
    const caps = capVectors(pieces, Number(o.get("capSize") ?? 6) * displayScale / 2);
    result.push(...caps);
    primitives += caps.length;
  }
  return { elements: result, count: primitives };
}

/**
 * Segments' cap="bar" (TODO 130.1): a bar `half` pixels each way across the path at each true
 * end (not at a cut), along the end's last chord on the page, or for a refined segment its
 * local tangent there (`at`, its point at a parameter), as the line material draws it.
 */
function capVectors(pieces, half) {
  const out = [];
  for (const { parts, ranges, attrs, at } of pieces)
    ranges.forEach(([a, b], k) => {
      const part = parts[k];
      if (!part || part.length < 2) return;
      /** @param {number} t @param {number} toward @param {number[]} fallback @param {number[]} inner */
      const tangent = (t, toward, fallback, inner) => {
        if (!at) return [fallback, inner];
        const end = at(t), probe = at(toward);
        return end && probe && end.seam === probe.seam ? [end.point, probe.point] : [fallback, inner];
      };
      for (const [end, inner] of [a === 0 && tangent(0, 1e-3, part[0], part[1]), b === 1 && tangent(1, 1 - 1e-3, part.at(-1), part.at(-2))].filter(Boolean)) {
        const dx = inner[0] - end[0], dy = inner[1] - end[1], length = Math.hypot(dx, dy);
        if (!(length > 1e-9)) continue;
        const nx = -dy / length * half, ny = dx / length * half;
        out.push({ type: "path", attrs: { d: `M${end[0] - nx} ${end[1] - ny} L${end[0] + nx} ${end[1] + ny}`, fill: "none",
          stroke: attrs.stroke, "stroke-width": attrs["stroke-width"], "stroke-linecap": "butt", opacity: attrs.opacity } });
      }
    });
  return out;
}

/**
 * One arrow-capped segment's shaft and head, as materials/arrowCap.js draws them: the
 * shaft a flat-ended stroke of its width that stops at the head's base, so the two never
 * overlap (they did, and the shaft's round cap stood past the tip); the head a triangle at the
 * path's true end along its final chord, headLength long (at most the path's length) and
 * headWidth wide. A path cut before its end (a horizon, a seam) has no head there.
 */
function arrowVectors(parts, ranges, attrs, o, displayScale, dash, distance = 0) {
  const shaft = parts.map((part) => part.slice()), out = [];
  let head = null;
  if (ranges.at(-1)[1] === 1) {
    const run = shaft.at(-1), tip = run.at(-1), previous = run.at(-2),
      dx = tip[0] - previous[0], dy = tip[1] - previous[1], chord = Math.hypot(dx, dy),
      total = run.slice(1).reduce((sum, p, k) => sum + Math.hypot(p[0] - run[k][0], p[1] - run[k][1]), 0);
    if (chord > 1e-6) {
      const ux = dx / chord, uy = dy / chord, nx = -uy, ny = ux,
        headLength = Math.min(total, Number(o.get("headLength") ?? 10) * displayScale),
        headWidth = Number(o.get("headWidth") ?? 8) * displayScale,
        bx = tip[0] - ux * headLength, by = tip[1] - uy * headLength;
      head = { type: "path", attrs: { d: `M${tip[0]} ${tip[1]} L${bx + nx * headWidth / 2} ${by + ny * headWidth / 2} L${bx - nx * headWidth / 2} ${by - ny * headWidth / 2} Z`,
        fill: attrs.stroke, opacity: attrs.opacity } };
      // The shaft stops headLength back along the path.
      let remaining = headLength;
      while (run.length > 1 && remaining > 0) {
        const p = run.at(-1), q = run.at(-2), step = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (step <= remaining) { run.pop(); remaining -= step; continue; }
        const t = remaining / step;
        run[run.length - 1] = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
        remaining = 0;
      }
    }
  }
  const drawn = shaft.filter((part) => part.length > 1 &&
    part.slice(1).some((p, k) => Math.hypot(p[0] - part[k][0], p[1] - part[k][1]) > 1e-9));
  if (dash) for (const part of drawn) {
    out.push(...dashedRun(part, distance, dash, attrs));
    distance += polylinePixels(part);
  }
  else if (drawn.length) out.push({ type: "path", attrs: { d: pathData(drawn), ...attrs, "stroke-linecap": "butt" } });
  if (head) out.push(head);
  return out;
}

/** A globe's graticule or reference rule (globeGuides.svelte, TODO 141): each line sampled at the
 * export's resolution in lon/lat (both meridians and parallels are straight there), cut at the
 * horizon, through the root frame as the GPU projects it. Dashes are laid along the sphere's
 * surface, as the GPU lays them. */
function globeGuideVectors(mark, camera, width, height, budget) {
  const frame = mark.frameOptions, context = { camera, width, height };
  const angular = { get: (key) => key === "interpolation" ? "angular" : frame.get(key) };
  const projectGuide = (point) => project(point, frame, camera, width, height, false, context);
  const factor = TAU / angularPeriod(frame),
    pixelsPerWorld = height * Math.abs(camera.projectionMatrix.elements[5]) / 2,
    radius = Number(frame.get("baseRadius") ?? 1);
  const elements = [];
  let count = 0;
  for (const line of mark.exportLines ?? []) {
    const from = line.axis === "x" ? [line.value, line.start, 0] : [line.start, line.value, 0],
      to = line.axis === "x" ? [line.value, line.end, 0] : [line.end, line.value, 0];
    const path = orthographicPolyline(from, to, angular, camera, width, height, 0.25, budget - count, projectGuide);
    if (path.overflow) return { overflow: true, count: count + 1 };
    count += path.count;
    const attrs = { fill: "none", stroke: line.color, "stroke-width": line.width, "stroke-opacity": line.opacity,
      "stroke-linecap": "butt", "data-globe-guide": line.axis, "data-value": line.value,
      ...(line.minor ? { "data-minor": "true" } : {}), ...(mark.exportLayer === "background" ? {} : { "data-reference": "true" }) };
    const dash = line.dash?.length ? { size: line.dash[0], gap: line.dash[1] ?? line.dash[0] } : null;
    if (!dash) {
      if (path.paths.length) elements.push({ type: "path", attrs: { d: pathData(path.paths), ...attrs } });
      continue;
    }
    // The arc's length on the sphere, in pixels: the GPU's dash distance (globeGuides.svelte).
    const arc = Math.abs(line.end - line.start) * factor * radius * pixelsPerWorld *
      (line.axis === "y" ? Math.cos(line.value * factor) : 1);
    path.paths.forEach((part, index) => {
      const [t0, t1] = path.ranges[index], drawn = polylinePixels(part),
        scale = drawn / Math.max(1e-9, (t1 - t0) * arc);
      elements.push(...dashedRun(part, t0 * arc * scale, { size: dash.size * scale, gap: dash.gap * scale }, attrs));
    });
  }
  return { elements, count, layer: mark.exportLayer === "background" ? "background" : undefined };
}

async function markVectors(mark, camera, width, height, budget, detail = 1) {
  if (vectorCandidate(mark) !== "vector") return null;
  const name = mark.exportKind;
  if(name==="axis-rules"){
    // Bands (TODO 46) under the rules, as the GPU draws them.
    const bands=(mark.exportBands??[]).map((band)=>({type:"rect",attrs:{x:band.x0,y:band.y0,width:band.x1-band.x0,height:band.y1-band.y0,fill:band.color,"fill-opacity":band.opacity}}));
    const elements=[...bands,...(mark.exportLines??[]).map((line)=>({type:"path",attrs:{d:line.axis==="x"?`M${line.p} ${line.start} V${line.end}`:`M${line.start} ${line.p} H${line.end}`,fill:"none",stroke:line.color,"stroke-width":line.width,...(line.dash?{"stroke-dasharray":line.dash.join(" ")}:{})}}))];
    return {elements,count:elements.length,layer:"background"};
  }
  if(name==="globe-guides")return globeGuideVectors(mark,camera,width,height,budget);
  if(name==="axis-bands"){
    // A polar frame's bands: each sector's outline in data units, through the frame chain.
    const context={camera,width,height};
    const elements=(mark.exportPolygons??[]).flatMap((polygon)=>{
      const points=polygon.points.map((point)=>project(point,mark.frameOptions,camera,width,height,false,context)).filter(Boolean);
      return points.length<3?[]:[{type:"path",attrs:{d:`M${points.map((p)=>`${p[0]} ${p[1]}`).join(" L")} Z`,fill:polygon.color,"fill-opacity":polygon.opacity,stroke:"none"}}];
    });
    return {elements,count:elements.length,layer:"background"};
  }
  const pointContext = { camera, width, height };
  if (mark.positionSpace !== "world") {
    try { pointContext.operations = framePointOperations(mark.options, pointContext); }
    catch (error) {
      if (isDegenerateFrameError(error)) return { elements: [], count: 0 };
      throw error;
    }
  }
  const projectMark = (position, world = false) =>
    project(position, mark.options, camera, width, height, world, pointContext);
  const line = name === "segments" || name === "line" || name === "geo-segments" || name === "billboard-arrows";
  const { positions, ends, sizes, colorAt, symbolCodes, outlineColors, outlineAt, offsetsX, offsetsY, shown, shownCount, displayScale,
    strokeWidthAt, opacityAt } = await captureMarkRows(mark);
  const count = mark.count;
  if (shownCount > budget) return { overflow: true, count: shownCount };
  const result = [];
  if (line) return strokeVectors(mark, { camera, width, height, budget, detail, positions, ends, colorAt, strokeWidthAt,
    opacityAt, shown, projectMark, displayScale });
  if ((name === "prism" || name === "polar-rect") && refinesPieces(mark)) {
    // A refined patch: its four corners in source space (a turned footprint,
    // or a sector's angle and radius bounds), each side through the chain.
    const extents = await liveRows(mark, "extent"),
      turns = mark.turnActive ? await fieldValue(mark.fields.get("turn")) : null,
      fixed = mark.patchRotation?.() ?? 0,
      tolerance = toleranceOf(mark, detail);
    const { sampler, projectWorld } = chainContext(mark.options, camera, width, height);
    let primitives = 0;
    for (let i = 0; i < count; i++) {
      if (shown && !(shown[i] > 0)) continue;
      const lo = element(positions, i, 3), hi = element(extents, i, 3), fill = colorAt(i);
      if (!lo || !hi || !fill) continue;
      const turn = turns ? Number(element(turns, i) ?? 0) * Math.PI / 180 : fixed,
        c = Math.cos(turn), s = Math.sin(turn), z = Number(hi[2] ?? 0);
      const corner = (u, v) => {
        const a = (u - 0.5) * (hi[0] - lo[0]), b = (v - 0.5) * (hi[1] - lo[1]);
        return [(lo[0] + hi[0]) / 2 + a * c - b * s, (lo[1] + hi[1]) / 2 + a * s + b * c, z];
      };
      const shape = chainedOutline([corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)],
        pieceOptions(mark), sampler, projectWorld, tolerance, budget - primitives, pointContext.operations);
      if (shape?.overflow) return { overflow: true, count: primitives + 1 };
      if (shape?.raster) return { raster: shape.raster };
      if (!shape) continue;
      primitives += shape.count;
      result.push(outlinedPath(shape.outlines.map((outline) => `M${outline.map((point) => point.join(" ")).join(" L")} Z`).join(" "),
        fill, opacityAt(i), outlineAt(i)));
    }
    return { elements: result, count: primitives };
  }
  if (name === "triangles") {
    // A path per triangle; opaque ones are stroked in their own fill (a hairline) so viewers'
    // antialiasing leaves no seams between neighbors. The outline strokes the flagged edges.
    // (Looked up by name from a list: the Python registry scrapes get("...") calls as options.)
    const [cornersB, cornersC, flags] = await Promise.all(TRIANGLE_FIELDS.map((key) => fieldValue(mark.fields.get(key))));
    for (let i = 0; i < count; i++) {
      if (shown && !(shown[i] > 0)) continue;
      const corners = [element(positions, i, 3), element(cornersB, i, 3), element(cornersC, i, 3)];
      if (corners.some((corner) => !corner)) continue;
      const points = corners.map((corner) => projectMark([corner[0], corner[1], 0]));
      if (points.some((point) => !point)) continue;
      const fill = colorAt(i), opacity = opacityAt(i);
      if (!fill) continue;
      const edges = Number(element(flags, i) ?? 0);
      const boundary = points.flatMap((point, k) => Math.floor(edges / 2 ** k) % 2
        ? [`M${point.join(" ")} L${points[(k + 1) % 3].join(" ")}`] : []).join(" ");
      result.push(outlinedPath(`M${points.map((p) => p.join(" ")).join(" L")} Z`, fill, opacity,
        boundary ? outlineAt(i) : { width: 0 }, boundary,
        opacity >= 1 ? { stroke: fill, "stroke-width": 0.5, "stroke-linejoin": "round" } : {}));
    }
    return { elements: result, count: result.length };
  }
  if (name === "prism") {
    const extents = await liveRows(mark, "extent"), turns = await fieldValue(mark.fields.get("turn")),
      footprint = prismFootprint(mark.options.get("shape") ?? "rectangle");
    for (let i = 0; i < count; i++) {
      if (shown && !(shown[i] > 0)) continue;
      const lo = element(positions, i, 3), hi = element(extents, i, 3), turn = Number(element(turns, i) ?? 0) * Math.PI / 180;
      if (!lo || !hi) continue;
      const center = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2], c = Math.cos(turn), s = Math.sin(turn), points = [];
      for (const [u, v] of footprint) {
        const a = u * (hi[0] - lo[0]), b = v * (hi[1] - lo[1]), p = projectMark([center[0] + a*c - b*s, center[1] + a*s + b*c, lo[2]]);
        if (p) points.push(p);
      }
      const fill = colorAt(i);
      if (points.length !== footprint.length || !fill) continue;
      result.push(outlinedPath(`M${points.map((p) => p.join(" ")).join(" L")} Z`, fill, opacityAt(i), outlineAt(i)));
    }
    return { elements: result, count: result.length };
  }
  if (name === "polar-rect") {
    const extents = await liveRows(mark, "extent");
    const tolerance = toleranceOf(mark, detail);
    let primitives = 0;
    for (let i = 0; i < count; i++) {
      if (shown && !(shown[i] > 0)) continue;
      const lo = element(positions, i, 3), hi = element(extents, i, 3), fill = colorAt(i); if (!lo || !hi || !fill) continue;
      const corners = [[lo[0], hi[1], 0], [hi[0], hi[1], 0],
        [hi[0], lo[1], 0], [lo[0], lo[1], 0]];
      const edges = [], points = [];
      let rowPrimitives = 0;
      for (let side = 0; side < 4; side++) {
        const edge = polarPolyline(corners[side], corners[(side + 1) % 4],
          mark.options, camera, width, height, tolerance, budget - primitives - rowPrimitives,
          projectMark);
        if (edge?.overflow) return { overflow: true, count: primitives + 1 };
        if (!edge) break;
        edges.push(edge);
        points.push(...(side ? edge.points.slice(1) : edge.points));
        rowPrimitives += edge.count;
      }
      if (edges.length !== 4) continue;
      primitives += rowPrimitives;
      result.push(outlinedPath(`M${points.map((p) => p.join(" ")).join(" L")} Z`, fill, opacityAt(i), outlineAt(i)));
    }
    return { elements: result, count: primitives };
  }
  if (name === "band" && chainedPath(mark.options, { root: true })) {
    if (mark.fields.get("outlineWidth")?.isBufferNode || Number(mark.options.get("outlineWidth") ?? 0) > 0)
      return { raster: "Outlined nonlinear bands retain the rendered boundary layer." };
    // Each interval's outline: lower edge, end cross-section, upper edge back,
    // start cross-section, each refined through the same packed table.
    const upper0 = await fieldValue(mark.fields.get("previous")), upper1 = await fieldValue(mark.fields.get("next"));
    const tolerance = toleranceOf(mark, detail);
    const { sampler, projectWorld } = chainContext(mark.options, camera, width, height);
    let primitives = 0;
    for (let i = 0; i < count; i++) {
      if (shown && !(shown[i] > 0)) continue;
      const corners = [element(positions, i, 3), element(ends, i, 3), element(upper1, i, 3), element(upper0, i, 3)], fill = colorAt(i);
      if (corners.some((corner) => !corner) || !fill) continue;
      const shape = chainedOutline(corners, pieceOptions(mark), sampler, projectWorld, tolerance, budget - primitives,
        pointContext.operations);
      if (shape?.overflow) return { overflow: true, count: primitives + 1 };
      if (shape?.raster) return { raster: shape.raster.replace("a filled boundary", "a band boundary") };
      if (!shape) continue;
      primitives += shape.count;
      result.push(outlinedPath(shape.outlines.map((outline) => `M${outline.map((point) => point.join(" ")).join(" L")} Z`).join(" "),
        fill, opacityAt(i), outlineAt(i)));
    }
    return { elements: result, count: primitives };
  }
  if (name === "solid-arrows") {
    // A tube and a cone sized in world units (objects/arrows.js), seen from above: each piece's
    // shaft a quad and the head a triangle, outlined in world space and projected corner by
    // corner, since a 2D plot's world units are anisotropic on screen. A bent or curved arrow
    // refines like a Line (its controls in data space, TODO 70.4); its shaft stops at the head's
    // base, and the head sits only at a true end the chain maps, along the final chord, as the
    // GPU's last piece carries it (TODO 64.4: these were drawn in pixels).
    const curve = exportCurve(mark), bent = chainedPath(mark.options, { root: true }) || wrappedRootMark(mark) || curve,
      tolerance = toleranceOf(mark, detail),
      { sampler, projectWorld } = bent ? chainContext(mark.options, camera, width, height) : { projectWorld: worldProjector(camera, width, height) },
      [controls1, controls2] = curve && !(mark.options.get("curve") ?? "").startsWith("step")
        ? [await fieldValue(mark.fields.get(CONTROL_FIELDS[0])), await fieldValue(mark.fields.get(CONTROL_FIELDS[1]))] : [null, null],
      headLength = Number(mark.options.get("headLength") ?? 10) * displayScale,
      headWidth = Number(mark.options.get("headWidth") ?? 8) * displayScale;
    // A world point `along` a direction and `across` it (in the xy plane: the 2D view pins z).
    const offset = (p, [ux, uy], along, across) => [p[0] + ux * along - uy * across, p[1] + uy * along + ux * across, p[2] ?? 0];
    const outline = (corners) => {
      const points = corners.map(projectWorld);
      return points.every(Boolean) ? `M${points.map((q) => `${q[0]} ${q[1]}`).join(" L")} Z` : null;
    };
    let primitives = 0;
    for (let i = 0; i < count; i++) {
      if (shown && !(shown[i] > 0)) continue;
      const from = element(positions, i, 3), to = element(ends, i, 3), fill = colorAt(i), radius = strokeWidthAt(i) / 2;
      if (!from || !to || !fill || !finite(radius) || !(radius > 0)) continue;
      let runs, tip = false;
      if (bent) {
        const controls = controls1 ? [element(controls1, i, 3), element(controls2, i, 3)] : null;
        const path = chainPolyline(from, to, mark.options, sampler, projectWorld, tolerance, budget - primitives, controls);
        if (path.overflow) return { overflow: true, count: primitives + 1 };
        runs = path.paths.map((run) => run.map((point) => point.world)).filter((run) => run.every(Boolean));
        const end = chainPoint(from, to, mark.options, sampler, projectWorld, controls)(1), last = path.paths.at(-1)?.at(-1);
        tip = Boolean(end && last && Math.hypot(last[0] - end.point[0], last[1] - end.point[1]) < 1e-3);
      } else {
        const a = projectMark(from), b = projectMark(to);
        if (!a?.world || !b?.world) continue;
        runs = [[a.world, b.world]];
        tip = true;
      }
      const length = (run) => run.slice(1).reduce((sum, q, k) => sum + Math.hypot(q[0] - run[k][0], q[1] - run[k][1]), 0);
      const total = runs.reduce((sum, run) => sum + length(run), 0);
      if (!(total > 0)) continue;
      let head = null;
      if (tip) {
        const run = runs.at(-1), end = run.at(-1), previous = run.at(-2), chord = Math.hypot(end[0] - previous[0], end[1] - previous[1]),
          h = Math.min(headLength, total);
        if (chord > 1e-12 && h > 0) {
          const u = [(end[0] - previous[0]) / chord, (end[1] - previous[1]) / chord], base = offset(end, u, -h, 0);
          head = outline([offset(base, u, 0, headWidth / 2), end, offset(base, u, 0, -headWidth / 2)]);
          // Trim the shaft back by the head's length along the run.
          let remaining = h;
          while (run.length > 1 && remaining > 0) {
            const p = run.at(-1), q = run.at(-2), step = Math.hypot(p[0] - q[0], p[1] - q[1]);
            if (step <= remaining) { run.pop(); remaining -= step; continue; }
            const t = remaining / step;
            run[run.length - 1] = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
            remaining = 0;
          }
        }
      }
      // The shaft's pieces and the head as one path: they fill once where they overlap or meet
      // (nonzero), with no seam between neighbors and no darker overlap at an opacity.
      const pieces = [...runs.flatMap((run) => run.slice(1).map((q, k) => {
        const p = run[k], step = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (!(step > 1e-12)) return null;
        const u = [(q[0] - p[0]) / step, (q[1] - p[1]) / step];
        return outline([offset(p, u, 0, radius), offset(q, u, 0, radius), offset(q, u, 0, -radius), offset(p, u, 0, -radius)]);
      })), head].filter(Boolean);
      if (pieces.length) {
        primitives += pieces.length;
        result.push({ type: "path", attrs: { d: pieces.join(" "), fill, opacity: opacityAt(i) } });
      }
    }
    return { elements: result, count: primitives };
  }
  if (name === "errorbars" && chainedPath(mark.options, { root: true })) {
    // Each bar's interval refines like a Line; a cap stands across the local
    // tangent at a true end the chain maps, never at a horizon or seam cut.
    const tolerance = toleranceOf(mark, detail);
    const { sampler, projectWorld } = chainContext(mark.options, camera, width, height),
      cap = Number(mark.options.get("capSize") ?? 6) * displayScale / 2;
    let primitives = 0;
    for (let i = 0; i < count; i++) {
      if (shown && !(shown[i] > 0)) continue;
      const from = element(positions, i, 3), to = element(ends, i, 3);
      if (!from || !to) continue;
      const path = chainPolyline(from, to, pieceOptions(mark), sampler, projectWorld, tolerance, budget - primitives);
      if (path.overflow) return { overflow: true, count: primitives + 1 };
      const strokeWidth = strokeWidthAt(i);
      if (!path.paths.length || !finite(strokeWidth) || strokeWidth <= 0) continue;
      primitives += path.count;
      const stroke = colorAt(i);
      if (!stroke) continue;
      result.push({ type: "path", attrs: {
        d: path.paths.map((part) => `M${part.map((point) => point.join(" ")).join(" L")}`).join(" "),
        fill: "none", stroke, "stroke-width": strokeWidth, "stroke-linecap": "round",
        "stroke-linejoin": "round", opacity: opacityAt(i) } });
      const at = chainPoint(from, to, pieceOptions(mark), sampler, projectWorld);
      for (const [t, toward] of [[0, 1e-3], [1, 1 - 1e-3]]) {
        const end = at(t), probe = at(toward);
        if (!end || !probe || end.seam !== probe.seam) continue;
        const dx = probe.point[0] - end.point[0], dy = probe.point[1] - end.point[1],
          length = Math.hypot(dx, dy);
        if (length < 1e-9) continue;
        const [x, y] = end.point, nx = -dy / length * cap, ny = dx / length * cap;
        primitives += 1;
        result.push({ type: "path", attrs: { d: `M${x - nx} ${y - ny} L${x + nx} ${y + ny}`,
          fill: "none", stroke, "stroke-width": strokeWidth, "stroke-linecap": "butt",
          opacity: opacityAt(i) } });
      }
    }
    return { elements: result, count: primitives };
  }
  if (name === "band") {
    const upper0 = await fieldValue(mark.fields.get("previous")), upper1 = await fieldValue(mark.fields.get("next"));
    for (let i = 0; i < count; i++) {
      if (shown && !(shown[i] > 0)) continue;
      const points = [element(positions,i,3),element(ends,i,3),element(upper1,i,3),element(upper0,i,3)].map((point)=>projectMark(point));
      const fill=colorAt(i);
      if(points.some((p)=>!p)||!fill)continue;
      result.push(outlinedPath(`M${points.map((p)=>p.join(" ")).join(" L")} Z`, fill, opacityAt(i), outlineAt(i),
        `M${points[0].join(" ")} L${points[1].join(" ")} M${points[3].join(" ")} L${points[2].join(" ")}`));
    }
    return {elements:result,count:result.length};
  }
  if (name === "labels") {
    const codes=await fieldValue(mark.fields.get("textCode")),rows={sizes,offsetsX,offsetsY,displayScale,opacityAt};
    for(let i=0;i<count;i++){if(shown&&!(shown[i]>0))continue;
      const at=projectMark(element(positions,i,3)),code=Math.round(Number(element(codes,i))),fill=colorAt(i);
      if(at&&fill)result.push(...labelElements(mark,rows,i,at,code,fill));
    }
    return {elements:result,count:result.length};
  }
  for (let i = 0; i < count; i++) {
      if (shown && !(shown[i] > 0)) continue;
    const from = projectMark(element(positions, i, 3), mark.positionSpace === "world");
    if (!from) continue;
    const fill = colorAt(i);
    if (!fill) continue;
    if (name === "points") {
      const size = sizeValue(mark, element(sizes, i, 3)) *
        (mark.options.get("sizeUnits") === "data"
          ? localPixelsPerDataUnit(element(positions, i, 3), mark.options, camera, width, height,
            projectMark) : 1) * displayScale;
      if (!finite(size) || size <= 0) continue;
      // A point's pixel offset (Dodge's, Swarm's) is y-up, as the shader adds it (base.js applyPixelOffset).
      const ox = Number(element(offsetsX, i) ?? 0) * displayScale,
        oy = Number(element(offsetsY, i) ?? 0) * displayScale;
      result.push(pointSymbol(mark, { symbolCodes, outlineColors, opacityAt, outlineAt }, i, [from[0] + ox, from[1] - oy], size, fill));
    } else {
      const to = projectMark(element(ends, i, 3), mark.positionSpace === "world"),
        strokeWidth = strokeWidthAt(i);
      if (!to || !finite(strokeWidth) || strokeWidth <= 0) continue;
      result.push({ type: "path", attrs: { d: `M${from[0]} ${from[1]} L${to[0]} ${to[1]}`, fill: "none", stroke: fill, "stroke-width": strokeWidth, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: opacityAt(i) } });
      if(name==="errorbars"){
        const cap=Number(mark.options.get("capSize")??6)*displayScale/2,axis=mark.options.get("uncertaintyAxis")??1;
        for(const p of [from,to])result.push({type:"path",attrs:{d:axis===1?`M${p[0]-cap} ${p[1]} L${p[0]+cap} ${p[1]}`:`M${p[0]} ${p[1]-cap} L${p[0]} ${p[1]+cap}`,fill:"none",stroke:fill,"stroke-width":strokeWidth,"stroke-linecap":"butt",opacity:opacityAt(i)}});
      }
    }
  }
  return { elements: result, count: result.length };
}
