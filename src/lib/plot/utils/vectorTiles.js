import {bytesToBase64, base64ToBytes} from "../../encoding/base64.js";
// Vector tiles (TODO 24): Mapbox Vector Tile (MVT 2.x) decoding into GeoJSON in longitude and
// latitude degrees, tile coordinates, and the fetch of the tiles the caller names. Live tiles
// (TODO 35): the zoom and tiles a view selects (the view itself: vectorTileView.js).
import { diagnostic } from "./diagnostics.js";
import { LIMITS, limitError } from "./limits.js";

const fail = (message, details = undefined) =>
  diagnostic("vectortile.data", `VectorTile: ${message}`, { component: "VectorTile", details });
const text = new TextDecoder();

/** A protobuf reader over `bytes`, from `start` to `end`: the wire types MVT uses. */
function reader(bytes, start = 0, end = bytes.length) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = start;
  const varint = () => {
    let value = 0, scale = 1, byte;
    do {
      if (pos >= end) throw fail("the tile is not a valid vector tile (truncated varint).");
      byte = bytes[pos++];
      value += (byte & 0x7f) * scale;
      scale *= 128;
    } while (byte & 0x80);
    return value;
  };
  const length = () => {
    const size = varint();
    if (pos + size > end) throw fail("the tile is not a valid vector tile (truncated field).");
    const at = pos;
    pos += size;
    return [at, at + size];
  };
  return {
    get done() { return pos >= end; },
    // A field header: [field number, wire type].
    header() { const key = varint(); return [Math.floor(key / 8), key % 8]; },
    varint,
    length,
    string() { const [a, b] = length(); return text.decode(bytes.subarray(a, b)); },
    float() { const value = view.getFloat32(pos, true); pos += 4; return value; },
    double() { const value = view.getFloat64(pos, true); pos += 8; return value; },
    packed() {
      const [a, b] = length(), out = [];
      const inner = reader(bytes, a, b);
      while (!inner.done) out.push(inner.varint());
      return out;
    },
    skip(type) {
      if (type === 0) varint();
      else if (type === 1) pos += 8;
      else if (type === 2) length();
      else if (type === 5) pos += 4;
      else throw fail(`the tile is not a valid vector tile (wire type ${type}).`);
      if (pos > end) throw fail("the tile is not a valid vector tile (truncated field).");
    },
  };
}

const zigzag = (value) => (value % 2 === 0 ? value / 2 : -(value + 1) / 2);
// int64 values arrive as unsigned varints; above 2^63 they are negative (two's complement).
const signed64 = (value) => (value >= 2 ** 63 ? value - 2 ** 64 : value);

function readValue(bytes, [start, end]) {
  const read = reader(bytes, start, end);
  let value = null;
  while (!read.done) {
    const [field, type] = read.header();
    if (field === 1) value = read.string();
    else if (field === 2) value = read.float();
    else if (field === 3) value = read.double();
    else if (field === 4) value = signed64(read.varint());
    else if (field === 5) value = read.varint();
    else if (field === 6) value = zigzag(read.varint());
    else if (field === 7) value = read.varint() !== 0;
    else read.skip(type);
  }
  return value;
}

function readFeature(bytes, [start, end]) {
  const read = reader(bytes, start, end);
  const feature = { id: undefined, tags: [], type: 0, geometry: [] };
  while (!read.done) {
    const [field, type] = read.header();
    if (field === 1) feature.id = read.varint();
    else if (field === 2) feature.tags = read.packed();
    else if (field === 3) feature.type = read.varint();
    else if (field === 4) feature.geometry = read.packed();
    else read.skip(type);
  }
  return feature;
}

