import { test, expect } from "./fixtures.js";
import fs from "node:fs";
import { encodeVectorTile } from "../unit/vectorTileEncoder.js";

// These library tests drive the gallery component's dev hooks (window.__manhattanFlyover), so they
// open it as a fixture: the public /examples/manhattan-flyover draws the paired program (TODO
// 69.10), checked in examples.spec.js.

test("Manhattan buildings render over a vector tile basemap under the Y-up flyover", { tag: "@gpu" }, async ({ page }) => {
  test.setTimeout(120_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/gallery-example?id=manhattan-flyover");
  await page.getByLabel("Buildings", { exact: true }).selectOption("nyc");
  await page.waitForFunction(() => window.__manhattanFlyover?.mark && window.__manhattanFlyover?.basemap);
  await page.evaluate(() => window.__manhattanFlyover.plot.whenSettled());
  const diagnostics = await page.evaluate(() => ({
    buildings: window.__manhattanFlyover.mark.getDiagnostics(),
    basemap: window.__manhattanFlyover.basemap.getStatus(),
  }));
  expect(diagnostics.buildings.features).toBe(10000);
  // The twelve zoom-12 tiles under the scene, in the buildings' plane (TODO 24), as they are
  // (live={false}): a flat basemap under the 3D buildings (TODO 66), none of its own extruded.
  expect(diagnostics.basemap).toMatchObject({ pending: false, error: "", tiles: 12, live: null, extruded: 0 });
  expect(diagnostics.basemap.features).toBeGreaterThan(1000);
  await expect(page.getByLabel("Live example").getByText("Fly over Manhattan.", { exact: false })).toBeVisible();
  // The repository keeps 10,000 of Manhattan's 45,194 buildings (R1.4; SOURCE.md).
  await expect(page.getByLabel("Maximum buildings")).toHaveAttribute("max", "10000");
  const canvas = page.locator("canvas").first();
  const before = await page.evaluate(() => {
    const camera = window.__manhattanFlyover.mark.getMark().view.navigation.controls.current.object;
    return { position: camera.position.toArray(), up: camera.up.toArray() };
  });
  expect(before.up).toEqual([0, 1, 0]);
  const colored = await page.evaluate(async () => {
    const image = await createImageBitmap(await window.__manhattanFlyover.plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 16)
      if (Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 210) count++;
    image.close();
    return count;
  });
  expect(colored).toBeGreaterThan(500);
  await page.getByLabel("Live example").screenshot({ path: "test-results/manhattan-flyover.png" });
  await page.getByLabel("Maximum buildings").fill("1000");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.evaluate(() => window.__manhattanFlyover.plot.whenSettled());
  expect(await page.evaluate(() => window.__manhattanFlyover.mark.getDiagnostics().features)).toBe(1000);
  await page.getByRole("button", { name: "All buildings" }).click();
  await page.evaluate(() => window.__manhattanFlyover.plot.whenSettled());
  expect(await page.evaluate(() => window.__manhattanFlyover.mark.getDiagnostics().features)).toBe(10000);
  const afterLimit = await page.evaluate(() => ({
    camera: window.__manhattanFlyover.mark.getMark().view.navigation.controls.current.object.position.toArray(),
    buildings: window.__manhattanFlyover.mark.getDiagnostics(),
  }));
  expect(afterLimit.camera).toEqual(before.position);
  expect(afterLimit.buildings.faceInstances).toBeGreaterThan(450000); // 495,236 on 2026-10-02
  expect(afterLimit.buildings.faceCapacity).toBeGreaterThanOrEqual(afterLimit.buildings.faceInstances);
  await page.getByLabel("Live example").screenshot({ path: "test-results/manhattan-flyover-all.png" });
  await canvas.click();
  await page.keyboard.down("w");
  await page.waitForTimeout(250);
  await page.keyboard.up("w");
  const after = await page.evaluate(() =>
    window.__manhattanFlyover.mark.getMark().view.navigation.controls.current.object.position.toArray(),
  );
  expect(after).not.toEqual(before.position);
  expect(errors).toEqual([]);
});

// 9D M: the Manhattan example's map-style flyover, driven the way the manual check reads: grab a
// street and drag in circles (it stays under the pointer), then zoom in on a building (it stays
// under the pointer and grows). Positions go through the example's real three.js camera.
test("Manhattan flyover: a grabbed street follows the pointer in circles; a building zoomed on stays under it and grows", { tag: "@gpu" }, async ({ page }) => {
  test.setTimeout(120_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/gallery-example?id=manhattan-flyover");
  await page.getByLabel("Buildings", { exact: true }).selectOption("nyc");
  await page.waitForFunction(() => window.__manhattanFlyover?.mark && window.__manhattanFlyover?.basemap);
  await page.evaluate(() => window.__manhattanFlyover.plot.whenSettled());
  const camera = () => page.evaluate(() => window.__manhattanFlyover.plot.getCamera());
  /** Client pixel of a world point. */
  const project = (point) => page.evaluate((point) => {
    const mark = window.__manhattanFlyover.mark.getMark(), renderer = mark.renderer, eye = mark.view.navigation.controls.current.object;
    eye.updateMatrixWorld();
    const v = eye.position.clone().set(...point).project(eye), r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }, point);
  /** The world point at height `level` under a client pixel. */
  const under = (x, y, level = 0) => page.evaluate(([x, y, level]) => {
    const mark = window.__manhattanFlyover.mark.getMark(), renderer = mark.renderer, eye = mark.view.navigation.controls.current.object;
    eye.updateMatrixWorld();
    const r = renderer.domElement.getBoundingClientRect();
    const ray = eye.position.clone().set((2 * (x - r.left)) / r.width - 1, 1 - (2 * (y - r.top)) / r.height, 0.5)
      .unproject(eye).sub(eye.position).normalize();
    return eye.position.clone().addScaledVector(ray, (level - eye.position.y) / ray.y).toArray();
  }, [x, y, level]);
  const off = async (point, x, y) => { const p = await project(point); return Math.hypot(p.x - x, p.y - y); };
  const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  // Mouse and wheel events carry whole pixels; anchor on the world point under that pixel, since
  // each zoom magnifies any sub-pixel offset about the cursor.
  const pixel = ({ x, y }) => ({ x: Math.round(x), y: Math.round(y) });

  // Zoom in toward midtown: the point under the cursor stays there and the camera descends.
  const cursor = pixel(await project([-9, 0, -27]));
  const midtown = await under(cursor.x, cursor.y);
  await page.mouse.move(cursor.x, cursor.y);
  let previous = await camera();
  for (let i = 0; i < 12 && (distance(previous.position, midtown) >= 45 || previous.position[1] >= 20); i++) {
    await page.mouse.wheel(0, -300);
    await expect.poll(async () => distance((await camera()).position, previous.position)).toBeGreaterThan(0.1);
    previous = await camera();
    expect(await off(midtown, cursor.x, cursor.y)).toBeLessThan(1.5);
  }
  expect(distance(previous.position, midtown)).toBeLessThan(45);
  expect(previous.position[1]).toBeLessThan(20);

  // Grab the street under the pointer (buildings stand on y = 0, and the base map lies flat on it,
  // TODO 66) and drag twice around a circle: it stays under the pointer, and the camera returns home.
  const start = await camera();
  const street = await under(cursor.x, cursor.y);
  await page.mouse.down();
  for (let step = 1; step <= 48; step++) {
    const angle = (step / 24) * 2 * Math.PI;
    const x = Math.round(cursor.x + 45 * Math.sin(angle)), y = Math.round(cursor.y - 45 * (1 - Math.cos(angle)));
    await page.mouse.move(x, y);
    if (step % 4) continue;
    await expect.poll(() => off(street, x, y)).toBeLessThan(1.5);
  }
  // Released still (the last move's pixel): no glide (TODO 66.6).
  await page.waitForTimeout(100);
  await page.mouse.up();
  const home = await camera();
  expect(distance(home.position, start.position)).toBeLessThan(1e-3);
  expect(Math.abs(home.position[1] - start.position[1])).toBeLessThan(1e-9);

  // Find a building by clicking near the pointer whose roof centre is visible, and aim at it.
  const selection = page.locator(".selection");
  const picked = async (x, y) => {
    await page.mouse.click(x, y);
    await page.waitForTimeout(150);
    const text = (await selection.textContent()) ?? "";
    return text.startsWith("Click") ? "" : text.split(" · ")[0];
  };
  const roofOf = (name) => page.evaluate(async (name) => {
    const url = document.querySelector('a[download="manhattan-buildings.json"]').href;
    const feature = (await (await fetch(url)).json()).features.find((f) => f.properties.name === name);
    const ring = feature.geometry.type === "MultiPolygon" ? feature.geometry.coordinates[0][0] : feature.geometry.coordinates[0];
    // plane="xz" puts GeoJSON (x, y) at world (x, -y); heightScale from [0, 2] onto [0, 20].
    return ring.map(([x, y]) => [x, 10 * feature.properties.height, -y]);
  }, name);
  let name = "", roof = null, aim = null;
  for (const [dx, dy] of [[0, 0], [12, 0], [-12, 0], [0, 12], [0, -12], [24, 12], [-24, -12], [24, -24], [-24, 24], [36, 0], [-36, 0], [0, 36]]) {
    const candidate = await picked(cursor.x + dx, cursor.y + dy);
    if (!candidate) continue;
    const ring = await roofOf(candidate);
    const centre = ring.slice(0, -1).reduce((sum, p) => sum.map((v, i) => v + p[i] / (ring.length - 1)), [0, 0, 0]);
    const target = pixel(await project(centre));
    if (await picked(target.x, target.y) === candidate) { name = candidate; roof = ring; aim = target; break; }
  }
  expect(name).not.toBe("");
  const roofPoint = await under(aim.x, aim.y, roof[0][1]); // the roof point under the aim pixel
  const groundPoint = await under(aim.x, aim.y);
  const screenArea = async () => {
    const pts = await Promise.all(roof.map(project));
    return Math.abs(pts.reduce((sum, p, i) => { const q = pts[(i + 1) % pts.length]; return sum + p.x * q.y - q.x * p.y; }, 0)) / 2;
  };
  // One wheel event sized so the camera ends halfway to the roof: the wheel zooms toward the
  // ground point behind it (exp(0.001 * deltaY) of the way), so more would fly through the roof.
  const areaBefore = await screenArea(), before = await camera();
  const toGround = distance(before.position, groundPoint), toRoof = distance(before.position, roofPoint);
  const deltaY = Math.round(1000 * Math.log((toGround - toRoof / 2) / toGround));
  await page.mouse.move(aim.x, aim.y);
  // Chromium's CDP wheel delta is in native pixels; the DOM receives CSS pixels.
  // Preserve the calculated zoom factor when this fixture runs at DPR2.
  await page.mouse.wheel(0, deltaY * await page.evaluate(() => devicePixelRatio));
  await expect.poll(async () => distance((await camera()).position, before.position)).toBeGreaterThan(0.1);
  const zoomed = await camera();
  expect(distance(zoomed.position, roofPoint) / toRoof).toBeCloseTo(0.5, 1);
  expect(await off(roofPoint, aim.x, aim.y)).toBeLessThan(1.5);
  expect(await screenArea()).toBeGreaterThan(areaBefore * 2.5); // about 4x: half the distance
  // Select another building first (a click on bare ground keeps the text), then re-select it.
  for (const [dx, dy] of [[80, 0], [-80, 0], [0, 80], [0, -80], [120, 60], [-120, -60], [120, -60], [-120, 60], [160, 0], [-160, 0]])
    if (await picked(aim.x + dx, aim.y + dy) !== name) break;
  expect(await selection.textContent()).not.toContain(`${name} ·`);
  expect(await picked(aim.x, aim.y)).toBe(name);
  await page.getByLabel("Live example").screenshot({ path: "test-results/manhattan-flyover-zoomed.png" });
  expect(errors).toEqual([]);
});

// TODO 37.2 and 37.4: the example's gradient Sky and its Fog switch. Pixels come from PNG exports
// (the live presentation); a window's color is its mean.
test("Manhattan flyover: the sky's zenith is above a tilted view; fog fades distant geometry more than near, follows the camera, and switches off", { tag: "@gpu" }, async ({ page }) => {
  test.setTimeout(180_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/gallery-example?id=manhattan-flyover");
  await page.getByLabel("Buildings", { exact: true }).selectOption("nyc");
  await page.waitForFunction(() => window.__manhattanFlyover?.mark && window.__manhattanFlyover?.basemap);
  await page.evaluate(() => window.__manhattanFlyover.plot.whenSettled());
  /** Mean colors of 9 x 9 windows of the exported image around world points (or [x, y] fractions). */
  const sample = (points) => page.evaluate(async (points) => {
    const { plot, mark } = window.__manhattanFlyover;
    await plot.whenSettled();
    const image = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0); image.close();
    const eye = mark.getMark().view.navigation.controls.current.object;
    eye.updateMatrixWorld();
    return points.map((point) => {
      let x, y;
      if (point.length === 2) [x, y] = [point[0] * canvas.width, point[1] * canvas.height];
      else {
        const v = eye.position.clone().set(...point).project(eye);
        [x, y] = [((v.x + 1) / 2) * canvas.width, ((1 - v.y) / 2) * canvas.height];
      }
      const { data } = context.getImageData(Math.round(x) - 4, Math.round(y) - 4, 9, 9), mean = [0, 0, 0];
      for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) mean[c] += data[i + c] / 81;
      return mean;
    });
  }, points);
  const change = (a, b) => a.reduce((sum, color, i) => sum + Math.hypot(...color.map((v, c) => v - b[i][c])), 0) / a.length;
  // Map points near the default camera and far from it (the ground plane, y = 0).
  const near = [[8, 0, 12], [14, 0, 6], [2, 0, 16]], far = [[-30, 0, -62], [-24, 0, -70], [-36, 0, -56]];
  const picks = (points) => page.evaluate(async (points) => {
    const mark = window.__manhattanFlyover.mark.getMark(), renderer = mark.renderer, eye = mark.view.navigation.controls.current.object, rect = renderer.domElement.getBoundingClientRect();
    eye.updateMatrixWorld();
    const out = [];
    for (const point of points) {
      const v = eye.position.clone().set(...point).project(eye);
      const hit = await mark.view.picking.context.current.pickAt(rect.left + ((v.x + 1) / 2) * rect.width, rect.top + ((1 - v.y) / 2) * rect.height);
      out.push(hit ? [hit.object.uuid, hit.instanceId] : null);
    }
    return out;
  }, points);
  const clear = await sample([...near, ...far]), clearPicks = await picks([...near, ...far]);
  const fogSwitch = page.getByRole("checkbox", { name: "Fog", exact: true });
  await fogSwitch.check();
  // The example's fog is its pale horizon, close to the pale basemap: a red fog (a setting, in
  // the settings pane) shows how much each point is fogged.
  await page.evaluate(() => window.__manhattanFlyover.plot.openSettings());
  await page.getByRole("dialog", { name: /^Settings/ }).getByText("View", { exact: true }).click();
  const fogColor = page.getByRole("textbox", { name: "Fog color" });
  await fogColor.fill("#ff0000");
  await fogColor.press("Enter");
  await page.evaluate(() => window.__manhattanFlyover.plot.closeSettings());
  await expect.poll(async () => change((await sample(far)), clear.slice(3)), { timeout: 20_000 }).toBeGreaterThan(20);
  const fogged = await sample([...near, ...far]);
  const nearChange = change(fogged.slice(0, 3), clear.slice(0, 3)), farChange = change(fogged.slice(3), clear.slice(3));
  expect(farChange).toBeGreaterThan(nearChange * 2);
  // Fog is presentation only: picks are unchanged.
  expect(await picks([...near, ...far])).toEqual(clearPicks);
  // It follows the camera: flown toward the far points, they are less fogged.
  const home = await page.evaluate(() => window.__manhattanFlyover.plot.getCamera());
  await page.evaluate(() => window.__manhattanFlyover.plot.setCamera({ position: [-30, 60, 10], target: [-30, 0, -62] }));
  const closeFogged = await sample(far);
  await fogSwitch.uncheck();
  const closeClear = await sample(far);
  expect(change(closeFogged, closeClear)).toBeLessThan(farChange / 2);
  // Off again, the first view draws as it did.
  await page.evaluate((home) => window.__manhattanFlyover.plot.setCamera({ position: home.position, target: home.target }), home);
  expect(change(await sample([...near, ...far]), clear)).toBeLessThan(1);
  // The sky: tilted toward the horizon, the top of the view is the zenith's blue, above the
  // pale horizon.
  await page.evaluate(() => window.__manhattanFlyover.plot.setCamera({ position: [0, 12, 60], target: [0, 20, 0] }));
  const [top, low] = await sample([[0.5, 0.02], [0.02, 0.45]]);
  expect(top[2] - top[0]).toBeGreaterThan(25);
  expect(top[0]).toBeLessThan(low[0] - 15);
  expect(errors).toEqual([]);
});

// TODO 66: the example's map tile buildings, streamed from VersaTiles around the camera (routed
// here: the twelve bundled zoom-12 tiles, a block of synthetic towers at every zoom-14 tile, land
// elsewhere; no network).
const square = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const LAND = encodeVectorTile([{ name: "land", features: [{ type: 3, properties: { kind: "residential" }, geometry: [square(-64, -64, 4160, 4160)] }] }]);
const BLOCKS = encodeVectorTile([
  { name: "land", features: [{ type: 3, properties: { kind: "residential" }, geometry: [square(-64, -64, 4160, 4160)] }] },
  { name: "buildings", features: Array.from({ length: 36 }, (_, i) => {
    const x = 200 + (i % 6) * 650, y = 200 + Math.floor(i / 6) * 650;
    return { id: i + 1, type: 3, properties: i % 7 ? { height: 60 + (i % 5) * 40 } : {}, geometry: [square(x, y, x + 400, y + 400)] };
  }) },
]);
async function openTiles(page) {
  const requests = [], errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // WebGPU validation errors are console events, not uncaught JavaScript exceptions.
  page.on("console", (message) => {
    if (message.type() === "error" && /WebGPU|used in submit while destroyed/.test(message.text()))
      errors.push(message.text());
  });
  await page.route("https://tiles.versatiles.org/tiles/osm/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/tiles/osm/", "");
    requests.push(path);
    const local = `static/data/vector-tiles/${path}.mvt`, z = Number(path.split("/")[0]);
    const body = fs.existsSync(local) ? fs.readFileSync(local) : Buffer.from(z === 14 ? BLOCKS : LAND);
    await route.fulfill({ contentType: "application/vnd.mapbox-vector-tile", body }).catch(() => {});
  });
  await page.goto("/test/gallery-example?id=manhattan-flyover");
  await page.waitForFunction(() => window.__manhattanFlyover?.plot && window.__manhattanFlyover?.basemap);
  await page.evaluate(() => window.__manhattanFlyover.plot.whenSettled());
  await expect(page.getByLabel("Buildings", { exact: true })).toHaveValue("tiles");
  // The camera flies down over Midtown (300 ms).
  await expect.poll(() => page.evaluate(() => window.__manhattanFlyover.plot.getCamera().position[1])).toBeLessThan(3.3);
  await page.evaluate(() => window.__manhattanFlyover.plot.whenSettled());
  return { requests, errors };
}
const status = (page) => page.evaluate(() => window.__manhattanFlyover.basemap.getStatus());
/** The PNG export's pixels at [x, y] fractions, or all of them (every 4th, as RGB). */
const exported = (page, points = null) => page.evaluate(async (points) => {
  const { plot } = window.__manhattanFlyover;
  await plot.whenSettled();
  const image = await createImageBitmap(await plot.exportPNG());
  const canvas = new OffscreenCanvas(image.width, image.height), context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  if (points) return points.map(([x, y]) => [...context.getImageData(Math.round(x * image.width), Math.round(y * image.height), 1, 1).data.slice(0, 3)]);
  const { data } = context.getImageData(0, 0, image.width, image.height), out = [];
  for (let i = 0; i < data.length; i += 16) out.push(data[i], data[i + 1], data[i + 2]);
  return out;
}, points);

