// TODO 24: MVT decoding, clipping, tile coordinates, tile loading and the VectorTile style rules.
import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { encodeVectorTile } from "./vectorTileEncoder.js";
import {
  readVectorTile, tileFeatures, tileProjection, tileBounds, tileAt, resolveTiles, tileUrl, loadVectorTiles, MAX_TILES, localPlane,
  localPlaneInverse, liveZoom, viewZoom, tilesInBox, selectLiveTiles, MAX_LIVE_TILES, LIVE_TILE_SIZE, tileRange, nearestTiles,
} from "../../src/lib/plot/utils/vectorTiles.js";
import {
  PARTS, DEFAULT_STYLES, resolveStyles, resolveSourceLayers, layerDrawn, partOf, splitFeatures, vectorTileScheme, colorAlpha, liveStyleIssue,
  lineWidth,
} from "../../src/lib/plot/utils/vectorTileStyle.js";
import { liveView, flyoverView, tileCoordinateSettings } from "../../src/lib/plot/utils/vectorTileView.js";
import { jointForward, projectionParameters } from "../../src/lib/plot/utils/mapProjections.js";
import { tileMesh, paintTile, SLOT_PARTS, buildingHeights, BUILDING_HEIGHT } from "../../src/lib/plot/utils/vectorTileMesh.js";
import { createRequestScheduler } from "../../src/lib/plot/utils/requestScheduler.js";
import { createTileCache, createLru, arrayBytes, RETRY_AFTER } from "../../src/lib/plot/utils/vectorTileCache.js";
import { sharedJobs, acquireTileWorkers } from "../../src/lib/plot/utils/vectorTileWorker.js";
import { PLACE_KINDS, SIZE_CLASSES, placeKind, placeLabels } from "../../src/lib/plot/utils/vectorTileLabels.js";
import { themes } from "../../src/lib/plot/utils/themePresets.js";
import { tilePublication } from "../../src/lib/plot/utils/tilePublication.js";
import { createViewServices } from "../../src/lib/plot/utils/viewServices.ts";

test("tile publication prioritizes visible work, cancels stale turns and waits for completed draws per view", async () => {
  const original = globalThis.requestAnimationFrame, frames = [];
  globalThis.requestAnimationFrame = callback => frames.push(callback);
  try {
    const view = createViewServices(), other = createViewServices();
    let canceled = false;
    const later = tilePublication(view, () => false, () => 3);
    const gone = tilePublication(view, () => canceled, () => 0);
    const urgent = tilePublication(view, () => false, () => 1);
    const independent = tilePublication(other, () => false);
    canceled = true;
    frames.shift()(); frames.shift()();
    assert.equal(await gone, null);
    const release = await urgent, releaseOther = await independent;
    assert.equal(frames.length, 0);
    release(); releaseOther(false);
    assert.equal(frames.length, 0, "another RAF cannot release work before the draw");
    for (const completed of view.lifecycle.frameCallbacks) completed();
    assert.equal(frames.length, 1);
    frames.shift()();
    (await later)(false);
    assert.equal(view.lifecycle.frameCallbacks.size, 0);
  } finally { globalThis.requestAnimationFrame = original; }
});

test("renderer disposal releases tile publications waiting for a completed draw", async () => {
  const original = globalThis.requestAnimationFrame, frames = [];
  globalThis.requestAnimationFrame = callback => frames.push(callback);
  try {
    const view = createViewServices();
    const first = tilePublication(view, () => false), waiting = tilePublication(view, () => false);
    frames.shift()();
    const release = await first;
    release();
    view.lifecycle.rendererResources.dispose();
    assert.equal(await waiting, null);
    assert.equal(view.lifecycle.frameCallbacks.size, 0);
    assert.equal(await tilePublication(view, () => false), null);
    release();
    assert.equal(view.lifecycle.frameCallbacks.size, 0, "a late publication cannot wait for a stopped renderer");
    assert.equal(frames.length, 0);
  } finally { globalThis.requestAnimationFrame = original; }
});

const square = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-9, `${message ?? ""} ${a} vs ${b}`);
// Twice the signed area of a [lon, lat] ring: positive is counterclockwise (latitude up).
const lonLatArea = (ring) => ring.slice(1).reduce((sum, [x, y], i) => sum + (ring[i][0] * y - x * ring[i][1]), 0);

test("the reader returns layers, tags of every value type, ids and command geometry", () => {
  const bytes = encodeVectorTile([
    { name: "pois", features: [{ id: 7, type: 1, properties: { name: "Café", rank: 3, height: 2.5, below: -4, open: true }, geometry: [[10, 20], [30, 40]] }] },
    { name: "roads", extent: 512, features: [{ type: 2, properties: { kind: "primary" }, geometry: [[[0, 0], [100, 50], [200, 50]], [[5, 5], [6, 6]]] }] },
    { name: "water", features: [{ type: 3, geometry: [square(0, 0, 100, 100), square(20, 20, 40, 40).reverse()] }] },
  ]);
  const layers = readVectorTile(bytes);
  assert.deepEqual(layers.map((layer) => [layer.name, layer.extent, layer.version]), [["pois", 4096, 2], ["roads", 512, 2], ["water", 4096, 2]]);
  const [poi] = layers[0].features;
  assert.equal(poi.id, 7);
  assert.equal(poi.type, 1);
  assert.deepEqual(poi.properties, { name: "Café", rank: 3, height: 2.5, below: -4, open: true });
  assert.deepEqual(poi.geometry, [[[10, 20]], [[30, 40]]]);
  assert.deepEqual(layers[1].features[0].geometry, [[[0, 0], [100, 50], [200, 50]], [[5, 5], [6, 6]]]);
  assert.deepEqual(layers[2].features[0].geometry[0], square(0, 0, 100, 100), "a ClosePath repeats the first point");
  // Layers the caller does not want are not decoded.
  assert.deepEqual(readVectorTile(bytes, { layers: (name) => name !== "pois" }).map((layer) => layer.name), ["roads", "water"]);
  assert.throws(() => readVectorTile(bytes.subarray(0, bytes.length - 3)), (error) => error.code === "vectortile.data");
});

test("tile coordinates project to longitude and latitude (Web Mercator)", () => {
  const project = tileProjection([1, 0, 0], 4096);
  const [west, north] = project([0, 0]), [east, south] = project([4096, 4096]);
  close(west, -180); close(north, 85.0511287798066); close(east, 0); close(south, 0);
  assert.deepEqual(tileBounds([0, 0, 0]).map((v) => +v.toFixed(6)), [-180, -85.051129, 180, 85.051129]);
  assert.deepEqual(tileAt([-74.006, 40.7128], 14), [14, 4823, 6160]);
  assert.deepEqual(tileAt([180, 0], 1), [1, 0, 1], "longitude 180 wraps to the first column");
  for (const tile of [[3, 5, 2], [14, 4824, 6159], [9, 0, 511]]) {
    const [w, s, e, n] = tileBounds(tile);
    assert.deepEqual(tileAt([(w + e) / 2, (s + n) / 2], tile[0]), tile, `center of ${tile}`);
  }
});

