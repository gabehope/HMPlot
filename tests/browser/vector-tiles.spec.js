// TODO 24: VectorTile loads the tiles it is given (routed here, built with the test encoder) and
// draws them as a styled basemap in a 2D map. Fixture: src/routes/test/vector-tiles.
import { test, expect } from "./fixtures.js";
import fs from "node:fs";
import { encodeVectorTile } from "../unit/vectorTileEncoder.js";
import { installGpuCounters, installGpuErrors, gpuCounters } from "./gpu-counters.js";
import { pixelReader } from "./png.js";
import { themes } from "../../src/lib/plot/utils/themePresets.js";
import { mergeThemes } from "../../src/lib/plot/utils/theme.js";
import { vectorTileScheme } from "../../src/lib/plot/utils/vectorTileStyle.js";
import { localPlane, tileBounds, tileProjection } from "../../src/lib/plot/utils/vectorTiles.js";
import { cameraBasis } from "../../src/lib/plot/utils/camera.js";

const square = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
// Water on the west half, a park in the north-east quarter, a building and a road in the
// south-east quarter, a place name, and a POI (hidden by default).
const TILE = encodeVectorTile([
  { name: "water_polygons", features: [{ id: 1, type: 3, properties: { kind: "water" }, geometry: [square(-64, -64, 2048, 4160)] }] },
  { name: "land", features: [{ id: 2, type: 3, properties: { kind: "park" }, geometry: [square(2048, 0, 4096, 2048)] }] },
  { name: "buildings", features: [{ id: 3, type: 3, properties: { height: 12 }, geometry: [square(2600, 2600, 3600, 3600)] }] },
  { name: "streets", features: [{ id: 4, type: 2, properties: { kind: "primary" }, geometry: [[[2100, 2300], [4000, 2300]]] }] },
  { name: "place_labels", features: [{ id: 5, type: 1, properties: { kind: "suburb", name: "Testville" }, geometry: [[3000, 1000]] }] },
  { name: "pois", features: [{ id: 6, type: 1, properties: { name: "Hidden" }, geometry: [[3000, 3000]] }] },
]);
// Every other tile: water everywhere.
const WATER = encodeVectorTile([{ name: "water_polygons", features: [{ type: 3, properties: { kind: "water" }, geometry: [square(0, 0, 4096, 4096)] }] }]);
const OCEAN = encodeVectorTile([{ name: "ocean", features: [{ type: 3, geometry: [square(0, 0, 4096, 4096)] }] }]);

async function open(page, { query = "", tile = "12/2000/1300", fallback = WATER, delays = {}, status = {} } = {}) {
  const requests = [], errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/vt-api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/vt-api/", "").replace(".mvt", "");
    requests.push(path);
    const delay = typeof delays === "function" ? delays(path) : delays[path], code = typeof status === "function" ? status(path) : status[path];
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    if (code) return route.fulfill({ status: code, body: "missing" }).catch(() => {});
    await route.fulfill({ contentType: "application/vnd.mapbox-vector-tile", body: Buffer.from(path === "12/2000/1300" ? TILE : fallback) }).catch(() => {});
  });
  await page.goto(`/test/vector-tiles?url=${encodeURIComponent("/vt-api/{z}/{x}/{y}.mvt")}&tile=${tile}${query}`);
  await page.waitForFunction(() => window.vectorTiles?.plot && window.vectorTiles?.tiles);
  return { requests, errors };
}

// The plot's pixels as [r, g, b] at fractions of its width and height (720 x 480, toneMapping 0).
const colors = (page, points) => page.evaluate(async (points) => {
  const image = await createImageBitmap(await window.vectorTiles.plot.exportPNG());
  const canvas = new OffscreenCanvas(image.width, image.height), context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  return points.map(([fx, fy]) => [...context.getImageData(Math.round(fx * image.width), Math.round(fy * image.height), 1, 1).data.slice(0, 3)]);
}, points);
const hex = (value) => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
const near = (actual, expected, message) =>
  expect(actual.every((channel, i) => Math.abs(channel - hex(expected)[i]) <= 6), `${message}: ${actual} vs ${expected}`).toBe(true);
// The tile fills the 480 px height, centered in the 720 px width: tile fraction -> plot fraction.
const at = (u, v) => [(120 + 480 * u) / 720, v];

test.describe('centered joint projections', () => {
  test.use({ deviceScaleFactor: 2 });
  for (const projection of ['equal-earth', 'natural-earth', 'albers'])
    test(`${projection} keeps live tiles aligned with points across the centered seam`, async ({ page }) => {
      const { errors } = await open(page, { tile: '1/0/0', fallback: OCEAN,
        query: `&live=1&fit=0&maxZoom=1&projection=${projection}&center=135,0&marker=-135,30` });
      const aligned = async () => {
        await page.waitForFunction(() => [...document.querySelectorAll('.canvas')].every((canvas) => canvas.getAttribute('aria-busy') === 'false'));
        await page.evaluate(() => window.vectorTiles.plot.whenSettled());
        const pixels = await page.evaluate(async () => {
          const bitmap = await createImageBitmap(await window.vectorTiles.plot.exportPNG());
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext('2d');
          context.drawImage(bitmap, 0, 0); bitmap.close();
          const { data, width } = context.getImageData(0, 0, canvas.width, canvas.height);
          let x = 0, y = 0, count = 0;
          for (let i = 0; i < data.length; i += 4) if (data[i] < 40 && data[i + 1] > 200 && data[i + 2] < 40) {
            x += i / 4 % width; y += Math.floor(i / 4 / width); count++;
          }
          x = Math.round(x / count); y = Math.round(y / count);
          return { count, around: [-24, 24].flatMap((dx) => [-24, 24].map((dy) =>
            [...context.getImageData(x + dx, y + dy, 1, 1).data.slice(0, 3)])) };
        });
        expect(pixels.count, 'the marker is drawn').toBeGreaterThan(20);
        for (const pixel of pixels.around) near(pixel, '#aad3df', 'water surrounds the same geographic point');
      };
      await aligned();
      // The settings pane changes projection without remounting the live tile source.
      await page.evaluate(() => window.vectorTiles.setProjection('orthographic', [0, 0]));
      await page.evaluate(() => window.vectorTiles.plot.whenSettled());
      await page.evaluate((projection) => window.vectorTiles.setProjection(projection, [135, 0]), projection);
      await aligned();
      expect(errors).toEqual([]);
    });
});

