// One tile's arrays for a live tile slot (TODO 35): decoded, split into parts and triangulated by
// geoGeometry off the main thread (workers/vectorTile.worker.js), so assigning a tile to a slot is
// only an upload. Each instance carries its part, not its color: paintTile colors a tile from the
// styles on the main thread, so a change of colors or widths prepares nothing again (TODO 63.4).
import { Color } from "three";
import { decodeTile, localPlane, tileBounds, tileKey } from "./vectorTiles.js";
import { layerDrawn, lineWidth, splitFeatures } from "./vectorTileStyle.js";
import { placeKind } from "./vectorTileLabels.js";
import { geoGeometry } from "./geoGeometry.js";
import earcut from "earcut3";

/**
 * The parts a slot draws, in order. A slot is one mark per geometry kind: its areas draw first,
 * then its lines, then its points, each in this order; place names are the VectorTile's Text.
 */
export const SLOT_PARTS = ["background", "land", "green", "water", "buildings", "other",
  "waterways", "paths", "roads", "majorRoads", "railways", "boundaries"];
const OUTLINE_COLOR = "#f4f2ed";
const PART_INDEX = new Map(SLOT_PARTS.map((part, i) => [part, i]));

// Colors as the marks take them: linear RGB (three's working space), cached per CSS value.
const linear = new Map();
// A part a style hides (its instances are prepared again without it).
const MISSING = [0.5, 0.5, 0.5];
function rgb(css) {
  let value = linear.get(css);
  if (!value) {
    const color = new Color(css);
    linear.set(css, (value = [color.r, color.g, color.b]));
  }
  return value;
}

const projectCoordinates = (value, project) => (typeof value[0] === "number" ? project(value) : value.map((item) => projectCoordinates(item, project)));
const projectGeometry = (geometry, project) => (geometry.type === "GeometryCollection"
  ? { ...geometry, geometries: geometry.geometries.map((item) => projectGeometry(item, project)) }
  : { ...geometry, coordinates: projectCoordinates(geometry.coordinates, project) });
