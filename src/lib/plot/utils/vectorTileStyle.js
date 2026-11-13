// The VectorTile mark's basemap style (TODO 24): which part draws each tile feature, and the
// parts' default appearance. Rules read the source layer and its kind or class, for the common
// schemas: Shortbread (VersaTiles, openstreetmap.org), OpenMapTiles (MapTiler, OpenFreeMap),
// Protomaps and Mapbox Streets.
import { diagnostic } from "./diagnostics.js";
import { cssRgb } from "./axisColors.js";

/** The parts, in drawing order (later parts draw over earlier ones). */
export const PARTS = ["background", "land", "green", "water", "waterways", "buildings", "other",
  "paths", "roads", "majorRoads", "railways", "boundaries", "places"];

/** Default appearance per part (fill for areas and points, color and width for lines). */
export const DEFAULT_STYLES = {
  background: { fill: "#f2efe9" },
  land: { fill: "#e9e5dc" },
  green: { fill: "#cfe5c0" },
  water: { fill: "#aad3df" },
  waterways: { color: "#8cc1d4", width: 1.5 },
  buildings: { fill: "#d9d0c9" },
  other: { fill: "#d4d0c8", color: "#8f8a80", width: 1, size: 5 },
  paths: { color: "#fbfaf7", width: 0.8 },
  roads: { color: "#ffffff", width: 2 },
  majorRoads: { color: "#f7cf8e", width: 3 },
  railways: { color: "#9a9a9a", width: 1 },
  boundaries: { color: "#a19bb4", width: 1.2 },
  places: { color: "#3d3a36", size: 13 },
};
const STYLE_KEYS = ["fill", "color", "width", "size", "opacity", "outlineColor", "outlineWidth"];

const set = (text) => new Set(text.split(" "));
const GREEN = set("park grass garden playground forest wood meadow nature_reserve cemetery grave_yard golf_course pitch recreation_ground village_green allotments scrub heath grassland orchard vineyard national_park protected_area dog_park wetland marsh swamp bog greenfield farmland farm plant_nursery zoo");
const MAJOR = set("motorway trunk primary secondary tertiary motorway_link trunk_link primary_link secondary_link tertiary_link highway major_road medium_road");
const PATHS = set("path footway cycleway steps pedestrian track bridleway sidewalk crossing corridor platform busway");
const RAIL = set("rail light_rail subway tram narrow_gauge monorail funicular transit railway preserved miniature major_rail minor_rail service_rail");
const HIDDEN_KINDS = set("ferry aerialway cable_car gondola chair_lift drag_lift pier construction proposed");

const kindOf = (p) => String(p.kind ?? p.class ?? p.type ?? p["pmap:kind"] ?? "");
const ICE = set("glacier ice");
const tunnel = (p) => p.tunnel === true || p.tunnel === 1 || p.tunnel === "yes" || p.brunnel === "tunnel" || p.structure === "tunnel" || p.is_tunnel === true;
const area = (type) => type === "Polygon" || type === "MultiPolygon";
const line = (type) => type === "LineString" || type === "MultiLineString";
const point = (type) => type === "Point" || type === "MultiPoint";

// The zoom from which a kind draws: VersaTiles' own style for its Shortbread tiles
// (tiles.versatiles.org/assets/styles/colorful), as MapLibre applies it to deck.gl's and CARTO's
// basemaps. A tile draws the kinds its zoom reaches (TODO 35).
const from = (table) => new Map(Object.entries(table).flatMap(([zoom, kinds]) => kinds.split(" ").map((kind) => [kind, Number(zoom)])));
const ROADS_FROM = from({
  5: "motorway", 6: "trunk", 8: "primary", 9: "secondary", 10: "tertiary",
  11: "rail light_rail subway major_rail transit runway",
  12: "residential unclassified street street_limited minor busway bus_guideway",
  13: "living_street service pedestrian track footway path cycleway steps bridleway sidewalk crossing corridor platform " +
    "taxiway narrow_gauge tram funicular monorail miniature preserved minor_rail",
  14: "service_rail",
});
const LAND_FROM = from({
  7: "forest wood",
  11: "park village_green recreation_ground allotments garden miniature_golf playground golf_course pitch dog_park " +
    "bare_rock scree shingle rock grass grassland meadow wet_meadow heath scrub bog marsh string_bog swamp wetland " +
    "nature_reserve national_park protected_area",
  13: "cemetery grave_yard",
});
const WATERWAYS_FROM = from({ 9: "river canal", 14: "stream ditch drain" });
const yes = (value) => value === true || value === 1 || value === "true" || value === "yes";

