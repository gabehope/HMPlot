// @ts-check
// One validity contract for mapped positions (TODO 136.3, 136.11). The frame maps a point to
// {position, valid} (frameNodes.js framePoint, a mark's mapPosition): valid is false where a
// coordinate chain cannot map it (a log axis at or below zero, behind a globe's horizon, past a
// projection's edge) or where it is not finite (NaN, the end of a series). A mark reads valid and
// never tests the position: there is no sentinel position. An invalid primitive collapses
// (collapsed) or is cut by an interpolated valid bit.
import { float, vec3 } from "three/tsl";

/** The largest finite f32, rounded down. */
const FINITE = 3.4e38;
/** Short of framePlacement.js's offscreen translation (1e20) of a hidden tangent frame. */
const PLACED = 1e19;

/** @typedef {{position: any, valid: any}} MappedPoint A mapped position and whether it is one. */

/** A boolean node that is always true. */
export const always = () => float(1).greaterThan(0);

/** Whether every component of every point is below `limit` in magnitude (NaN fails).
 * @param {number} limit @param {any[]} points @returns {any} */
const within = (limit, points) =>
  points
    .map((/** @type {any} */ point) =>
      point.x.abs().lessThan(limit)
        .and(point.y.abs().lessThan(limit))
        .and(point.z.abs().lessThan(limit)),
    )
    .reduce((/** @type {any} */ all, /** @type {any} */ next) => all.and(next));

/**
 * Whether every component of every point is finite: not NaN or infinite. Three-component nodes.
 * @param {...any} points
 */
export function isFinitePoint(...points) {
  return within(FINITE, points);
}

/**
 * Whether gathered world positions (a connection's endpoints, coordinateArrays.js mapThroughFrame) are
 * drawable: finite (an endpoint that did not map is NaN) and not in a hidden tangent frame, which
 * framePlacement.js moves far offscreen. Three-component nodes.
 * @param {...any} points
 */
export function isPlaced(...points) {
  return within(PLACED, points);
}

/**
 * A primitive's position where `valid` (the same for all of its vertices: per row or instance),
 * else the origin: an invalid primitive collapses to a point, which draws and picks nothing.
 * @param {any} valid @param {any} position
 */
export function collapsed(valid, position) {
  return valid.select(position, vec3(0));
}