// A layer's fields are collected as byte ranges first, so a layer the caller skips is not decoded.
function readLayer(bytes, [start, end], wanted) {
  const read = reader(bytes, start, end);
  const layer = { name: "", version: 1, extent: 4096, keys: [], values: [], features: [] };
  while (!read.done) {
    const [field, type] = read.header();
    if (field === 15) layer.version = read.varint();
    else if (field === 1) layer.name = read.string();
    else if (field === 2) layer.features.push(read.length());
    else if (field === 3) layer.keys.push(read.length());
    else if (field === 4) layer.values.push(read.length());
    else if (field === 5) layer.extent = read.varint();
    else read.skip(type);
  }
  if (!wanted(layer.name)) return null;
  if (!(layer.extent > 0)) throw fail(`layer "${layer.name}" has extent ${layer.extent}.`);
  layer.keys = layer.keys.map(([a, b]) => text.decode(bytes.subarray(a, b)));
  layer.values = layer.values.map((range) => readValue(bytes, range));
  layer.features = layer.features.map((range) => readFeature(bytes, range));
  return layer;
}

/**
 * The layers of an MVT tile: [{ name, version, extent, features: [{ id, type, properties,
 * geometry }] }], geometry as parts of [x, y] tile coordinates (y down, 0..extent plus the
 * tile's buffer). Types: 1 point, 2 line, 3 polygon. `layers(name)` chooses the layers to decode
 * (default all).
 */
export function readVectorTile(data, { layers: wanted = () => true } = {}) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const read = reader(bytes), layers = [];
  while (!read.done) {
    const [field, type] = read.header();
    if (field === 3) {
      const layer = readLayer(bytes, read.length(), wanted);
      if (layer) layers.push(layer);
    } else read.skip(type);
  }
  return layers.map((layer) => ({
    name: layer.name,
    version: layer.version,
    extent: layer.extent,
    features: layer.features.map((feature) => {
      const properties = {};
      for (let i = 0; i + 1 < feature.tags.length; i += 2) {
        const key = layer.keys[feature.tags[i]], value = layer.values[feature.tags[i + 1]];
        if (key === undefined || value === undefined) throw fail(`layer "${layer.name}" has a tag outside its keys or values.`);
        properties[key] = value;
      }
      return { id: feature.id, type: feature.type, properties, geometry: geometryParts(feature.geometry, layer.name) };
    }),
  }));
}

/** MoveTo / LineTo / ClosePath commands as parts of points; a ClosePath repeats the first. */
function geometryParts(commands, name) {
  const parts = [];
  let x = 0, y = 0, part = null;
  for (let i = 0; i < commands.length;) {
    const command = commands[i++], id = command & 7, count = command >>> 3;
    if (id === 1 || id === 2) {
      if (i + 2 * count > commands.length) throw fail(`layer "${name}" has a truncated geometry.`);
      for (let n = 0; n < count; n++) {
        x += zigzag(commands[i++]);
        y += zigzag(commands[i++]);
        if (id === 1) parts.push((part = [[x, y]]));
        else if (part) part.push([x, y]);
        else throw fail(`layer "${name}" has a LineTo before a MoveTo.`);
      }
    } else if (id === 7) {
      if (part) part.push([part[0][0], part[0][1]]);
    } else throw fail(`layer "${name}" has an unknown geometry command ${id}.`);
  }
  return parts;
}

// Twice the signed area (surveyor's formula), in tile coordinates (y down): MVT 2 exterior
// rings are positive.
function ringArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) sum += (ring[j][0] - ring[i][0]) * (ring[i][1] + ring[j][1]);
  return sum;
}

// Clipping to the tile square [0, extent]: a single tile ends at its edge, and neighbouring
// tiles meet there without drawing their shared buffer twice. Lines and points are clipped here.
// Polygons are not: clipping each ring leaves holes lying on the exterior's cut edge, which no
// triangulation handles (a zoom-5 ocean tile triangulated to 9 times its area, TODO 35). They keep
// their rings and name the tile's box (`tileClip`), to which geoGeometry clips their triangles.
const at = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const touchesSquare = (ring, extent) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return x0 < extent && x1 > 0 && y0 < extent && y1 > 0;
};

