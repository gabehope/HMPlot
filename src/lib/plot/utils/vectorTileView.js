// Live VectorTile views (TODO 35): what the 2D camera shows, in longitude and latitude, and at
// what ground resolution; in a 3D flyover (TODO 66), an area around the camera sized by its
// height. The tiles a view selects: selectLiveTiles (vectorTiles.js).
import { angularFactor, inverseOrthographicAtCenter, inverseY, jointProjectionOf, longitudeOrigin, normalizeProjectionCenter, spherical } from "./coordinates.js";
import { jointInverse } from "./mapProjections.js";
import { axisValue, axisWorld, readAxis } from "./axes.js";
import { placedFrame } from "./framePlacement.js";
import { localPlaneInverse } from "./vectorTiles.js";
import { coordinateView } from "./viewContext.js";

const DEGREES = 180 / Math.PI;
const METERS_PER_DEGREE = 111320;
const MERCATOR_LATITUDE = 85.0511287798066;

/** Geometry settings shared by every live tile job. Joint maps cut and rebase
 * tile vertices into the same centered longitude extent as ordinary marks. */
export function tileCoordinateSettings(options) {
  const geographic = spherical(options), joint = geographic ? jointProjectionOf(options) : null;
  const factor = geographic ? angularFactor(options) : 1, origin = geographic ? longitudeOrigin(options) : 0;
  const projection = geographic ? options.get("projection") : "equirectangular";
  return {
    geographic, projection,
    angularStep: geographic && (joint || projection === "orthographic") ? 3 : 1e9,
    seamLongitude: joint ? joint.center * DEGREES : 0,
    geoScale: geographic ? 1 / (DEGREES * factor) : 1,
    geoOrigin: origin,
  };
}

/**
 * World [x, y] (the 2D camera's coordinates) to [longitude, latitude] degrees for a VectorTile
 * with these options, returning null off the map; or null where live tiles do not apply: a 3D
 * view and a surface's chart. The inverses of what fitViewport (vectorTile.svelte) and the marks
 * apply forward: a flat map's x is the longitude in radians from the angular origin; a joint
 * projection's (equal-earth, albers, ...) point comes back through jointInverse; the orthographic
 * globe's through its front surface (off the disk: null), with longitudes within 180 degrees of
 * its center so a view across the antimeridian is one box; a Cartesian plot's axes give the data,
 * which with an `origin` is the local plane. An inverse with `straight` set maps the view's box to
 * a longitude/latitude box (its corners bound it): flat maps with straight meridians, Cartesian.
 */
export function liveInverse(options, { origin = undefined, unitsPerMeter = 1 } = {}) {
  const view = coordinateView(options);
  if (view === "3d" || view === "chart") return null;
  if (spherical(options)) {
    const projection = options.get("projection");
    if (projection === "orthographic") {
      const factor = angularFactor(options) * DEGREES, radius = options.get("baseRadius") ?? 1;
      return (x, y) => {
        const point = inverseOrthographicAtCenter([x, y], options, radius);
        if (!point) return null;
        const center = normalizeProjectionCenter(options.get("projectionCenter") ?? [0, 0], options)[0] * factor;
        const longitude = point[0] * factor;
        return [center + ((((longitude - center + 180) % 360) + 360) % 360) - 180, point[1] * factor];
      };
    }
    const shift = longitudeOrigin(options) * angularFactor(options), joint = jointProjectionOf(options);
    if (joint)
      return (x, y) => {
        const point = jointInverse(joint.name, x, y, joint.params, { center: joint.center });
        return point && [(point[0] + joint.center + shift) * DEGREES, point[1] * DEGREES];
      };
    return Object.assign((x, y) => {
      const latitude = inverseY(y, projection) * DEGREES;
      return Number.isFinite(latitude) ? [(x + shift) * DEGREES, latitude] : null;
    }, { straight: true });
  }
  const plane = origin === undefined || origin === null ? null : localPlaneInverse(origin, unitsPerMeter);
  return Object.assign((x, y) => {
    const data = [axisValue(options, "x", x), axisValue(options, "y", y)];
    if (!data.every(Number.isFinite)) return null;
    return plane ? plane(data) : data;
  }, { straight: true });
}

