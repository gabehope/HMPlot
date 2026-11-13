import { Matrix4, Vector3, Euler } from "three/webgpu";
import { isDegenerateFrameError, tryFrameDimensionMapping } from "./frameMapping.js";
import { buildCoordinateOperations, applyCoordinateOperations,
  inverseCoordinateOperations } from "./coordinateOperations.js";
import { spherical, orthographicBasis, longitudeRadians,
  latitudeRadians } from "./coordinates.js";
import { coordinateView } from "./viewContext.js";

export function placedFrame(options) {
  for (let node = options; node; node = node.defaults)
    if (node.frameDefinition?.placement) return node.frameDefinition;
  return null;
}

export function framePoint(options, position, context = null) {
  try {
    return applyCoordinateOperations(position,
      context?.operations ?? framePointOperations(options, context)) ?? [NaN, NaN, NaN];
  } catch (error) {
    if (isDegenerateFrameError(error)) return [NaN, NaN, NaN];
    throw error;
  }
}

/** Capture the operation list once for an export or pick; option values remain
 * live, while camera-dependent placement matrices use this pass's camera. */
export function framePointOperations(options, context = null) {
  return buildCoordinateOperations(options, {
    matrixFor: context ? definition => resolvePlacement(definition,
      context.camera, context.width, context.height) : undefined,
  });
}

export function framePointInverse(options, position, operations = null) {
  try {
    return inverseCoordinateOperations(position, operations ?? buildCoordinateOperations(options)) ??
      [undefined, undefined, undefined];
  } catch (error) {
    if (isDegenerateFrameError(error)) return [undefined, undefined, undefined];
    throw error;
  }
}

/** Placement descriptors carry `version`; a missing version is a legacy (version 1) scene. */
export const FRAME_PLACEMENT_VERSION = 1;

export function validatePlacement(value, dimensions, parent = null) {
  if (value === "fit") {
    if (dimensions.some(d=>d.range!==undefined)) throw Error('Frame placement="fit" cannot be combined with x/y ranges: remove the ranges or the placement.');
    if (parent && parent.get("coordinates") !== "cartesian")
      throw Error('Frame placement="fit" needs a Cartesian parent: give an {anchor, size} placement instead.');
    return;
  }
  if (!value || typeof value !== "object") throw Error('Frame placement requires anchor and size, or "fit".');
  if (value.version !== undefined && value.version !== FRAME_PLACEMENT_VERSION)
    throw Error(`Frame: unsupported placement version ${JSON.stringify(value.version)}; expected ${FRAME_PLACEMENT_VERSION}.`);
  for (const key of ["anchor", "size"])
    if (!Array.isArray(value[key]) || ![2,3].includes(value[key].length) || !value[key].every(Number.isFinite))
      throw Error(`Frame placement.${key} requires two or three finite numbers.`);
  if (value.size.some(v=>v<=0)) throw Error("Frame placement.size must be positive.");
  if (dimensions.some(d=>d.range!==undefined)) throw Error("Frame placement cannot be combined with parent-coordinate ranges.");
  if (value.rotation !== undefined && (!Array.isArray(value.rotation) || value.rotation.length!==3 || !value.rotation.every(Number.isFinite)))
    throw Error("Frame placement.rotation requires three XYZ angles in degrees.");
  if (![undefined,"parent","billboard","tangent"].includes(value.orientation))
    throw Error("Frame placement.orientation must be parent, billboard or tangent.");
}

/**
 * placement="fit" (TODO 130.1): centered in the parent's domain (the data value at the middle of
 * its range, so a log, sqrt or symlog axis's visual middle), across 90% of the parent's shorter
 * side: in CSS pixels in 2D (from the camera, so a pan or zoom refits it and an export pass fits
 * its own size), in world units in 3D. Inside an anchored frame the parent's side is its share
 * of that frame's size. Null until a 2D view has a size.
 */