// A line clipped to the square, as the pieces inside it (Liang-Barsky per segment).
function clipLine(line, extent) {
  const pieces = [];
  let piece = null;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], dx = b[0] - a[0], dy = b[1] - a[1];
    let t0 = 0, t1 = 1, keep = true;
    for (const [p, q] of [[-dx, a[0]], [dx, extent - a[0]], [-dy, a[1]], [dy, extent - a[1]]]) {
      if (p === 0) { if (q < 0) { keep = false; break; } continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) { keep = false; break; } if (r > t0) t0 = r; }
      else { if (r < t0) { keep = false; break; } if (r < t1) t1 = r; }
    }
    if (!keep) { piece = null; continue; }
    const start = t0 > 0 ? at(a, b, t0) : a, end = t1 < 1 ? at(a, b, t1) : b;
    if (!piece) pieces.push((piece = [start]));
    piece.push(end);
    if (t1 < 1) piece = null;
  }
  return pieces.filter((part) => part.length >= 2);
}

const RAD = 180 / Math.PI;
/** A tile coordinate transform: tile pixels (y down) to [longitude, latitude] degrees. */
export function tileProjection([z, x, y], extent = 4096) {
  const n = 2 ** z;
  return ([px, py]) => {
    const u = (x + px / extent) / n, v = (y + py / extent) / n;
    return [u * 360 - 180, RAD * Math.atan(Math.sinh(Math.PI * (1 - 2 * v)))];
  };
}

/** The tile's [west, south, east, north] in degrees. */
export function tileBounds(tile) {
  const project = tileProjection(checkTile(tile), 1);
  const [west, north] = project([0, 0]), [east, south] = project([1, 1]);
  return [west, south, east, north];
}

/** The [z, x, y] tile that contains [longitude, latitude] at zoom z. */
export function tileAt([longitude, latitude], z) {
  checkZoom(z);
  const n = 2 ** z, limit = 85.0511287798066;
  const phi = Math.max(-limit, Math.min(limit, latitude)) / RAD;
  const u = (((longitude + 180) % 360) + 360) % 360 / 360;
  const v = (1 - Math.asinh(Math.tan(phi)) / Math.PI) / 2;
  return [z, Math.min(n - 1, Math.floor(u * n)), Math.min(n - 1, Math.max(0, Math.floor(v * n)))];
}

const checkZoom = (z) => {
  if (!Number.isInteger(z) || z < 0 || z > 30) throw fail(`zoom must be an integer from 0 to 30, not ${JSON.stringify(z)}.`);
};
/** A validated [z, x, y]. */
export function checkTile(tile) {
  if (!Array.isArray(tile) || tile.length !== 3) throw fail(`a tile is [z, x, y], not ${JSON.stringify(tile)}.`);
  const [z, x, y] = tile;
  checkZoom(z);
  const n = 2 ** z;
  for (const [name, value] of [["x", x], ["y", y]])
    if (!Number.isInteger(value) || value < 0 || value >= n)
      throw fail(`tile ${JSON.stringify(tile)}: ${name} must be an integer from 0 to ${n - 1} at zoom ${z}.`);
  return [z, x, y];
}

const METERS_PER_DEGREE = 111320;
/**
 * A local plane around `origin` ([longitude, latitude] degrees): [lon, lat] to meters east and
 * north of it, times `unitsPerMeter`. An equirectangular plane with the origin's latitude scale
 * (as scripts/build-manhattan-buildings.py projects the flyover's buildings); within a few tens
 * of kilometers of the origin, lengths are off by well under 1%.
 */
export function localPlane(origin, unitsPerMeter = 1) {
  if (!Array.isArray(origin) || origin.length !== 2 || !origin.every(Number.isFinite) || Math.abs(origin[1]) >= 90)
    throw fail(`origin must be [longitude, latitude] in degrees, not ${JSON.stringify(origin)}.`);
  const scale = Number(unitsPerMeter);
  if (!(scale > 0) || !Number.isFinite(scale)) throw fail(`unitsPerMeter must be a positive number, not ${JSON.stringify(unitsPerMeter)}.`);
  const [lon0, lat0] = origin, y = METERS_PER_DEGREE * scale, x = y * Math.cos((lat0 * Math.PI) / 180);
  return ([lon, lat]) => [(lon - lon0) * x, (lat - lat0) * y];
}

/** The inverse of localPlane: plane coordinates back to [longitude, latitude] degrees. */
export function localPlaneInverse(origin, unitsPerMeter = 1) {
  localPlane(origin, unitsPerMeter);
  const [lon0, lat0] = origin, y = METERS_PER_DEGREE * Number(unitsPerMeter), x = y * Math.cos((lat0 * Math.PI) / 180);
  return ([px, py]) => [lon0 + px / x, lat0 + py / y];
}