test("the tile loads, each part draws in its style, the map frames the tile, and whenSettled waits for the load", { tag: "@gpu" }, async ({ page }) => {
  const { requests, errors } = await open(page, { delays: { "12/2000/1300": 400 } });
  const started = Date.now();
  await page.evaluate(() => window.vectorTiles.plot.whenSettled());
  expect(Date.now() - started).toBeGreaterThan(300);
  expect(requests).toEqual(["12/2000/1300"]);
  const state = await page.evaluate(() => ({
    loads: window.vectorTiles.loads.map(({ tiles, features }) => ({ tiles, features })),
    parts: Object.keys(window.vectorTiles.tiles.getParts()).sort(),
    status: window.vectorTiles.tiles.getStatus(),
    viewport: window.vectorTiles.plot.getViewport(),
  }));
  // The POI layer is not decoded: five features.
  expect(state.loads).toEqual([{ tiles: [[12, 2000, 1300]], features: 5 }]);
  expect(state.parts).toEqual(["background", "buildings", "green", "majorRoads", "places", "water"]);
  expect(state.status).toEqual({ pending: false, error: "", tiles: 1, features: 5, live: null });
  expect(state.viewport.zoom).toBeCloseTo(4096, 3);
  expect(state.viewport.x).toBeCloseTo(2000.5 / 4096, 9);
  expect(state.viewport.y).toBeCloseTo(1 - 1300.5 / 4096, 9);
  // The road is 1.9 pixels wide at zoom 12 (roads thin as the zoom goes out): its color is on one
  // of the three pixel rows across it.
  const [water, park, building, background, outside, ...across] = await colors(page, [at(0.25, 0.5), at(0.75, 0.3), at(0.76, 0.76), at(0.6, 0.95), [0.05, 0.5],
    ...[-1, 0, 1].map((dy) => at(0.9, 2300 / 4096 + dy / 480))]);
  const road = across.reduce((best, value) => (value[2] < best[2] ? value : best));
  near(water, "#aad3df", "water");
  near(park, "#cfe5c0", "park");
  near(building, "#d9d0c9", "building");
  near(background, "#f2efe9", "background");
  near(outside, "#ffffff", "outside the tile");
  near(road, "#f7cf8e", "major road");
  expect(errors).toEqual([]);
});

test("clicking a feature reports it with its layer and tags", async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.vectorTiles.plot.whenSettled());
  const box = await page.locator("canvas").first().boundingBox();
  const [fx, fy] = at(0.76, 0.76);
  await page.mouse.click(box.x + fx * box.width, box.y + fy * box.height);
  await expect.poll(() => page.evaluate(() => window.vectorTiles.clicked)).toEqual({ layerName: "buildings", height: 12 });
});

test("a newer tile list aborts the load in flight; the tiles on screen stay until the next load, and through an error", async ({ page }) => {
  const { requests } = await open(page, { delays: { "12/2001/1300": 1500, "12/2002/1300": 600 }, status: { "12/9/9": 404 } });
  await page.evaluate(() => window.vectorTiles.plot.whenSettled());
  // B starts loading, C supersedes it: B's result is never shown.
  await page.evaluate(() => window.vectorTiles.set({ tile: [12, 2001, 1300] }));
  await expect.poll(() => requests.includes("12/2001/1300")).toBe(true);
  await page.evaluate(() => window.vectorTiles.set({ tile: [12, 2002, 1300] }));
  await expect.poll(() => page.evaluate(() => window.vectorTiles.tiles.getStatus().pending)).toBe(true);
  expect(await page.evaluate(() => window.vectorTiles.tiles.getResult().tiles)).toEqual([[12, 2000, 1300]]);
  await page.evaluate(() => window.vectorTiles.plot.whenSettled());
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => window.vectorTiles.loads.map((load) => load.tiles[0].join("/")))).toEqual(["12/2000/1300", "12/2002/1300"]);
  expect(await page.evaluate(() => window.vectorTiles.tiles.getResult().tiles)).toEqual([[12, 2002, 1300]]);
  // The map moved to C.
  expect(await page.evaluate(() => window.vectorTiles.plot.getViewport().x)).toBeCloseTo(2002.5 / 4096, 9);
  // A missing tile: C stays, the plot shows the error, and the next load clears it.
  await page.evaluate(() => window.vectorTiles.set({ tile: [12, 9, 9] }));
  await page.evaluate(() => window.vectorTiles.plot.whenSettled());
  const failed = await page.evaluate(() => ({ errors: window.vectorTiles.errors, status: window.vectorTiles.tiles.getStatus(), tiles: window.vectorTiles.tiles.getResult().tiles }));
  expect(failed.errors).toEqual(["VectorTile: HTTP 404 Not Found: /vt-api/12/9/9.mvt"]);
  expect(failed.status.error).toBe("VectorTile: HTTP 404 Not Found: /vt-api/12/9/9.mvt");
  expect(failed.tiles).toEqual([[12, 2002, 1300]]);
  await expect(page.getByText("VectorTile: HTTP 404 Not Found")).toBeVisible();
  await page.evaluate(() => window.vectorTiles.set({ tile: [12, 2000, 1300] }));
  await page.evaluate(() => window.vectorTiles.plot.whenSettled());
  expect(await page.evaluate(() => window.vectorTiles.tiles.getStatus().error)).toBe("");
  await expect(page.getByText("VectorTile: HTTP 404 Not Found")).toBeHidden();
});

test("styles restyle and hide parts without a reload; showing a part whose layers were skipped loads again", async ({ page }) => {
  // The first load hides the buildings, so their layer is not decoded.
  const { requests } = await open(page, { query: `&styles=${encodeURIComponent(JSON.stringify({ buildings: false }))}` });
  await page.evaluate(() => window.vectorTiles.plot.whenSettled());
  expect(Object.keys(await page.evaluate(() => window.vectorTiles.tiles.getParts()))).not.toContain("buildings");
  near((await colors(page, [at(0.76, 0.76)]))[0], "#f2efe9", "hidden building (background)");
  await page.evaluate(() => window.vectorTiles.set({ tile: [12, 2000, 1300], styles: { water: { fill: "#204080" }, buildings: false, places: false } }));
  await page.evaluate(() => window.vectorTiles.plot.whenSettled());
  expect(requests).toEqual(["12/2000/1300"]);
  expect(Object.keys(await page.evaluate(() => window.vectorTiles.tiles.getParts()))).not.toContain("places");
  near((await colors(page, [at(0.25, 0.5)]))[0], "#204080", "restyled water");
  // Showing the buildings needs their layer: the tile loads again.
  await page.evaluate(() => window.vectorTiles.set({ tile: [12, 2000, 1300] }));
  await page.evaluate(() => window.vectorTiles.plot.whenSettled());
  expect(requests).toEqual(["12/2000/1300", "12/2000/1300"]);
  near((await colors(page, [at(0.76, 0.76)]))[0], "#d9d0c9", "building again");
  expect(Object.keys(await page.evaluate(() => window.vectorTiles.tiles.getParts()))).toContain("places");
});