export function fitPlacement(parent, mode, width, height, camera) {
  const axes = mode === "2d" ? ["x", "y"] : ["x", "y", "z"];
  const range = (axis) => { const value = parent.get(axis + "range"); return Array.isArray(value) ? value : [NaN, NaN]; };
  const middle = (axis) => {
    const [r0, r1] = range(axis);
    let value;
    try { value = tryFrameDimensionMapping(parent, axis)?.inverse((r0 + r1) / 2); } catch { value = undefined; }
    return Number.isFinite(value) ? value : 0;
  };
  let sides = ["x", "y"].map((axis) => Math.abs(range(axis)[1] - range(axis)[0]));
  const outer = placedFrame(parent);
  if (outer) {
    // An anchored frame spans [-1, 1] across its size: the parent's sides are their share of it.
    const size = outer.placement === "fit" ? fitPlacement(outer.parent, mode, width, height, camera)?.size : outer.placement.size;
    if (!size) return null;
    sides = sides.map((side, i) => side / 2 * size[i]);
  } else if (mode === "2d") {
    if (!(width > 0 && height > 0) || !camera) return null;
    const e = camera.projectionMatrix.elements;
    sides = [sides[0] * width * Math.abs(e[0]) / 2, sides[1] * height * Math.abs(e[5]) / 2];
  }
  // At least 8 pixels in 2D; a 3D parent without ranges yet gets its unit cube's size.
  let side = 0.9 * Math.min(...sides);
  side = !(side > 0) ? (mode === "2d" ? 8 : 1.8) : mode === "2d" ? Math.max(8, side) : side;
  return { anchor: axes.map(middle), size: [side, side] };
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Local east/north/outward at a spherical anchor. Projected orthographic
 * tangents are orthonormalized in the screen plane so the inset stays rigid. */
export function sphericalTangentBasis(anchor, parent) {
  if (!spherical(parent)) throw Error("Tangent placement requires a spherical parent.");
  const longitude = longitudeRadians(anchor[0], parent),
    latitude = latitudeRadians(anchor[1], parent),
    sl = Math.sin(longitude), cl = Math.cos(longitude),
    sp = Math.sin(latitude), cp = Math.cos(latitude),
    east = [cl, 0, -sl],
    north = [-sp * sl, cp, -sp * cl],
    outward = [cp * sl, sp, cp * cl];
  if (![longitude, latitude].every(Number.isFinite) || Math.abs(latitude) > Math.PI / 2 + 1e-9)
    throw Error("Tangent placement requires a finite spherical anchor on the globe.");
  if (coordinateView(parent) === "3d" && parent.get("sphericalView") !== "projected")
    return { east, north, outward };
  if (parent.get("projection") !== "orthographic" || parent.get("projectionCenter") == null)
    throw Error("Projected tangent placement currently requires an orthographic spherical parent with a center.");
  const projection = orthographicBasis(parent),
    e = [dot(east, projection.east), dot(east, projection.north)],
    n = [dot(north, projection.east), dot(north, projection.north)],
    determinant = e[0] * n[1] - e[1] * n[0],
    length = Math.hypot(...e);
  // The determinant is the anchor's facing cosine. At and beyond the horizon
  // the inset is occluded, just like a spherical mark on the back hemisphere.
  // Keep an actual basis failure visible as an error while it faces the camera.
  if (determinant <= 1e-8) return null;
  if (!(length > 1e-8))
    throw Error("Tangent placement has a degenerate projected basis at this anchor.");
  return { east: [e[0] / length, e[1] / length, 0],
    north: [-e[1] / length, e[0] / length, 0], outward: [0, 0, 1] };
}

/**
 * `extent`: a curved frame's canonical half-extents [x, y] (placedExtent in
 * coordinates.js: a polar or orthographic disk's radius, a flat map's
 * half-width and half-height), which fit its `size` box uniformly, so a disk
 * stays round and a map keeps its aspect. Cartesian frames (null) span the
 * box itself, one axis each.
 */
export function placementMatrix(placement, parent, mode, visible, width, height, camera, extent = null) {
  if (placement === "fit") placement = fitPlacement(parent, mode, width, height, camera);
  if (!placement) return null;
  const orientation = placement.orientation ?? (spherical(parent) ? "tangent" : "parent");
  const basis = orientation === "tangent"
    ? sphericalTangentBasis(placement.anchor, parent) : null;
  // A finite offscreen transform keeps nested placements and render passes
  // well-defined while the tangent surface is hidden behind the globe.
  if (orientation === "tangent" && !basis)
    return new Matrix4().makeTranslation(1e20, 1e20, 1e20);
  const anchor = framePoint(parent, placement.anchor, camera ? {camera,width,height} : null);
  if (!anchor.every(Number.isFinite))
    throw Error("Frame placement anchor is outside its parent's visible coordinate surface.");
  const size = [...placement.size];
  size[2] ??= mode === "2d" ? 1 : Math.min(...size);
  let pixelScale;
  if (mode === "2d") {
    if (!(width>0 && height>0) || !camera) return null;
    pixelScale = new Vector3(Math.abs(2/camera.projectionMatrix.elements[0])/width, Math.abs(2/camera.projectionMatrix.elements[5])/height, 1);
  }
  const matrix = new Matrix4().makeTranslation(...anchor);
  const outer = placedFrame(parent),
    outerMatrix = outer ? (camera ? resolvePlacement(outer, camera, width, height) : outer.matrix) : null,
    tangent = orientation === "tangent" ? new Matrix4().makeBasis(
      new Vector3(...basis.east), new Vector3(...basis.north), new Vector3(...basis.outward)) : null;
  if (pixelScale) {
    // 2D: every rotation acts in screen pixels, then pixels scale to world. In
    // a non-square plot the world-per-pixel scale differs by axis, and a
    // rotation applied in world units would shear the inset. An outer
    // placement's pixel-space rotation is its matrix with that scale removed.
    matrix.scale(pixelScale);
    if (outerMatrix) matrix.multiply(new Matrix4().extractRotation(new Matrix4()
      .makeScale(1 / pixelScale.x, 1 / pixelScale.y, 1 / pixelScale.z).multiply(outerMatrix)));
    if (tangent) matrix.multiply(tangent);
  } else if (tangent) {
    if (outerMatrix) matrix.multiply(new Matrix4().extractRotation(outerMatrix));
    matrix.multiply(tangent);
  } else if (orientation === "billboard" && camera)
    matrix.multiply(new Matrix4().makeRotationFromQuaternion(camera.quaternion));
  else if (outerMatrix) matrix.multiply(new Matrix4().extractRotation(outerMatrix));
  const angle = (placement.rotation ?? [0,0,0]).map(v=>v*Math.PI/180);
  matrix.multiply(new Matrix4().makeRotationFromEuler(new Euler(...angle,"XYZ")));
  if (extent && extent.every((value) => Number.isFinite(value) && value > 0)) {
    const k = Math.min(size[0] / 2 / extent[0], size[1] / 2 / extent[1]);
    return matrix.scale(new Vector3(k, k, size[2] / 2));
  }
  return matrix.scale(new Vector3(...size.map(v=>v/2)));
}

/** Resolve for the rendering camera rather than using the last displayed camera.
 * This keeps export and minimap passes from changing the live placement state.
 */
export function resolvePlacement(definition, camera, width, height) {
  const mode = definition.mode?.() ?? (camera.isOrthographicCamera ? "2d" : "3d");
  return placementMatrix(definition.placement, definition.parent, mode, null, width, height, camera,
    definition.extent?.(mode) ?? null) ?? definition.matrix;
}