test("features are GeoJSON clipped to the tile square (polygons by their triangles, TODO 35), with RFC 7946 winding", () => {
  const extent = 4096;
  const layers = readVectorTile(encodeVectorTile([{
    name: "mixed",
    features: [
      // A polygon with a hole, reaching into the buffer on the west.
      { id: 1, type: 3, properties: { kind: "park" }, geometry: [square(-200, 1000, 2000, 3000), square(500, 1500, 800, 1800).reverse()] },
      // A line that leaves the tile and comes back: two pieces.
      { id: 2, type: 2, geometry: [[[100, 100], [100, -300], [300, -300], [300, 100]]] },
      // Points: inside, on the east edge (the next tile's), in the buffer.
      { id: 3, type: 1, geometry: [[50, 50], [extent, 50], [-10, 50]] },
      // Entirely in the buffer: dropped.
      { id: 4, type: 3, geometry: [square(4100, 0, 4200, 100)] },
    ],
  }]));
  const tile = [10, 300, 400];
  const features = tileFeatures(layers, tile);
  assert.deepEqual(features.map((f) => [f.id, f.geometry.type]), [[1, "Polygon"], [2, "MultiLineString"], [3, "Point"]]);
  const [west, south, east, north] = tileBounds(tile);
  const [polygon, line, point] = features;
  assert.deepEqual(polygon.properties, { layerName: "mixed", kind: "park" });
  const [outer, hole] = polygon.geometry.coordinates;
  // A polygon keeps its rings (clipping rings leaves holes on the cut edge, which no triangulation
  // handles) and names the tile's box, to which geoGeometry clips its triangles.
  assert.ok(Math.min(...outer.map((p) => p[0])) < west, "the polygon keeps its buffer");
  assert.deepEqual(polygon.tileClip, [west, south, east, north]);
  assert.ok(lonLatArea(outer) > 0, "exterior counterclockwise");
  assert.ok(lonLatArea(hole) < 0, "hole clockwise");
  assert.deepEqual(outer[0], outer.at(-1));
  for (const piece of line.geometry.coordinates) for (const [, lat] of piece) assert.ok(lat <= north + 1e-9);
  assert.equal(line.geometry.coordinates.length, 2);
  const [px, py] = tileProjection(tile, extent)([50, 50]);
  assert.deepEqual(point.geometry.coordinates, [px, py]);
  assert.ok(east > west && north > south);
  // Without clipping, the buffer stays.
  const raw = tileFeatures(layers, tile, { clip: false });
  assert.equal(raw.length, 4);
  assert.equal(raw[2].geometry.type, "MultiPoint");
  assert.ok(Math.min(...raw[0].geometry.coordinates[0].map((p) => p[0])) < west);
});

test("a version 1 tile wound the other way reads its first ring as the exterior; reserved tags are left out", () => {
  const layers = readVectorTile(encodeVectorTile([{
    name: "areas", version: 1,
    features: [{ type: 3, properties: { geometry: "x", layerName: "y", kind: "wood" }, geometry: [square(0, 0, 100, 100).reverse(), square(10, 10, 20, 20)] }],
  }]));
  const [feature] = tileFeatures(layers, [2, 1, 1]);
  assert.equal(feature.geometry.type, "Polygon");
  assert.equal(feature.geometry.coordinates.length, 2, "one exterior and its hole");
  assert.ok(lonLatArea(feature.geometry.coordinates[0]) > 0);
  assert.deepEqual(feature.properties, { layerName: "areas", kind: "wood" });
});

test("tiles come from tile, tiles, or bounds and a zoom, at most MAX_TILES", () => {
  assert.deepEqual(resolveTiles({ tile: [14, 4824, 6159] }), [[14, 4824, 6159]]);
  assert.deepEqual(resolveTiles({ tiles: [[2, 1, 1], [2, 2, 1], [2, 1, 1]] }), [[2, 1, 1], [2, 2, 1]], "duplicates once");
  assert.deepEqual(resolveTiles({}), []);
  // A box two tiles wide at zoom 2: longitudes -90..90 touch columns 1 and 2 only (90 is an edge).
  const [w] = tileBounds([2, 1, 1]), [, , e] = tileBounds([2, 2, 1]);
  assert.deepEqual(resolveTiles({ bounds: [w + 1, -10, e, 10], zoom: 2 }), [[2, 1, 1], [2, 2, 1], [2, 1, 2], [2, 2, 2]]);
  const code = (message) => (error) => error.code === "vectortile.data" && message.test(error.message);
  assert.throws(() => resolveTiles({ tile: [1, 0, 0], bounds: [0, 0, 1, 1] }), code(/one of tile, tiles or bounds/));
  assert.throws(() => resolveTiles({ tile: [2, 4, 0] }), code(/x must be an integer from 0 to 3/));
  assert.throws(() => resolveTiles({ tile: [1.5, 0, 0] }), code(/zoom must be an integer/));
  assert.throws(() => resolveTiles({ bounds: [0, 0, 1, 1] }), code(/needs a zoom/));
  assert.throws(() => resolveTiles({ bounds: [1, 0, 0, 1], zoom: 3 }), code(/west < east/));
  assert.throws(() => resolveTiles({ bounds: [-10, -10, 10, 10], zoom: 8 }), {
    code: "limit.vectorTiles",
    message: "VectorTile: a box at zoom 8 needs 256 tiles; the limit is 16 tiles. Use a lower zoom or a smaller box.",
  });
});

test("a local plane is meters east and north of its origin, scaled (the flyover's projection)", () => {
  const project = localPlane([-73.95, 40.72], 0.004);
  // scripts/build-manhattan-buildings.py: (lon + 73.95) * 111320 * cos(40.72°) * 0.004, (lat - 40.72) * 111320 * 0.004.
  const [x, y] = project([-74.0156, 40.7033]);
  close(x, (-74.0156 + 73.95) * 111320 * Math.cos((40.72 * Math.PI) / 180) * 0.004);
  close(y, (40.7033 - 40.72) * 111320 * 0.004);
  assert.deepEqual(project([-73.95, 40.72]), [0, 0]);
  // One kilometer north at unitsPerMeter 1 is about 1000 units.
  assert.ok(Math.abs(localPlane([0, 0])([0, 1000 / 111320])[1] - 1000) < 1e-6);
  for (const [origin, scale] of [[[0], 1], [[0, 95], 1], [[0, 0], 0], [[0, 0], -1]])
    assert.throws(() => localPlane(origin, scale), (error) => error.code === "vectortile.data");
});

test("tile urls fill {z}, {x} and {y}; a function gets the tile", () => {
  assert.equal(tileUrl("https://t.example/{z}/{x}/{y}.pbf?key=abc", [3, 4, 5]), "https://t.example/3/4/5.pbf?key=abc");
  assert.equal(tileUrl(({ z, x, y }) => `/t/${z}-${x}-${y}`, [3, 4, 5]), "/t/3-4-5");
  assert.throws(() => tileUrl("/t/{z}/{x}/{y}/{style}", [1, 0, 0]), (error) => /\{style\}/.test(error.message));
});

test("loadVectorTiles fetches each tile, gunzips gzip files, and names HTTP errors", async () => {
  const original = globalThis.fetch, calls = [];
  const tileBytes = (name) => encodeVectorTile([{ name, features: [{ type: 1, geometry: [[100, 100]] }] }]);
  globalThis.fetch = async (url, init) => {
    calls.push({ url, signal: init.signal });
    if (url.endsWith("/2/1/1.mvt")) return new Response(gzipSync(tileBytes("gzipped")));
    if (url.endsWith("/2/2/1.mvt")) return new Response(tileBytes("plain"));
    if (url.endsWith("/2/3/1.mvt")) return new Response(null, { status: 204 });
    return new Response("no", { status: 404, statusText: "Not Found" });
  };
  try {
    const signal = new AbortController().signal;
    const collection = await loadVectorTiles("/t/{z}/{x}/{y}.mvt", [[2, 1, 1], [2, 2, 1], [2, 3, 1]], { signal });
    assert.equal(collection.type, "FeatureCollection");
    assert.deepEqual(collection.features.map((f) => f.properties.layerName), ["gzipped", "plain"]);
    assert.ok(calls.every((call) => call.signal === signal));
    await assert.rejects(loadVectorTiles("/t/{z}/{x}/{y}.mvt", [[2, 0, 0]]),
      (error) => error.code === "vectortile.http" && error.message === "VectorTile: HTTP 404 Not Found: /t/2/0/0.mvt");
    globalThis.fetch = async () => { throw TypeError("Failed to fetch"); };
    await assert.rejects(loadVectorTiles("/t/{z}/{x}/{y}.mvt", [[2, 0, 0]]), (error) => {
      assert.equal(error.code, "vectortile.network");
      assert.deepEqual(error.diagnostic.details, { url: "/t/2/0/0.mvt", tile: [2, 0, 0], reason: "Failed to fetch" });
      assert.match(error.message, /offline HTML/);
      return true;
    });
    const aborted = new DOMException("Canceled", "AbortError");
    globalThis.fetch = async () => { throw aborted; };
    await assert.rejects(loadVectorTiles("/t/{z}/{x}/{y}.mvt", [[2, 0, 0]]), (error) => error === aborted);
  } finally {
    globalThis.fetch = original;
  }
});