/**
 * The tiles a VectorTile draws without a `url` (TODO 35): VersaTiles' OpenStreetMap tiles
 * (Shortbread schema, zoom 0 to 14, no key, every origin allowed), with the credit their data's
 * licenses ask for (OpenStreetMap: ODbL; ESA WorldCover: CC BY 4.0).
 */
export const DEFAULT_TILES = Object.freeze({
  url: "https://tiles.versatiles.org/tiles/osm/{z}/{x}/{y}",
  attribution: "© OpenStreetMap contributors · ESA WorldCover · VersaTiles",
  maxZoom: 14,
});

/** A tile's cache and slot key: "z/x/y". */
export const tileKey = ([z, x, y]) => `${z}/${x}/${y}`;

/** The most tiles one VectorTile requests (a fixed area; live mode streams the rest, TODO 35). */
export const MAX_TILES = LIMITS.vectorTiles.value;
/** Live tiles (TODO 35): the width in CSS pixels at which a tile shows its native detail. */
export const LIVE_TILE_SIZE = 512;
/** The most exact tiles one live view selects; past it, the selection goes one zoom coarser. */
export const MAX_LIVE_TILES = LIMITS.liveTiles.value;
const EQUATOR = 40075016.686;
const MERCATOR_LATITUDE = 85.0511287798066;
const clampLatitude = (latitude) => Math.max(-MERCATOR_LATITUDE, Math.min(MERCATOR_LATITUDE, latitude));

/**
 * The (fractional) zoom of a view whose ground resolution is `metersPerPixel` (per CSS pixel) at
 * `latitude` (degrees): the zoom at which Web Mercator tiles of LIVE_TILE_SIZE pixels have that
 * resolution there, as a web map's camera zoom. A live view ({ metersPerPixel, center }) works
 * as the only argument.
 */
export function viewZoom(metersPerPixel, latitude = 0) {
  if (typeof metersPerPixel === "object" && metersPerPixel) ({ metersPerPixel, center: [, latitude = 0] = [] } = metersPerPixel);
  const phi = (clampLatitude(latitude) * Math.PI) / 180;
  return Math.log2((EQUATOR * Math.cos(phi)) / (LIVE_TILE_SIZE * metersPerPixel));
}

/** How far past half-way to the next zoom a coarser level on screen stays (TODO 63.7), in zooms. */
export const ZOOM_HYSTERESIS = 0.15;
/**
 * The live zoom of a view (viewZoom's arguments): the nearest whole zoom, as deck.gl's TileLayer
 * picks it, so tiles show at 0.71 to 1.41 times LIVE_TILE_SIZE; within [minZoom, maxZoom]. Past
 * maxZoom the maxZoom tiles stretch. With `current`, the zoom on screen: zooming in, it stays until
 * the view is ZOOM_HYSTERESIS past half-way to the next (its tiles up to 1.57 times their size),
 * so a view zoom wavering around a half-way point does not switch levels back and forth. Zooming
 * out switches at half-way, as without it: holding the finer level longer would load more of its
 * tiles.
 */
export function liveZoom(metersPerPixel, latitude = 0, { minZoom = 0, maxZoom = 14, current = undefined } = {}) {
  const exact = viewZoom(metersPerPixel, latitude);
  let z = Math.round(exact);
  if (z === current + 1 && exact - current <= 0.5 + ZOOM_HYSTERESIS) z = current;
  return Math.max(minZoom, Math.min(maxZoom, Number.isFinite(z) ? z : minZoom));
}

/**
 * The tile range of `box` ([west, south, east, north] degrees) at zoom z, without listing it
 * (TODO 63.3): columns x0..x1, unwrapped (a column is x mod 2^z; a box as wide as the world takes
 * the 2^z columns centered on the center's), rows y0..y1, the center in tile units (cu, cv), and
 * `count`, the number of tiles. A box edge on a tile edge (within rounding) does not reach into
 * the next tile. `center`: [longitude, latitude], default the box's center.
 */