const landuse = (p, type, z) => (z >= (LAND_FROM.get(kindOf(p)) ?? 10) ? (GREEN.has(kindOf(p)) ? "green" : "land") : null);
const transport = (p, type, z) => {
  const kind = kindOf(p);
  if (tunnel(p) || HIDDEN_KINDS.has(kind) || !line(type)) return null;
  // Shortbread marks ramps with `link` and sidings with `service`.
  const start = p.service !== undefined && RAIL.has(kind) ? 14 : yes(p.link) || yes(p.ramp) ? (kind === "motorway" ? 12 : 13) : ROADS_FROM.get(kind) ?? 12;
  if (z < start) return null;
  if (RAIL.has(kind) || p.rail === true) return "railways";
  if (MAJOR.has(kind)) return "majorRoads";
  if (PATHS.has(kind)) return "paths";
  return "roads";
};
// Country borders from zoom 0 and state borders from 7, on land: maritime borders (territorial
// waters) and finer levels are left out.
const boundary = (p, type, z) => {
  const level = Number(p.admin_level ?? 2);
  return yes(p.maritime) || level > 4 || z < (level <= 2 ? 0 : 7) ? null : "boundaries";
};
// A rule: the parts it can assign, the part for one feature at a tile zoom (null: hidden), and
// the lowest zoom at which it assigns any (below it the reader skips the layer).
const rule = (parts, assign, minZoom = 0) => ({ parts, assign, minZoom });
const fixed = (part, minZoom = 0) => rule(part ? [part] : [], () => part, minZoom);
const LANDUSE = rule(["land", "green"], landuse, 7);
const TRANSPORT = rule(["roads", "majorRoads", "paths", "railways"], transport, 5);
const BOUNDARIES = rule(["boundaries"], boundary);
const HIDDEN = fixed(null);
// Every point with a name: which names show, and where, is the place names' own choice
// (vectorTileLabels.js).
const PLACES = rule(["places"], (p, type) => (point(type) ? "places" : null));
const RULES = {
  // Areas.
  earth: HIDDEN, // Protomaps: land polygons, which the background already paints.
  land: LANDUSE, landuse: LANDUSE, landcover: LANDUSE, natural: LANDUSE,
  sites: rule(["land", "green"], landuse, 14),
  park: rule(["green"], (p, type, z) => (z >= 11 ? "green" : null), 11), landuse_overlay: rule(["green"], (p, type, z) => (z >= 11 ? "green" : null), 11),
  dam_polygons: fixed("land", 12), pier_polygons: fixed("land", 12), aeroway: rule(["land"], (p, type, z) => (area(type) && z >= 11 ? "land" : null), 11),
  // The open sea from zoom 0; lakes, rivers and glaciers from 4. Shortbread files glaciers
  // under water_polygons (kind "glacier"): they draw as land, not sea (the Greenland ice sheet).
  ocean: fixed("water"), water_polygons: rule(["water", "land"], (p) => (ICE.has(kindOf(p)) ? "land" : "water"), 4), lake: fixed("water", 4),
  water: rule(["water", "waterways"], (p, type, z) => (area(type) ? "water" : line(type) && z >= (WATERWAYS_FROM.get(kindOf(p)) ?? 9) ? "waterways" : null)),
  water_lines: rule(["waterways"], (p, type, z) => (z >= (WATERWAYS_FROM.get(kindOf(p)) ?? 9) ? "waterways" : null), 9),
  waterway: rule(["waterways"], (p, type, z) => (z >= (WATERWAYS_FROM.get(kindOf(p)) ?? 9) ? "waterways" : null), 9),
  // Buildings wherever a tileset has them (Shortbread from zoom 14, OpenMapTiles from 13).
  buildings: fixed("buildings"), building: fixed("buildings"),
  // Lines.
  streets: TRANSPORT, transportation: TRANSPORT, roads: TRANSPORT, road: TRANSPORT,
  transit: rule(["railways"], (p, type, z) => (line(type) && !tunnel(p) && RAIL.has(kindOf(p)) && z >= 11 ? "railways" : null), 11),
  boundaries: BOUNDARIES, boundary: BOUNDARIES, admin: BOUNDARIES,
  // Place names. Shortbread names countries and states only in boundary_labels, and countries
  // are the only names its tiles carry below zoom 4.
  place_labels: PLACES, place: PLACES, places: PLACES, place_label: PLACES, boundary_labels: PLACES,
  // Hidden by default: addresses, POIs, label-only layers and the rest of the clutter.
  ...Object.fromEntries(("addresses housenumber housenum_label pois poi poi_label public_transport " +
    "street_labels street_labels_points streets_polygons_labels street_polygons water_polygons_labels " +
    "water_lines_labels water_name water_label waterway_label transportation_name " +
    "road_label natural_label airport_label transit_stop_label motorway_junction mountain_peak " +
    "aerialways ferries bridges dam_lines pier_lines structure").split(" ").map((name) => [name, HIDDEN])),
};
const OTHER = fixed("other");