const feature = (layerName, properties = {}, type = "Polygon") => ({ type: "Feature", properties: { layerName, ...properties }, geometry: { type, coordinates: [] } });
test("style rules assign the common schemas' layers to parts", () => {
  const styles = resolveStyles(), layers = resolveSourceLayers();
  const part = (...args) => partOf(feature(...args), styles, layers);
  // Shortbread (VersaTiles).
  assert.equal(part("water_polygons", { kind: "water" }), "water");
  assert.equal(part("land", { kind: "park" }), "green");
  assert.equal(part("land", { kind: "residential" }), "land");
  assert.equal(part("streets", { kind: "primary" }, "LineString"), "majorRoads");
  assert.equal(part("streets", { kind: "residential" }, "LineString"), "roads");
  assert.equal(part("streets", { kind: "footway" }, "LineString"), "paths");
  assert.equal(part("streets", { kind: "subway", tunnel: true }, "LineString"), null, "tunnels are hidden");
  assert.equal(part("streets", { kind: "rail" }, "MultiLineString"), "railways");
  assert.equal(part("place_labels", { kind: "city", name: "Oslo" }, "Point"), "places");
  assert.equal(part("boundary_labels", { admin_level: 2, name: "Norway" }, "Point"), "places", "countries and states name places");
  assert.equal(part("addresses", {}, "Point"), null);
  // OpenMapTiles (class), Protomaps (kind), Mapbox Streets (class).
  assert.equal(part("transportation", { class: "motorway", brunnel: "bridge" }, "LineString"), "majorRoads");
  assert.equal(part("transportation", { class: "minor", brunnel: "tunnel" }, "LineString"), null);
  assert.equal(part("landcover", { class: "wood" }), "green");
  assert.equal(part("water", {}, "MultiPolygon"), "water");
  assert.equal(part("waterway", { class: "river" }, "LineString"), "waterways");
  assert.equal(part("roads", { kind: "highway" }, "LineString"), "majorRoads");
  assert.equal(part("earth", {}), null);
  assert.equal(part("road", { class: "street" }, "LineString"), "roads");
  assert.equal(part("admin", { admin_level: 2 }, "LineString"), "boundaries");
  // Anything else draws as "other".
  assert.equal(part("parcels", {}), "other");
});

test("a tile draws the kinds its zoom reaches, as VersaTiles' style; borders stay on land", () => {
  const styles = resolveStyles(), layers = resolveSourceLayers();
  const at = (zoom, ...args) => partOf(feature(...args), styles, layers, zoom);
  assert.equal(at(4, "streets", { kind: "motorway" }, "LineString"), null);
  assert.equal(at(5, "streets", { kind: "motorway" }, "LineString"), "majorRoads");
  assert.equal(at(11, "streets", { kind: "residential" }, "LineString"), null);
  assert.equal(at(12, "streets", { kind: "residential" }, "LineString"), "roads");
  assert.equal(at(12, "streets", { kind: "footway" }, "LineString"), null);
  assert.equal(at(13, "streets", { kind: "footway" }, "LineString"), "paths");
  assert.equal(at(12, "streets", { kind: "motorway", link: true }, "LineString"), "majorRoads", "motorway ramps from 12");
  assert.equal(at(12, "streets", { kind: "primary", link: true }, "LineString"), null, "other ramps from 13");
  assert.equal(at(13, "streets", { kind: "rail", service: "siding" }, "LineString"), null, "sidings from 14");
  assert.equal(at(7, "land", { kind: "forest" }), "green");
  assert.equal(at(9, "land", { kind: "farmland" }), null);
  assert.equal(at(12, "land", { kind: "cemetery" }), null);
  assert.equal(at(3, "water_polygons", { kind: "water" }), null, "lakes from 4");
  assert.equal(at(0, "ocean", {}), "water");
  assert.equal(at(13, "buildings", {}), "buildings");
  assert.equal(at(8, "water_lines", { kind: "river" }, "LineString"), null);
  assert.equal(at(0, "boundaries", { admin_level: 2, maritime: false }, "LineString"), "boundaries");
  assert.equal(at(14, "boundaries", { admin_level: 2, maritime: true }, "LineString"), null, "no borders at sea");
  assert.equal(at(6, "boundaries", { admin_level: 4 }, "LineString"), null, "states from 7");
  assert.equal(at(7, "boundaries", { admin_level: 4 }, "LineString"), "boundaries");
  assert.equal(at(14, "boundaries", { admin_level: 6 }, "LineString"), null);
  // The reader skips a layer below the zoom its rule starts at; sourceLayers draw at every zoom.
  assert.equal(layerDrawn("land", styles, layers, 6), false, "below forests");
  assert.equal(layerDrawn("streets", styles, layers, 5), true);
  assert.equal(layerDrawn("parcels", styles, resolveSourceLayers({ parcels: "buildings" }), 0), true);
  // Without a zoom, every kind.
  assert.equal(partOf(feature("streets", { kind: "footway" }, "LineString"), styles, layers), "paths");
});

test("place names show by kind and zoom, the most important first, none overlapping (VersaTiles' order)", () => {
  assert.deepEqual(placeKind({ layerName: "boundary_labels", admin_level: 2, way_area: 4e8 }), { kind: 0, weight: 4e8 });
  assert.equal(placeKind({ layerName: "boundary_labels", admin_level: 4 }).kind, PLACE_KINDS.findIndex((k) => k.kind === "state"));
  assert.equal(placeKind({ kind: "farm" }).kind, -1, "farms never show");
  assert.equal(PLACE_KINDS[placeKind({ class: "city", capital: 2 }).kind].kind, "capital", "OpenMapTiles' capitals");
  const place = (text, kind, lon, lat, weight = 0) => ({ text, kind: placeKind({ kind }).kind, weight, coordinates: [lon, lat], position: [lon, lat] });
  const candidates = [
    place("Hamlet", "hamlet", 18.2, 59.4), place("Uppsala", "city", 17.64, 59.86, 1.6e5), place("Stockholm", "capital", 18.07, 59.33, 9e5),
    place("Solna", "city", 18.03, 59.335, 8e4), place("Stockholm", "city", 18.07, 59.33),
  ];
  const names = (zoom) => placeLabels(candidates, zoom).flatMap((group) => group.text).sort();
  // Zoom 8: the capital, and Uppsala; Solna, 2 km from the capital, would overlap it; no hamlets.
  assert.deepEqual(names(8), ["Stockholm", "Uppsala"]);
  // Zoom 12: capitals end at 12 (the city's name stands in), Solna is clear of it, and hamlets
  // start at 13.
  assert.deepEqual(names(12), ["Solna", "Stockholm", "Uppsala"]);
  assert.ok(names(13).includes("Hamlet"));
  // Sizes: the style's size scales every class; groups are one text size each.
  const groups = placeLabels(candidates, 8, { size: 26 });
  assert.ok(groups.every((group) => SIZE_CLASSES.map((value) => value * 2).includes(group.size)));
});

test("styles hide or restyle parts; sourceLayers assign layers first; hidden layers are skipped", () => {
  const styles = resolveStyles({ buildings: false, water: { fill: "#00f" }, places: true });
  assert.equal(styles.buildings, null);
  assert.deepEqual(styles.water, { fill: "#00f" });
  assert.deepEqual(styles.places, resolveStyles().places);
  const layers = resolveSourceLayers({ parcels: "buildings", water_polygons: false, land: "other" });
  assert.equal(partOf(feature("parcels"), resolveStyles(), layers), "buildings");
  assert.equal(partOf(feature("parcels"), styles, layers), null, "a hidden part hides its features");
  assert.equal(partOf(feature("land", { kind: "park" }), styles, layers), "other");
  assert.equal(layerDrawn("buildings", styles, {}), false);
  assert.equal(layerDrawn("water_polygons", styles, layers), false);
  assert.equal(layerDrawn("pois", styles, {}), false);
  assert.equal(layerDrawn("streets", styles, {}), true);
  assert.equal(layerDrawn("streets", resolveStyles({ roads: false, majorRoads: false, paths: false, railways: false }), {}), false);
  assert.equal(layerDrawn("unknown", styles, {}), true);
  const split = splitFeatures({ features: [feature("water_polygons"), feature("buildings"), feature("parcels"), feature("pois", {}, "Point")] }, resolveStyles(), {});
  assert.deepEqual(Object.fromEntries(Object.entries(split).map(([name, value]) => [name, value.features.length])), { water: 1, buildings: 1, other: 1 });
  assert.throws(() => resolveStyles({ lakes: false }), (error) => error.code === "vectortile.style" && error.message.includes(PARTS.join(", ")));
  assert.throws(() => resolveStyles({ water: { stroke: "#000" } }), /styles.water.stroke is not a style/);
  assert.throws(() => resolveSourceLayers({ parcels: "background" }), /must be a part/);
});