export function tileRange([west, south, east, north], z, center = undefined) {
  checkZoom(z);
  const n = 2 ** z;
  const u = (longitude) => ((longitude + 180) / 360) * n;
  const v = (latitude) => ((1 - Math.asinh(Math.tan((clampLatitude(latitude) * Math.PI) / 180)) / Math.PI) / 2) * n;
  const [cu, cv] = center ? [u(center[0]), v(center[1])] : [(u(west) + u(east)) / 2, (v(north) + v(south)) / 2];
  const low = (value) => Math.floor(value + 1e-9), high = (value) => Math.ceil(value - 1e-9) - 1;
  let x0 = low(u(west)), x1 = Math.max(x0, high(u(east)));
  if (!(x1 - x0 + 1 < n)) [x0, x1] = [Math.floor(cu) - Math.floor(n / 2), Math.floor(cu) - Math.floor(n / 2) + n - 1];
  const y0 = Math.min(n - 1, Math.max(0, low(v(north)))), y1 = Math.min(n - 1, Math.max(y0, high(v(south))));
  return { z, n, x0, x1, y0, y1, cu, cv, count: (x1 - x0 + 1) * (y1 - y0 + 1) };
}

// A range's tiles within columns ax0..ax1 and rows ay0..ay1, nearest its center first; ties keep
// row, then column, order.
function listRange({ z, n, cu, cv }, ax0, ax1, ay0, ay1) {
  const out = [];
  for (let y = ay0; y <= ay1; y++)
    for (let x = ax0; x <= ax1; x++) out.push({ tile: [z, ((x % n) + n) % n, y], distance: Math.hypot(x + 0.5 - cu, y + 0.5 - cv) });
  return out.sort((a, b) => a.distance - b.distance);
}

/**
 * The `limit` tiles of a range (tileRange) nearest its center, in that order. Past the limit it
 * lists a window around the center, not the range: the window doubles until its limit-th
 * nearest tile is nearer than any tile outside it (a range can hold billions of tiles).
 * @returns {[number, number, number][]}
 */
export function nearestTiles(range, limit = Infinity) {
  const { x0, x1, y0, y1, cu, cv } = range;
  if (range.count <= limit) return listRange(range, x0, x1, y0, y1).map((entry) => entry.tile);
  if (!(limit > 0)) return [];
  for (let radius = Math.ceil(Math.sqrt(limit) / 2) + 1; ; radius *= 2) {
    const ax0 = Math.max(x0, Math.floor(cu) - radius), ax1 = Math.min(x1, Math.floor(cu) + radius);
    const ay0 = Math.max(y0, Math.floor(cv) - radius), ay1 = Math.min(y1, Math.floor(cv) + radius);
    if ((ax1 - ax0 + 1) * (ay1 - ay0 + 1) < limit) continue;
    const entries = listRange(range, ax0, ax1, ay0, ay1);
    // A tile outside the window is at least this far from the center (the range's own edges
    // bound nothing); at a tie the window grows, so ties keep the full listing's order.
    const reach = Math.min(ax0 > x0 ? cu - ax0 + 0.5 : Infinity, ax1 < x1 ? ax1 + 1.5 - cu : Infinity,
      ay0 > y0 ? cv - ay0 + 0.5 : Infinity, ay1 < y1 ? ay1 + 1.5 - cv : Infinity);
    if (entries[limit - 1].distance < reach) return entries.slice(0, limit).map((entry) => entry.tile);
  }
}

/**
 * The tiles at zoom z that cover `box` ([west, south, east, north] degrees), nearest to `center`
 * ([longitude, latitude]; default the box's center) first, at most `limit` of them. On a map that
 * repeats, west may be below -180 and east above 180: columns wrap, and a box as wide as the
 * world takes each column once.
 */
export function tilesInBox(box, z, center = undefined, limit = Infinity) {
  return nearestTiles(tileRange(box, z, center), limit);
}