// The local plane is linear in longitude and latitude: a box stays a box.
export const projectFeature = (feature, project) => {
  const out = { ...feature, geometry: projectGeometry(feature.geometry, project) };
  if (feature.tileClip) {
    const [x0, y0] = project(feature.tileClip.slice(0, 2)), [x1, y1] = project(feature.tileClip.slice(2));
    out.tileClip = [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
  }
  return out;
};

/**
 * A tile's slot arrays. `job`: { bytes (null: an empty tile), tile, styles (resolved),
 * sourceLayers, clip, geographic, projection, angularStep, seamLongitude, geoScale, geoOrigin,
 * origin, unitsPerMeter, extrude }. Only what the styles draw matters here (which parts show, and which have
 * outlines): their colors, widths and sizes are paintTile's. `extrude` (TODO 66.3) is set in a 3D
 * flyover only: true adds the buildings' extrusions (buildingMesh), false draws them flat; either
 * way building parts (`part`) leave the flat footprints, where their building's outline is drawn.
 * Returns { result, features, transfer }:
 * - result.faces { a, b, c, part, feature }, result.lines { start, end, part, outline, scale,
 *   feature }, result.points { position, part, feature }: positions as [x, y, z] rows in the map's
 *   units (or the local plane's), z the top flag (1) for faces and 0 otherwise; `part` each
 *   instance's index in SLOT_PARTS; a line's `outline` 1 for an area's outline, and `scale` its
 *   width over its part's (by zoom and kind, lineWidth); `feature` the index of each instance's
 *   feature in `features`;
 * - result.places { position: [x, y] rows in the plot's units, coordinates: [lon, lat] rows, text }:
 *   the named place points;
 * - result.buildings { a, b, c, feature }: the extruded buildings' triangles, corners as [x, y, z]
 *   rows with z the elevation in the plot's units (meters times unitsPerMeter); empty without
 *   `extrude`;
 * - features: the tile's features in slot order, for onclick;
 * - transfer: the result's buffers.
 */
export function tileMesh(job) {
  const { bytes, tile, styles, sourceLayers = {}, clip = true, geographic = true } = job;
  // minArea: rings under about a pixel at the tile's largest size, in a tile a finer one replaces
  // as the view zooms in (a zoom-5 ocean tile: 1,468 of its 1,922 rings).
  // A tile draws the kinds its zoom reaches (vectorTileStyle.js).
  const zoom = tile[0];
  const decoded = bytes ? decodeTile(bytes, tile, { clip, layers: (name) => layerDrawn(name, styles, sourceLayers, zoom), minArea: job.minArea ?? 0 }) : [];
  const parts = splitFeatures({ type: "FeatureCollection", features: decoded }, styles, sourceLayers, zoom);
  // Drawn flat, a building's parts would lie over its outline: they are left out.
  if (job.extrude === false && parts.buildings)
    parts.buildings = { ...parts.buildings, features: parts.buildings.features.filter((feature) => !yes(feature.properties?.part)) };
  // Where tiles are subdivided (curved meridians, the globe), neighbours cut their shared edge
  // into different pieces, and hairline gaps opened between them: such a tile reaches 1/256 of
  // its size past its edges (tiles are opaque, so the overlap does not show).
  const curved = job.angularStep !== undefined && job.angularStep < STRAIGHT;
  const [tw, ts, te, tn] = tileBounds(tile), pad = curved && !job.world ? (te - tw) / 256 : 0;
  if (pad)
    for (const feature of decoded)
      if (feature.tileClip) {
        const [x0, y0, x1, y1] = feature.tileClip;
        feature.tileClip = [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
      }
  const square = (layerName, west, south, east, north) => ({ type: "Feature", properties: { layerName, tile: tileKey(tile) },
    geometry: { type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] } });
  const EDGE = 85.0511287798066;
  if (styles.background)
    parts.background = { features: [square("background", tw - pad, Math.max(-EDGE, ts - pad), te + pad, Math.min(EDGE, tn + pad))] };
  // On the globe the world square reaches the poles, past Web Mercator's tiles: the Arctic is sea
  // and the Antarctic land.
  if (job.world) {
    if (styles.water) parts.water = { features: [square("ocean", -180, EDGE, 180, 90)] };
    if (styles.land) parts.land = { features: [square("land", -180, -90, 180, -EDGE)] };
  }
  const project = job.origin === undefined || job.origin === null ? null : localPlane(job.origin, job.unitsPerMeter ?? 1);
  const features = [], partOf = [];
  for (const part of SLOT_PARTS)
    for (const feature of parts[part]?.features ?? []) {
      features.push(project ? projectFeature(feature, project) : feature);
      partOf.push(part);
    }
  const outlines = SLOT_PARTS.some((part) => styles[part] && Number(styles[part].outlineWidth) > 0);
  const scale = geographic ? (job.geoScale ?? 1) : 1, shift = geographic ? (job.geoOrigin ?? 0) : 0;
  const partIndex = (feature) => PART_INDEX.get(partOf[feature]);
  // Extruded, building parts draw only in 3D (their outline is the footprint); in the local plane.
  const buildings = job.extrude && project ? buildingMesh(features, partOf, job.unitsPerMeter ?? 1) : NO_BUILDINGS();
  const flat = job.extrude ? features.map((feature, i) => (partOf[i] === "buildings" && yes(feature.properties?.part) ? { ...feature, geometry: null } : feature)) : features;
  if ((job.angularStep ?? 3) >= STRAIGHT && !outlines && !(job.seamLongitude ?? 0)) {
    const cap = geographic && (job.projection ?? "mercator") === "mercator" ? 85.0511287798066 : 90;
    const { faces, lines, points } = flatMesh(flat, partOf, { geographic, cap, scale, shift, zoom });
    return pack(tile, faces, lines, points, placesOf(parts, styles, project), features, buildings);
  }
  const mesh = geoGeometry({ type: "FeatureCollection", features: flat }, {
    // An eighth of the tile at most: a finer tile's edges are chords short of the curve (on the
    // globe at zoom 9 about a pixel), which neighbours cut differently, leaving hairlines.
    geographic, projection: job.projection ?? "mercator", angularStep: curved ? Math.min(job.angularStep, (te - tw) / 8) : job.angularStep ?? 3,
    polygonOutlines: outlines, seamLongitude: job.seamLongitude ?? 0, flat: true,
  });
  const position = (source, index, out, at, z = 0) => {
    out[at] = source[index * 3] * scale + shift;
    out[at + 1] = source[index * 3 + 1] * scale;
    out[at + 2] = z;
  };

  // geoGeometry emits each polygon's top (height flag 1 at every corner), its bottom and its walls,
  // for extrusion; a flat tile needs the tops only. GeoFaces reads the flag (z) to tell them apart,
  // so a top keeps z = 1 (a 2D view multiplies it by 0).
  const tops = [];
  for (let i = 0; i < mesh.faces.feature.length; i++)
    if (mesh.faces.a[i * 3 + 2] === 1 && mesh.faces.b[i * 3 + 2] === 1 && mesh.faces.c[i * 3 + 2] === 1) tops.push(i);
  const faceCount = tops.length;
  const faces = { a: new Float32Array(faceCount * 3), b: new Float32Array(faceCount * 3), c: new Float32Array(faceCount * 3),
    part: new Uint8Array(faceCount), feature: new Uint32Array(faceCount) };
  tops.forEach((i, n) => {
    position(mesh.faces.a, i, faces.a, n * 3, 1);
    position(mesh.faces.b, i, faces.b, n * 3, 1);
    position(mesh.faces.c, i, faces.c, n * 3, 1);
    const feature = mesh.faces.feature[i];
    faces.part[n] = partIndex(feature);
    faces.feature[n] = feature;
  });

  // Segments: every line feature's, and the outlines of the area parts that have one.
  const keep = [];
  for (let i = 0; i < mesh.lines.feature.length; i++) {
    const style = styles[partOf[mesh.lines.feature[i]]];
    if (!mesh.lines.outline[i] || Number(style.outlineWidth) > 0) keep.push(i);
  }
  const lines = { start: new Float32Array(keep.length * 3), end: new Float32Array(keep.length * 3), part: new Uint8Array(keep.length),
    outline: new Uint8Array(keep.length), scale: new Float32Array(keep.length), feature: new Uint32Array(keep.length) };
  keep.forEach((i, n) => {
    position(mesh.lines.start, i, lines.start, n * 3);
    position(mesh.lines.end, i, lines.end, n * 3);
    const feature = mesh.lines.feature[i], outline = mesh.lines.outline[i] > 0;
    lines.part[n] = partIndex(feature);
    lines.outline[n] = outline ? 1 : 0;
    lines.scale[n] = outline ? 1 : lineWidth(partOf[feature], 1, zoom, features[feature].properties);
    lines.feature[n] = feature;
  });

  const pointCount = mesh.points.feature.length;
  const points = { position: new Float32Array(pointCount * 3), part: new Uint8Array(pointCount), feature: mesh.points.feature };
  for (let i = 0; i < pointCount; i++) {
    position(mesh.points.position, i, points.position, i * 3);
    points.part[i] = partIndex(mesh.points.feature[i]);
  }
  return pack(tile, faces, lines, points, placesOf(parts, styles, project), features, buildings);
}

// Place names: one per named point of a kind that ever shows (the first point of a MultiPoint), in
// the plot's units, with its kind and weight (vectorTileLabels.js placeKind).
function placesOf(parts, styles, project) {
  const position = [], coordinates = [], text = [], kind = [], weight = [];
  if (styles.places)
    for (const feature of parts.places?.features ?? []) {
      const label = feature.properties?.name ?? feature.properties?.name_en;
      if (label === undefined || label === null || label === "") continue;
      const place = placeKind(feature.properties);
      if (place.kind < 0) continue;
      const point = feature.geometry.type === "MultiPoint" ? feature.geometry.coordinates[0] : feature.geometry.coordinates;
      position.push(...(project ? project(point) : point).slice(0, 2));
      coordinates.push(point[0], point[1]);
      text.push(String(label));
      kind.push(place.kind);
      weight.push(place.weight);
    }
  return { position: new Float64Array(position), coordinates: new Float64Array(coordinates), text, kind: new Int8Array(kind), weight: new Float64Array(weight) };
}

function pack(tile, faces, lines, points, places, features, buildings) {
  const result = { tile, faces, lines, points, places, buildings,
    counts: { faces: faces.feature.length, lines: lines.feature.length, points: points.feature.length, features: features.length,
      buildings: buildings.feature.length } };
  const transfer = [faces.a, faces.b, faces.c, faces.part, faces.feature, lines.start, lines.end, lines.part, lines.outline, lines.scale,
    lines.feature, points.position, points.part, points.feature, places.position, places.coordinates, places.kind, places.weight,
    buildings.a, buildings.b, buildings.c, buildings.feature].map((array) => array.buffer);
  return { result, features, transfer: [...new Set(transfer)] };
}

const yes = (value) => value === true || value === 1 || value === "true" || value === "yes";
const NO_BUILDINGS = () => ({ a: new Float32Array(0), b: new Float32Array(0), c: new Float32Array(0), feature: new Uint32Array(0) });

/** A building's height when its tags give none (or an invalid one), in meters (TODO 66.3). */
export const BUILDING_HEIGHT = 5;
/**
 * A building feature's extrusion from its tags (TODO 66.3, the VersaTiles Shortbread extension's
 * 3D buildings): { base, top } in meters above the ground, or null when it stays flat. `height` is
 * the top (BUILDING_HEIGHT when missing, negative or not a number; a valid 0 is flat), `min_height`
 * the base (0 by default, clamped to [0, top]); `hide_3d` (the outline of a building whose parts
 * are extruded instead) and a base at the top are flat.
 */
export function buildingHeights(properties) {
  const tags = properties ?? {};
  if (yes(tags.hide_3d)) return null;
  const given = (value) => typeof value === "number" || (typeof value === "string" && value.trim() !== "");
  let top = given(tags.height) ? Number(tags.height) : NaN;
  if (!Number.isFinite(top) || top < 0) top = BUILDING_HEIGHT;
  let base = given(tags.min_height) ? Number(tags.min_height) : 0;
  if (!Number.isFinite(base) || base < 0) base = 0;
  base = Math.min(base, top);
  return top > base ? { base, top } : null;
}

/**
 * The extruded buildings of a tile in the local plane (TODO 66.3): each building polygon's roof
 * (earcut, as flatMesh), its walls from its rings' edges, and its floor when it starts above the
 * ground, each clipped to the polygon's tileClip; elevations from buildingHeights times
 * `unitsPerMeter`. A building cut by the tile's edge has no wall there (its neighbour draws the
 * rest). Returns { a, b, c, feature } as tileMesh's result.buildings.
 */
export function buildingMesh(features, partOf, unitsPerMeter = 1) {
  const a = [], b = [], c = [], feature = [];
  let box = null, index = 0, low = 0, high = 0;
  const emit = (ax, ay, az, bx, by, bz, cx, cy, cz) => {
    a.push(ax, ay, az); b.push(bx, by, bz); c.push(cx, cy, cz); feature.push(index);
  };
  // A roof or floor triangle at elevation z, clipped to the box.
  const flatTriangle = (ax, ay, bx, by, cx, cy, z) => {
    let v = [[ax, ay], [bx, by], [cx, cy]];
    if (box) {
      const [x0, y0, x1, y1] = box;
      if (!(ax >= x0 && ax <= x1 && bx >= x0 && bx <= x1 && cx >= x0 && cx <= x1 && ay >= y0 && ay <= y1 && by >= y0 && by <= y1 && cy >= y0 && cy <= y1)) {
        v = clipSide(clipSide(clipSide(clipSide(v, 0, x0, true), 0, x1, false), 1, y0, true), 1, y1, false);
      }
    }
    for (let i = 1; i + 1 < v.length; i++) emit(v[0][0], v[0][1], z, v[i][0], v[i][1], z, v[i + 1][0], v[i + 1][1], z);
  };
  const open = (ring) => (ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? ring.length - 1 : ring.length);
  const polygon = (rings) => {
    if (!rings?.length || open(rings[0]) < 3) return;
    let count = 0;
    for (const ring of rings) count += ring.length;
    const data = new Float64Array(count * 2), holes = [];
    let n = 0;
    rings.forEach((ring, r) => {
      const end = open(ring);
      if (end < 3) return;
      if (r) holes.push(n);
      for (let i = 0; i < end; i++) { data[2 * n] = ring[i][0]; data[2 * n + 1] = ring[i][1]; n++; }
      // The walls: each edge from the floor to the roof, the part inside the box.
      for (let i = 0; i < end; i++) {
        const [px, py] = ring[i], [qx, qy] = ring[(i + 1) % end];
        const edge = box ? clipSegment(px, py, qx, qy, box) : [px, py, qx, qy];
        if (!edge) continue;
        const [sx, sy, ex, ey] = edge;
        emit(sx, sy, low, ex, ey, low, ex, ey, high);
        emit(sx, sy, low, ex, ey, high, sx, sy, high);
      }
    });
    const coordinates = data.subarray(0, n * 2), indices = earcut(coordinates, holes, 2);
    for (let t = 0; t < indices.length; t += 3) {
      const i = indices[t] * 2, j = indices[t + 1] * 2, k = indices[t + 2] * 2;
      flatTriangle(coordinates[i], coordinates[i + 1], coordinates[j], coordinates[j + 1], coordinates[k], coordinates[k + 1], high);
      if (low > 0) flatTriangle(coordinates[i], coordinates[i + 1], coordinates[k], coordinates[k + 1], coordinates[j], coordinates[j + 1], low);
    }
  };
  features.forEach((value, i) => {
    if (partOf[i] !== "buildings") return;
    const type = value.geometry?.type;
    if (type !== "Polygon" && type !== "MultiPolygon") return;
    const heights = buildingHeights(value.properties);
    if (!heights) return;
    index = i;
    box = value.tileClip ?? null;
    low = heights.base * unitsPerMeter;
    high = heights.top * unitsPerMeter;
    if (type === "Polygon") polygon(value.geometry.coordinates);
    else for (const rings of value.geometry.coordinates) polygon(rings);
  });
  return { a: new Float32Array(a), b: new Float32Array(b), c: new Float32Array(c), feature: new Uint32Array(feature) };
}

// An angular step at least this large subdivides nothing (vectorTileLive passes 1e9 wherever
// meridians are straight).
const STRAIGHT = 1e6;

// Sutherland-Hodgman against one side of a box: [x, y] vertices.
function clipSide(vertices, axis, bound, above) {
  const out = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    const inA = above ? a[axis] >= bound : a[axis] <= bound, inB = above ? b[axis] >= bound : b[axis] <= bound;
    if (inA) out.push(a);
    if (inA !== inB) {
      const t = (bound - a[axis]) / (b[axis] - a[axis]);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}
// Liang-Barsky: the part of segment ab inside the box, or null.
function clipSegment(ax, ay, bx, by, [x0, y0, x1, y1]) {
  const dx = bx - ax, dy = by - ay;
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return t1 > t0 ? [ax + t0 * dx, ay + t0 * dy, ax + t1 * dx, ay + t1 * dy] : null;
}

/**
 * A flat tile's slot arrays where meridians are straight (Mercator, the local plane) and no part
 * has an outline: what geoGeometry's tops, segments and points would give, written directly.
 * Each polygon triangulates whole (its holes valid) with earcut, and a triangle is clipped only
 * when it crosses the polygon's tileClip; the world's edges (longitude ±180, the map's latitude
 * cap) bound everything on a map. Lines are not subdivided: a tile's segments are straight in
 * Web Mercator. (35: a zoom-8 tile's geometry took 38 ms through geoGeometry.)
 */
function flatMesh(features, partOf, { geographic, cap, scale, shift, zoom }) {
  const world = geographic ? [-180, -cap, 180, cap] : null;
  const faceXY = [], facePart = [], faceFeature = [];
  const lineXY = [], linePart = [], lineScale = [], lineFeature = [];
  const pointXY = [], pointPart = [], pointFeature = [];
  let box = null, part = 0, index = 0, widthScale = 1;
  const emit = (ax, ay, bx, by, cx, cy) => {
    faceXY.push(ax, ay, bx, by, cx, cy);
    facePart.push(part);
    faceFeature.push(index);
  };
  const triangle = (ax, ay, bx, by, cx, cy) => {
    if (!box) return emit(ax, ay, bx, by, cx, cy);
    const [x0, y0, x1, y1] = box;
    if (ax >= x0 && ax <= x1 && bx >= x0 && bx <= x1 && cx >= x0 && cx <= x1 &&
      ay >= y0 && ay <= y1 && by >= y0 && by <= y1 && cy >= y0 && cy <= y1) return emit(ax, ay, bx, by, cx, cy);
    if ((ax < x0 && bx < x0 && cx < x0) || (ax > x1 && bx > x1 && cx > x1) ||
      (ay < y0 && by < y0 && cy < y0) || (ay > y1 && by > y1 && cy > y1)) return;
    let v = [[ax, ay], [bx, by], [cx, cy]];
    v = clipSide(v, 0, x0, true);
    v = clipSide(v, 0, x1, false);
    v = clipSide(v, 1, y0, true);
    v = clipSide(v, 1, y1, false);
    for (let i = 1; i + 1 < v.length; i++) emit(v[0][0], v[0][1], v[i][0], v[i][1], v[i + 1][0], v[i + 1][1]);
  };
  // A ring's length without its closing point, which repeats the first.
  const open = (ring) => (ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? ring.length - 1 : ring.length);
  const polygon = (rings) => {
    if (!rings?.length || open(rings[0]) < 3) return;
    let count = 0;
    for (const ring of rings) count += ring.length;
    const data = new Float64Array(count * 2), holes = [];
    let n = 0;
    rings.forEach((ring, r) => {
      const end = open(ring);
      if (end < 3) return;
      if (r) holes.push(n);
      for (let i = 0; i < end; i++) { data[2 * n] = ring[i][0]; data[2 * n + 1] = ring[i][1]; n++; }
    });
    const coordinates = data.subarray(0, n * 2);
    const indices = earcut(coordinates, holes, 2);
    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t] * 2, b = indices[t + 1] * 2, c = indices[t + 2] * 2;
      triangle(coordinates[a], coordinates[a + 1], coordinates[b], coordinates[b + 1], coordinates[c], coordinates[c + 1]);
    }
  };
  const line = (points) => {
    for (let i = 1; i < points.length; i++) {
      let [ax, ay] = points[i - 1], [bx, by] = points[i];
      if (world) {
        const piece = clipSegment(ax, ay, bx, by, world);
        if (!piece) continue;
        [ax, ay, bx, by] = piece;
      }
      lineXY.push(ax, ay, bx, by);
      linePart.push(part);
      lineScale.push(widthScale);
      lineFeature.push(index);
    }
  };
  const walk = (geometry) => {
    switch (geometry?.type) {
      case "Polygon": polygon(geometry.coordinates); break;
      case "MultiPolygon": for (const rings of geometry.coordinates) polygon(rings); break;
      case "LineString": line(geometry.coordinates); break;
      case "MultiLineString": for (const points of geometry.coordinates) line(points); break;
      case "Point": case "MultiPoint":
        for (const [x, y] of geometry.type === "Point" ? [geometry.coordinates] : geometry.coordinates) {
          if (world && Math.abs(y) > cap) continue;
          pointXY.push(x, y);
          pointPart.push(part);
          pointFeature.push(index);
        }
        break;
      case "GeometryCollection": for (const child of geometry.geometries) walk(child); break;
      default: break;
    }
  };
  features.forEach((feature, i) => {
    const clip = feature.tileClip;
    index = i;
    box = clip && world ? [Math.max(clip[0], world[0]), Math.max(clip[1], world[1]), Math.min(clip[2], world[2]), Math.min(clip[3], world[3])] : clip ?? world;
    part = PART_INDEX.get(partOf[i]);
    widthScale = lineWidth(partOf[i], 1, zoom, feature.properties);
    walk(feature.geometry);
  });

  const at = (xy, count, z) => {
    const out = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      out[3 * i] = xy[2 * i] * scale + shift;
      out[3 * i + 1] = xy[2 * i + 1] * scale;
      out[3 * i + 2] = z;
    }
    return out;
  };
  const faceCount = faceFeature.length, lineCount = lineFeature.length, pointCount = pointFeature.length;
  // The corners' xy, one triangle in six numbers, split into a, b and c; z is the top flag (1).
  const corner = (k) => {
    const out = new Float32Array(faceCount * 3);
    for (let i = 0; i < faceCount; i++) {
      out[3 * i] = faceXY[6 * i + 2 * k] * scale + shift;
      out[3 * i + 1] = faceXY[6 * i + 2 * k + 1] * scale;
      out[3 * i + 2] = 1;
    }
    return out;
  };
  const endpoints = (k) => {
    const out = new Float32Array(lineCount * 3);
    for (let i = 0; i < lineCount; i++) {
      out[3 * i] = lineXY[4 * i + 2 * k] * scale + shift;
      out[3 * i + 1] = lineXY[4 * i + 2 * k + 1] * scale;
    }
    return out;
  };
  return {
    faces: { a: corner(0), b: corner(1), c: corner(2), part: new Uint8Array(facePart), feature: new Uint32Array(faceFeature) },
    lines: { start: endpoints(0), end: endpoints(1), part: new Uint8Array(linePart), outline: new Uint8Array(lineCount), scale: new Float32Array(lineScale),
      feature: new Uint32Array(lineFeature) },
    points: { position: at(pointXY, pointCount, 0), part: new Uint8Array(pointPart), feature: new Uint32Array(pointFeature) },
  };
}