test("every theme preset has a complete vectorTile scheme; minimal's is the default look (TODO 36)", () => {
  for (const [name, theme] of Object.entries(themes)) {
    assert.deepEqual(Object.keys(theme.vectorTile ?? {}).sort(), [...PARTS].sort(), name);
    const styles = resolveStyles(undefined, theme.vectorTile);
    for (const part of PARTS) assert.ok(styles[part], `${name}.${part}`);
  }
  assert.deepEqual(themes.minimal.vectorTile, DEFAULT_STYLES);
  // A dark theme's basemap is dark: its land is near its background, names light.
  const luminance = (hex) => [1, 3, 5].reduce((sum, i, k) => sum + [0.2126, 0.7152, 0.0722][k] * parseInt(hex.slice(i, i + 2), 16), 0) / 255;
  for (const name of ["dark", "financeTerminal", "yellowGlow"]) {
    assert.ok(luminance(themes[name].vectorTile.background.fill) < 0.25, name);
    assert.ok(luminance(themes[name].vectorTile.places.color) > 0.6, name);
  }
});

test("a scheme sits between the defaults and styles; a derived scheme follows a theme's colors", () => {
  const scheme = { water: { fill: "#102030" }, buildings: false, roads: { width: 4 } };
  const styles = resolveStyles({ roads: { color: "#ff0000" }, buildings: true }, scheme);
  assert.deepEqual(styles.water, { fill: "#102030" });
  assert.deepEqual(styles.roads, { color: "#ff0000", width: 4 });
  assert.deepEqual(styles.buildings, DEFAULT_STYLES.buildings, "styles can show a part the scheme hid");
  assert.equal(resolveStyles(undefined, { places: false }).places, null);
  assert.throws(() => resolveStyles(undefined, { lakes: {} }), /scheme has no part "lakes"/);
  const derived = vectorTileScheme({ view: { background: "#000000" }, typography: { color: "#ffffff" }, palette: ["#0000ff", "#00ff00", "#ff8800"] });
  assert.equal(derived.places.color, "#ffffff");
  assert.ok(parseInt(derived.water.fill.slice(5, 7), 16) > parseInt(derived.water.fill.slice(1, 3), 16), "water leans toward the palette's blue");
  assert.ok(parseInt(derived.green.fill.slice(3, 5), 16) > parseInt(derived.green.fill.slice(1, 3), 16), "parks lean toward its green");
});

// TODO 35: live tiles.
const mercatorInverse = (x, y) => [(x * 180) / Math.PI, ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI];
const mercatorY = (latitude) => Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360));

test("a live view's zoom is the nearest whole zoom (deck.gl's), within minZoom and maxZoom", () => {
  // 0.3 degrees of longitude across 1200 px at New York's latitude: 21.1 m per pixel.
  const view = liveView(mercatorInverse, { x: [(-74.1 * Math.PI) / 180, (-73.8 * Math.PI) / 180], y: [mercatorY(40.65), mercatorY(40.85)] }, 1200, 800);
  close(view.metersPerPixel, (0.3 * Math.cos((view.center[1] * Math.PI) / 180) * 111320) / 1200, "ground resolution");
  assert.deepEqual(view.box.map((v) => Math.round(v * 100) / 100), [-74.1, 40.65, -73.8, 40.85]);
  const z = liveZoom(view.metersPerPixel, view.center[1]);
  const shown = (40075016.686 * Math.cos((view.center[1] * Math.PI) / 180)) / 2 ** z / view.metersPerPixel;
  assert.ok(Math.abs(viewZoom(view) - 11.46) < 0.01, "the camera's zoom");
  assert.equal(z, 11);
  assert.ok(shown >= LIVE_TILE_SIZE / Math.SQRT2 && shown < LIVE_TILE_SIZE * Math.SQRT2, `a tile shows at ${shown} px`);
  assert.equal(liveZoom(view.metersPerPixel / 1.2, view.center[1]), 12, "11.72 rounds up");
  assert.equal(liveZoom(0.01, 40, { maxZoom: 14 }), 14, "past maxZoom the maxZoom tiles stretch");
  assert.equal(liveZoom(1e7, 0, { minZoom: 2 }), 2);
  // Hysteresis (TODO 63.7): zooming in, the zoom on screen stays until the view is 0.15 past
  // half-way; zooming out, it changes at half-way.
  const at = (zoom) => (40075016.686 / LIVE_TILE_SIZE) / 2 ** zoom;
  assert.equal(liveZoom(at(12.6), 0), 13);
  assert.equal(liveZoom(at(12.6), 0, { current: 12 }), 12, "12.6 keeps 12 on screen");
  assert.equal(liveZoom(at(12.7), 0, { current: 12 }), 13, "past 12.65, 13");
  assert.equal(liveZoom(at(12.6), 0, { current: 13 }), 13);
  assert.equal(liveZoom(at(12.45), 0, { current: 13 }), 12, "zooming out: 12 below 12.5");
  assert.equal(liveZoom(at(16), 0, { current: 14, maxZoom: 14 }), 14);
  // A view off the map (a joint projection's corner) has no box.
  assert.equal(liveView(() => null, { x: [0, 1], y: [0, 1] }, 100, 100), null);
});

test("live tile detail offsets zoom while retaining limits and the tile budget", () => {
  const view = { box: [-0.01, -0.01, 0.01, 0.01], center: [0, 0], metersPerPixel: 40075016.686 / (LIVE_TILE_SIZE * 2 ** 10) };
  assert.equal(selectLiveTiles(view).z, 10);
  assert.equal(selectLiveTiles(view, { zoomBias: 1 }).z, 11);
  assert.equal(selectLiveTiles(view, { zoomBias: -2 }).z, 8);
  assert.equal(selectLiveTiles(view, { zoomBias: 4, maxZoom: 12 }).z, 12);
  const wide = { ...view, box: [-90, -80, 90, 80] };
  assert.ok(selectLiveTiles(wide, { zoomBias: 4 }).tiles.length <= MAX_LIVE_TILES);
  for (const zoomBias of [NaN, Infinity, 5, "1"])
    assert.throws(() => selectLiveTiles(view, { zoomBias }), /VectorTile: zoomBias.*finite number/);
});

test("the tiles in a box: nearest the center first, wrapped columns, edges exclusive, a world-wide box once", () => {
  const tiles = tilesInBox([-74.1, 40.6, -73.8, 40.9], 12, [-73.95, 40.75]);
  assert.deepEqual(tiles[0], tileAt([-73.95, 40.75], 12), "the center's tile first");
  assert.equal(new Set(tiles.map(String)).size, tiles.length);
  // A box ending exactly on a tile edge does not take the next column.
  const [west, south, east, north] = tileBounds([3, 2, 2]);
  assert.deepEqual(tilesInBox([west, south, east, north], 3), [[3, 2, 2]]);
  // Across the antimeridian (a repeating map's longitudes run past 180): columns wrap.
  assert.deepEqual(tilesInBox([170, -10, 190, 10], 2).map(([, x]) => x).sort(), [0, 0, 3, 3]);
  assert.equal(tilesInBox([-400, -80, 400, 80], 1).length, 4, "wider than the world: every tile once");
  // Past MAX_LIVE_TILES, one zoom coarser.
  const selection = selectLiveTiles({ box: [-10, -10, 10, 10], center: [0, 0], metersPerPixel: 1 }, { maxZoom: 14 });
  assert.ok(selection.tiles.length <= MAX_LIVE_TILES && selection.z < 14);
  assert.equal(tilesInBox([-10, -10, 10, 10], selection.z + 1).length > MAX_LIVE_TILES, true);
});