/**
 * The view a live VectorTile loads for, from the visible world box `viewbox` ({ x: [x0, x1],
 * y: [y0, y1] }) and the canvas's CSS size: { box: [west, south, east, north], center: [lon,
 * lat], metersPerPixel }. The box comes from a 9 x 9 lattice of the view through `inverse`
 * (liveInverse), or its four corners for a `straight` inverse (TODO 63.7), clamped to Web
 * Mercator's latitudes; on a map that repeats its longitudes run past ±180. The ground resolution
 * is taken at the center, the finer of x and y. Null when no point of the view is on the map.
 */
export function liveView(inverse, viewbox, width, height) {
  const [x0, x1] = viewbox.x, [y0, y1] = viewbox.y, steps = inverse.straight ? 1 : 8;
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (let i = 0; i <= steps; i++)
    for (let j = 0; j <= steps; j++) {
      const point = inverse(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * j) / steps);
      if (!point || !point.every(Number.isFinite)) continue;
      west = Math.min(west, point[0]); east = Math.max(east, point[0]);
      south = Math.min(south, point[1]); north = Math.max(north, point[1]);
    }
  if (!Number.isFinite(west)) return null;
  south = Math.max(-MERCATOR_LATITUDE, south);
  north = Math.min(MERCATOR_LATITUDE, north);
  if (!(south < north)) return null;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const middle = inverse(cx, cy);
  const center = middle && middle.every(Number.isFinite) ? middle : [(west + east) / 2, (south + north) / 2];
  const cosine = Math.cos((Math.max(-MERCATOR_LATITUDE, Math.min(MERCATOR_LATITUDE, center[1])) * Math.PI) / 180);
  const ground = (a, b) => (a && b && [...a, ...b].every(Number.isFinite)
    ? Math.hypot((b[0] - a[0]) * cosine, b[1] - a[1]) * METERS_PER_DEGREE : NaN);
  const step = 16, perX = (x1 - x0) / Math.max(1, width), perY = (y1 - y0) / Math.max(1, height);
  const resolutions = [
    ground(inverse(cx - step * perX, cy), inverse(cx + step * perX, cy)) / (2 * step),
    ground(inverse(cx, cy - step * perY), inverse(cx, cy + step * perY)) / (2 * step),
  ].filter((value) => value > 0 && Number.isFinite(value));
  const metersPerPixel = resolutions.length ? Math.min(...resolutions) : ((east - west) * cosine * METERS_PER_DEGREE) / Math.max(1, width);
  return { box: [west, south, east, north], center, metersPerPixel };
}

/**
 * The ground under a live VectorTile in a 3D flyover (TODO 66), or null where that path does not
 * apply: a Cartesian 3D view outside placed Frames, tiles in a local plane (`origin`) laid on the
 * horizontal ground (`plane: "xz"`), and linear numeric x, y and z axes. Returns { y, lonLat,
 * metersPerUnit }: the world height of the ground (the z axis at 0, where the tiles lie), the
 * [longitude, latitude] of a world point (x, z) on it (plane="xz" puts the plane's y at world -z),
 * and the ground meters in one world unit (the finer of the x and y axes').
 */
export function flyoverGround(options, { origin = undefined, unitsPerMeter = 1, plane = "xy" } = {}) {
  if (plane !== "xz" || origin === undefined || origin === null) return null;
  if (options.get("coordinates") !== "cartesian" || coordinateView(options) !== "3d" || placedFrame(options)) return null;
  // Each axis as data = at + per * world, checked linear 1000 world units out.
  const linear = {};
  for (const axis of ["x", "y", "z"]) {
    if (readAxis(options, axis).type === "datetime") return null;
    const at = axisValue(options, axis, 0), per = axisValue(options, axis, 1) - at, far = axisValue(options, axis, 1000);
    if (![at, per, far].every(Number.isFinite) || per === 0 || Math.abs(far - (at + 1000 * per)) > 1e-6 * Math.max(1, Math.abs(far))) return null;
    linear[axis] = { at, per };
  }
  const y = axisWorld(options, "z", 0), scale = Number(unitsPerMeter);
  if (!Number.isFinite(y) || !(scale > 0)) return null;
  const inverse = localPlaneInverse(origin, scale), { x: ax, y: ay } = linear;
  return {
    y,
    lonLat: (wx, wz) => inverse([ax.at + ax.per * wx, ay.at - ay.per * wz]),
    metersPerUnit: Math.min(Math.abs(ax.per), Math.abs(ay.per)) / scale,
  };
}

