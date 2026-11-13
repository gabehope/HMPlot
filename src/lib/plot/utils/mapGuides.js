import { jointProjectionOf, angularFactor, longitudeOrigin } from "./coordinates.js";
import { jointForward } from "./mapProjections.js";

/** Graticule spacing in degrees (d3's examples use 10° or 15°). */
export const GRATICULE_STEP = 15;
const rounded = (value) => Number(value.toFixed(2));

/**
 * Guides for a map in a joint projection (TODO 39.5): edge axes do not fit its curved outline,
 * so it draws a graticule (meridians and parallels every GRATICULE_STEP degrees, without labels)
 * and the sphere's outline, as SVG paths in the overlay's pixels. `frame` is the visible world
 * rectangle {x, y}. Returns null for any other map; albers-usa draws neither (as d3's examples).
 * Meridians are placed relative to the map's center longitude, so one lies on the center.
 */
export function mapGuides(options, frame, width, height) {
  const joint = jointProjectionOf(options);
  if (!joint || joint.name === "albers-usa") return null;
  const factor = Math.PI / 180, sx = width / (frame.x[1] - frame.x[0]), sy = height / (frame.y[1] - frame.y[0]);
  const screen = ([x, y]) => [(x - frame.x[0]) * sx, (frame.y[1] - y) * sy];
  // λ relative to the center, unwrapped: the outline's meridians are λ = ±π exactly.
  const project = (lambda, phi) => jointForward(joint.name, lambda, phi, joint.params, { unwrapped: true });
  const path = (points) => {
    let d = "", pen = false;
    for (const point of points) {
      if (!point || !point.every(Number.isFinite)) { pen = false; continue; }
      const [x, y] = screen(point);
      d += `${pen ? "L" : "M"}${rounded(x)} ${rounded(y)}`;
      pen = true;
    }
    return d.includes("L") ? d : "";
  };
  const samples = 180;
  const meridian = (lambda, from = -90, to = 90) =>
    path(Array.from({ length: samples + 1 }, (_, i) => project(lambda, (from + (to - from) * i / samples) * factor)));
  const parallel = (phi) =>
    path(Array.from({ length: samples + 1 }, (_, i) => project(-Math.PI + 2 * Math.PI * i / samples, phi * factor)));
  const meridians = [], parallels = [];
  for (let degrees = -180 + GRATICULE_STEP; degrees < 180; degrees += GRATICULE_STEP) {
    // d3.geoGraticule: meridians stop short of the poles, except every 90°.
    const d = degrees % 90 === 0 ? meridian(degrees * factor) : meridian(degrees * factor, -90 + GRATICULE_STEP, 90 - GRATICULE_STEP);
    if (d) meridians.push({ value: degrees, d });
  }
  for (let degrees = -90 + GRATICULE_STEP; degrees < 90; degrees += GRATICULE_STEP) {
    const d = parallel(degrees);
    if (d) parallels.push({ value: degrees, d });
  }
  // The outline: the seam's two meridians and the poles (a line or a point, by projection).
  const outline = path([
    ...Array.from({ length: samples + 1 }, (_, i) => project(-Math.PI, (-90 + 180 * i / samples) * factor)),
    ...Array.from({ length: samples + 1 }, (_, i) => project(-Math.PI + 2 * Math.PI * i / samples, Math.PI / 2)),
    ...Array.from({ length: samples + 1 }, (_, i) => project(Math.PI, (90 - 180 * i / samples) * factor)),
    ...Array.from({ length: samples + 1 }, (_, i) => project(Math.PI - 2 * Math.PI * i / samples, -Math.PI / 2)),
  ]);
  const center = joint.center / angularFactor(options) + longitudeOrigin(options);
  return { meridians, parallels, outline: outline ? outline + "Z" : "", center };
}
