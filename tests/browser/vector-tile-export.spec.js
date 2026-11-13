// TODO 24, 35: a VectorTile in a Python scene (the notebook route) and in exported HTML. The
// exported page runs the built standalone bundle: run `npm run build:python` after changing the
// scene runtime or the VectorTile.
import { test, expect } from "./fixtures.js";
import fs from "node:fs";
import { pixelReader } from "./png.js";
import { encodeVectorTile } from "../unit/vectorTileEncoder.js";

const square = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const TILE = encodeVectorTile([
  { name: "water_polygons", features: [{ type: 3, properties: { kind: "water" }, geometry: [square(0, 0, 2048, 4096)] }] },
  { name: "buildings", features: [{ type: 3, geometry: [square(2600, 2600, 3600, 3600)] }] },
  { name: "pois", features: [{ type: 1, properties: { name: "Hidden" }, geometry: [[3000, 3000]] }] },
]);
const scene = (tileProps, events = []) => ({
  protocol: 1, library: "test", scene: "tile-scene", revision: 1,
  root: {
    id: "scene", kind: "Scene", props: {}, events: [], children: [{
      id: "plot", kind: "Plot", props: { height: 300, responsive: true, coordinates: "spherical", projection: "mercator", toneMapping: 0 }, events: [],
      children: [{ id: "tiles", kind: "VectorTile", props: { url: "/vt-export/{z}/{x}/{y}.mvt", tile: [12, 2000, 1300], ...tileProps }, events, children: [] }],
    }],
  },
  tables: {}, scales: {}, columns: {},
});

async function mount(page, state, { delays = {}, tile = TILE } = {}) {
  const requests = [];
  await page.context().route("**/vt-export/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    if (delays[path]) await new Promise((resolve) => setTimeout(resolve, delays[path]));
    await route.fulfill({ contentType: "application/vnd.mapbox-vector-tile", body: Buffer.from(tile) }).catch(() => {});
  });
  await page.route("**/test/notebook-vectortile.json", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ state, buffers: {}, metadata: {} }) }));
  await page.goto("/test/notebook?fixture=vectortile");
  await page.waitForFunction(() => window.notebookReady);
  return requests;
}

async function exportAndOpen(page, state) {
  const bundle = fs.readFileSync("python/hmplot/static/standalone.js", "utf8");
  // The page embeds the runtime its host gives, as the notebook widget and the export browser do.
  await page.context().route("**/__standalone__.js", (route) => route.fulfill({ contentType: "text/javascript", body: bundle }));
  const exported = await page.evaluate(async (state) => {
    const runtime = window.notebookRuntime;
    runtime.setSerializable(state, () => { throw Error("This scene has no columns."); }, () => fetch("/__standalone__.js").then((response) => response.text()));
    const { blob, warnings } = await runtime.command({ command: "export_html", target: "scene", args: {} });
    return { html: await blob.text(), warnings };
  }, state);
  const embedded = JSON.parse(exported.html.match(/<script id="hmplot-state" type="application\/json">([\s\S]*?)<\/script>/)[1]).state;
  await page.context().route("**/__exported__.html", (route) => route.fulfill({ contentType: "text/html", body: exported.html }));
  const opened = await page.context().newPage();
  const errors = [];
  opened.on("pageerror", (error) => errors.push(error.message));
  await opened.goto("/__exported__.html");
  await opened.waitForFunction(() => typeof window.hmplotExport === "function");
  await expect.poll(() => opened.evaluate(() => window.hmplotExport("settled").then(() => true, (error) => error.message)), { timeout: 60000 }).toBe(true);
  return { exported, embedded, opened, errors };
}

test("a scene update does not wait for the tiles it loads; a settled command does", async ({ page }) => {
  // The plot reveals with its first tiles (a load caused by its mount, as for a Provider inside
  // a Plot); a later update returns while the next tiles load. Fixed tiles (TODO 24).
  const state = scene({ live: false });
  const requests = await mount(page, state, { delays: { "/vt-export/12/2001/1300.mvt": 1500 } });
  const next = structuredClone(state);
  next.revision = 2;
  next.root.children[0].children[0].props.tile = [12, 2001, 1300];
  let started = Date.now();
  await page.evaluate((next) => window.notebookRuntime.apply(next, () => { throw Error("This scene has no columns."); }), next);
  expect(Date.now() - started).toBeLessThan(1000);
  // The previous tiles stay on screen meanwhile: the update does not hide the plot to reveal it
  // again (a re-reveal would wait for the load).
  expect(await page.evaluate(() => document.querySelector(".canvas.atomic-pending"))).toBe(null);
  started = Date.now();
  await page.evaluate(() => window.notebookRuntime.command({ command: "settled", target: "scene", args: {} }));
  expect(Date.now() - started).toBeGreaterThan(500);
  expect(requests).toEqual(["/vt-export/12/2000/1300.mvt", "/vt-export/12/2001/1300.mvt"]);
  expect(await page.evaluate(() => [...window.notebookRuntime.handles.values()].find((entry) => entry.id === "tiles").handle.getResult().tiles)).toEqual([[12, 2001, 1300]]);
});

