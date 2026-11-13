import { viewContextOf, coordinateView } from "./viewContext.js";
// How a node sees its coordinates (the view context), beside the other coordinate readers.
export { coordinateView };
import {
  SelectType,
  ScalarType,
  FieldType,
  BooleanType,
  ColorType,
  Vector2Type,
} from "../objects/types.js";
import {
  PROJECTION_NAMES, DEFAULT_PARALLELS, jointProjection, jointBounds, jointInverse, projectionParameters,
} from "./mapProjections.js";
export const TAU = Math.PI * 2;
export const MERCATOR_LIMIT = (85.0511287798066 * Math.PI) / 180;
export const coordinateKeys = [
  "coordinates",
  "angleUnit",
  "anglePeriod",
  "baseRadius",
  "radialScale",
  "polarAxis",
  "projection",
  "projectionCenter",
  "parallels",
  "_projectionCenterLongitude",
  "_projectionCenterLatitude",
  "sphericalView",
  "globeBackground",
  "globeBackgroundVisible",
  "interpolation",
  "subdivisionTolerance",
];
export function ensureCoordinates(node) {
  const select = (key, value, options) =>
    node.ensure(key, new SelectType({ defaultValue: value, options }));
  select("coordinates", "cartesian", ["cartesian", "polar", "spherical"]);
  select("polarAxis", "Z", ["X", "Y", "Z"]);
  select("sphericalView", "globe", ["globe", "projected"]);
  select("angleUnit", "degrees", {
    Degrees: "degrees",
    Radians: "radians",
    "Data extent": "extent",
    "Custom period": "custom",
  });
  select("projection", "equirectangular", [...PROJECTION_NAMES]);
  node.ensure("projectionCenter", new FieldType({ defaultValue: [0, 0], ui: false }));
  // albers' standard parallels, in angular units (TODO 39.6).
  node.ensure("parallels", new Vector2Type({ defaultValue: [...DEFAULT_PARALLELS], ui: false }));
  node.ensure("_projectionCenterLongitude", new ScalarType({ defaultValue: 0, ui: false }));
  node.ensure("_projectionCenterLatitude", new ScalarType({ defaultValue: 0, ui: false }));
  select("interpolation", "great-circle", [
    "great-circle",
    "angular",
    "cartesian",
  ]);
  node.ensure(
    "globeBackground",
    new ColorType({ defaultValue: "#e7edf2", label: "Globe background" }),
  );
  node.ensure(
    "globeBackgroundVisible",
    new BooleanType({ defaultValue: false, label: "Show globe background" }),
  );
  for (const [key, value, min] of [
    ["anglePeriod", 360, Number.EPSILON],
    ["baseRadius", 1, 0],
    ["radialScale", 1, 0],
    ["subdivisionTolerance", 0.5, 0.01],
  ])
    node.ensure(
      key,
      new ScalarType({
        defaultValue: value,
        min,
        transform: (v) => {
          if (!Number.isFinite(Number(v)) || Number(v) < min)
            throw Error(`${key} must be finite and at least ${min}.`);
          return Number(v);
        },
      }),
    );
}
export const spherical = (options) =>
  options?.get?.("coordinates") === "spherical";
export const polar = (options) => options?.get?.("coordinates") === "polar";
/** Keep coordinate-mode radius defaults local to the owning Plot or Frame.
 * A generated value follows mode changes, including settings-pane edits;
 * explicitly edited radii remain owned by the user. */