// The flyover's loading area (TODO 66.0): a square of half-width FLYOVER_REACH heights, centered
// up to one height ahead of the camera along its horizontal view direction. Tuned on the Manhattan
// flyover: a camera tilted 45 degrees sees about 2.5 heights ahead before fog and the coarser
// levels take over; nearer the horizon the area ends (the overview and fog cover the rest).
const FLYOVER_REACH = 4, FLYOVER_AHEAD = 1;
// The lowest camera height (meters) the area and zoom are sized for: a camera on or under the
// ground would ask for no area and the deepest zoom.
const FLYOVER_FLOOR = 2;
// The lens the reach is tuned for: 50 degrees vertical at a 16:10 canvas.
const FLYOVER_LENS = Math.tan((25 * Math.PI) / 180) * 1.6;

/**
 * The view a live VectorTile loads for under a 3D flyover camera (TODO 66.0), as liveView's: {
 * box, center, metersPerPixel }, plus the camera's `height` above the ground (world units). A
 * bounded approximation, not the visible frustum: `camera` is { position, direction (the view
 * direction), fov (vertical degrees), zoom, aspect }, `ground` flyoverGround's, `width` and
 * `height` the canvas's CSS size. With h the camera's height above the ground (at least
 * FLYOVER_FLOOR meters):
 * - the box is a square of half-width 4 h (wider for a wider lens or canvas, narrower for a
 *   zoomed one, within a factor of 2), centered h ahead along the horizontal view direction
 *   times its share of the view (looking straight down, under the camera);
 * - the ground resolution is a top-down view's at that height: 2 h tan(fov / 2) / height, with
 *   the camera's zoom narrowing the fov, in ground meters (a world unit is ground.metersPerUnit).
 * Latitudes are clamped to Web Mercator's; longitudes may run past ±180 (columns wrap). Null for a
 * non-finite camera or an empty canvas.
 */
export function flyoverView(camera, ground, width, height) {
  const [px, py, pz] = camera.position ?? [], [dx, dy, dz] = camera.direction ?? [];
  const fov = Number(camera.fov ?? 50), zoom = Number(camera.zoom ?? 1), aspect = Number(camera.aspect ?? width / height);
  if (![px, py, pz, dx, dy, dz, fov, zoom, aspect].every(Number.isFinite) || !(width > 0) || !(height > 0) || !(zoom > 0) || !ground) return null;
  const length = Math.hypot(dx, dy, dz) || 1;
  // Clamped to a few meters and to about the Earth's size, in world units.
  const units = ground.metersPerUnit;
  const h = Math.min(4e7 / units, Math.max(FLYOVER_FLOOR / units, py - ground.y));
  const half = Math.tan(Math.max(1e-4, Math.min(179, fov)) * Math.PI / 360) / zoom;
  const lens = Math.min(2, Math.max(0.5, (half * Math.max(1, aspect)) / FLYOVER_LENS));
  const reach = FLYOVER_REACH * h * lens;
  // Ahead: the view's horizontal share (1 at the horizon, 0 straight down).
  const cx = px + (FLYOVER_AHEAD * h * dx) / length, cz = pz + (FLYOVER_AHEAD * h * dz) / length;
  const a = ground.lonLat(cx - reach, cz - reach), b = ground.lonLat(cx + reach, cz + reach), middle = ground.lonLat(cx, cz);
  if (![...a, ...b, ...middle].every(Number.isFinite)) return null;
  const west = Math.min(a[0], b[0]), east = Math.max(a[0], b[0]);
  const south = Math.max(-MERCATOR_LATITUDE, Math.min(a[1], b[1])), north = Math.min(MERCATOR_LATITUDE, Math.max(a[1], b[1]));
  if (!(south < north)) return null;
  const center = [middle[0], Math.max(-MERCATOR_LATITUDE, Math.min(MERCATOR_LATITUDE, middle[1]))];
  return { box: [west, south, east, north], center, metersPerPixel: (2 * h * half * units) / height, height: h };
}