test("exported HTML embeds the tiles as raw bytes (tileData), and the page draws them without fetching", async ({ page }) => {
  // This checks byte embedding and replay. Keep its 300-DPI raster fallback within
  // the native DPR2 device's texture budget; export resolution has separate coverage.
  await page.setViewportSize({ width: 420, height: 900 });
  const state = scene({ live: false });
  const requests = await mount(page, state);
  await page.evaluate(() => window.notebookRuntime.command({ command: "settled", target: "scene", args: {} }));
  const { exported, embedded, opened, errors } = await exportAndOpen(page, state);
  // Automatic Cartesian theme guides stay automatic when spherical scenes are replayed.
  expect(embedded.root.children[0].props).not.toHaveProperty("axisMask");
  expect(embedded.root.children[0].props).not.toHaveProperty("axes2d");
  await expect(opened.locator('[data-export-axes]')).toHaveCount(0);
  const props = embedded.root.children[0].children[0].props;
  expect(Object.keys(props).sort()).toEqual(["live", "tile", "tileData", "url"]);
  expect(props.tileData).toEqual([{ tile: [12, 2000, 1300], bytes: Buffer.from(TILE).toString("base64") }]);
  expect(exported.warnings).toEqual([]);
  await opened.waitForFunction(() => document.querySelector("#hmplot-root canvas"));
  expect(requests).toEqual(["/vt-export/12/2000/1300.mvt"]);
  expect(errors).toEqual([]);
  expect(await opened.locator("#hmplot-error").textContent()).toBe("");
});

test("a live VectorTile's export carries its view: offline, the page draws it and fails quietly", async ({ page }) => {
  // TODO 35: the export embeds the requested tile and the live tiles on screen; the page, with
  // every tile request failing, draws them and shows no error. After a color-only style change
  // (TODO 63.4: repainted, not prepared again) it embeds them all still (63.5: tiles in use keep
  // their bytes).
  const initial = scene({ attribution: "© Test contributors" }), state = structuredClone(initial);
  state.revision = 2;
  state.root.children[0].children[0].props.styles = { water: { fill: "#204080" } };
  await mount(page, initial);
  await page.evaluate(() => window.notebookRuntime.command({ command: "settled", target: "scene", args: {} }));
  await page.evaluate((state) => window.notebookRuntime.apply(state, () => { throw Error("This scene has no columns."); }), state);
  await page.evaluate(() => window.notebookRuntime.command({ command: "settled", target: "scene", args: {} }));
  const live = await page.evaluate(() => [...window.notebookRuntime.handles.values()].find((entry) => entry.id === "tiles").handle.getStatus().live);
  expect(live.shown).toBeGreaterThan(0);
  await page.context().unroute("**/vt-export/**");
  const failed = [];
  await page.context().route("**/vt-export/**", (route) => { failed.push(new URL(route.request().url()).pathname); return route.abort(); });
  const { embedded, opened, errors } = await exportAndOpen(page, state);
  const props = embedded.root.children[0].children[0].props;
  expect(props.tileData.map((entry) => entry.tile.join("/"))).toContain("12/2000/1300");
  expect(props.tileData.length).toBe(1 + live.shown);
  expect(props.styles).toEqual({ water: { fill: "#204080" } });
  expect(errors).toEqual([]);
  expect(await opened.locator("#hmplot-error").textContent()).toBe("");
  // The live plot's credits (the snapshot, fading out over it, has its own).
  expect(await opened.locator("#hmplot-root .credits text").textContent()).toBe("© Test contributors");
  const status = await opened.evaluate(() => window.hmplotExport("settled").then(() => document.querySelector(".canvas")?.getAttribute("aria-busy")));
  expect(status).toBe("false");
  expect(failed.filter((path) => path.endsWith("12/2000/1300.mvt"))).toEqual([]);
  // Inspect the live canvas, not the exported preview: embedded water must actually draw offline.
  const png = await opened.locator("#hmplot-root .canvas canvas").first().screenshot(), read = pixelReader(png);
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  let water = 0;
  for (let x = 0; x < 40; x++) for (let y = 0; y < 30; y++) {
    const pixel = read(Math.floor((x + 0.5) * width / 40), Math.floor((y + 0.5) * height / 30));
    if (pixel.every((channel, i) => Math.abs(channel - [32, 64, 128][i]) <= 8)) water++;
  }
  expect(water, "embedded water draws while all tile requests are blocked").toBeGreaterThan(100);
});

