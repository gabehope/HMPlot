// @ts-check
import {
  angularFactor, inverseLatitude, inverseLongitude, longitudeOrigin, MERCATOR_LIMIT, projectionY,
  sphericalDomain, jointProjectionOf,
} from "./coordinates.js";
import { jointForward } from "./mapProjections.js";
import { viewContextOf, coordinateView } from "./viewContext.js";

/**
 * Frame a 2D map on a longitude/latitude box [west, south, east, north] (degrees): VectorTile's
 * tiles, and GeoJSON's features (TODO 134.24: a city's districts were a speck in a world map).
 * Returns false while the plot's controls or size are not ready (the caller retries on the next
 * frame), true once fitted or when there is nothing to fit: not a map, a nested map (its parent
 * frames it), or a plot whose viewport the caller gave.
 * @param {any} options the mark's options (it reads the plot's projection through them)
 * @param {any} controls the plot's navigation controls (setViewport)
 * @param {{ width: number, height: number }} rect the plot area in CSS pixels
 * @param {number[]} box [west, south, east, north]
 */
export function fitMapViewport(options, controls, rect, [west, south, east, north]) {
  if (!controls?.setViewport) return false;
  const nested = ["coordinates", "projection"].some((key) => options.owner?.(key)?.frameDefinition?.parent != null);
  if (options.get("coordinates") !== "spherical" || nested || viewContextOf(options)?.explicitViewport) return true;
  const radians = Math.PI / 180;
  const kind = coordinateView(options) === "chart" ? "equirectangular" : options.get("projection");
  if (kind === "orthographic") {
    const middle = ((south + north) / 2) * radians;
    const half = Math.max(((east - west) / 2) * Math.cos(middle), (north - south) / 2) * radians;
    /** @type {[number, number]} */
    const center = [inverseLongitude(((west + east) / 2) * radians, options), inverseLatitude(middle, options)];
    const scale = 1 / Math.sin(Math.min(Math.PI / 2, Math.max(1e-9, half)));
    controls.setViewport({ x: 0.5, y: 0.5, zoom: scale, zoomX: scale, zoomY: scale, center });
    return true;
  }
  if (!(rect.width > 1 && rect.height > 1)) return false;
  const domain = sphericalDomain(options), spanX = domain.x[1] - domain.x[0], spanY = domain.y[1] - domain.y[0];
  const origin = longitudeOrigin(options) * angularFactor(options);
  const y = (/** @type {number} */ latitude) => projectionY(Math.max(-MERCATOR_LIMIT, Math.min(MERCATOR_LIMIT, latitude * radians)), kind);
  let x0 = west * radians - origin, x1 = east * radians - origin, y0 = y(south), y1 = y(north);
  const joint = jointProjectionOf(options);
  if (joint) {
    // A joint projection's box: its outline is curved, so fit a lattice of the box's points.
    x0 = y0 = Infinity; x1 = y1 = -Infinity;
    for (let i = 0; i <= 8; i++)
      for (let j = 0; j <= 8; j++) {
        const lon = (west + (east - west) * i / 8) * radians - origin, lat = (south + (north - south) * j / 8) * radians;
        const p = jointForward(joint.name, lon - joint.center, lat, joint.params, { center: joint.center });
        if (!p) continue;
        x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
      }
    if (!Number.isFinite(x0)) return true;
  }
  const scale = Math.min(rect.width / spanX, rect.height / spanY);
  const factor = Math.min(rect.width / (scale * Math.max(1e-12, x1 - x0)), rect.height / (scale * Math.max(1e-12, y1 - y0)));
  const center = ((x0 + x1) / 2 - domain.x[0]) / spanX;
  controls.setViewport({ x: joint ? center : center - Math.floor(center), y: ((y0 + y1) / 2 - domain.y[0]) / spanY,
    zoom: factor, zoomX: factor, zoomY: factor });
  return true;
}

/**
 * The [west, south, east, north] box (degrees) of GeoJSON features' coordinates, padded by a
 * twentieth of its span on each side; null without coordinates. A box that already covers most
 * of the world is the world (a world map is left as it is).
 * @param {any[]} features
 * @returns {number[] | null}
 */
export function featureBounds(features) {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  /** @param {any} c */
  const visit = (c) => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number") {
      const [lon, lat] = c;
      if (Number.isFinite(lon) && Number.isFinite(lat)) {
        west = Math.min(west, lon); east = Math.max(east, lon); south = Math.min(south, lat); north = Math.max(north, lat);
      }
      return;
    }
    for (const item of c) visit(item);
  };
  /** @param {any} geometry */
  const walk = (geometry) => {
    if (!geometry) return;
    if (geometry.type === "GeometryCollection") for (const g of geometry.geometries ?? []) walk(g);
    else visit(geometry.coordinates);
  };
  for (const feature of features ?? []) walk(feature?.geometry ?? feature);
  if (!Number.isFinite(west)) return null;
  if (east - west > 300 || north - south > 150) return null;
  const padX = Math.max((east - west) / 20, 1e-4), padY = Math.max((north - south) / 20, 1e-4);
  return [west - padX, Math.max(-89.9, south - padY), east + padX, Math.min(89.9, north + padY)];
}