test("several tiles draw side by side, and an orthographic map centers on them", async ({ page }) => {
  await open(page, { query: "&projection=orthographic" });
  await page.evaluate(() => window.vectorTiles.set({ tiles: [[12, 2000, 1300], [12, 2001, 1300]] }));
  await page.evaluate(() => window.vectorTiles.plot.whenSettled());
  await expect.poll(() => page.evaluate(() => window.vectorTiles.tiles.getResult()?.tiles.length)).toBe(2);
  const viewport = await page.evaluate(() => window.vectorTiles.plot.getViewport());
  // The two tiles' box: longitudes from tile 2000's west edge to tile 2001's east edge.
  const west = (2000 / 4096) * 360 - 180, east = (2002 / 4096) * 360 - 180;
  const lat = (row) => (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - (2 * row) / 4096)));
  expect(viewport.center[0]).toBeCloseTo((west + east) / 2, 6);
  expect(viewport.center[1]).toBeCloseTo((lat(1300) + lat(1301)) / 2, 6);
  expect(viewport.zoom).toBeGreaterThan(500);
});

// TODO 36: the enclosing Theme's scheme colors the map; scheme picks another; styles adjust both.
test("a Theme's basemap scheme colors the tiles; scheme overrides it, styles override both, and a custom theme derives one", async ({ page }) => {
  await open(page, { query: "&theme=dark" });
  await page.evaluate(() => window.vectorTiles.plot.whenSettled());
  const dark = themes.dark.vectorTile;
  let [water, background, building, outside] = await colors(page, [at(0.25, 0.5), at(0.6, 0.95), at(0.76, 0.76), [0.05, 0.5]]);
  near(water, dark.water.fill, "dark water");
  near(background, dark.background.fill, "dark background part");
  near(building, dark.buildings.fill, "dark building");
  near(outside, themes.dark.view.background, "the dark plot background");
  await page.evaluate(() => window.vectorTiles.set({ tile: [12, 2000, 1300], scheme: "sea" }));
  await page.evaluate(() => window.vectorTiles.plot.whenSettled());
  near((await colors(page, [at(0.25, 0.5)]))[0], themes.sea.vectorTile.water.fill, "scheme sea");
  await page.evaluate(() => window.vectorTiles.set({ tile: [12, 2000, 1300], scheme: "sea", styles: { water: { fill: "#204080" } } }));
  await page.evaluate(() => window.vectorTiles.plot.whenSettled());
  near((await colors(page, [at(0.25, 0.5)]))[0], "#204080", "styles over the scheme");
  // A custom theme with its own colors and no vectorTile section: a scheme from its colors (not
  // minimal's, which the Theme merges it over).
  const custom = { view: { background: "#0b0b0b" }, typography: { color: "#f0f0f0" }, palette: ["#3399ff", "#33cc66", "#ff9933"] };
  await page.evaluate((custom) => { window.vectorTiles.set({ tile: [12, 2000, 1300] }); window.vectorTiles.setTheme(custom); }, custom);
  await page.evaluate(() => window.vectorTiles.plot.whenSettled());
  const derived = vectorTileScheme(mergeThemes(themes.minimal, custom));
  [water, background] = await colors(page, [at(0.25, 0.5), at(0.6, 0.95)]);
  near(water, derived.water.fill, "derived water");
  near(background, derived.background.fill, "derived background part");
});