test("snapshot=false exports the url: the page loads the tiles when it opens", async ({ page }) => {
  const state = scene({ snapshot: false, live: false });
  const requests = await mount(page, state);
  await page.evaluate(() => window.notebookRuntime.command({ command: "settled", target: "scene", args: {} }));
  const { embedded, opened, errors } = await exportAndOpen(page, state);
  expect(embedded.root.children[0].children[0].props).toMatchObject({ url: "/vt-export/{z}/{x}/{y}.mvt", tile: [12, 2000, 1300], snapshot: false });
  await opened.waitForFunction(() => document.querySelector("#hmplot-root canvas"));
  await expect.poll(() => requests.length).toBe(2);
  expect(errors).toEqual([]);
});

test("a click on a tile feature reaches Python with the feature", async ({ page }) => {
  await mount(page, scene({}, ["click"]));
  await page.evaluate(() => window.notebookRuntime.command({ command: "settled", target: "scene", args: {} }));
  // The tile fills the plot's height, centered: the building's middle is at 0.757 of the tile.
  const box = await page.locator("canvas").first().boundingBox();
  const side = box.height, left = box.x + (box.width - side) / 2;
  await page.mouse.click(left + 0.757 * side, box.y + 0.757 * side);
  await expect.poll(() => page.evaluate(() => window.notebookMessages.filter((message) => message.type === "event" && message.event === "click")
    .map((message) => [message.target, message.payload.feature?.properties]))).toEqual([["tiles", { layerName: "buildings" }]]);
});