const fail = (message, property) => diagnostic("vectortile.style", `VectorTile: ${message}`, { component: "VectorTile", property });

/**
 * The parts' styles: the defaults, then a `scheme` (a theme's vectorTile section), then
 * `styles`, each { part: false | style } merged part by part: { part: style | null (hidden) }.
 */
export function resolveStyles(styles = undefined, scheme = undefined) {
  const out = {};
  for (const part of PARTS) out[part] = { ...DEFAULT_STYLES[part] };
  if (scheme != null) applyStyles(out, scheme, "scheme");
  return applyStyles(out, styles, "styles");
}
function applyStyles(out, styles, name) {
  if (styles != null && (typeof styles !== "object" || Array.isArray(styles))) throw fail(`${name} must be an object of part names.`, name);
  for (const [part, style] of Object.entries(styles ?? {})) {
    if (!PARTS.includes(part)) throw fail(`${name} has no part "${part}"; the parts are ${PARTS.join(", ")}.`, name);
    if (style === false || style === null) { out[part] = null; continue; }
    if (style === true) { out[part] ??= { ...DEFAULT_STYLES[part] }; continue; }
    if (typeof style !== "object" || Array.isArray(style)) throw fail(`${name}.${part} must be false or an object.`, name);
    for (const key of Object.keys(style))
      if (!STYLE_KEYS.includes(key)) throw fail(`${name}.${part}.${key} is not a style; use ${STYLE_KEYS.join(", ")}.`, name);
    // A part a scheme hid comes back when styles give it a style.
    out[part] = { ...(out[part] ?? DEFAULT_STYLES[part]), ...style };
  }
  return out;
}

/** `sourceLayers` checked: { layer: part | false }. */
export function resolveSourceLayers(sourceLayers = undefined) {
  if (sourceLayers == null) return {};
  if (typeof sourceLayers !== "object" || Array.isArray(sourceLayers)) throw fail("sourceLayers must map source layer names to parts.", "sourceLayers");
  const out = {};
  for (const [layer, part] of Object.entries(sourceLayers)) {
    if (part === false || part === null) out[layer] = null;
    else if (PARTS.includes(part) && part !== "background") out[layer] = part;
    else throw fail(`sourceLayers.${layer} must be a part (${PARTS.filter((name) => name !== "background").join(", ")}) or false.`, "sourceLayers");
  }
  return out;
}

const ruleFor = (layer, sourceLayers) =>
  Object.hasOwn(sourceLayers, layer) ? fixed(sourceLayers[layer]) : Object.hasOwn(RULES, layer) ? RULES[layer] : OTHER;

/**
 * Whether a source layer can draw with these styles in a tile at `zoom`: the reader skips the
 * layers that cannot (hidden by the rules, by `sourceLayers`, below the rules' zoom, or whose
 * every part is hidden). A layer `sourceLayers` assigns draws at every zoom.
 */
export function layerDrawn(layer, styles, sourceLayers, zoom = Infinity) {
  const found = ruleFor(layer, sourceLayers);
  return zoom >= found.minZoom && found.parts.some((part) => styles[part]);
}

