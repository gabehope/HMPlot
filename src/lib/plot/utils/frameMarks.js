import { jointProjection } from "./mapProjections.js";
import { buildCoordinateOperations, bendingOperation } from "./coordinateOperations.js";
import { kindsWith } from "./markKinds.js";
import { coordinateView } from "./viewContext.js";
/**
 * Which mark kinds can render inside nonlinear (log/sqrt parent chain) or anchored Frames. Each
 * kind declares it (its `frame` capability, utils/markKinds.js); the sets below follow.
 *
 * Marks in FRAME_SAFE map every vertex through the full frame chain on the GPU
 * (objects/base.js mapPosition), so they follow nonlinear parents and anchored
 * placement. Anchor draws nothing; connections map its positions through the same chain. Frame mappings are separable per axis, so axis-aligned rectangles, error
 * bars and flat band edges stay exact under log/sqrt parents; Area split
 * sloped intervals with the Line rule (objects/uncertainty.js, utils/curvedPaths.js).
 *
 * Text3D is a label mark (marks/text.svelte): it maps on the
 * GPU through the whole chain and follow nonlinear, anchored and nested frames.
 *
 * Surface renders in texture or mesh space outside the per-vertex frame mapping, so
 * it requires a Cartesian frame with linear parents. A 2D Heatmap or Image maps its
 * grid vertices through a bending or placed chain (WARPED_TEXTURES). GeoJSON maps
 * each vertex, but its worker triangulates and subdivides features in data space, so a
 * nonlinear chain would draw sloped edges as chords; it follows the same rule.
 */
export const FRAME_SAFE = new Set(["nested", "intervals", "patches", "flat"].flatMap((frame) => kindsWith("frame", frame)));
/** Paths refine through the complete ordered chain (utils/curvedPaths.js):
 * each piece is cut at horizons, seams and invalid radii of any Frame level. */
export const NESTED_COORDINATE_SAFE = new Set(kindsWith("frame", "nested"));
/** Bands refine along both edges and across their cross-section through the
 * same chain; error bars refine their interval and cap only its true ends.
 * Like root intervals, they are not drawn in spherical coordinates. */
export const NESTED_INTERVALS = new Set(kindsWith("frame", "intervals"));
/** A flat Rect (and so Histogram) refines as a patch between its four corners
 * where the chain bends it; a polar sector refines in its own polar source
 * space. A Prism counts when it is flat (`flat`: a 2D rectangle footprint, as
 * a Bar draws). A spherical Rect is rejected, as at a root. */
export const NESTED_PATCHES = new Set(kindsWith("frame", "patches"));
/** A 2D Heatmap or Image maps every grid vertex's source point through the
 * chain where it bends or places them (objects/heatmap.js warped()), so
 * nonlinear, anchored and nested polar/Cartesian frames work, and on an
 * orthographic ancestor it is cut at that horizon. Its own spherical frame, a
 * flat map's seam or a globe would need cuts inside the texture. */
export const WARPED_TEXTURES = new Set(kindsWith("frame", "warped"));

/** How the chain after the mark's own operation is spherical: null (not at
 * all), "horizon" (one 2D orthographic operation followed only by affine
 * ones, where a cut at its horizon is exact), "wrapping" (a repeating root
 * flat map, which needs no cut: its longitude stays unwrapped), "seam" (a
 * nested flat map followed only by affine operations, where a clip at its
 * antimeridian is exact) or "other" (a globe, or a bending operation after it). */
export function sphericalAncestor(options) {
  try {
    const later = buildCoordinateOperations(options).slice(1),
      index = later.findIndex((operation) => operation.kind.startsWith("spherical"));
    if (index < 0) return null;
    const { kind, options: source } = later[index];
    const orthographic = kind === "spherical-map2d" && source?.get("projection") === "orthographic" &&
      coordinateView(source) !== "chart";
    // A joint projection (equal-earth, albers, ...) has a curved seam: no texture cut is exact.
    if (kind === "spherical-map2d" && jointProjection(source?.get("projection")) && coordinateView(source) !== "chart")
      return "other";
    if (kind === "spherical-map2d" && !orthographic && index === later.length - 1) return "wrapping";
    const affineAfter = later.slice(index + 1).every((operation) => operation.kind === "fit" ||
      operation.kind === "matrix" || operation.kind === "scale" && !bendingOperation(operation, options));
    if (!affineAfter || kind !== "spherical-map2d") return "other";
    return orthographic ? "horizon" : "seam";
  } catch { return "other"; }
}

export function nestedCoordinateOverride(options) {
  for (let node = options; node; node = node.defaults)
    if (node.frameDefinition)
      return node.frameDefinition.parent && node.values?.has("coordinates")
        ? node.get("coordinates") : null;
  return null;
}

/** Return an error message when `kind` cannot render in this frame, else "". */
/** @param {string} kind
 * @param {{nonlinear?: boolean, anchored?: boolean, nestedCoordinates?: string|null, spherical?: string|boolean|null, flat?: boolean, affine?: boolean}} [frame] */
export function frameCompatibility(kind, { nonlinear = false, anchored = false,
  nestedCoordinates = null, spherical = false, flat = false, affine = false } = {}) {
  if (WARPED_TEXTURES.has(kind)) {
    // Its own nested spherical frame works when every ancestor is affine.
    if (spherical === "other" || nestedCoordinates === "spherical" && !affine)
      return `${kind} under a nested spherical Frame is not yet supported: its texture would need horizon and seam cuts. Use a root map, or a Cartesian or polar frame for this mark.`;
    return "";
  }
  // Intervals and flat patches refine through any chain; in a spherical frame
  // they are lon/lat pieces (interpolationOf in utils/curves.js).
  if (nestedCoordinates && !NESTED_COORDINATE_SAFE.has(kind) &&
      !(NESTED_INTERVALS.has(kind) || NESTED_PATCHES.has(kind) || kind === "Prism" && flat))
    return `${kind} inside a nested ${nestedCoordinates} Frame is not yet supported; use Points for this placement.`;
  if (!nonlinear && !anchored) return "";
  if (FRAME_SAFE.has(kind)) return "";
  const reason = kind === "GeoJSON" ? "triangulates its features in data space" : "renders in texture or mesh space";
  return `${kind} ${reason} and does not support ${anchored ? "anchored" : "nonlinear"} Frames. Use a Cartesian range frame with linear parent scales for this mark.`;
}