test("a selection counts tile ranges before listing them: nearest first, wrapped, ties in row order, capped at minZoom (TODO 63.3)", () => {
  // The case that listed 830,000 tiles a level (671-717 ms), and the world at zoom 14 (a Map overflowed).
  assert.deepEqual(selectLiveTiles({ box: [-10, -10, 10, 10], center: [0, 0], metersPerPixel: 1 }, { maxZoom: 14 }).tiles.length, 16);
  assert.equal(tileRange([-10, -10, 10, 10], 14).count > 800000, true);
  const world = selectLiveTiles({ box: [-180, -85, 180, 85], center: [0, 0], metersPerPixel: 0.5 }, { maxZoom: 14 });
  assert.equal(world.z, 2);
  assert.equal(world.tiles.length, 16);
  // At minZoom a range too large to list keeps its nearest maxTiles, the center's tile first.
  const capped = selectLiveTiles({ box: [-170, -80, 170, 80], center: [10, 20], metersPerPixel: 1 }, { minZoom: 10, maxZoom: 14 });
  assert.equal(capped.z, 10);
  assert.equal(capped.tiles.length, MAX_LIVE_TILES);
  assert.deepEqual(capped.tiles[0], tileAt([10, 20], 10));
  // A window of the range gives what listing all of it would: wrapped boxes, off-center centers.
  for (const [box, z, center] of [[[150, -30, 250, 40], 5, [179, 0]], [[-200, -60, -100, 70], 6, undefined], [[-400, -80, 400, 80], 3, [170, 10]],
    [[-20, -20, 20, 20], 7, [-19, 19]]])
    for (const limit of [1, 4, 17, 48]) {
      const range = tileRange(box, z, center);
      assert.deepEqual(nearestTiles(range, limit), nearestTiles(range).slice(0, limit), `${JSON.stringify({ box, z, center, limit })}`);
    }
  // Ties (a center on a tile corner) keep row, then column, order.
  assert.deepEqual(tilesInBox([-170, -80, 170, 80], 3, [0, 0], 4), [[3, 3, 3], [3, 4, 3], [3, 3, 4], [3, 4, 4]]);
});

test("the local plane's inverse returns longitude and latitude", () => {
  const forward = localPlane([-73.95, 40.72], 0.004), back = localPlaneInverse([-73.95, 40.72], 0.004);
  const [lon, lat] = back(forward([-73.9, 40.8]));
  close(lon, -73.9);
  close(lat, 40.8);
});

test("the request scheduler caps requests, starts them by current priority, and cancels negative ones", async () => {
  const scheduler = createRequestScheduler({ maxRequests: 2, debounceTime: 5 });
  const order = [], priorities = { a: 3, b: 1, c: 2, d: 0 };
  const started = ["a", "b", "c", "d"].map((name) => scheduler.schedule(() => priorities[name]).then((slot) => (slot && order.push(name), slot)));
  priorities.d = -1; // leaves the view before its request starts
  const [, c, d] = await Promise.all([started[1], started[2], started[3]]);
  assert.deepEqual(order, ["b", "c"], "two slots, lowest priority first");
  assert.equal(d, null, "canceled");
  assert.equal(scheduler.active, 2);
  c.done();
  await started[0];
  assert.deepEqual(order, ["b", "c", "a"], "a finished request frees its slot at once");
  scheduler.dispose();
});

test("speculative requests hold at most maxSpeculative slots, leaving the rest for the tiles on screen (TODO 66)", async () => {
  const scheduler = createRequestScheduler({ maxRequests: 4, speculative: 100, maxSpeculative: 2 });
  const started = [];
  const ask = (name, priority) => scheduler.schedule(() => priority).then((slot) => (started.push(name), slot));
  const ahead = [ask("ring 1", 101), ask("ring 2", 102), ask("ring 3", 103)];
  await Promise.all(ahead.slice(0, 2));
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(started, ["ring 1", "ring 2"], "two speculative requests at most");
  // Tiles the view shows take the free slots at once, ahead of the waiting speculative one.
  const shown = [ask("shown 1", 1), ask("shown 2", 2)];
  await Promise.all(shown);
  assert.deepEqual(started, ["ring 1", "ring 2", "shown 1", "shown 2"]);
  (await ahead[0]).done();
  assert.deepEqual((await ahead[2]) && started.at(-1), "ring 3", "a speculative slot freed starts the next");
  scheduler.dispose();
});

test("the request scheduler's debounce waits at most maxWait under a steady stream of requests (TODO 63.7)", async () => {
  const scheduler = createRequestScheduler({ maxRequests: 4, debounceTime: 16, maxWait: 60 });
  const started = performance.now();
  const first = scheduler.schedule(() => 0);
  let at = null;
  first.then(() => (at = performance.now() - started));
  // A camera asking for a new tile every 8 ms, for 200 ms: the debounce alone never ends.
  for (let i = 0; i < 25 && at === null; i++) {
    scheduler.schedule(() => 0);
    await new Promise((resolve) => setTimeout(resolve, 8));
  }
  assert.ok(at !== null && at < 150, `started after ${at} ms`);
  scheduler.dispose();
});

test("live tiles need opaque styles and a background", () => {
  assert.equal(colorAlpha("#aad3df"), 1);
  assert.equal(colorAlpha("#aad3df80"), 128 / 255);
  assert.equal(colorAlpha("rgb(1 2 3 / 25%)"), 0.25);
  assert.equal(colorAlpha("hsla(10, 20%, 30%, 0.5)"), 0.5);
  assert.equal(colorAlpha("transparent"), 0);
  assert.equal(liveStyleIssue(resolveStyles()), "");
  for (const theme of Object.values(themes)) assert.equal(liveStyleIssue(resolveStyles(undefined, vectorTileScheme(theme))), "", "every preset scheme is opaque");
  assert.match(liveStyleIssue(resolveStyles({ water: { opacity: 0.5 } })), /part "water" has opacity 0\.5.*live=\{false\}/);
  assert.match(liveStyleIssue(resolveStyles({ roads: { color: "rgba(255, 0, 0, 0.3)" } })), /part "roads" has color/);
  assert.match(liveStyleIssue(resolveStyles({ background: false })), /background part is hidden/);
  assert.match(liveStyleIssue(resolveStyles(), 0.8), /opacity is 0\.8/);
});

test("a tile's slot arrays: parts in order, flat faces only, linear colors painted from the styles, outlines when styled, places", () => {
  const bytes = encodeVectorTile([
    { name: "streets", features: [{ id: 4, type: 2, properties: { kind: "primary" }, geometry: [[[100, 100], [4000, 100]]] }] },
    { name: "water_polygons", features: [{ id: 1, type: 3, properties: { kind: "water" }, geometry: [square(0, 0, 2048, 4096)] }] },
    { name: "place_labels", features: [{ id: 5, type: 1, properties: { kind: "suburb", name: "Testville" }, geometry: [[3000, 1000]] }] },
  ]);
  const tile = [12, 2000, 1300], styles = resolveStyles();
  const { result, features } = tileMesh({ bytes, tile, styles }), paint = paintTile(result, styles);
  assert.deepEqual(features.map((f) => f.properties.layerName), ["background", "water_polygons", "streets"], "slot order: areas, then lines");
  assert.equal(result.counts.faces, 4, "two triangles each for the background and the water, tops only");
  const colors = [...new Set([...result.faces.feature].map((i) => features[i].properties.layerName))];
  assert.deepEqual(colors, ["background", "water_polygons"]);
  const water = [...result.faces.feature].indexOf(1);
  assert.ok(Math.abs(paint.faces.color[water * 3 + 2] - ((0xdf / 255 + 0.055) / 1.055) ** 2.4) < 1e-6, "water's blue, linear");
  assert.equal(result.counts.lines, 1, "the street; no outlines by default");
  // Roads thin as the zoom goes out: a zoom-12 primary road is 2^(-2/3) of its part's width.
  assert.ok(Math.abs(paint.lines.width[0] - DEFAULT_STYLES.majorRoads.width * 2 ** (-2 / 3)) < 1e-6);
  // New colors and widths repaint the same geometry (TODO 63.4): a tile prepared once.
  const restyled = paintTile(result, resolveStyles({ water: { fill: "#000000" }, majorRoads: { width: 6, color: "#ff0000" } }));
  assert.deepEqual([...restyled.faces.color.slice(water * 3, water * 3 + 3)], [0, 0, 0]);
  assert.ok(Math.abs(restyled.lines.width[0] - 6 * 2 ** (-2 / 3)) < 1e-6);
  assert.deepEqual([...restyled.lines.color], [1, 0, 0]);
  assert.equal(lineWidth("majorRoads", 3, 14, { kind: "primary" }), 3);
  assert.ok(lineWidth("majorRoads", 3, 14, { kind: "motorway" }) > lineWidth("majorRoads", 3, 14, { kind: "tertiary" }));
  assert.ok(Math.abs(lineWidth("majorRoads", 3, 2) - 0.9) < 1e-9, "at least 0.3 of the width");
  assert.equal(lineWidth("boundaries", 1.2, 3), 1.2, "borders keep theirs");
  // The straight-meridian path (vectorTileLive's) gives the same arrays up to float32.
  const straight = tileMesh({ bytes, tile, styles, angularStep: 1e9 }).result;
  assert.deepEqual(straight.counts, result.counts);
  for (const [family, key] of [["faces", "part"], ["lines", "scale"], ["lines", "part"], ["faces", "feature"], ["lines", "feature"]])
    assert.ok([...straight[family][key]].every((value, i) => Math.abs(value - result[family][key][i]) < 1e-6), `${family}.${key}`);
  assert.deepEqual([...result.faces.a].filter((_, i) => i % 3 === 2), [1, 1, 1, 1], "top faces (GeoFaces' flag)");
  assert.deepEqual(result.places.text, ["Testville"]);
  const outlined = tileMesh({ bytes, tile, styles: resolveStyles({ water: { outlineWidth: 2, outlineColor: "#000000" } }) });
  assert.ok(outlined.result.counts.lines > 1, "a styled outline adds the water's boundary");
  assert.equal(tileMesh({ bytes: null, tile, styles }).result.counts.faces, 2, "an empty tile is its background");
  assert.deepEqual(SLOT_PARTS.length, PARTS.length - 1, "every part but places");
  // With an origin, positions are the local plane's.
  const local = tileMesh({ bytes, tile, styles, geographic: false, origin: tileBounds(tile).slice(0, 2), unitsPerMeter: 1 });
  assert.ok(Math.max(...local.result.faces.a) > 1000, "meters, not degrees");
});