// Line widths by zoom and kind, as web map styles draw them: a road network thins as the view
// zooms out (half the width three zooms out, at least 0.3 of it), and within a part the more
// important kinds are wider. Borders keep their width.
const SCALED = new Set(["waterways", "paths", "roads", "majorRoads", "railways"]);
const KIND_WIDTH = new Map([["motorway", 1.35], ["trunk", 1.2], ["primary", 1], ["secondary", 0.85], ["tertiary", 0.7], ["river", 1.3], ["canal", 1.1]]);
/**
 * A line's width in pixels: its part's `width` (`base`), scaled for a tile at `zoom` and, with
 * the feature's properties, for its kind (a ramp at 0.6).
 */
export function lineWidth(part, base, zoom = Infinity, properties = undefined) {
  if (!SCALED.has(part)) return base;
  const zoomFactor = Number.isFinite(zoom) ? Math.max(0.3, Math.min(1, 2 ** ((zoom - 14) / 3))) : 1;
  const kind = properties ? (properties.link === true || properties.ramp === 1 ? 0.6 : KIND_WIDTH.get(kindOf(properties)) ?? 1) : 1;
  return base * zoomFactor * kind;
}

/** The part that draws a feature of a tile at `zoom` (null: hidden; Infinity: every kind). */
export function partOf(feature, styles, sourceLayers, zoom = Infinity) {
  const properties = feature.properties ?? {}, found = ruleFor(String(properties.layerName ?? ""), sourceLayers);
  if (zoom < found.minZoom) return null;
  const part = found.assign(properties, feature.geometry?.type, zoom);
  return part && styles[part] ? part : null;
}

/** Features by part: { part: FeatureCollection }, for the parts that have any, at `zoom`. */
export function splitFeatures(collection, styles, sourceLayers, zoom = Infinity) {
  const byPart = {};
  for (const feature of collection?.features ?? []) {
    if (!feature?.geometry) continue;
    const part = partOf(feature, styles, sourceLayers, zoom);
    if (part) (byPart[part] ??= []).push(feature);
  }
  return Object.fromEntries(Object.entries(byPart).map(([part, features]) => [part, { type: "FeatureCollection", features }]));
}