export function installCoordinateModeDefaults(options) {
  let generated = null, writing = false;
  const sync = () => {
    const mode = options.get("coordinates"),
      ownsMode = !options.frameDefinition?.parent || !!options.values?.has("coordinates"),
      desired = !ownsMode ? null : mode === "polar" ? 0 : mode === "spherical" ? 1 : null;
    if (generated && options.get("baseRadius") !== generated.value)
      generated = null;
    if (options.values?.has("baseRadius") && !generated) return;
    writing = true;
    try {
      if (desired === null || options.get("baseRadius") === desired && !generated) {
        if (generated) options.clear("baseRadius");
        generated = null;
      } else {
        options.set("baseRadius", desired);
        generated = { value: desired };
      }
    } finally { writing = false; }
  };
  const stopRadius = options.on(() => { if (!writing) generated = null; }, "baseRadius");
  const stopMode = options.on(sync, "coordinates");
  sync();
  return () => { stopRadius(); stopMode(); };
}
const option = (options, key, fallback) => options?.get?.(key) ?? options?.[key] ?? fallback;
export function angularPeriod(options) {
  const unit = option(options, "angleUnit", "degrees");
  if (unit === "radians") return TAU;
  if (unit === "custom") return option(options, "anglePeriod", 360);
  if (unit === "extent") {
    const bounds = option(options, "xbounds", null);
    return Array.isArray(bounds) ? Math.abs(bounds[1] - bounds[0]) : NaN;
  }
  return 360;
}
export function longitudeOrigin(options) {
  if (option(options, "angleUnit", "degrees") !== "extent") return 0;
  const bounds = option(options, "xbounds", null);
  return Array.isArray(bounds) ? (bounds[0] + bounds[1]) / 2 : 0;
}
export const angularFactor = (options) => TAU / angularPeriod(options);
export const longitudeRadians = (value, options) => (value - longitudeOrigin(options)) * angularFactor(options);
export const latitudeRadians = (value, options) => value * angularFactor(options);
export const inverseLongitude = (value, options) => value / angularFactor(options) + longitudeOrigin(options);
export const inverseLatitude = (value, options) => value / angularFactor(options);

/** Polar's extent origin is the beginning of its own angular domain. Spherical
 * longitude keeps its centered extent origin, so these must stay separate. */
export function polarAngleRadians(value, options = {}) {
  const period = angularPeriod(options);
  if (!Number.isFinite(period) || period <= 0)
    throw Error(option(options, "angleUnit", "degrees") === "extent"
      ? "Polar extent angle units require a finite, nonconstant X domain."
      : "Polar custom angle period must be finite and positive.");
  const bounds = option(options, "xbounds", null);
  const origin = option(options, "angleUnit", "degrees") === "extent" ? bounds[0] : 0;
  return (value - origin) * TAU / period;
}

/** Source channels are angle, radius offset, axial height. The axis variants
 * are cyclic permutations of Z and therefore preserve 3D handedness. */
export function polarPoint(point, options = {}) {
  const axis = option(options, "polarAxis", "Z");
  if (!["X", "Y", "Z"].includes(axis))
    throw Error("Polar axis must be X, Y or Z.");
  const angle = polarAngleRadians(point[0], options);
  const radius = option(options, "baseRadius", 0) +
    option(options, "radialScale", 1) * (point[1] ?? 0);
  const height = point[2] ?? 0;
  if (![angle, radius, height].every(Number.isFinite) || radius < 0)
    return null;
  const x = radius * Math.cos(angle), y = radius * Math.sin(angle);
  return axis === "X" ? [height, x, y] : axis === "Y" ? [y, height, x] : [x, y, height];
}

/** A zero radius has no geometric angle; callers with source identity must
 * prefer that retained angle instead of assigning a fabricated inverse. */