/**
 * A live view's selection (TODO 35): its zoom and exact tiles, nearest the center first. `view`
 * is { box, center, metersPerPixel } (vectorTileView.js liveView). Past maxTiles, one zoom
 * coarser, down to minZoom (where the nearest maxTiles are kept). Ranges are counted, not listed
 * (TODO 63.3: a 20-degree box at zoom 14 listed 830,000 tiles a level, 0.6 s, and the world at
 * zoom 14 overflowed a Map). `current`: the zoom on screen (liveZoom's hysteresis). `hold` (TODO
 * 66.0, a 3D flyover's 0.75): a level finer than `current` must fit in that share of maxTiles, so
 * a view whose tiles are at the budget's edge (a flyover's area grows with the camera's height)
 * does not switch levels back and forth; the budget itself always holds.
 */
export function selectLiveTiles(view, { minZoom = 0, maxZoom = 14, zoomBias = 0, maxTiles = MAX_LIVE_TILES, current = undefined, hold = 1 } = {}) {
  if (!Number.isFinite(zoomBias) || Math.abs(zoomBias) > 4)
    throw fail("zoomBias must be a finite number between -4 and 4; use 0 for automatic detail.");
  let z = liveZoom(view.metersPerPixel / 2 ** zoomBias, view.center[1], { minZoom, maxZoom, current });
  const budget = (zoom) => (current !== undefined && zoom > current ? Math.floor(maxTiles * hold) : maxTiles);
  let range = tileRange(view.box, z, view.center);
  while (range.count > budget(z) && z > minZoom) range = tileRange(view.box, --z, view.center);
  return { z, tiles: nearestTiles(range, maxTiles) };
}
/**
 * The tiles to load: `tile` ([z, x, y]), `tiles` (a list of them), or `bounds` ([west, south,
 * east, north] degrees) with `zoom` (every tile the box touches). At most MAX_TILES.
 */
export function resolveTiles({ tile = undefined, tiles = undefined, bounds = undefined, zoom = undefined } = {}) {
  const given = [tile, tiles, bounds].filter((value) => value !== undefined && value !== null);
  if (given.length > 1) throw fail("pass one of tile, tiles or bounds.");
  let out;
  if (tile != null) out = [checkTile(tile)];
  else if (tiles != null) {
    if (!Array.isArray(tiles)) throw fail("tiles must be a list of [z, x, y].");
    out = tiles.map(checkTile);
  } else if (bounds != null) {
    if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite))
      throw fail(`bounds must be [west, south, east, north] in degrees, not ${JSON.stringify(bounds)}.`);
    if (zoom === undefined || zoom === null) throw fail("bounds needs a zoom.");
    const [west, south, east, north] = bounds;
    if (!(west < east) || !(south < north)) throw fail("bounds must have west < east and south < north.");
    const [z, x0, y0] = tileAt([west, north], zoom), [, x1, y1] = tileAt([east, south], zoom);
    // East at exactly a tile edge does not reach into the next tile.
    const xEnd = x1 > x0 && tileBounds([z, x1, y1])[0] === east ? x1 - 1 : x1;
    const yEnd = y1 > y0 && tileBounds([z, x1, y1])[3] === south ? y1 - 1 : y1;
    const count = (xEnd - x0 + 1) * (yEnd - y0 + 1);
    if (count > MAX_TILES)
      throw limitError("vectorTiles", { what: `a box at zoom ${z}`, count, property: "bounds" });
    out = [];
    for (let y = y0; y <= yEnd; y++) for (let x = x0; x <= xEnd; x++) out.push([z, x, y]);
  } else return [];
  const unique = [...new Map(out.map((value) => [value.join("/"), value])).values()];
  if (unique.length > MAX_TILES) throw limitError("vectorTiles", { count: unique.length, property: "tiles", hint: "Name fewer tiles." });
  return unique;
}

/**
 * GeoJSON features of one decoded tile, in [longitude, latitude] degrees, each with its source
 * layer in `properties.layerName`. With `clip` (the default) geometry ends at the tile's edge:
 * the buffer MVT keeps around a tile is dropped, lines are cut into the pieces inside, and points
 * on the east or south edge belong to the next tile. Polygons keep their rings, and carry the
 * tile's [west, south, east, north] box as `tileClip` (a GeoJSON foreign member): geoGeometry
 * clips their triangles and outlines to it. A polygon wholly in the buffer is dropped. A tag named
 * "layerName" or "geometry" (reserved by Data) is left out.
 */
