// TODO 137.5: every keyword a mark lists among those that only some marks read changes what
// that mark draws. Each case draws the mark twice, with and without the keyword's value, and
// counts the pixels that differ (keyword-effects page).
import { test, expect } from "./fixtures.js";
import { optionsTable, componentOptions } from "../../src/lib/scene/options.js";

const n = 40, rows = Array.from({ length: n }, (_, i) => i);
const data = {
  x: rows.map((i) => i / 4), y: rows.map((i) => 2 + Math.sin(i / 3) * 2 + (i % 2) * 1.5),
  z: rows.map((i) => (i % 5) / 2), g: rows.map((i) => (i % 2 ? "a" : "b")),
  cat: rows.map((i) => "ABCD"[i % 4]), value: rows.map((i) => 1 + (i % 7)),
  lower: rows.map((i) => 1 + Math.sin(i / 3)), upper: rows.map((i) => 3 + Math.sin(i / 3)),
  x0: rows.map((i) => i / 4), x1: rows.map((i) => i / 4 + 0.2), y0: rows.map(() => 0), y1: rows.map((i) => 1 + (i % 7)),
  lon: rows.map((i) => -150 + i * 7), lat: rows.map((i) => -40 + (i % 9) * 10),
};
const grid = [[0, 1, 2, 1], [1, 3, 4, 2], [2, 4, 3, 1]];
const segs = { start: [[0, 0], [1, 2], [2, 1], [3, 3]], end: [[1, 1], [2, 3], [4, 0], [5, 2]] };
const geo = { type: "FeatureCollection", features: [
  { type: "Feature", properties: { value: 1 }, geometry: { type: "LineString", coordinates: [[-120, 10], [-20, 60], [60, 40]] } },
  { type: "Feature", properties: { value: 2 }, geometry: { type: "Polygon", coordinates: [[[-100, -40], [40, -40], [0, 20], [-100, -40]]] } },
] };
const threeD = { type: "3d", axes3d: false };
// Each mark's base drawing: its props and the Plot's.
const BASE = {
  Points: { props: { data, x: "x", y: "y" } },
  Points3D: { plot: threeD, props: { data, x: "x", y: "y", z: "z" } },
  Line: { props: { data, x: "x", y: "y" } },
  Area: { props: { data, x: "x", lower: "lower", upper: "upper" } },
  Segments: { props: segs },
  Arrows: { props: segs },
  Arrows3D: { plot: threeD, props: { start: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], end: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], width: 1 } },
  BandX: { plot: { x: { domain: [0, 10] }, y: { domain: [0, 10] } }, props: { data: { lo: [1, 5], hi: [3, 8] }, x0: "lo", x1: "hi" } },
  BandY: { plot: { x: { domain: [0, 10] }, y: { domain: [0, 10] } }, props: { data: { lo: [1, 5], hi: [3, 8] }, y0: "lo", y1: "hi" } },
  Rect: { props: { data, x0: "x0", x1: "x1", y0: "y0", y1: "y1" } },
  Prism: { plot: threeD, props: { data, x: "x", y: "z", z0: 0, z1: "value" } },
  Heatmap: { props: { fill: grid } },
  Image: { props: { data: [[[0.9, 0.3, 0.2], [0.95, 0.75, 0.2], [0.3, 0.7, 0.4]], [[0.2, 0.5, 0.8], [0.5, 0.3, 0.7], [0.9, 0.9, 0.9]]] } },
  Surface: { plot: threeD, props: { height: grid } },
  Text: { props: { data, x: "x", y: "y", text: "cat" } },
  Text3D: { plot: threeD, props: { text: "Hello", position: [0, 0, 0], size: 10 } },
  Callout: { props: { data, x: "x", y: "y", text: "cat" } },
  ErrorBars: { props: { data, x: "x", y: "y", lower: "lower", upper: "upper" } },
  GeoJSON: { plot: { coordinates: "spherical", projection: "mercator" }, props: { data: geo, fill: "value" } },
  Histogram: { props: { data, x: "value", bins: 5 } },
  Violin: { props: { data, x: "cat", y: "value" } },
  BoxPlot: { props: { data, x: "cat", y: "value" } },
  Swarm: { props: { data, x: "cat", y: "value" } },
  Bar: { props: { data, x: "cat", y: "value" } },
  Lollipop: { props: { data, x: "cat", y: "value" } },
  RuleX: { props: { data, x: "x" } },
  RuleY: { props: { data, y: "y" } },
  Smooth: { props: { data, x: "x", y: "y", method: "poly", order: 3, band: false } },
  Ecdf: { props: { data, x: "value" } },
  Polygon: { props: { data: { x: [0, 2, 2, 0, 3, 5, 4], y: [0, 0, 2, 2, 0, 0, 2], g: ["a", "a", "a", "a", "b", "b", "b"] }, x: "x", y: "y" } },
  DensityContour: { props: { data, x: "x", y: "y" } },
  DensityBands: { props: { data, x: "x", y: "y" } },
  Pie: { props: { data, value: "value", category: "cat" } },
  Candlestick: { props: { data: { x: [0, 1, 2], open: [2, 3, 2], close: [3, 2, 4], low: [1, 1, 1], high: [4, 4, 5] }, x: "x", open: "open", close: "close", low: "low", high: "high" } },
  Dumbbell: { props: { data, y: "cat", x0: "lower", x1: "upper" } },
  Waterfall: { props: { data, x: "x", y: "value" } },
  ForestPlot: { props: { data, x: "x", y: "cat", lower: "lower", upper: "upper" } },
  BulletChart: { props: { data, x: "value", y: "cat", target: "upper" } },
  IntervalTimeline: { props: { data, x0: "lower", x1: "upper", y: "cat" } },
  Sparkline: { props: { data, x: "x", y: "y" } },
  EndLabels: { props: { data, x: "x", y: "y", text: "cat" } },
};
// Marks drawn as a Prism, whose footprints are rectangle, hexagon and the like.
const PRISMS = ["Prism", "Bar", "BulletChart", "IntervalTimeline"];
const spherical = { coordinates: "spherical", projection: "mercator" };
// What each keyword is set to, and any props or Plot settings it needs to show.
const VARIANT = {
  series: () => ({ variant: { series: "g" } }),
  start: (kind) => ({ variant: { start: kind === "Arrows3D" ? [[0, 0, 1], [1, 0, 0], [0, 1, 0]] : [[0, 3], [1, 0], [2, 3], [3, 0]] } }),
  end: (kind) => ({ variant: { end: kind === "Arrows3D" ? [[1, 1, 1], [1, 1, 0], [0, 1, 1]] : [[0, 3], [3, 0], [1, 3], [5, 3]] } }),
  sampling: () => ({ base: { maxInstances: 6 }, variant: { sampling: "uniform-x" } }),
  maxInstances: () => ({ variant: { maxInstances: 1 } }),
  textureResolution: () => ({ variant: { textureResolution: [4, 4] } }),
  interpolation: (kind) => ({ plot: spherical, base: geoBase(kind), variant: { interpolation: "cartesian" } }),
  rotation: (kind) => ({ base: { shape: PRISMS.includes(kind) ? "rectangle" : "square", size: 14 }, variant: { rotation: 45 } }),
  shape: (kind) => ({ base: { size: 14 }, variant: { shape: kind === "Points3D" ? "cube" : PRISMS.includes(kind) ? "hexagon" : "square" } }),
  sizeUnits: () => ({ variant: { sizeUnits: "data" } }),
};
// On a map, a mark's positions as longitude and latitude. Segment arcs stay away from
// the Mercator poles: a pole-crossing great circle has no finite projected subdivision.
const geoBase = (kind) => ({ Arrows3D: { start: [[-60, -20, 0], [-30, 10, 0]], end: [[30, 30, 0], [60, 50, 0]], width: 2 }, DensityContour: { x: "lon", y: "lat", resolution: 4, bandwidth: 20, bounds: { x: [-160, 130], y: [-70, 70] } }, Line: { x: "lon", y: "lat" }, Area: { x: "lon", upper: "lat" }, Segments: { start: [[-60, -20], [-30, 10]], end: [[30, 30], [60, 50]] }, Arrows: { start: [[-60, -20], [-30, 10]], end: [[30, 30], [60, 50]] } })[kind] ?? {};
const KEYWORDS = Object.keys(VARIANT);
// Keywords these single-mark drawings cannot show, and why they stay.
const UNSEEN = {
  "Heatmap.textureResolution": "sizes the texture a Heatmap's child marks paint into; these drawings have no children",
  "Ecdf.sampling": "passed to Ecdf's Line, which reads it; this small ECDF's two samples draw the same",
};
const cases = [];
for (const [kind, component] of Object.entries(optionsTable.components)) {
  if (!component.mark || !BASE[kind]) continue;
  const names = new Set(componentOptions(kind).map((option) => option.name));
  for (const keyword of KEYWORDS) if (names.has(keyword) && !UNSEEN[`${kind}.${keyword}`]) cases.push([kind, keyword]);
}

