// @ts-check
/**
 * Segments ends at the frame edge (TODO 130.1). A component of a composed start or end that is
 * a bare "@view_x_min" (and so on) on its own axis, as a rule's ends are
 * (start={[x, "@view_y_min"]}), is the edge of the frame's visible domain. In a flat Cartesian
 * frame that is not drawn in a box of its own, Segments reads it in the shader from a uniform
 * set from the camera of each draw, so the ends reach the frame's edges in the same frame as a
 * pan or zoom, and moving the view prepares nothing. Elsewhere (polar, maps, placed or ranged
 * frames, refined chains) the visible domain is the frame's bounds and the host value stands.
 */
import { Vector3 } from "three/webgpu";
import { curved } from "./curves.js";
import { cartesianMaskSupported } from "./axisMask.js";
import { placedFrame, framePointInverse } from "./framePlacement.js";
import { buildCoordinateOperations } from "./coordinateOperations.js";
import { coordinateView } from "./viewContext.js";

const EDGE = /^@view_([xy])_(min|max)$/;

/**
 * Whether `item`, component `index` of a composed vector, is a frame edge: 1 min, 2 max, else 0.
 * @param {unknown} item @param {number} index
 */
export function frameEdgeCode(item, index) {
  const match = typeof item === "string" ? EDGE.exec(item) : null;
  return match && match[1] === "xy"[index] ? (match[2] === "min" ? 1 : 2) : 0;
}

/**
 * Each end's edge codes ({start: [x, y], end: [x, y]}, 0 none, 1 min, 2 max) for a Segments'
 * start and end props, or null when no component is an edge.
 * @param {unknown} start @param {unknown} end
 */
export function frameEdgeCodes(start, end) {
  const codes = (/** @type {unknown} */ value) => (Array.isArray(value) ? [0, 1].map((i) => frameEdgeCode(value[i], i)) : [0, 0]);
  const result = { start: codes(start), end: codes(end) };
  return [...result.start, ...result.end].some(Boolean) ? result : null;
}

/** The frame (its definition) whose options a mark's options inherit. @param {any} options */
function nearestFrame(options) {
  for (let node = options; node; node = node.defaults) if (node.frameDefinition) return node.frameDefinition;
  return null;
}

/** Whether a mark with these options reads its frame edges in the shader (see above). @param {any} options */
export function frameEdgesSupported(options) {
  return coordinateView(options) === "2d" && cartesianMaskSupported(options) && !placedFrame(options) &&
    !curved(options) && !nearestFrame(options)?.spatial?.();
}

/**
 * The frame's visible domain through `camera`, in the data units its marks' positions hold
 * ([xmin, xmax, ymin, ymax]), or null without an orthographic camera: the corners of the plot
 * area (camera.userData.frameFraction, the whole view for a camera without one) mapped back
 * through the frame chain. An edge the chain cannot map back (below 0 on a sqrt axis) is NaN,
 * so that end is not drawn, as on the host.
 * @param {any} options @param {any} camera a three.js camera
 * @returns {number[] | null}
 */
export function frameEdgeData(options, camera) {
  if (!camera?.isOrthographicCamera) return null;
  const f = camera.userData?.frameFraction ?? { left: 0, right: 1, top: 0, bottom: 1 };
  const operations = /** @type {any} */ (buildCoordinateOperations(options));
  /** @param {number} u @param {number} v @returns {number[]} */
  const corner = (u, v) => {
    const world = new Vector3(2 * u - 1, 1 - 2 * v, 0).unproject(camera);
    return framePointInverse(options, [world.x, world.y, 0], operations)
      .map((/** @type {unknown} */ value) => (typeof value === "number" && Number.isFinite(value) ? value : NaN));
  };
  const a = corner(f.left, f.bottom), b = corner(f.right, f.top);
  // Each axis's two edges, the smaller first (a reversed axis); one NaN leaves the other.
  const sorted = (/** @type {number} */ p, /** @type {number} */ q) => (Number.isNaN(p) || Number.isNaN(q) ? [p, q] : [Math.min(p, q), Math.max(p, q)]);
  return [...sorted(a[0], b[0]), ...sorted(a[1], b[1])];
}

/**
 * A position with its edge components replaced by the frame's visible domain `edges` (from
 * frameEdgeData), for the host's own drawing (vector export).
 * @param {number[]} position @param {number[]} codes @param {number[]} edges
 */
export function atFrameEdges(position, codes, edges) {
  const out = [...position];
  codes.forEach((code, axis) => { if (code) out[axis] = edges[2 * axis + code - 1]; });
  return out;
}