// Scheme derivation (TODO 36): a theme without a vectorTile section gets a basemap from its own
// colors. The presets' sections were generated with it, then tuned.
const hex = (rgb) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
const mixRgb = (a, b, t) => a.map((value, i) => value + (b[i] - value) * t);
const luminance = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
function hueSaturation([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  if (!delta) return [0, 0];
  const hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return [(hue * 60 + 360) % 360, delta / Math.max(max, 1)];
}
// The palette color nearest a hue (degrees), among the saturated ones, else the fallback.
function nearestHue(palette, target, fallback) {
  let best = null, distance = 50;
  for (const color of palette) {
    const [hue, saturation] = hueSaturation(color);
    if (saturation < 0.2) continue;
    const d = Math.min(Math.abs(hue - target), 360 - Math.abs(hue - target));
    if (d < distance) { best = color; distance = d; }
  }
  return best ?? fallback;
}

/**
 * `color` taken `amount` of the way toward `toward` (CSS colors; hex out), or `color` unchanged when
 * either is not an rgb or hex color. State names are their places color halfway to the map's.
 */
export function mixColor(color, toward, amount) {
  const a = cssRgb(color), b = cssRgb(toward);
  return a && b ? hex(mixRgb(a, b, amount)) : color;
}

/**
 * A VectorTile scheme from a theme's colors: land from its background, water and parks from
 * its palette's blue and green, roads from the background toward its text color, major roads
 * from an orange accent, and place names in its text color.
 */
export function vectorTileScheme(theme = {}) {
  const background = cssRgb(theme.view?.background) ?? [255, 255, 255];
  const text = cssRgb(theme.typography?.color) ?? cssRgb(theme.axes?.textColor) ?? [52, 64, 84];
  const palette = (theme.palette ?? []).map(cssRgb).filter(Boolean);
  const dark = luminance(background) < 0.4;
  const blue = nearestHue(palette, 205, [74, 144, 196]), green = nearestHue(palette, 115, [96, 160, 88]);
  const accent = nearestHue(palette, 35, [232, 163, 61]), violet = nearestHue(palette, 285, mixRgb(text, [150, 110, 180], 0.5));
  const toward = (t) => mixRgb(background, text, t);
  const base = dark ? toward(0.06) : mixRgb(background, text, 0.035);
  const color = (rgb) => hex(rgb);
  return {
    background: { fill: color(base) },
    land: { fill: color(dark ? toward(0.1) : toward(0.075)) },
    green: { fill: color(mixRgb(base, green, dark ? 0.24 : 0.3)) },
    water: { fill: color(mixRgb(background, blue, dark ? 0.32 : 0.42)) },
    // Rivers and canals as lines lie over their own water areas: a shade apart, not a bright seam.
    waterways: { color: color(mixRgb(background, blue, dark ? 0.37 : 0.5)), width: 1.5 },
    buildings: { fill: color(dark ? toward(0.19) : toward(0.15)) },
    other: { fill: color(toward(0.2)), color: color(toward(0.5)), width: 1, size: 5 },
    paths: { color: color(dark ? toward(0.2) : mixRgb(base, [255, 255, 255], 0.7)), width: 0.8 },
    roads: { color: color(dark ? toward(0.3) : mixRgb(base, [255, 255, 255], 1)), width: 2 },
    majorRoads: { color: color(mixRgb(background, accent, dark ? 0.62 : 0.55)), width: 3 },
    railways: { color: color(toward(dark ? 0.42 : 0.4)), width: 1 },
    boundaries: { color: color(mixRgb(background, violet, dark ? 0.6 : 0.55)), width: 1.2 },
    places: { color: color(text), size: 13 },
  };
}

/**
 * A CSS color's alpha, 1 when it has none: "transparent", #rgba and #rrggbbaa, and the alpha of
 * rgb(), hsl(), hwb(), lab(), lch(), oklab(), oklch() and color() (a fourth comma value or the
 * value after "/", a number or a percentage). Names and other values are opaque.
 */
export function colorAlpha(value) {
  if (typeof value !== "string") return 1;
  const text = value.trim().toLowerCase();
  if (text === "transparent") return 0;
  const hex = /^#([0-9a-f]{4}|[0-9a-f]{8})$/.exec(text);
  if (hex) return hex[1].length === 4 ? parseInt(hex[1][3], 16) / 15 : parseInt(hex[1].slice(6), 16) / 255;
  const call = /^[a-z-]+\((.*)\)$/.exec(text);
  if (!call) return 1;
  const slash = call[1].split("/"), commas = call[1].split(",");
  const alpha = slash.length === 2 ? slash[1] : commas.length === 4 ? commas[3] : undefined;
  if (alpha === undefined || alpha.trim() === "none") return 1;
  const number = parseFloat(alpha);
  return Number.isFinite(number) ? (alpha.trim().endsWith("%") ? number / 100 : number) : 1;
}

/**
 * Why resolved part styles cannot draw live tiles (TODO 35), or "" when they can. A live tile
 * covers the coarser tile under it with its background, so every drawn part must be opaque
 * (opacity 1, colors without alpha), the background drawn, and the mark's own opacity 1.
 */
export function liveStyleIssue(styles, opacity = undefined) {
  const lead = "VectorTile: live tiles need opaque styles";
  const advice = "Use opaque colors, or pass live={false}.";
  if (opacity !== undefined && opacity !== null && Number(opacity) !== 1) return `${lead}, but opacity is ${opacity}. ${advice}`;
  if (!styles?.background) return `${lead} and a background: a finer tile covers the coarser one under it with it, but the background part is hidden. Show it, or pass live={false}.`;
  for (const part of PARTS) {
    const style = styles[part];
    if (!style) continue;
    if (style.opacity !== undefined && Number(style.opacity) !== 1) return `${lead}, but part "${part}" has opacity ${style.opacity}. ${advice}`;
    for (const key of ["fill", "color", "outlineColor"])
      if (colorAlpha(style[key]) < 1) return `${lead}, but part "${part}" has ${key} "${style[key]}". ${advice}`;
  }
  return "";
}