export function inversePolarPoint(point, options = {}) {
  const axis = option(options, "polarAxis", "Z");
  if (!["X", "Y", "Z"].includes(axis))
    throw Error("Polar axis must be X, Y or Z.");
  const [x, y, rawHeight] = axis === "X"
    ? [point[1], point[2], point[0]]
    : axis === "Y" ? [point[2], point[0], point[1]] : point;
  const height = rawHeight ?? 0;
  if (![x, y, height].every(Number.isFinite)) return null;
  const radius = Math.hypot(x, y), scale = option(options, "radialScale", 1);
  const period = angularPeriod(options);
  if (!Number.isFinite(period) || period <= 0) polarAngleRadians(0, options);
  const bounds = option(options, "xbounds", null);
  const origin = option(options, "angleUnit", "degrees") === "extent" ? bounds[0] : 0;
  return [radius === 0 ? undefined : Math.atan2(y, x) * period / TAU + origin,
    scale === 0 ? undefined : (radius - option(options, "baseRadius", 0)) / scale,
    height];
}
export const wrapLongitude = (x) =>
  ((((x + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

/** Keep a globe center in one turn of its owning angular units. Interactive
 * drags may clamp latitude at a pole; programmatic state rejects it instead. */
export function normalizeProjectionCenter(center, options = {}, { clampLatitude = false } = {}) {
  if (!Array.isArray(center) || center.length !== 2 || !center.every(Number.isFinite))
    throw Error("Orthographic projectionCenter requires two finite angular values.");
  const period = angularPeriod(options);
  if (!Number.isFinite(period) || period <= 0)
    throw Error("Orthographic projectionCenter requires a finite positive angular period.");
  const origin = longitudeOrigin(options), quarter = period / 4;
  if (!clampLatitude && Math.abs(center[1]) > quarter + 1e-9)
    throw Error("Orthographic projectionCenter latitude must lie between the poles.");
  const longitude = origin + (((center[0] - origin + period / 2) % period + period) % period) - period / 2;
  return [longitude, Math.max(-quarter, Math.min(quarter, center[1]))];
}

/** East, north and outward unit vectors for a north-up orthographic view.
 * Longitude remains the chosen meridian at a pole, making the limiting basis
 * deterministic and preventing a roll when the center reaches latitude 90°. */
export function orthographicBasis(options = {}) {
  const center = normalizeProjectionCenter(option(options, "projectionCenter", [0, 0]), options);
  const longitude = longitudeRadians(center[0], options);
  const latitude = latitudeRadians(center[1], options);
  const sl = Math.sin(longitude), cl = Math.cos(longitude),
    sp = Math.sin(latitude), cp = Math.cos(latitude);
  return {
    east: [cl, 0, -sl],
    north: [-sp * sl, cp, -sp * cl],
    outward: [cp * sl, sp, cp * cl],
  };
}

/** Rotate the north-up center by a drag measured in projected world units: the horizontal
 * part turns longitude and the vertical part latitude, each by its arc length over the radius,
 * and latitude stops at the poles (so the view never rolls or flips over a pole). The two parts
 * are independent, so a little vertical jitter in a horizontal drag moves the center by that
 * jitter only. (A drag along one great circle, stopped at its latitude extremum, stalled and
 * even reversed near a pole when a nearly horizontal drag tilted poleward.) */
export function draggedProjectionCenter(center, worldX, worldY, radius, options = {}) {
  if (![worldX, worldY, radius].every(Number.isFinite) || radius <= 0)
    throw Error("Orthographic drag requires finite displacement and positive radius.");
  const normalized = normalizeProjectionCenter(center, options);
  if (worldX === 0 && worldY === 0) return normalized;
  const longitude = longitudeRadians(normalized[0], options) - worldX / radius;
  const latitude = Math.max(-Math.PI / 2, Math.min(Math.PI / 2,
    latitudeRadians(normalized[1], options) - worldY / radius));
  return normalizeProjectionCenter([inverseLongitude(longitude, options), inverseLatitude(latitude, options)],
    options, { clampLatitude: true });
}

/** The north-up center that puts `grab` ([longitude, latitude] in the plot's angle units) at
 * `point` ([x, y] on the orthographic disk, in world units from its center), for a globe of
 * `radius`: a drag keeps the point grabbed under the pointer, and a zoom the point under it. Null
 * when none does: the point would have to turn past a pole or off the front of the globe (a
 * point near a pole cannot reach far sideways by turning longitude alone). */
export function grabbedProjectionCenter(grab, point, radius, options = {}) {
  if (!Array.isArray(grab) || !Array.isArray(point) || ![grab[0], grab[1], point[0], point[1], radius].every(Number.isFinite) || radius <= 0)
    return null;
  const longitude = longitudeRadians(grab[0], options), latitude = latitudeRadians(grab[1], options);
  const x = point[0] / radius, y = point[1] / radius, cosine = Math.cos(latitude), atPole = Math.abs(cosine) < 1e-12,
    across = atPole ? 0 : x / cosine;
  if (atPole && Math.abs(x) > 1e-9) return null;
  if (Math.abs(across) > 1 + 1e-9 || x * x + y * y > 1 + 1e-9) return null;
  // x = cos(lat) sin(lon - lon0); y = cos(lat0) sin(lat) - sin(lat0) cos(lat) cos(lon - lon0),
  // with depth >= 0. At a tilted center, BOTH longitude solutions may face the viewer.
  // Keep the solution nearest the current center so grabbing near a pole does not flip it.
  const turn = Math.asin(Math.max(-1, Math.min(1, across))), a = Math.sin(latitude),
    current = normalizeProjectionCenter(option(options, "projectionCenter", [0, 0]), options),
    currentLongitude = longitudeRadians(current[0], options), currentLatitude = latitudeRadians(current[1], options);
  let nearest = null, distance = Infinity;
  // A pole does not constrain longitude; an equatorial limb does not constrain latitude.
  for (const delta of atPole ? [longitude - currentLongitude] : [turn, Math.PI - turn]) {
    const b = cosine * Math.cos(delta), reach = Math.hypot(a, b);
    if (Math.abs(y) > reach + 1e-9) continue;
    const centerLatitude = reach < 1e-12 ? currentLatitude
      : wrapLongitude(Math.atan2(a, b) - Math.asin(Math.max(-1, Math.min(1, y / reach))));
    if (Math.abs(centerLatitude) > Math.PI / 2 + 1e-9) continue;
    const centerLongitude = longitude - delta,
      separation = wrapLongitude(centerLongitude - currentLongitude) ** 2 + (centerLatitude - currentLatitude) ** 2;
    if (separation < distance) {
      distance = separation;
      nearest = normalizeProjectionCenter([inverseLongitude(centerLongitude, options),
        inverseLatitude(centerLatitude, options)], options, { clampLatitude: true });
    }
  }
  return nearest;
}

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Project a spherical source point onto the visible, rotated hemisphere. */
export function orthographicAtCenter(point, options = {}) {
  const sphere = sphericalPoint(point, options);
  if (!sphere) return null;
  const basis = orthographicBasis(options);
  const longitude = longitudeRadians(point[0], options), latitude = latitudeRadians(point[1], options),
    direction = [Math.cos(latitude) * Math.sin(longitude), Math.sin(latitude),
      Math.cos(latitude) * Math.cos(longitude)];
  if (dot3(direction, basis.outward) < -1e-9) return null;
  return [dot3(sphere, basis.east), dot3(sphere, basis.north)];
}

/** Inverse on the front surface at the supplied radius. Outside the disk has
 * no geographic coordinate; source-owned picks should keep their source row. */
export function inverseOrthographicAtCenter(point, options = {}, radius = option(options, "baseRadius", 1)) {
  if (!Array.isArray(point) || point.length < 2 || !point.slice(0, 2).every(Number.isFinite) ||
      !Number.isFinite(radius) || radius <= 0) return null;
  const [x, y] = point, square = radius * radius - x * x - y * y;
  if (square < -1e-9) return null;
  const basis = orthographicBasis(options), depth = Math.sqrt(Math.max(0, square));
  const world = [0, 1, 2].map((index) => x * basis.east[index] +
    y * basis.north[index] + depth * basis.outward[index]);
  return [inverseLongitude(Math.atan2(world[0], world[2]), options),
    inverseLatitude(Math.asin(Math.max(-1, Math.min(1, world[1] / radius))), options),
    (radius - option(options, "baseRadius", 1)) / (option(options, "radialScale", 1) || 1)];
}
export function projectionY(latitude, kind) {
  if (kind === "mercator")
    return Math.log(Math.tan(Math.PI / 4 + latitude / 2));
  return kind === "equal-area" ? Math.sin(latitude) : latitude;
}
export function inverseY(y, kind) {
  return kind === "mercator"
    ? 2 * Math.atan(Math.exp(y)) - Math.PI / 2
    : kind === "equal-area"
      ? Math.asin(Math.max(-1, Math.min(1, y)))
      : y;
}
/**
 * The joint projection a map uses (TODO 39.5-39.6): `{name, params, center}` (center the center
 * longitude in radians relative to the angular origin), or null for a cylindrical or orthographic
 * map, a globe, or a surface's chart.
 */
export function jointProjectionOf(options) {
  if (!spherical(options) || coordinateView(options) === "chart") return null;
  if (coordinateView(options) === "3d" && option(options, "sphericalView", "globe") !== "projected") return null;
  const name = option(options, "projection", "equirectangular");
  if (!jointProjection(name)) return null;
  const factor = angularFactor(options),
    center = normalizeProjectionCenter(option(options, "projectionCenter", [0, 0]), options);
  return { name, center: (center[0] - longitudeOrigin(options)) * factor,
    params: projectionParameters(name, { parallels: option(options, "parallels", DEFAULT_PARALLELS),
      centerLatitude: center[1] * factor, factor }) };
}
export const periodicSpherical = (options) => {
  if (!spherical(options)) return false;
  // Joint projections have one curved outline: they do not repeat.
  if (jointProjectionOf(options)) return false;
  // A projected map owned by a nested Frame is one inset, even when its Plot
  // root wraps. An inherited root operation still repeats all of its marks.
  if (["coordinates", "projection"].some((key) =>
    options.owner?.(key)?.frameDefinition?.parent != null)) return false;
  return coordinateView(options) === "chart" ||
    options.get("projection") !== "orthographic";
};
export function orthographicPoint(point,options={}){
 return orthographicAtCenter(point,options);
}
export function sphericalDomain(options) {
  const kind =
      coordinateView(options) === "chart"
        ? "equirectangular"
        : options.get("projection"),
    h = kind === "mercator" ? Math.PI : kind === "equal-area" ? 1 : Math.PI / 2;
  if (jointProjection(kind)) {
    const joint = jointProjectionOf(options);
    return jointBounds(kind, joint?.params ?? null);
  }
  if(kind==='orthographic'){
    // The disk reaches the marks' radial (z) extent; with no mark mapping z (the default
    // zbounds [-1, 1], not set) every mark lies on the sphere, at z 0 (TODO 135.5). Options
    // that cannot say (a plain proxy or copy) count as not set.
    const unset=!options.isExplicit?.('zbounds');
    const z=viewContextOf(options)?.radialExtent??(unset?[0,0]:options.get('zbounds')??[0,1]),r=Math.max(1e-6,options.get('baseRadius')+options.get('radialScale')*Math.max(...z));
    return {x:[-r,r],y:[-r,r]};
  }
  return { x: [-Math.PI, Math.PI], y: [-h, h] };
}
/** A placed frame's canonical half-extents [x, y], which its placement's `size` box fits
 * uniformly: a polar disk's outer radius (in 2D and 3D: a ring placed around a planet is its
 * size across), and in 2D an orthographic disk's radius or a flat map's half-width and
 * half-height. Cartesian frames (whose scales map to [-1, 1]) and 3D globes (radius 1) return
 * null: they span the box. */
export function placedExtent(options, mode) {
  if (polar(options)) {
    const radius = Math.max(...polarDomain(options).x.map(Math.abs));
    return [radius, radius];
  }
  if (mode !== "2d") return null;
  if (spherical(options)) {
    const domain = sphericalDomain(options);
    return [Math.abs(domain.x[1]), Math.abs(domain.y[1])];
  }
  return null;
}
export function polarDomain(options) {
  const bounds = option(options, "ybounds", [-1, 1]);
  const base = option(options, "baseRadius", 0), scale = option(options, "radialScale", 1);
  const radius = Math.max(1e-6, ...bounds.map((value) => base + scale * value));
  return { x: [-radius, radius], y: [-radius, radius] };
}
export function sphericalPoint(
  point,
  options = {},
) {
  const baseRadius=option(options,'baseRadius',1),radialScale=option(options,'radialScale',1),
    l = longitudeRadians(point[0], options),
    p = latitudeRadians(point[1], options),
    r = baseRadius + (point[2] ?? 0) * radialScale;
  if (
    ![l, p, r].every(Number.isFinite) ||
    Math.abs(p) > Math.PI / 2 + 1e-9 ||
    r <= 0
  )
    return null;
  return [
    r * Math.cos(p) * Math.sin(l),
    r * Math.sin(p),
    r * Math.cos(p) * Math.cos(l),
  ];
}
export function inverseSpherical(point, options) {
  const f = angularFactor(options),
    r = Math.hypot(...point);
  return [
    inverseLongitude(Math.atan2(point[0], point[2]), options),
    inverseLatitude(Math.asin(Math.max(-1, Math.min(1, point[1] / Math.max(r, 1e-30)))), options),
    (r - options.get("baseRadius")) / (options.get("radialScale") || 1),
  ];
}
export function coordinateValue(options, world) {
  if (!spherical(options)) return null;
  if(options.get('projection')==='orthographic'&&coordinateView(options)!=='chart'&&(coordinateView(options)!=='3d'||options.get('sphericalView')==='projected'))return null;
  if (coordinateView(options) === "3d") {
    if (options.get("sphericalView") !== "projected")
      return inverseSpherical(world, options);
    const radius = options.get("baseRadius"),
      f = angularFactor(options);
    return [
      inverseLongitude(wrapLongitude(world[0] / radius), options),
      inverseLatitude(inverseY(-world[2] / radius, options.get("projection")), options),
      world[1] / (options.get("radialScale") || 1),
    ];
  }
  const joint = jointProjectionOf(options);
  if (joint) {
    const [x, y] = coordinateView(options) === "3d"
      ? [world[0] / options.get("baseRadius"), -world[2] / options.get("baseRadius")] : world;
    const result = jointInverse(joint.name, x, y, joint.params, { center: joint.center });
    return result && [inverseLongitude(wrapLongitude(result[0] + joint.center), options),
      inverseLatitude(result[1], options), undefined];
  }
  return [
    inverseLongitude(wrapLongitude(world[0]), options),
    inverseLatitude(inverseY(world[1], options.get("projection")), options),
    undefined,
  ];
}
export function validateCoordinates(options) {
  if (!spherical(options)) return;
  const period = angularPeriod(options);
  if (!Number.isFinite(period) || period <= 0)
    throw Error(options.get("angleUnit") === "extent"
      ? "Extent angle units require a finite, nonconstant X domain."
      : "Custom angle period must be finite and positive.");
  for (const a of ["x", "y"]) {
    if (
      options.get(a + "Transform") !== "linear" ||
      options
        .getChildDefaults("plot")
        ?.get("axis" + a.toUpperCase() + "Type") === "datetime"
    )
      throw Error("Spherical angular axes require linear numeric coordinates.");
  }
}
export function greatCircle(a, b, t) {
  const dot = Math.max(
      -1,
      Math.min(
        1,
        a.reduce((s, v, i) => s + v * b[i], 0),
      ),
    ),
    angle = Math.acos(dot);
  if (dot > 0.999999) {
    const q = a.map((v, i) => v + (b[i] - v) * t),
      n = Math.hypot(...q);
    return q.map((v) => v / n);
  }
  let tangent = b.map((v, i) => v - a[i] * dot),
    norm = Math.hypot(...tangent);
  if (norm < 1e-6) {
    const axis = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0],
      d = a.reduce((s, v, i) => s + v * axis[i], 0);
    tangent = axis.map((v, i) => v - a[i] * d);
    norm = Math.hypot(...tangent);
  }
  return a.map(
    (v, i) =>
      v * Math.cos(angle * t) + (tangent[i] / norm) * Math.sin(angle * t),
  );
}