test("joint-projection tiles use the marks' centered longitude extent in every angular unit", () => {
  const degrees = Math.PI / 180;
  for (const projection of ["equal-earth", "natural-earth", "albers"])
    for (const [angleUnit, period, origin] of [["degrees", 360, 0], ["radians", 2 * Math.PI, 0], ["extent", 360, 280]]) {
      const factor = 2 * Math.PI / period;
      const values = { coordinates: "spherical", projection, angleUnit,
        xbounds: [origin - period / 2, origin + period / 2],
        projectionCenter: [135 * degrees / factor + origin, 0], parallels: [29.5, 45.5].map((p) => p * degrees / factor) };
      const settings = tileCoordinateSettings({ get: (key) => values[key] });
      close(settings.seamLongitude, 135, `${projection}/${angleUnit} worker seam`);
      const { faces } = tileMesh({ bytes: null, tile: [2, 0, 1], styles: resolveStyles(), ...settings }).result;
      assert.ok(faces.a.length > 0);
      const params = projectionParameters(projection);
      for (const corner of [faces.a, faces.b, faces.c]) for (let i = 0; i < corner.length; i += 3) {
        const longitude = (corner[i] - settings.geoOrigin) * factor, latitude = corner[i + 1] * factor;
        assert.ok(longitude >= -45 * degrees - 1e-6 && longitude <= 315 * degrees + 1e-6);
        const tile = jointForward(projection, longitude - 135 * degrees, latitude, params, { unwrapped: true });
        const point = jointForward(projection, longitude - 135 * degrees, latitude, params);
        assert.ok(tile.every((value, axis) => Math.abs(value - point[axis]) < 1e-6), `${projection}/${angleUnit}: tile and point agree`);
      }
      values.projection = "orthographic";
      const initial = tileCoordinateSettings({ get: (key) => values[key] });
      values.projectionCenter = [0, 0];
      assert.deepEqual(tileCoordinateSettings({ get: (key) => values[key] }), initial, "globe turns do not change tile geometry jobs");
    }
  assert.deepEqual(tileCoordinateSettings({ get: () => undefined }), { geographic: false, projection: "equirectangular",
    angularStep: 1e9, seamLongitude: 0, geoScale: 1, geoOrigin: 0 });
});

test("the tile cache fetches once, remembers failures for RETRY_AFTER, and drops canceled requests", async () => {
  let clock = 0, calls = 0;
  const outcomes = { "1/0/0": new Uint8Array([1]), "1/1/0": "fail" };
  const scheduler = createRequestScheduler({ maxRequests: 1 });
  const cache = createTileCache({ url: "x", scheduler, now: () => clock, fetchBytes: async (url, tile) => {
    calls++;
    const outcome = outcomes[tile.join("/")];
    if (outcome === "fail") throw Error("offline");
    return outcome ?? null;
  } });
  assert.deepEqual(await cache.load([1, 0, 0]), new Uint8Array([1]));
  await cache.load([1, 0, 0]);
  assert.equal(calls, 1, "fetched once");
  await assert.rejects(cache.load([1, 1, 0]), /offline/);
  await assert.rejects(cache.load([1, 1, 0]), /offline/);
  assert.equal(calls, 2, "a failure is not requested again at once");
  clock = RETRY_AFTER;
  outcomes["1/1/0"] = new Uint8Array([2]);
  assert.deepEqual(await cache.load([1, 1, 0]), new Uint8Array([2]), "retried after RETRY_AFTER");
  await assert.rejects(cache.load([1, 0, 1], { priority: () => -1 }), (error) => error.name === "AbortError");
  assert.equal(cache.peek([1, 0, 1]), undefined, "a canceled tile leaves nothing behind");
  // A second load of a waiting tile keeps it wanted when the first stops wanting it (a view that
  // zooms in and straight back: the tile stayed blank).
  let firstWanted = true;
  const first = cache.load([1, 1, 1], { priority: () => (firstWanted ? 0 : -1) });
  first.catch(() => {});
  const second = cache.load([1, 1, 1], { priority: () => 0 });
  firstWanted = false;
  assert.equal(await second, null, "fetched for the load still wanting it");
  // prune() aborts a request under way that no load wants any more, and remembers nothing.
  let wanted = true;
  const slow = createTileCache({ url: "x", scheduler, fetchBytes: (url, tile, { signal }) => new Promise((resolve, reject) =>
    signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))) });
  const underway = slow.load([3, 0, 0], { priority: () => (wanted ? 0 : -1) });
  await new Promise((resolve) => setTimeout(resolve, 5));
  wanted = false;
  slow.prune();
  await assert.rejects(underway, (error) => error.name === "AbortError");
  assert.equal(slow.peek([3, 0, 0]), undefined, "an aborted request is not a failure");
  cache.seed([2, 0, 0], null);
  assert.equal(await cache.load([2, 0, 0]), null, "a seeded empty tile");
  scheduler.dispose();
});

test("tile caches are budgeted in bytes, used entries are recent, and kept tiles stay (TODO 63.5)", async () => {
  const kept = new Set(["a"]);
  const lru = createLru({ maxBytes: 100, maxEntries: 3, size: (value) => value.length, keep: (key) => kept.has(key) });
  const keys = () => lru.entries().map(([key]) => key);
  lru.set("a", "x".repeat(40));
  lru.set("b", "x".repeat(40));
  lru.set("c", "x".repeat(40));
  assert.deepEqual(keys(), ["a", "c"], "over 100 bytes the oldest unkept entry goes; a is kept");
  assert.equal(lru.bytes, 80);
  lru.set("d", "x");
  lru.get("c");
  lru.set("e", "x".repeat(10));
  assert.deepEqual(keys(), ["a", "c", "e"], "past 3 entries: d, used less recently than c");
  kept.clear();
  lru.set("f", "x".repeat(60));
  assert.deepEqual(keys(), ["e", "f"], "a goes once it is no longer kept");
  assert.equal(arrayBytes({ faces: { a: new Float32Array(4), part: new Uint8Array(3) }, text: ["x"] }), 19);
  // The raw tile cache keeps the tiles in use past its byte budget, and lets them go after.
  const scheduler = createRequestScheduler({ maxRequests: 4 }), inUse = new Set(["1/0/0"]);
  const cache = createTileCache({ url: "x", scheduler, maxBytes: 300, keep: (key) => inUse.has(key), fetchBytes: async () => new Uint8Array(200) });
  for (const x of [0, 1]) await cache.load([1, x, 0]);
  assert.equal(cache.peek([1, 0, 0])?.status, "ready", "in use: kept");
  assert.equal(cache.peek([1, 1, 0]), undefined, "over the budget");
  inUse.clear();
  await cache.load([1, 1, 1]);
  assert.equal(cache.peek([1, 0, 0]), undefined, "no longer in use");
  scheduler.dispose();
});