test.describe("map tile buildings (TODO 66)", () => {
  test.use({ deviceScaleFactor: 2 });

  test("reused tile slots draw after buffer growth when detail decreases and returns", { tag: "@gpu" }, async ({ page }) => {
    test.setTimeout(180_000);
    const { errors } = await openTiles(page);
    await page.evaluate(async () => {
      const { BasePlotObject } = await import("/src/lib/plot/objects/base.js");
      const ensure = BasePlotObject.prototype.ensureCapacity;
      window.__tileMarks = new Set();
      BasePlotObject.prototype.ensureCapacity = function (...args) {
        if (this.plotTileStorage) window.__tileMarks.add(this);
        return ensure.apply(this, args);
      };
    });
    const detail = page.getByRole("slider", { name: "Tile detail", exact: true });
    const firstFrame = await page.evaluate(() => window.__manhattanFlyover.plot.getDiagnostics().completedFrame);
    for (const value of ["-2", "0", "-2", "0"]) {
      await detail.evaluate((el, value) => { el.value = value; el.dispatchEvent(new Event("input", { bubbles: true })); }, value);
      await page.evaluate(() => window.__manhattanFlyover.plot.whenSettled());
      const state = await status(page);
      expect(state.live.shown).toBe(state.live.selected);
      expect(state.live.failed).toBe(0);
      // Export submits another draw: validate the actual rendered ground/buildings too.
      const pixels = await exported(page);
      expect(pixels.filter((value) => value < 210).length).toBeGreaterThan(500);
    }
    expect(await page.evaluate(() => window.__manhattanFlyover.plot.getDiagnostics().completedFrame)).toBeGreaterThan(firstFrame + 4);
    expect((await status(page)).extruded).toBeGreaterThan(0);
    const beforeGrowth = await exported(page);
    // Force a reused, visible slot past capacity. Route fixtures alone may select slots that
    // already fit, whereas real tiles have very different row counts at the same zoom.
    await page.evaluate(async () => {
      const mark = [...window.__tileMarks].find(mark => !mark.isDisposed && mark.visible && mark.count && mark.constructor.name === "GeoFaces");
      if (!mark) throw new Error("Expected a visible streamed GeoFaces slot");
      const arrays = [...mark.fields.values()].filter(field => field.data instanceof Float32Array)
        .map(field => [field, field.data, field.count]);
      mark.ensureCapacity(mark.manager.maxElements * 2);
      await Promise.all(arrays.map(([field, data, rows]) => field.updateHost(data, rows)));
    });
    // Let submission validation arrive before an export that would depend on the invalid draw.
    await page.waitForTimeout(250);
    expect(errors).toEqual([]);
    await page.evaluate(() => window.__manhattanFlyover.plot.whenSettled());
    expect(await exported(page)).toEqual(beforeGrowth);
    expect(errors).toEqual([]);
  });

  test("tile buildings stand around the camera, the 3D buildings switch lays them flat from the same tiles, fog fades the far ground, and SVG export draws the 3D view as an image", { tag: "@gpu" }, async ({ page }) => {
    test.setTimeout(180_000);
    const { requests, errors } = await openTiles(page);
    let state = await status(page);
    expect(state.live).toMatchObject({ zoom: 14, failed: 0 });
    expect(state.live.shown).toBe(state.live.selected);
    expect(state.extruded).toBeGreaterThan(0);
    expect(requests.some((path) => path.startsWith("14/"))).toBe(true);
    const standing = await exported(page);
    const camera = await page.evaluate(() => window.__manhattanFlyover.plot.getCamera());
    const detail = page.getByRole("slider", { name: "Tile detail", exact: true });
    await detail.evaluate((el) => { el.value = "-2"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.evaluate(() => window.__manhattanFlyover.plot.whenSettled());
    expect((await status(page)).live.zoom).toBeLessThan(14);
    expect(await exported(page)).not.toEqual(standing);
    expect(await page.evaluate(() => window.__manhattanFlyover.plot.getCamera())).toEqual(camera);
    await detail.evaluate((el) => { el.value = "0"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    await page.evaluate(() => window.__manhattanFlyover.plot.whenSettled());
    expect((await status(page)).live.zoom).toBe(14);
    const asked = requests.length;
    await page.getByRole("checkbox", { name: "3D buildings" }).uncheck();
    await page.evaluate(() => window.__manhattanFlyover.plot.whenSettled());
    state = await status(page);
    expect(state.extruded).toBe(0);
    const flat = await exported(page);
    // The towers' walls and roofs gave way to the ground behind them and their footprints.
    const changed = standing.reduce((n, value, i) => n + (i % 3 === 0 && Math.abs(value - flat[i]) + Math.abs(standing[i + 1] - flat[i + 1]) + Math.abs(standing[i + 2] - flat[i + 2]) > 24 ? 1 : 0), 0);
    expect(changed).toBeGreaterThan(standing.length / 3 / 50);
    await page.getByRole("checkbox", { name: "3D buildings" }).check();
    await page.evaluate(() => window.__manhattanFlyover.plot.whenSettled());
    expect((await status(page)).extruded).toBeGreaterThan(0);
    expect(requests.slice(asked).filter((path) => requests.slice(0, asked).includes(path)), "the switch prepares the tiles again from their bytes").toEqual([]);
    // Fog (the example's, from 6 to 40 units with tile buildings; red, from the settings pane) reads
    // the ground plane's depth: the far ground, near the horizon, turns redder than the near ground.
    const clear = await exported(page, [[0.5, 0.97], [0.5, 0.42]]);
    await page.getByRole("checkbox", { name: "Fog", exact: true }).check();
    await page.evaluate(() => window.__manhattanFlyover.plot.openSettings());
    await page.getByRole("dialog", { name: /^Settings/ }).getByText("View", { exact: true }).click();
    const fogColor = page.getByRole("textbox", { name: "Fog color" });
    await fogColor.fill("#ff0000");
    await fogColor.press("Enter");
    await page.evaluate(() => window.__manhattanFlyover.plot.closeSettings());
    await expect.poll(async () => (await exported(page, [[0.5, 0.42]]))[0][0] - clear[1][0], { timeout: 20_000 }).toBeGreaterThan(5);
    const [nearFog, farFog] = await exported(page, [[0.5, 0.97], [0.5, 0.42]]);
    const redder = (now, before) => (now[0] - now[1]) - (before[0] - before[1]);
    expect(redder(farFog, clear[1])).toBeGreaterThan(redder(nearFog, clear[0]) + 20);
    // A 3D view exports to SVG as an image (its tiles and buildings in it).
    const svg = await page.evaluate(async () => (await (await window.__manhattanFlyover.plot.exportSVG({ mode: "auto" })).blob.text()));
    expect(svg).toContain("<image");
    expect(errors).toEqual([]);
  });

  test("a flick glides on and stops, with height and direction kept, frames coming and the tile work bounded; whenSettled waits for it; Momentum off stops on release", { tag: ["@gpu", "@timing"] }, async ({ page }) => {
    test.setTimeout(180_000);
    const { errors } = await openTiles(page);
    const canvas = await page.locator(".canvas").first().boundingBox();
    const camera = () => page.evaluate(() => window.__manhattanFlyover.plot.getCamera());
    // A drag of 240 px in 8 moves, one a frame, released at speed: the release follows the last
    // move at once, and the camera as released is read in the page. (A drag held still for 40 ms
    // before its release does not glide; a frame and a round trip after the last move took 35 to
    // 60 ms beside other specs, and the flick did not glide, TODO 69.15.)
    const flick = async () => {
      const x = canvas.x + canvas.width / 2, y = canvas.y + canvas.height * 0.7;
      await page.evaluate(() => addEventListener("pointerup", () => {
        window.__released = JSON.parse(JSON.stringify(window.__manhattanFlyover.plot.getCamera()));
      }, { capture: true, once: true }));
      await page.mouse.move(x, y);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) {
        await page.mouse.move(x + 30 * i, y);
        if (i < 8) await page.evaluate(() => new Promise(requestAnimationFrame));
      }
      await page.mouse.up();
      return page.evaluate(() => window.__released);
    };
    const before = await flick();
    // Animation frames while the camera moves, and the plot's completed frames meanwhile.
    const watch = await page.evaluate(async () => {
      const plot = window.__manhattanFlyover.plot, tiles = window.__manhattanFlyover.basemap, t0 = performance.now();
      const completed = () => plot.getDiagnostics().completedFrame, first = completed();
      let animation = 0, slots = 0, requests = 0, moving = 0, drawn = 0, last = plot.getCamera().position[0];
      while (performance.now() - t0 < 2000) {
        await new Promise(requestAnimationFrame);
        const live = tiles.getStatus().live, x = plot.getCamera().position[0];
        slots = Math.max(slots, live?.slots ?? 0);
        requests = Math.max(requests, live?.requests ?? 0);
        if (x !== last) { moving = performance.now() - t0; animation++; drawn = completed() - first; }
        last = x;
      }
      return { animation, drawn, slots, requests, moving };
    });
    const after = await camera();
    const travel = Math.hypot(after.position[0] - before.position[0], after.position[2] - before.position[2]);
    expect(travel, "it glides on").toBeGreaterThan(0.05);
    expect(watch.moving, "and stops within 1.5 s").toBeLessThan(1600);
    expect(after.position[1]).toBeCloseTo(before.position[1], 9);
    const direction = (state) => state.target.map((v, i) => v - state.position[i]), unit = (v) => v.map((x) => x / Math.hypot(...v));
    unit(direction(after)).forEach((v, i) => expect(v).toBeCloseTo(unit(direction(before))[i], 6));
    expect(watch.drawn, `${watch.drawn} frames drawn in ${watch.animation} of the glide`).toBeGreaterThan(watch.animation * 0.7);
    expect(watch.slots).toBeLessThan(120);
    // whenSettled after a flick returns once the glide has stopped and its tiles show.
    await flick();
    await page.evaluate(() => window.__manhattanFlyover.plot.whenSettled());
    const settled = await camera();
    await page.waitForTimeout(300);
    expect((await camera()).position).toEqual(settled.position);
    const live = (await status(page)).live;
    expect(live.shown).toBe(live.selected);
    // Momentum off: the view stops on release.
    await page.getByRole("checkbox", { name: "Momentum" }).uncheck();
    await flick();
    const released = await camera();
    await page.waitForTimeout(400);
    expect((await camera()).position).toEqual(released.position);
    expect(errors).toEqual([]);
  });
});