// TODO 35: live tiles. Every tile but 12/2000/1300 is water (WATER); the fixture is live with ?live=1.
test.describe("live tiles", () => {
  test.use({ deviceScaleFactor: 2 });
  const status = (page) => page.evaluate(() => window.vectorTiles.tiles.getStatus());
  const zoomBy = (page, factor) => page.evaluate((factor) => {
    const plot = window.vectorTiles.plot, v = plot.getViewport();
    plot.setViewport({ ...v, zoom: v.zoom * factor, zoomX: v.zoomX * factor, zoomY: v.zoomY * factor });
  }, factor);

  test("live tiles follow the view: frames keep coming while they load, nothing loads twice, the previous level shows until the next covers it, and the zoom stops at maxZoom", { tag: ["@gpu", "@timing"] }, async ({ page }) => {
    const { requests, errors } = await open(page, { query: "&live=1", delays: (path) => (path.startsWith("13/") ? 800 : 0) });
    await page.evaluate(() => window.vectorTiles.plot.whenSettled());
    let live = (await status(page)).live;
    // The fitted view shows the zoom-12 tile at 480 px: its own zoom is the nearest (deck.gl's
    // choice), and live zoom-12 tiles fill the view around it.
    expect(live).toMatchObject({ zoom: 12, failed: 0, previous: 0 });
    expect(live.shown).toBe(live.selected);
    near((await colors(page, [at(0.25, 0.5)]))[0], "#aad3df", "the requested tile's water");
    // Pan three zoom-11 tiles east, counting the frames drawn meanwhile.
    const before = requests.length;
    const frames = await page.evaluate(async () => {
      const plot = window.vectorTiles.plot, start = plot.getViewport(), first = plot.getDiagnostics().completedFrame, t0 = performance.now();
      await new Promise((resolve) => {
        const step = () => {
          const t = performance.now() - t0;
          plot.setViewport({ ...start, x: start.x + (3 / 2048) * Math.min(1, t / 1000) });
          if (t < 1200) requestAnimationFrame(step); else resolve();
        };
        requestAnimationFrame(step);
      });
      return plot.getDiagnostics().completedFrame - first;
    });
    expect(frames).toBeGreaterThan(40);
    await page.evaluate(() => window.vectorTiles.plot.whenSettled());
    expect(requests.length).toBeGreaterThan(before);
    expect(new Set(requests).size, "no tile loads twice").toBe(requests.length);
    live = (await status(page)).live;
    expect(live.shown).toBe(live.selected);
    // Zoom in, away from the requested tile: the zoom-12 level stays on screen while zoom 13 loads.
    await zoomBy(page, 2);
    await expect.poll(async () => (await status(page)).live.zoom).toBe(13);
    live = (await status(page)).live;
    expect(live.previous).toBeGreaterThan(0);
    expect(live.shown).toBeLessThan(live.selected);
    near((await colors(page, [[0.5, 0.5]]))[0], "#aad3df", "the previous level's water while zoom 13 loads");
    await page.evaluate(() => window.vectorTiles.plot.whenSettled());
    live = (await status(page)).live;
    expect(live).toMatchObject({ zoom: 13, previous: 0 });
    expect(live.shown).toBe(live.selected);
    // Past maxZoom (14) nothing deeper loads; the zoom-14 tiles stretch.
    await zoomBy(page, 64);
    await page.evaluate(() => window.vectorTiles.plot.whenSettled());
    expect((await status(page)).live.zoom).toBe(14);
    expect(requests.filter((path) => Number(path.split("/")[0]) > 14)).toEqual([]);
    expect(errors).toEqual([]);
  });

  // TODO 63: dense tiles (the bundled Amsterdam tile at every zoom-14 tile, 670 KB, 36,000
  // triangles) arriving while the view moves.
  const DENSE = { 14: "14/8414/5384", 13: "13/2411/3080", 12: "12/1206/1538" };
  // Counts the jobs posted to the tile workers (window.__tileJobs).
  const countJobs = (page) => page.addInitScript(() => {
    window.__tileJobs = 0;
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, ...rest) {
      if (message?.job) window.__tileJobs++;
      return post.call(this, message, ...rest);
    };
  });
  async function openDense(page, { query = "", delay = 0 } = {}) {
    await page.addInitScript(installGpuCounters);
    await page.addInitScript(installGpuErrors);
    await countJobs(page);
    const bytes = Object.fromEntries(Object.entries(DENSE).map(([z, path]) => [z, fs.readFileSync(`static/data/vector-tiles/${path}.mvt`)]));
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/vt-dense/**", async (route) => {
      const z = Number(new URL(route.request().url()).pathname.split("/")[2]);
      if (z === 14 && delay) await new Promise((resolve) => setTimeout(resolve, delay));
      await route.fulfill({ contentType: "application/vnd.mapbox-vector-tile", body: bytes[z] ?? Buffer.from(WATER) }).catch(() => {});
    });
    await page.goto(`/test/vector-tiles?url=${encodeURIComponent("/vt-dense/{z}/{x}/{y}.mvt")}&tile=14/8414/5384&live=1${query}`);
    await page.waitForFunction(() => window.vectorTiles?.plot && window.vectorTiles?.tiles);
    await page.waitForFunction(() => [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"));
    await page.evaluate(() => window.vectorTiles.plot.whenSettled());
    return errors;
  }
  // Moves the viewport every animation frame for `ms` (`to(start, u)`, u from 0 to 1); returns the
  // animation frames and the plot's completed frames meanwhile.
  const move = (page, kind, ms, amount) => page.evaluate(async ({ kind, ms, amount }) => {
    const plot = window.vectorTiles.plot, start = plot.getViewport(), first = plot.getDiagnostics().completedFrame, t0 = performance.now();
    let frames = 0;
    await new Promise((resolve) => {
      const step = () => {
        const u = Math.min(1, (performance.now() - t0) / ms);
        frames++;
        if (kind === "pan") plot.setViewport({ ...start, x: start.x + amount * (u < 0.5 ? 2 * u : 2 - 2 * u) });
        else {
          const f = 2 ** (-amount * Math.sin(Math.PI * u));
          plot.setViewport({ ...start, zoom: start.zoom * f, zoomX: start.zoomX * f, zoomY: start.zoomY * f });
        }
        if (u < 1) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
    return { frames, completed: plot.getDiagnostics().completedFrame - first };
  }, { kind, ms, amount });
  // The canvas's pixels near `color` (within 8 per channel) on a grid of 40 x 30 points.
  const countNear = async (page, color) => {
    const png = await page.locator(".canvas canvas").first().screenshot(), read = pixelReader(png);
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20), target = hex(color);
    let count = 0;
    for (let i = 0; i < 40; i++)
      for (let j = 0; j < 30; j++) {
        const value = read(Math.floor(((i + 0.5) / 40) * width), Math.floor(((j + 0.5) / 30) * height));
        if (value.every((channel, k) => Math.abs(channel - target[k]) <= 8)) count++;
      }
    return count;
  };

  test("dense tiles: frames complete while they arrive, a reversal leaves no stale tile, a new tile takes clicks, a color-only restyle prepares nothing, and a repeated zoom reuses the slots (TODO 63)", { tag: ["@gpu", "@timing"] }, async ({ page }) => {
    const errors = await openDense(page, { delay: 120, query: "&background=%23ff00ff" });
    // Four tiles east and straight back over 1.2 s, the zoom-14 tiles answering after 120 ms:
    // tiles asked for on the way out arrive after the view has turned back.
    const pan = await move(page, "pan", 1200, 4 / 16384);
    expect(pan.completed).toBeGreaterThan(pan.frames * 0.8);
    await page.evaluate(() => window.vectorTiles.plot.whenSettled());
    let live = (await status(page)).live;
    expect(live.shown).toBe(live.selected);
    // Ten tiles east (new ground): the coarser levels cover it until its tiles arrive (the plot's
    // magenta background never shows), then a click on the new tiles reports their feature.
    await page.evaluate(() => { const plot = window.vectorTiles.plot, v = plot.getViewport(); plot.setViewport({ ...v, x: v.x + 10 / 16384 }); });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect((await status(page)).live.shown, "the new tiles are still on their way").toBeLessThan((await status(page)).live.selected);
    expect(await countNear(page, "#ff00ff"), "plot background").toBe(0);
    await page.evaluate(() => window.vectorTiles.plot.whenSettled());
    const box = await page.locator("canvas").first().boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(() => page.evaluate(() => typeof window.vectorTiles.clicked?.layerName)).toBe("string");
    // A new water color repaints the tiles shown: no worker job, and the water changes color.
    const water = await countNear(page, "#aad3df"), jobs = await page.evaluate(() => window.__tileJobs);
    expect(water).toBeGreaterThan(20);
    await page.evaluate(() => window.vectorTiles.set({ tile: [14, 8414, 5384], styles: { water: { fill: "#c03060" } } }));
    await page.evaluate(() => window.vectorTiles.plot.whenSettled());
    expect(await page.evaluate(() => window.__tileJobs)).toBe(jobs);
    // The same water, within its antialiased edges.
    expect(Math.abs((await countNear(page, "#c03060")) - water)).toBeLessThanOrEqual(water * 0.15);
    expect(await countNear(page, "#aad3df")).toBe(0);
    // Zoom out three levels and back, three times: no pass makes a new pipeline, and the GPU
    // memory stops growing (the slots grow to fit their tiles, then are reused; measured 96, 136,
    // 137 MB).
    const after = [];
    for (let pass = 0; pass < 3; pass++) {
      const zoom = await move(page, "zoom", 1500, 3);
      expect(zoom.completed).toBeGreaterThan(zoom.frames * 0.7);
      await page.evaluate(() => window.vectorTiles.plot.whenSettled());
      after.push(await gpuCounters(page));
    }
    expect(after[2].render - after[0].render).toBe(0);
    expect(after[2].liveBytes - after[1].liveBytes).toBeLessThan(8 * 2 ** 20);
    expect(after[2].liveBytes).toBeLessThan(200 * 2 ** 20);
    live = (await status(page)).live;
    expect(live.shown).toBe(live.selected);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => window.__gpuErrors), "tile growth must produce valid GPU draws").toEqual([]);
  });

  test("the gallery globe can zoom into dense city tiles and back without invalid GPU draws", { tag: "@gpu" }, async ({ page }) => {
    await page.addInitScript(installGpuErrors);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const bytes = Object.fromEntries(Object.entries(DENSE).map(([z, path]) => [z, fs.readFileSync(`static/data/vector-tiles/${path}.mvt`)]));
    await page.route("**/tiles.versatiles.org/**", async route => {
      const match = /\/(\d+)\/\d+\/\d+(?:\.[^/]+)?$/.exec(new URL(route.request().url()).pathname);
      await route.fulfill({ contentType: "application/vnd.mapbox-vector-tile", body: bytes[Number(match?.[1])] ?? Buffer.from(WATER) }).catch(() => {});
    });
    await page.goto("/examples/globe-tiles");
    await page.waitForFunction(() => window.__examples?.plot &&
      [...document.querySelectorAll(".canvas")].every(canvas => canvas.getAttribute("aria-busy") === "false"));
    await page.evaluate(() => window.__examples.settle());
    for (let pass = 0; pass < 3; pass++) {
      const frames = await page.evaluate(async () => {
        const plot = window.__examples.plot, start = plot.getViewport(), first = plot.getDiagnostics().completedFrame, t0 = performance.now();
        let rafs = 0;
        await new Promise(resolve => {
          const tick = now => {
            const u = Math.min(1, (now - t0) / 3000), factor = 2 ** (8 * Math.sin(Math.PI * u));
            rafs++;
            plot.setViewport({ ...start, zoom: start.zoom * factor, zoomX: start.zoomX * factor, zoomY: start.zoomY * factor });
            if (u < 1) requestAnimationFrame(tick); else resolve();
          };
          requestAnimationFrame(tick);
        });
        const completed = plot.getDiagnostics().completedFrame - first;
        await plot.whenSettled();
        return { completed, rafs };
      });
      expect(frames.completed).toBeGreaterThan(frames.rafs * .8);
    }
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => window.__gpuErrors)).toEqual([]);
    expect(await page.evaluate(() => window.__examples.plot.getRenderError())).toBe("");
    // The basemap and earthquake overlay must remain visible after the reversal.
    const png = await page.locator(".canvas canvas").first().screenshot(), read = pixelReader(png);
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    let basemap = 0, overlay = 0;
    for (let x = 0; x < 40; x++) for (let y = 0; y < 30; y++) {
      const rgb = read(Math.floor((x + .5) / 40 * width), Math.floor((y + .5) / 30 * height));
      // The default basemap's land background is intentionally pale (#f2efe9).
      if (rgb.some(channel => channel < 250)) basemap++;
      if (rgb.some(channel => channel < 220)) overlay++;
    }
    expect(basemap).toBeGreaterThan(100);
    expect(overlay).toBeGreaterThan(20);
  });

  test("on the globe, live tiles follow the view and its turning center; a click picks a tile loaded on the way, and new colors repaint without preparing", { tag: "@gpu" }, async ({ page }) => {
    await countJobs(page);
    const { requests, errors } = await open(page, { query: "&live=1&projection=orthographic" });
    await page.evaluate(() => window.vectorTiles.plot.whenSettled());
    let live = (await status(page)).live;
    expect(live.zoom).toBeGreaterThanOrEqual(11);
    expect(live.shown).toBe(live.selected);
    // The zoom-0 tile loads too, under the rest (TODO 61): the minimap shows the whole globe.
    expect(requests).toContain("0/0/0");
    // A drag turns the globe (its center), not the 2D camera: the tiles follow.
    const before = new Set(requests);
    const box = await page.locator(".canvas").first().boundingBox();
    // Twelve drags of 500 pixels (at this zoom each turns the globe a third of a tile): past the
    // ring of tiles loaded around the view.
    for (let drag = 0; drag < 12; drag++) {
      await page.mouse.move(box.x + box.width / 2 + 250, box.y + box.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width / 2 + 250 - 50 * i, box.y + box.height / 2);
      await page.mouse.up();
    }
    await page.evaluate(() => window.vectorTiles.plot.whenSettled());
    live = (await status(page)).live;
    expect(live.shown).toBe(live.selected);
    expect(requests.filter((path) => !before.has(path)).length).toBeGreaterThan(0);
    // The view's center is a live tile now (TODO 63.2: its pick is drawn for the click).
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(() => page.evaluate(() => window.vectorTiles.clicked?.layerName)).toBe("water_polygons");
    // Finish the click and any follow-up view/ring loads before measuring only the restyle.
    await page.evaluate(() => window.vectorTiles.plot.whenSettled());
    await expect.poll(async () => {
      const state = await status(page);
      return state.pending || state.live.requests > 0;
    }, { timeout: 30000 }).toBe(false);
    await page.evaluate(() => window.vectorTiles.plot.whenSettled());
    // A color-only restyle (TODO 63.4).
    const jobs = await page.evaluate(() => window.__tileJobs);
    await page.evaluate(() => window.vectorTiles.set({ tile: [12, 2000, 1300], styles: { water: { fill: "#204080" } } }));
    await page.evaluate(() => window.vectorTiles.plot.whenSettled());
    expect(await page.evaluate(() => window.__tileJobs)).toBe(jobs);
    near((await colors(page, [[0.5, 0.5]]))[0], "#204080", "the repainted water");
    expect(errors).toEqual([]);
  });

  test("a live tile that fails leaves what is under it, with no error on the plot, and is not requested again at once; styles must be opaque", async ({ page }) => {
    const { requests } = await open(page, { query: "&live=1", status: (path) => (path === "12/2000/1300" ? 0 : 500) });
    await page.evaluate(() => window.vectorTiles.plot.whenSettled());
    const state = await page.evaluate(() => ({ status: window.vectorTiles.tiles.getStatus(), errors: window.vectorTiles.errors }));
    expect(state.status.error).toBe("");
    expect(state.status.live.failed).toBe(state.status.live.selected);
    // The tiles in view, and the ring loaded around them, each reach onerror.
    expect(state.errors.length).toBeGreaterThanOrEqual(state.status.live.failed);
    expect(state.errors.every((message) => /^VectorTile: HTTP 500/.test(message))).toBe(true);
    await expect(page.getByText("VectorTile: HTTP 500")).toBeHidden();
    const [water, outside] = await colors(page, [at(0.25, 0.5), [0.05, 0.5]]);
    near(water, "#aad3df", "the requested tile stays");
    near(outside, "#f2efe9", "the map's background square where live tiles failed");
    // The same view again: the failed tiles are not requested before RETRY_AFTER.
    const count = requests.length;
    await zoomBy(page, 1.01);
    await page.evaluate(() => window.vectorTiles.plot.whenSettled());
    expect(requests.length).toBe(count);
    // A translucent part cannot draw live tiles.
    await page.evaluate(() => window.vectorTiles.set({ tile: [12, 2000, 1300], styles: { water: { opacity: 0.5 } } }));
    await expect.poll(async () => (await status(page)).error).toMatch(/live tiles need opaque styles, but part "water" has opacity 0\.5/);
    await expect(page.getByText('part "water" has opacity 0.5')).toBeVisible();
  });

  // The zoom-0 tile and the overview draw under the live level: whenSettled and the exports wait
  // for them too, so an export does not depend on which tile arrived first (the docs' globe
  // exported with or without its zoom-0 tile; final validation, 2026-10-02).
  test("whenSettled and exports wait for the zoom-0 tile and the overview under the live level", async ({ page }) => {
    // The overview (three zooms coarser than the live level, 11 or 12) and the zoom-0 tile come late.
    await open(page, { query: "&live=1&projection=orthographic", delays: (path) => (Number(path.split("/")[0]) <= 9 ? 2500 : 0) });
    const exported = () => page.evaluate(async () => {
      await window.vectorTiles.plot.whenSettled();
      const { live } = window.vectorTiles.tiles.getStatus(), svg = await (await window.vectorTiles.plot.exportSVG()).blob.text();
      return { zoom: live.zoom, overview: live.overview, images: svg.match(/<image\b/g)?.length ?? 0 };
    });
    const settled = await exported();
    expect(settled.zoom).toBeGreaterThanOrEqual(11);
    expect(settled.overview).toBeGreaterThan(0);
    // Later, with nothing left to arrive, the same view exports the same layers.
    await page.waitForTimeout(3000);
    expect(await exported()).toEqual(settled);
  });

  test("in a Cartesian plot the axes stay on the requested tile; a 404 is an empty tile; the credit line is drawn and exported", async ({ page }) => {
    const credit = "© Test contributors";
    await open(page, { query: `&live=1&cartesian=1&attribution=${encodeURIComponent(credit)}`, status: (path) => (path === "12/2000/1300" ? 0 : 404) });
    await page.evaluate(() => window.vectorTiles.plot.whenSettled());
    // The visible x range, from two major ticks.
    const range = () => page.evaluate(() => {
      const [a, b] = window.vectorTiles.plot.getAxisLayout().x.major;
      const per = (b.value - a.value) / (b.fraction - a.fraction), low = a.value - a.fraction * per;
      return [low, low + per];
    });
    const first = await range(), start = await page.evaluate(() => window.vectorTiles.plot.getViewport());
    const west = (2000 / 4096) * 360 - 180, east = (2001 / 4096) * 360 - 180;
    expect(first[0]).toBeLessThanOrEqual(west + 1e-9);
    expect(first[1]).toBeGreaterThanOrEqual(east - 1e-9);
    const live = (await status(page)).live;
    expect(live.failed).toBe(0);
    expect(live.shown).toBe(live.selected);
    // Live tiles loading elsewhere do not move the axes: back at the first view, the same range.
    await page.evaluate(() => { const plot = window.vectorTiles.plot, v = plot.getViewport(); plot.setViewport({ ...v, x: v.x + 0.4 }); });
    await page.evaluate(() => window.vectorTiles.plot.whenSettled());
    await page.evaluate((start) => window.vectorTiles.plot.setViewport(start), start);
    await page.evaluate(() => window.vectorTiles.plot.whenSettled());
    const again = await range();
    expect(again[0]).toBeCloseTo(first[0], 9);
    expect(again[1]).toBeCloseTo(first[1], 9);
    await expect(page.locator(".credits text")).toHaveText(credit);
    expect(await page.evaluate(async () => (await (await window.vectorTiles.plot.exportSVG()).blob.text()))).toContain("Test contributors");
  });
});

// TODO 66: live tiles under a 3D flyover camera (the fixture's ?flyover=1: a 900 x 600 plot, the
// tiles in a local plane of 0.01 units per meter around tile 14/8414/5384's center, on the xz
// plane). Every zoom-14 tile is CITY, every other tile LAND; the map's background is magenta, so
// ground the tiles do not cover shows.
test.describe("3D flyover (TODO 66)", () => {
  test.use({ deviceScaleFactor: 2 });
  const FLY = [14, 8414, 5384], [fw, fs, fe, fn] = tileBounds(FLY), ORIGIN = [(fw + fe) / 2, (fs + fn) / 2];
  // A point of a tile (u, v from 0 to 4096) `meters` above the ground, in world units.
  const world = (u, v, meters = 0, tile = FLY) => {
    const [x, y] = localPlane(ORIGIN, 0.01)(tileProjection(tile, 4096)([u, v]));
    return [x, meters * 0.01, -y];
  };
  const CITY = encodeVectorTile([
    { name: "land", features: [{ id: 1, type: 3, properties: { kind: "residential" }, geometry: [square(-64, -64, 4160, 4160)] },
      { id: 2, type: 3, properties: { kind: "park" }, geometry: [square(1600, 2800, 2400, 3600)] }] },
    { name: "water_polygons", features: [{ id: 3, type: 3, properties: { kind: "water" }, geometry: [square(-64, 1800, 1200, 4160)] }] },
    { name: "buildings", features: [
      // A 120 m tower; a building without a height (5 m); one across the east edge, whose other
      // half the east neighbour (also CITY) has across its west edge.
      { id: 10, type: 3, properties: { height: 120 }, geometry: [square(2600, 2600, 3200, 3200)] },
      { id: 11, type: 3, properties: { name: "low" }, geometry: [square(3400, 600, 3800, 1000)] },
      { id: 12, type: 3, properties: { height: 30 }, geometry: [square(3800, 3300, 4300, 3700)] },
      { id: 13, type: 3, properties: { height: 30 }, geometry: [square(-204, 3300, 296, 3700)] },
    ] },
  ]);
  const LAND = encodeVectorTile([{ name: "land", features: [{ type: 3, properties: { kind: "residential" }, geometry: [square(-64, -64, 4160, 4160)] }] }]);
  const STYLES = { background: { fill: "#ff00ff" }, buildings: { fill: "#c03060" }, places: false };
  async function openFlyover(page, { query = "", delay = 0 } = {}) {
    const requests = [], errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/vt-fly/**", async (route) => {
      const path = new URL(route.request().url()).pathname.replace("/vt-fly/", "").replace(".mvt", "");
      requests.push(path);
      if (delay && path.startsWith("14/")) await new Promise((resolve) => setTimeout(resolve, delay));
      await route.fulfill({ contentType: "application/vnd.mapbox-vector-tile", body: Buffer.from(path.startsWith("14/") ? CITY : LAND) }).catch(() => {});
    });
    await page.goto(`/test/vector-tiles?url=${encodeURIComponent("/vt-fly/{z}/{x}/{y}.mvt")}&tile=${FLY.join("/")}&flyover=1&width=900&height=600` +
      `&styles=${encodeURIComponent(JSON.stringify(STYLES))}${query}`);
    await page.waitForFunction(() => window.vectorTiles?.plot && window.vectorTiles?.tiles);
    await page.waitForFunction(() => [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"));
    await settle(page);
    return { requests, errors };
  }
  const settle = (page) => page.evaluate(() => window.vectorTiles.plot.whenSettled());
  const status = (page) => page.evaluate(() => window.vectorTiles.tiles.getStatus());
  const setCamera = async (page, position, target) => {
    await page.evaluate(([position, target]) => window.vectorTiles.plot.setCamera({ position, target }), [position, target]);
    await settle(page);
  };
  // A world point's [x, y] fraction of the plot, through the camera (getCamera) at the plot's aspect.
  const project = async (page, point) => {
    const state = await page.evaluate(() => window.vectorTiles.plot.getCamera());
    const { forward, right, screenUp } = cameraBasis(state), offset = point.map((v, i) => v - state.position[i]);
    const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0), depth = dot(offset, forward);
    const half = Math.tan((state.fov * Math.PI) / 360) / (state.zoom || 1);
    return [(1 + dot(offset, right) / depth / (half * 1.5)) / 2, (1 - dot(offset, screenUp) / depth / half) / 2];
  };
  // The camera's ground area is covered: no magenta in the plot's lower half (toward the horizon,
  // past the overview, the bare background may show).
  const lowerMagenta = async (page) => {
    const png = await page.locator(".canvas canvas").first().screenshot(), read = pixelReader(png);
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    let count = 0;
    for (let i = 0; i < 40; i++)
      for (let j = 15; j < 30; j++) {
        const [r, g, b] = read(Math.floor(((i + 0.5) / 40) * width), Math.floor(((j + 0.5) / 30) * height));
        if (r > 230 && g < 30 && b > 230) count++;
      }
    return count;
  };

  test("live tiles follow the flyover camera: beyond the requested tile, up and down, turning, resized and reversed with slow replies; frames keep coming and the work stays bounded", { tag: ["@gpu", "@timing"] }, async ({ page }) => {
    const { requests, errors } = await openFlyover(page, { query: "&live=1", delay: 120 });
    let live = (await status(page)).live;
    expect(live.shown).toBe(live.selected);
    expect(live.selected).toBeLessThanOrEqual(48);
    expect(await lowerMagenta(page)).toBe(0);
    const first = live.zoom;
    // Fly 6 km east over 2 s (past the requested tile's 1.5 km), the zoom-14 tiles answering after
    // 120 ms, counting the plot's frames.
    const flight = (from, to, ms) => page.evaluate(async ({ from, to, ms }) => {
      const plot = window.vectorTiles.plot, t0 = performance.now(), start = plot.getDiagnostics().completedFrame;
      let frames = 0, slots = 0, requests = 0;
      await new Promise((resolve) => {
        const step = () => {
          const u = Math.min(1, (performance.now() - t0) / ms), x = from + (to - from) * u;
          frames++;
          plot.setCamera({ position: [x, 12, 18], target: [x, 0, 0] });
          const live = window.vectorTiles.tiles.getStatus().live;
          slots = Math.max(slots, live?.slots ?? 0);
          requests = Math.max(requests, live?.requests ?? 0);
          if (u < 1) requestAnimationFrame(step); else resolve();
        };
        requestAnimationFrame(step);
      });
      return { frames, completed: plot.getDiagnostics().completedFrame - start, slots, requests };
    }, { from, to, ms });
    const before = requests.length;
    const east = await flight(0, 60, 2000);
    expect(east.completed).toBeGreaterThan(east.frames * 0.7);
    await settle(page);
    live = (await status(page)).live;
    expect(live.shown).toBe(live.selected);
    const column = (path) => Number(path.split("/")[1]) / 2 ** (Number(path.split("/")[0]) - 14);
    expect(requests.slice(before).some((path) => column(path) > FLY[1] + 3), "tiles east of the requested one").toBe(true);
    expect(await lowerMagenta(page)).toBe(0);
    // Straight back: tiles asked for on the way out arrive after the camera turned around.
    const back = await flight(60, 0, 800);
    expect(back.completed).toBeGreaterThan(back.frames * 0.7);
    await settle(page);
    live = (await status(page)).live;
    expect(live.shown).toBe(live.selected);
    expect(live.zoom).toBe(first);
    // Bounded: at most 48 tiles selected, their ring and the levels under them in slots; requests
    // within the scheduler's 16 plus those waiting.
    expect(Math.max(east.slots, back.slots)).toBeLessThan(120);
    // Up: a coarser zoom, still covered; down near the ground: zoom 14, its buildings standing.
    await setCamera(page, [0, 80, 60], [0, 0, 0]);
    live = (await status(page)).live;
    expect(live.zoom).toBeLessThan(first);
    expect(live.shown).toBe(live.selected);
    expect(await lowerMagenta(page)).toBe(0);
    await setCamera(page, [0, 3, 6], [0, 0, 0]);
    const low = await status(page);
    expect(low.live.zoom).toBe(14);
    expect(low.extruded).toBeGreaterThan(0);
    // Turning from north to east in place: the loading area moves ahead of the view, 850 m east
    // (0.0125 degrees here) and as far less north.
    await setCamera(page, [0, 12, 18], [0, 0, 6]);
    const north = (await status(page)).live.center;
    await setCamera(page, [0, 12, 18], [12, 0, 18]);
    const turned = (await status(page)).live.center;
    expect(turned[0] - north[0]).toBeCloseTo(850 / (111320 * Math.cos((ORIGIN[1] * Math.PI) / 180)), 3);
    expect(north[1] - turned[1]).toBeCloseTo(850 / 111320, 3);
    // A taller, narrower plot: the camera's aspect and the ground resolution change (the canvas
    // resizes a frame or two later, so this polls), and the new selection is covered.
    const wide = (await status(page)).live;
    await page.evaluate(() => window.vectorTiles.setSize(500, 800));
    await expect.poll(async () => {
      const next = (await status(page)).live;
      return next.selected !== wide.selected && next.shown === next.selected;
    }, { timeout: 15000 }).toBe(true);
    await settle(page);
    expect(await lowerMagenta(page)).toBe(0);
    expect(errors).toEqual([]);
  });

  test("the flat map draws in part order under the buildings, which hide what is behind them, take the clicks, stand 5 m without a height, meet across tile edges, and lie flat again without extrusion", { tag: "@gpu" }, async ({ page }) => {
    // A green point (another 3D mark) 20 m up just north of the tower: behind it from the camera.
    const behindTower = world(2900, 2500, 20);
    const { requests, errors } = await openFlyover(page, { query: `&live=1&marker=${behindTower.join(",")}` });
    // South of the tower, 220 m up, looking down past it.
    const tower = world(2900, 2900, 40), base = world(2900, 3150, 0);
    await setCamera(page, [tower[0] + 2.2, 2.2, tower[2] + 9], [tower[0], 0.2, tower[2] - 1]);
    await page.locator(".canvas").first().screenshot({ path: "test-results/vector-tiles-flyover.png" });
    expect((await status(page)).live.zoom).toBe(14);
    expect((await status(page)).extruded).toBeGreaterThan(0);
    const colorsAt = async (points) => colors(page, await Promise.all(points.map((point) => project(page, point))));
    const red = ([r, g, b]) => r > g + 40 && r > b + 30, green = ([r, g, b]) => g > r + 80 && g > b + 80;
    // The park over the land, both flat: the park's color (parts keep their order without depth).
    const [park, towerPixel, seam, low, hidden] = await colorsAt([world(2000, 3400, 0), tower, world(4096, 3500, 15), world(3600, 800, 2.5), behindTower]);
    near(park, "#cfe5c0", "the park over the land");
    expect(red(towerPixel), `the tower: ${towerPixel}`).toBe(true);
    expect(red(hidden), `the point behind the tower is hidden by it: ${hidden}`).toBe(true);
    expect(red(seam), `the building across the tile edge, at the edge: ${seam}`).toBe(true);
    expect(red(low), `the building without a height, 2.5 m up: ${low}`).toBe(true);
    // A click on the tower picks the building, not the map under it.
    const box = await page.locator("canvas").first().boundingBox(), at = await project(page, tower);
    await page.mouse.click(box.x + at[0] * box.width, box.y + at[1] * box.height);
    await expect.poll(() => page.evaluate(() => window.vectorTiles.clicked)).toEqual({ layerName: "buildings", height: 120 });
    // Flat footprints (the settings pane's "3D buildings"): no tile requested again, the tower's
    // pixel shows the ground behind it, its base the fill, and the point behind it draws over the
    // flat map.
    const asked = requests.length, again = () => requests.slice(asked).filter((path) => requests.slice(0, asked).includes(path));
    await page.evaluate(() => window.vectorTiles.plot.openSettings());
    const panel = page.getByRole("dialog", { name: /^Settings/ });
    await panel.getByRole("treeitem", { name: "VectorTile", exact: false }).click();
    await panel.locator("summary").filter({ hasText: /^Geography/ }).click();
    const buildings3d = panel.getByRole("checkbox", { name: "3D buildings", exact: true });
    await buildings3d.uncheck();
    await expect.poll(async () => (await status(page)).extruded).toBe(0);
    await settle(page);
    expect(again()).toEqual([]);
    const [behind, footprint, point] = await colorsAt([tower, base, behindTower]);
    expect(red(behind), `behind the tower: ${behind}`).toBe(false);
    near(footprint, "#c03060", "the tower's footprint");
    expect(green(point), `the point over the flat map: ${point}`).toBe(true);
    await buildings3d.check();
    await expect.poll(async () => (await status(page)).extruded).toBeGreaterThan(0);
    await settle(page);
    expect(red((await colorsAt([tower]))[0])).toBe(true);
    expect(again()).toEqual([]);
    // An orbit camera is not a flyover: the requested tile draws as parts, flat and fixed; back in
    // flyover, the tiles follow the camera again, their buildings standing.
    await panel.getByRole("treeitem", { name: "Plot", exact: true }).click();
    await panel.getByText("View", { exact: true }).click();
    const mode = panel.getByLabel("3D camera", { exact: true });
    await mode.selectOption("orbit");
    await expect.poll(async () => (await status(page)).live).toBe(null);
    await settle(page);
    expect(Object.keys(await page.evaluate(() => window.vectorTiles.tiles.getParts()))).toContain("buildings");
    await mode.selectOption("flyover");
    await expect.poll(async () => (await status(page)).live?.zoom).toBe(14);
    await settle(page);
    expect((await status(page)).extruded).toBeGreaterThan(0);
    await page.evaluate(() => window.vectorTiles.plot.closeSettings());
    expect(errors).toEqual([]);
  });
});