test("a tile job is shared while in flight and canceled only when every caller drops it; a click on a forgotten tile prepares it again (TODO 63.5)", async () => {
  let runs = 0, urgency;
  const share = sharedJobs((key, priority) => { runs++; urgency = priority; return new Promise((resolve) => setTimeout(() => resolve(key), 5)); });
  let first = 1, second = 2;
  const a = share("t", () => first), b = share("t", () => second);
  assert.equal(runs, 1);
  assert.equal(urgency(), 1, "the most urgent caller's priority");
  first = -1;
  assert.equal(urgency(), 2, "one caller dropping it keeps it wanted");
  second = -1;
  assert.equal(urgency(), -1, "every caller dropped it");
  assert.deepEqual(await Promise.all([a, b]), ["t", "t"]);
  await share("t");
  assert.equal(runs, 2, "a settled job runs again");
  // In process (no workers): features of the 96 tiles prepared last; an older one is prepared again.
  const workers = acquireTileWorkers(), styles = resolveStyles();
  const job = (x) => ({ bytes: encodeVectorTile([{ name: "streets", features: [{ type: 2, properties: { kind: "primary", name: `street ${x}` }, geometry: [[[0, 100], [4000, 100]]] }] }]),
    tile: [12, x, 1300], styles });
  for (let x = 0; x < 100; x++) await workers.process(`tile ${x}`, job(x));
  const street = (feature) => feature?.properties.name;
  assert.equal(street(await workers.feature("tile 99", 1)), "street 99");
  assert.equal(await workers.feature("tile 0", 1), null, "forgotten, with no job to prepare it again");
  assert.equal(street(await workers.feature("tile 0", 1, () => job(0))), "street 0");
  workers.release();
});

test("a polygon whose hole crosses the tile edge triangulates to its area inside the tile (TODO 35)", async () => {
  const { geoGeometry } = await import("../../src/lib/plot/utils/geoGeometry.js");
  // Water over the whole tile and its buffer, with land (a hole) crossing the east edge: the
  // zoom-5 Norway tile's case, which ring clipping triangulated to 9 times its area.
  const tile = [5, 16, 9];
  const layers = readVectorTile(encodeVectorTile([{ name: "ocean", features: [{ type: 3, properties: {},
    geometry: [square(-64, -64, 4160, 4160), square(3000, 1000, 4160, 3000).reverse()] }] }]));
  const features = tileFeatures(layers, tile);
  const mesh = geoGeometry({ type: "FeatureCollection", features }, { geographic: true, projection: "mercator", angularStep: 1e9, flat: true, polygonOutlines: false });
  let area = 0;
  const { a, b, c } = mesh.faces;
  for (let i = 0; i < mesh.faces.feature.length; i++) {
    const k = i * 3;
    area += Math.abs((b[k] - a[k]) * (c[k + 1] - a[k + 1]) - (c[k] - a[k]) * (b[k + 1] - a[k + 1])) / 2;
  }
  const project = tileProjection(tile, 4096), [west, south, east, north] = tileBounds(tile);
  const [hx0, hy1] = project([3000, 1000]), [, hy0] = project([3000, 3000]);
  const expected = (east - west) * (north - south) - (east - hx0) * (hy1 - hy0);
  assert.ok(Math.abs(area - expected) < 1e-6 * expected, `${area} vs ${expected}`);
  assert.ok([...a, ...b, ...c].every((v, i) => i % 3 === 2 || (i % 3 === 0 ? v >= west - 1e-9 && v <= east + 1e-9 : v >= south - 1e-9 && v <= north + 1e-9)), "inside the tile");
});

// TODO 66: live tiles under a 3D flyover camera. The ground of the Manhattan flyover: 0.004 world
// units per meter (250 m a unit) around -73.95, 40.72, plane="xz" (the plane's y is world -z).
const flyoverGround = { y: 0, lonLat: (x, z) => localPlaneInverse([-73.95, 40.72], 0.004)([x, -z]), metersPerUnit: 250 };
const eye = (position, direction, more = {}) => ({ position, direction, fov: 50, zoom: 1, aspect: 1.6, ...more });

test("a flyover loads a square around the camera sized by its height, and a zoom from a top-down view's resolution (TODO 66.0)", () => {
  const T = Math.tan((25 * Math.PI) / 180);
  // Straight down from 4 units (1 km): centered under the camera, 4 heights each way, and the
  // ground resolution of a top-down view (2 h tan(fov / 2) over 800 px, in meters).
  const down = flyoverView(eye([2, 4, -3], [0, -1, 0]), flyoverGround, 1280, 800);
  const [west, south, east, north] = down.box, [lonA, latA] = flyoverGround.lonLat(2 - 16, -3 - 16), [lonB, latB] = flyoverGround.lonLat(2 + 16, -3 + 16);
  close(west, lonA); close(east, lonB); close(south, latB); close(north, latA);
  assert.deepEqual(down.center, flyoverGround.lonLat(2, -3));
  close(down.metersPerPixel, (2 * 4 * T * 250) / 800, "a top-down view's meters per pixel");
  close(down.height, 4);
  // Zoom 15.6 by resolution, so maxZoom 14: 8 km across is 25 zoom-14 tiles. From 2.5 km up, zoom
  // 14.3 by resolution, but 20 km across is 121 zoom-14 tiles and 49 zoom-13 ones: zoom 12.
  assert.deepEqual([selectLiveTiles(down, { maxZoom: 14 }).z, selectLiveTiles(down, { maxZoom: 14 }).tiles.length], [14, 25]);
  const higher = flyoverView(eye([2, 10, -3], [0, -1, 0]), flyoverGround, 1280, 800);
  assert.equal(liveZoom(higher.metersPerPixel, higher.center[1]), 14);
  assert.deepEqual([tileRange(higher.box, 13).count, selectLiveTiles(higher, { maxZoom: 14 }).z], [49, 12]);
  // Tilted 45 degrees toward the north (-z): the center moves h cos(pitch) ahead; at the horizon h.
  const tilted = flyoverView(eye([0, 4, 0], [0, -Math.SQRT1_2, -Math.SQRT1_2]), flyoverGround, 1280, 800);
  close(tilted.center[1], flyoverGround.lonLat(0, -4 * Math.SQRT1_2)[1], "ahead along the view");
  close(flyoverView(eye([0, 4, 0], [0, 0, -1]), flyoverGround, 1280, 800).center[1], flyoverGround.lonLat(0, -4)[1], "one height ahead at the horizon");
  // The lens: a camera zoomed 4x sees finer ground and a smaller area (at most twice as small);
  // a wide canvas a wider one (at most twice as wide).
  const zoomed = flyoverView(eye([0, 4, 0], [0, -1, 0], { zoom: 4 }), flyoverGround, 1280, 800);
  close(zoomed.metersPerPixel, down.metersPerPixel / 4);
  close(zoomed.box[2] - zoomed.box[0], (down.box[2] - down.box[0]) / 2);
  const wide = flyoverView(eye([0, 4, 0], [0, -1, 0], { aspect: 4 }), flyoverGround, 3200, 800);
  close(wide.box[2] - wide.box[0], (down.box[2] - down.box[0]) * 2);
  // World units are not meters: half the units per meter is twice the meters per pixel.
  const coarse = flyoverView(eye([0, 4, 0], [0, -1, 0]), { ...flyoverGround, metersPerUnit: 500 }, 1280, 800);
  close(coarse.metersPerPixel, 2 * down.metersPerPixel);
  // Near the ground (or under it) the camera counts as FLYOVER_FLOOR (2 m) up: a small area at the
  // deepest zoom; looking at the horizon from there loads just as little.
  const low = flyoverView(eye([0, 0.0001, 0], [0, 0, -1]), flyoverGround, 1280, 800);
  close(low.height, 2 / 250);
  assert.ok(low.box[2] - low.box[0] < 0.001, "a few meters across");
  assert.equal(selectLiveTiles(low, { maxZoom: 14 }).z, 14);
  close(flyoverView(eye([0, -5, 0], [0, -1, 0]), flyoverGround, 1280, 800).height, 2 / 250, "under the ground");
  // Far up, the area and zoom stay within the tile budget: the world at zoom 2 at most.
  const high = flyoverView(eye([0, 1e9, 0], [0, -1, 0]), flyoverGround, 1280, 800);
  assert.ok(high.box[1] >= -85.06 && high.box[3] <= 85.06, "Web Mercator's latitudes");
  const selection = selectLiveTiles(high, { maxZoom: 14 });
  assert.ok(selection.z <= 2 && selection.tiles.length <= MAX_LIVE_TILES);
  // A camera that is not finite, or an empty canvas, loads nothing.
  assert.equal(flyoverView(eye([NaN, 4, 0], [0, -1, 0]), flyoverGround, 1280, 800), null);
  assert.equal(flyoverView(eye([0, 4, 0], [0, -1, 0]), flyoverGround, 0, 800), null);
});