// The pixels that differ between two PNG screenshots (decoded in the page), beyond a small
// tolerance: two Plots drawing the same thing differ in a few antialiased edge pixels.
const differing = (page, a, b) => page.evaluate(async ([a, b]) => {
  const read = async (text) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${text}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
  };
  const [x, y] = await Promise.all([read(a), read(b)]);
  if (x.length !== y.length) return Infinity;
  let count = 0;
  for (let i = 0; i < x.length; i += 4)
    if (Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2]) > 48) count++;
  return count;
}, [a.toString("base64"), b.toString("base64")]);
test.use({ deviceScaleFactor: 1 });
test("every mark in the table has a base drawing here", () => {
  const marks = Object.entries(optionsTable.components).filter(([, c]) => c.mark).map(([k]) => k);
  // Anchor draws nothing; Crosshair draws at the pointer; VectorTile needs a tile server.
  expect(marks.filter((kind) => !BASE[kind] && !["Anchor", "Crosshair", "VectorTile"].includes(kind))).toEqual([]);
});
test("control: each mark draws the same twice", async ({ page }) => {
  test.skip(!process.env.KEYWORD_EFFECTS_CONTROL);
  test.setTimeout(30 * 60_000);
  await page.goto("/test/keyword-effects");
  await page.waitForFunction(() => window.keywordEffects);
  for (const [kind, { plot, props }] of Object.entries(BASE)) {
    const own = ["GeoJSON", "Image"].includes(kind), { data: table, ...rest } = props;
    const spec = { mark: kind, plot: { ...plot, ...(own || !table ? {} : { data: table }) }, base: own ? props : rest, variant: {} };
    const error = await page.evaluate((spec) => window.keywordEffects.draw(spec), spec);
    const [a, b] = await Promise.all(["#base", "#variant"].map((id) => page.locator(`${id} canvas`).first().screenshot()));
    console.log(`CONTROL ${kind}: ${await differing(page, a, b)} ${error}`);
  }
});
test("each keyword a mark lists changes what it draws", async ({ page }) => {
  test.setTimeout(30 * 60_000);
  await page.goto("/test/keyword-effects");
  await page.waitForFunction(() => window.keywordEffects);
  const unchanged = [], failed = [];
  for (const [kind, keyword] of cases) {
    const { plot, props } = BASE[kind], extra = VARIANT[keyword](kind);
    // A table goes on the Plot; GeoJSON's features and Image's pixels are the mark's own data.
    const own = ["GeoJSON", "Image"].includes(kind), { data: table, ...rest } = props;
    const base = { ...(own ? props : rest), ...extra.base };
    const spec = { mark: kind, plot: { ...plot, ...(own || !table ? {} : { data: table }), ...extra.plot }, base, variant: extra.variant };
    const error = await page.evaluate((spec) => window.keywordEffects.draw(spec), spec);
    const [a, b] = await Promise.all(["#base", "#variant"].map((id) => page.locator(`${id} canvas`).first().screenshot()));
    const changed = await differing(page, a, b), same = changed < 10;
    if (process.env.KEYWORD_EFFECTS_LOG) console.log(`${kind}.${keyword}: ${same ? "same" : "changed"} ${changed}${error ? ` (${error.slice(0, 100)})` : ""}`);
    // A drawing that errors says nothing about the keyword: fix the drawing.
    if (error) failed.push(`${kind}.${keyword}: ${error.slice(0, 100)}`);
    else if (same) unchanged.push(`${kind}.${keyword}`);
  }
  expect(failed).toEqual([]);
  expect(unchanged).toEqual([]);
});