// TODO 66.5: a live VectorTile under a 3D flyover camera, exported where the camera was moved to.
// Every tile has a 60 m tower (red) on land.
test("a flyover's export carries its camera, its tiles and its extrusion: offline, the page shows the exported view; online, it streams again", { tag: "@gpu" }, async ({ page }) => {
  const TOWER = encodeVectorTile([
    { name: "land", features: [{ type: 3, properties: { kind: "residential" }, geometry: [square(-64, -64, 4160, 4160)] }] },
    { name: "buildings", features: [{ type: 3, properties: { height: 60 }, geometry: [square(1600, 1600, 2500, 2500)] }] },
  ]);
  const origin = [4.8999, 52.3729];
  const state = {
    protocol: 1, library: "test", scene: "flyover-scene", revision: 1,
    root: { id: "scene", kind: "Scene", props: {}, events: [], children: [{
      id: "plot", kind: "Plot", events: [], props: { type: "3d-y-up", cameraMode: "flyover", width: 960, height: 400, toneMapping: 0,
        x: { domain: [-50, 50], range: [-50, 50] }, y: { domain: [-50, 50], range: [-50, 50] }, z: { domain: [0, 30], range: [0, 30] },
        cameraPosition: [0, 8, 12], cameraTarget: [0, 0, 0] },
      children: [{ id: "tiles", kind: "VectorTile", events: [], children: [], props: { url: "/vt-export/{z}/{x}/{y}.mvt", tile: [14, 8414, 5384],
        origin, unitsPerMeter: 0.01, plane: "xz", styles: { buildings: { fill: "#c03060" }, places: false } } }],
    }] },
    tables: {}, scales: {}, columns: {},
  };
  const requests = await mount(page, state, { tile: TOWER });
  const settled = () => page.evaluate(() => window.notebookRuntime.command({ command: "settled", target: "scene", args: {} }));
  await settled();
  // Fly east, lower: new tiles stream in, their towers standing.
  const moved = { position: [30, 3, 6], target: [30, 0, 0] };
  await page.evaluate((moved) => window.notebookRuntime.command({ command: "camera", target: "plot", args: { state: moved } }), moved);
  await settled();
  const handle = () => page.evaluate(() => [...window.notebookRuntime.handles.values()].find((entry) => entry.id === "tiles").handle.getStatus());
  const before = await handle();
  expect(before.live.zoom).toBe(14);
  expect(before.live.shown).toBe(before.live.selected);
  expect(before.extruded).toBeGreaterThan(0);
  // Red pixels (the towers) of a PNG export, in a page with `evaluate`.
  const towers = (target, run) => target.evaluate(async (run) => {
    const blob = run === "notebook"
      ? await window.notebookRuntime.command({ command: "export_png", target: "plot", args: {} })
      : await fetch(`data:image/png;base64,${(await window.hmplotExport("export_png", "plot", {})).payload}`).then((response) => response.blob());
    const image = await createImageBitmap(blob.blob ?? blob), canvas = new OffscreenCanvas(image.width, image.height), context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    let count = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] > data[i + 1] + 50 && data[i] > data[i + 2] + 30) count++;
    return count / (image.width * image.height);
  }, run);
  const shown = await towers(page, "notebook");
  expect(shown).toBeGreaterThan(0.01);
  // From Python, extrude_buildings=False lays the towers flat (their footprints stay, red, at
  // the ground) and True stands them again, from the tiles' bytes: no tile is requested again (the
  // ring around the still view may still be loading meanwhile).
  const asked = requests.length;
  const apply = (extrudeBuildings, revision) => {
    const next = structuredClone(state);
    next.revision = revision;
    next.root.children[0].children[0].props.extrudeBuildings = extrudeBuildings;
    return page.evaluate((next) => window.notebookRuntime.apply(next, () => { throw Error("This scene has no columns."); }), next).then(settled);
  };
  await apply(false, 2);
  expect((await handle()).extruded).toBe(0);
  const flat = await towers(page, "notebook");
  expect(flat).toBeLessThan(shown * 0.8);
  expect(flat).toBeGreaterThan(0);
  await apply(true, 3);
  expect((await handle()).extruded).toBe(before.extruded);
  expect(Math.abs((await towers(page, "notebook")) - shown)).toBeLessThan(shown * 0.05);
  expect(requests.slice(asked).filter((path) => requests.slice(0, asked).includes(path))).toEqual([]);
  await page.context().unroute("**/vt-export/**");
  const failed = [];
  await page.context().route("**/vt-export/**", (route) => { failed.push(new URL(route.request().url()).pathname); return route.abort(); });
  const { embedded, opened, errors } = await exportAndOpen(page, state);
  const plot = embedded.root.children[0], props = plot.children[0].props;
  expect(plot.props.cameraPosition.map((v) => Math.round(v * 1e6) / 1e6)).toEqual(moved.position);
  expect(plot.props.cameraTarget.map((v) => Math.round(v * 1e6) / 1e6)).toEqual(moved.target);
  expect(props.tileData.length).toBe(1 + before.live.shown);
  // The plot's settings keep its axes' ranges (the ground at z = 0).
  expect(plot.props.z).toMatchObject({ domain: [0, 30], range: [0, 30] });
  // Offline, the page opens on the exported view, its towers standing on the embedded tiles.
  const camera = (await opened.evaluate(() => window.hmplotExport("camera", "plot", {}))).value;
  expect(camera.position.map((v) => Math.round(v * 1e6) / 1e6)).toEqual(moved.position);
  // Camera parity needs the same aspect ratio: the standalone page caps its content width.
  const canvasSize = (target) => target.locator(".canvas").first().evaluate((e) => [e.clientWidth, e.clientHeight]);
  expect(await canvasSize(opened)).toEqual(await canvasSize(page));
  const offline = await towers(opened, "standalone");
  expect(Math.abs(offline - shown)).toBeLessThan(shown * 0.25);
  expect(errors).toEqual([]);
  expect(await opened.locator("#hmplot-error").textContent()).toBe("");
  // Online again, a move loads the tiles it needs.
  await page.context().unroute("**/vt-export/**");
  const online = [];
  await page.context().route("**/vt-export/**", async (route) => {
    online.push(new URL(route.request().url()).pathname);
    await route.fulfill({ contentType: "application/vnd.mapbox-vector-tile", body: Buffer.from(TOWER) }).catch(() => {});
  });
  await opened.evaluate(() => window.hmplotExport("camera", "plot", { state: { position: [-60, 3, 6], target: [-60, 0, 0] } }));
  await expect.poll(() => online.filter((path) => path.includes("/14/")).length, { timeout: 30_000 }).toBeGreaterThan(0);
  expect(requests.length).toBeGreaterThan(0);
});