test("a flyover's finer level must fit in three quarters of the tile budget, so a view at the budget's edge does not flap (TODO 66.0)", () => {
  // Boxes of columns x rows zoom-14 tiles (just inside their edges), at zoom 14's resolution.
  const view = (columns, rows) => {
    const [west, , , north] = tileBounds([14, 4820, 6150]), [, south, east] = tileBounds([14, 4820 + columns - 1, 6150 + rows - 1]);
    const box = [west + 1e-7, south + 1e-7, east - 1e-7, north - 1e-7];
    return { box, center: [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2], metersPerPixel: 1 };
  };
  assert.equal(tileRange(view(7, 7).box, 14).count, 49);
  assert.equal(selectLiveTiles(view(7, 7), { maxZoom: 14 }).z, 13, "49 zoom-14 tiles: one zoom coarser");
  // 42 tiles fit the budget, but with zoom 13 on screen zoom 14 must fit in 36 before it shows;
  // 35 do. Zoom 14 on screen keeps the whole budget.
  assert.equal(selectLiveTiles(view(6, 7), { maxZoom: 14 }).z, 14, "no level on screen");
  assert.equal(selectLiveTiles(view(6, 7), { maxZoom: 14, current: 13, hold: 0.75 }).z, 13, "held");
  assert.equal(selectLiveTiles(view(5, 7), { maxZoom: 14, current: 13, hold: 0.75 }).z, 14);
  assert.equal(selectLiveTiles(view(6, 7), { maxZoom: 14, current: 14, hold: 0.75 }).z, 14, "the level on screen keeps the whole budget");
  assert.equal(selectLiveTiles(view(6, 7), { maxZoom: 14, current: 13 }).z, 14, "2D: no hold");
});

test("buildings stand from their tags: height over min_height, 5 m when missing, flat at 0 or hide_3d; parts only extruded (TODO 66.3)", () => {
  assert.deepEqual(buildingHeights({ height: 22 }), { base: 0, top: 22 });
  assert.deepEqual(buildingHeights({ height: 30, min_height: 12 }), { base: 12, top: 30 });
  assert.deepEqual(buildingHeights({}), { base: 0, top: BUILDING_HEIGHT });
  assert.equal(BUILDING_HEIGHT, 5);
  for (const height of [-3, "tall", null, true, NaN]) assert.deepEqual(buildingHeights({ height }), { base: 0, top: 5 }, `height ${height}`);
  assert.deepEqual(buildingHeights({ height: "12" }), { base: 0, top: 12 }, "a number as text");
  assert.equal(buildingHeights({ height: 0 }), null, "a valid 0 is flat");
  assert.equal(buildingHeights({ height: 20, hide_3d: true }), null, "an outline whose parts stand instead");
  assert.equal(buildingHeights({ height: 10, min_height: 25 }), null, "a base over the top clamps to it: nothing stands");
  assert.deepEqual(buildingHeights({ height: 10, min_height: -4 }), { base: 0, top: 10 });
  // A tile in a local plane (1 unit per meter, its west edge the origin): a 22 m building with a
  // hole, a building part floating from 12 to 30 m, a hide_3d outline, a building crossing the east
  // edge and one with no height.
  const tile = [14, 8414, 5384], [west, south, east, north] = tileBounds(tile);
  const bytes = encodeVectorTile([{ name: "buildings", features: [
    { id: 1, type: 3, properties: { height: 22 }, geometry: [square(400, 400, 1400, 1400), square(700, 700, 1100, 1100).reverse()] },
    { id: 2, type: 3, properties: { height: 30, min_height: 12, part: true }, geometry: [square(2000, 400, 2400, 800)] },
    { id: 3, type: 3, properties: { height: 30, hide_3d: true }, geometry: [square(1900, 300, 2500, 900)] },
    { id: 4, type: 3, properties: { height: 8 }, geometry: [square(3800, 2000, 4200, 2400)] },
    { id: 5, type: 3, properties: {}, geometry: [square(400, 3000, 800, 3400)] },
  ] }]);
  const styles = resolveStyles({ places: false });
  const job = { bytes, tile, styles, geographic: false, origin: [west, south], unitsPerMeter: 1, angularStep: 1e9 };
  const flat2d = tileMesh(job).result, flat = tileMesh({ ...job, extrude: false }), up = tileMesh({ ...job, extrude: true });
  assert.equal(flat2d.counts.buildings, 0, "2D: flat, every building");
  assert.equal(flat.result.counts.buildings, 0);
  const layer = (mesh) => new Set([...mesh.result.faces.feature].map((i) => mesh.features[i].id).filter((id) => id !== undefined));
  assert.deepEqual(layer(flat), new Set([1, 3, 4, 5]), "flat: the part's polygon is left out, its outline drawn");
  assert.deepEqual(layer(up), new Set([1, 3, 4, 5]), "extruded: the flat footprints the same");
  const { a, b, c, feature } = up.result.buildings;
  const ids = new Set([...feature].map((i) => up.features[i].id));
  assert.deepEqual(ids, new Set([1, 2, 4, 5]), "the outline with hide_3d stays flat; the part stands");
  const z = (id) => [...feature].flatMap((f, i) => (up.features[f].id === id ? [a[i * 3 + 2], b[i * 3 + 2], c[i * 3 + 2]] : []));
  assert.deepEqual([...new Set(z(1))].sort((p, q) => p - q), [0, 22]);
  assert.deepEqual([...new Set(z(2))].sort((p, q) => p - q), [12, 30], "a floating part: its base and top");
  assert.deepEqual([...new Set(z(5))].sort((p, q) => p - q), [0, 5], "no height: 5 m");
  // The 22 m building: its roof (8 triangles around the hole), 8 walls of 2 triangles, no floor.
  assert.equal(z(1).length / 3, 8 + 16);
  // The floating part has a floor: roof 2 + floor 2 + walls 8.
  assert.equal(z(2).length / 3, 12);
  // The building over the east edge ends there: nothing past it, and no wall along it.
  const meters = localPlane([west, south], 1)([east, north]);
  const xs = [...feature].flatMap((f, i) => (up.features[f].id === 4 ? [a[i * 3], b[i * 3], c[i * 3]] : []));
  assert.ok(Math.max(...xs) <= meters[0] + 1e-3, "clipped to the tile");
  const walls = [...feature].filter((f, i) => up.features[f].id === 4 && a[i * 3 + 2] !== b[i * 3 + 2] || false);
  assert.ok(walls.length > 0 && walls.length < 8, "three walls, the fourth on the tile edge left out");
  // Units per meter scale the elevations.
  const scaled = tileMesh({ ...job, unitsPerMeter: 0.004, extrude: true }).result.buildings;
  assert.ok(Math.abs(Math.max(...scaled.a.filter((_, i) => i % 3 === 2)) - 30 * 0.004) < 1e-6);
  // One fill for every building, from the buildings part.
  assert.equal(paintTile(up.result, resolveStyles({ buildings: { fill: "#123456" } })).buildings.fill, "#123456");
});