/**
 * What tileMesh leaves to the styles (TODO 63.4): colors as linear RGB rows, line widths and
 * point sizes, from each instance's part (tileMesh's result). Areas take a part's fill (else its
 * color), lines its color (else its fill; an outline its outlineColor and outlineWidth, a line its
 * width times its scale), points its fill and size. A few loops over the instances: the dense
 * Amsterdam tile (36,000 triangles) paints in about a millisecond. Returns { faces: { color },
 * lines: { color, width }, points: { color, size }, buildings: { fill } }: extruded buildings
 * (TODO 66.3) are all the buildings part's fill (a CSS color), one value for the mark.
 */
export function paintTile({ faces, lines, points }, styles) {
  const style = SLOT_PARTS.map((part) => styles[part] ?? null);
  const palette = (pick) => style.map((value) => (value ? rgb(pick(value)) : MISSING));
  const fills = palette((value) => value.fill ?? value.color), strokes = palette((value) => value.color ?? value.fill),
    outlines = palette((value) => value.outlineColor ?? OUTLINE_COLOR);
  const widths = style.map((value) => Number(value?.width ?? 1)), outlineWidths = style.map((value) => Number(value?.outlineWidth ?? 0)),
    sizes = style.map((value) => Number(value?.size ?? 5));
  const fill = (parts, colors) => {
    const out = new Float32Array(parts.length * 3);
    for (let i = 0; i < parts.length; i++) out.set(colors[parts[i]], i * 3);
    return out;
  };
  const lineColor = new Float32Array(lines.part.length * 3), width = new Float32Array(lines.part.length);
  for (let i = 0; i < lines.part.length; i++) {
    const part = lines.part[i], outline = lines.outline[i] > 0;
    lineColor.set((outline ? outlines : strokes)[part], i * 3);
    width[i] = outline ? outlineWidths[part] : widths[part] * lines.scale[i];
  }
  const size = new Float32Array(points.part.length);
  for (let i = 0; i < points.part.length; i++) size[i] = sizes[points.part[i]];
  const building = styles.buildings;
  return { faces: { color: fill(faces.part, fills) }, lines: { color: lineColor, width }, points: { color: fill(points.part, fills), size },
    buildings: { fill: building ? building.fill ?? building.color ?? "#d9d0c9" : "#d9d0c9" } };
}