export function tileFeatures(layers, tile, { clip = true, minArea = 0 } = {}) {
  const features = [], tileClip = clip ? tileBounds(tile) : null;
  for (const layer of layers) {
    const project = tileProjection(tile, layer.extent), extent = layer.extent;
    // minArea is in 4096-extent units squared: scaled to the layer's extent.
    const floor = minArea * (extent / 4096) ** 2;
    for (const feature of layer.features) {
      const geometry = featureGeometry(feature, project, clip ? extent : undefined, floor);
      if (!geometry) continue;
      const properties = { layerName: layer.name };
      for (const [key, value] of Object.entries(feature.properties)) if (key !== "layerName" && key !== "geometry") properties[key] = value;
      const polygon = geometry.type === "Polygon" || geometry.type === "MultiPolygon";
      features.push({ type: "Feature", ...(feature.id !== undefined ? { id: feature.id } : {}), properties, geometry,
        ...(polygon && tileClip ? { tileClip: [...tileClip] } : {}) });
    }
  }
  return features;
}

// minArea: rings smaller than this (tile units squared) are left out, a polygon with its exterior.
function featureGeometry(feature, project, extent, minArea = 0) {
  const line = (points) => points.map(project);
  if (feature.type === 1) {
    const points = feature.geometry.map((part) => part[0])
      .filter((p) => extent === undefined || (p[0] >= 0 && p[0] < extent && p[1] >= 0 && p[1] < extent));
    if (!points.length) return null;
    return points.length === 1 ? { type: "Point", coordinates: project(points[0]) } : { type: "MultiPoint", coordinates: points.map(project) };
  }
  if (feature.type === 2) {
    const parts = feature.geometry.filter((part) => part.length >= 2).flatMap((part) => (extent === undefined ? [part] : clipLine(part, extent)));
    if (!parts.length) return null;
    return parts.length === 1 ? { type: "LineString", coordinates: line(parts[0]) } : { type: "MultiLineString", coordinates: parts.map(line) };
  }
  if (feature.type === 3) {
    // Rings with the first ring's winding are exteriors, the others its holes (MVT 2 exteriors
    // are positive; this also reads version 1 tiles wound the other way).
    const polygons = [];
    let sign = 0, polygon = null;
    for (const ring of feature.geometry) {
      if (ring.length < 4) continue;
      const area = ringArea(ring);
      if (area === 0) continue;
      sign ||= Math.sign(area);
      const exterior = Math.sign(area) === sign;
      // A ring below minArea: a hole is dropped; an exterior drops its polygon (its holes follow it).
      if (Math.abs(area) / 2 < minArea) {
        if (exterior) polygon = null;
        continue;
      }
      if (exterior) polygons.push((polygon = [ring]));
      else if (polygon) polygon.push(ring);
    }
    const out = [];
    for (const rings of polygons) {
      if (extent !== undefined && !touchesSquare(rings[0], extent)) continue;
      // GeoJSON (RFC 7946): exteriors counterclockwise, holes clockwise. Latitude runs up, so
      // a ring positive in tile coordinates (y down) is clockwise on the map.
      out.push(rings.map((ring, i) => {
        const coordinates = line(ring);
        return (ringArea(ring) < 0) === (i === 0) ? coordinates : coordinates.reverse();
      }));
    }
    if (!out.length) return null;
    return out.length === 1 ? { type: "Polygon", coordinates: out[0] } : { type: "MultiPolygon", coordinates: out };
  }
  return null;
}

/** Tile bytes, gunzipped when the server sent a gzip file without Content-Encoding. */
async function tileBytes(response) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A tile URL: {z}, {x} and {y} filled from the tile, or a function of { z, x, y }. */
export function tileUrl(url, [z, x, y]) {
  if (typeof url === "function") return String(url({ z, x, y }));
  if (typeof url !== "string" || !url) throw fail("url must be a template with {z}, {x} and {y}, or a function of { z, x, y }.");
  const filled = url.replace(/\{(z|x|y)\}/g, (_, name) => String({ z, x, y }[name]));
  if (/\{[^{}]*\}/.test(filled)) throw fail(`the url names ${filled.match(/\{[^{}]*\}/)[0]}; tile urls fill only {z}, {x} and {y}.`);
  return filled;
}

/**
 * A tile's bytes from `url`, gunzipped, or null for an empty tile: a 204, an empty body, and with
 * `missing: "empty"` a 404 (a live tileset with gaps, TODO 35). Any other HTTP error names the
 * status and URL.
 */
export async function fetchTileBytes(url, tile, { signal = undefined, init = undefined, missing = "error" } = {}) {
  const address = tileUrl(url, tile);
  let response;
  try { response = await fetch(address, { ...init, signal }); }
  catch (error) {
    if (signal?.aborted || error?.name === "AbortError") throw error;
    throw diagnostic("vectortile.network", `VectorTile: could not fetch ${address}. Check network access and the tile server's CORS policy; for offline HTML, provide tileData or export with snapshot=true after the tiles load.`,
      { component: "VectorTile", details: { url: address, tile, reason: error?.message ?? String(error) } });
  }
  if (response.status === 204 || (missing === "empty" && response.status === 404)) return null;
  if (!response.ok)
    throw diagnostic("vectortile.http", `VectorTile: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}: ${address}`,
      { component: "VectorTile", details: { status: response.status, url: address } });
  const bytes = await tileBytes(response);
  return bytes.length ? bytes : null;
}

/**
 * Fetch and decode `tiles` from `url` into one FeatureCollection (see tileFeatures), decoding
 * the source layers `layers(name)` accepts. An HTTP error names the status and URL; a 204 or an
 * empty body is an empty tile.
 */
export async function loadVectorTiles(url, tiles, { signal = undefined, init = undefined, clip = true, layers = undefined } = {}) {
  const results = await Promise.all(tiles.map(async (tile) => {
    const bytes = await fetchTileBytes(url, tile, { signal, init });
    return bytes ? decodeTile(bytes, tile, { url, clip, layers }) : [];
  }));
  return { type: "FeatureCollection", features: results.flat() };
}

/** One tile's features (tileFeatures) from its bytes; a decoding error names the tile's URL. */
export function decodeTile(bytes, tile, { url = undefined, clip = true, layers = undefined, minArea = 0 } = {}) {
  try {
    return tileFeatures(readVectorTile(bytes, { layers }), tile, { clip, minArea });
  } catch (error) {
    const where = url === undefined ? tileKey(tile) : typeof url === "function" ? String(url({ z: tile[0], x: tile[1], y: tile[2] })) : tileUrl(url, tile);
    throw fail(`${where}: ${error.message.replace(/^VectorTile: /, "")}`);
  }
}

/**
 * Embedded tiles (`tileData`, TODO 35): [{ tile: [z, x, y], bytes }], bytes as base64 text (how
 * exports carry them), a Uint8Array or an ArrayBuffer, or null for an empty tile. Returns
 * Uint8Array bytes (or null) by tile key.
 */
export function tileDataBytes(tileData) {
  const out = new Map();
  if (tileData === undefined || tileData === null) return out;
  if (!Array.isArray(tileData)) throw fail("tileData must be a list of { tile: [z, x, y], bytes }.");
  for (const entry of tileData) {
    const tile = checkTile(entry?.tile), value = entry?.bytes;
    let bytes = null;
    if (value instanceof Uint8Array) bytes = value;
    else if (value instanceof ArrayBuffer) bytes = new Uint8Array(value);
    else if (typeof value === "string") {
      bytes = base64ToBytes(value);
    } else if (value !== null && value !== undefined) throw fail(`tileData ${tileKey(tile)}: bytes must be base64 text or a Uint8Array.`);
    out.set(tileKey(tile), bytes);
  }
  return out;
}

/** A tile's bytes as tileData carries them: base64 text (null for an empty tile). */
export function tileDataEntry(tile, bytes) {
  if (!bytes) return { tile: [...tile], bytes: null };
  return { tile: [...tile], bytes: bytesToBase64(bytes) };
}
