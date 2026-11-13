import { test, expect } from "./fixtures.js";
import { readFileSync } from "node:fs";

// Python lights rendered through /test/notebook. Fixtures from scripts/generate-light-fixtures.py:
// notebook-lights.json (a gray lit globe under a point light spec to its right, and one under a
// hemisphere light spec with a white sky and a black ground; glowing globes; a sky effect sent as PNG bytes
// behind a globe in fog) and notebook-62_solar_system.json (python/examples/62_solar_system.py
// with 64 x 32 textures).
async function open(page, fixture) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/test/notebook?fixture=${fixture}`);
  await page.waitForFunction(() => window.notebookReady, null, { timeout: 30000 });
  await expect.poll(() => page.evaluate(() =>
    [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"))).toBe(true);
  return errors;
}

/** A Plot's exported pixels, the Plot found by `name`. */
const exportPixels = (page, name, logicalSize) => page.evaluate(async ({ name, logicalSize }) => {
  const plots = [];
  const walk = (node) => { if (node.kind === "Plot") plots.push(node); (node.children ?? []).forEach(walk); };
  walk(window.notebookState.root);
  const plot = window.notebookRuntime.reference(plots.find((node) => node.props.name === name).id);
  await plot.whenSettled();
  const bitmap = await createImageBitmap(await plot.exportPNG());
  const canvas = document.createElement("canvas");
  // Camera-derived probes can request their CSS-pixel frame; adaptive profiles retain native pixels.
  canvas.width = logicalSize?.[0] ?? bitmap.width; canvas.height = logicalSize?.[1] ?? bitmap.height;
  const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
  return { data: Array.from(data), width, height, error: plot.getRenderError?.() ?? "" };
}, { name, logicalSize });

/** The red channel along the globe's middle row (horizontal) or column, inside the disk. */
function profile({ data, width, height }, horizontal) {
  const values = [], lit = (x, y) => data[(y * width + x) * 4] > 15;
  const size = horizontal ? width : height;
  for (let i = 0; i < size; i++) {
    const [x, y] = horizontal ? [i, height >> 1] : [width >> 1, i];
    if (lit(x, y)) values.push(data[(y * width + x) * 4]);
  }
  return values;
}
const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;
const ends = (values) => {
  const quarter = Math.floor(values.length / 4);
  return [mean(values.slice(0, quarter)), mean(values.slice(-quarter))];
};

test("Python point and hemisphere Plot light specs light a lit Image", async ({ page }) => {
  const errors = await open(page, "lights");
  const point = await exportPixels(page, "point");
  expect(point.error).toBe("");
  const across = profile(point, true);
  expect(across.length).toBeGreaterThan(80);
  // The point light is to the right.
  const [left, right] = ends(across);
  expect(right).toBeGreaterThan(left + 40);
  const hemisphere = await exportPixels(page, "hemisphere");
  expect(hemisphere.error).toBe("");
  const down = profile(hemisphere, false);
  expect(down.length).toBeGreaterThan(80);
  // The sky (white) is above and the ground (black) below.
  const [top, bottom] = ends(down);
  expect(top).toBeGreaterThan(bottom + 40);
  expect(errors).toEqual([]);
});

test("light settings update pixels and survive HTML export", async ({ page }) => {
  const errors = await open(page, "lights");
  const before = await exportPixels(page, "point");
  const pointId = await page.evaluate(() => {
    const plots = [];
    const walk = node => { if (node.kind === "Plot") plots.push(node); (node.children ?? []).forEach(walk); };
    walk(window.notebookState.root);
    const id = plots.find(node => node.props.name === "point").id;
    window.notebookRuntime.reference(id).openSettings();
    return id;
  });
  const panel = page.getByRole("dialog", { name: "Settings · point", exact: true });
  await panel.getByRole("button", { name: "Search settings", exact: true }).click();
  await panel.getByRole("searchbox").fill("Lights");
  for (const index of [1, 2]) {
    const field = panel.getByLabel(`Light ${index} intensity value`, { exact: true });
    await field.fill("0"); await field.press("Enter");
  }
  const dark = await exportPixels(page, "point");
  const brightness = image => image.data.reduce((sum, v, i) => i % 4 === 3 ? sum : sum + v, 0);
  expect(brightness(dark)).toBeLessThan(brightness(before) * 0.1);
  const ambient = panel.getByLabel("Light 1 intensity value", { exact: true });
  await ambient.fill("2"); await ambient.press("Enter");
  const lit = await exportPixels(page, "point");
  expect(brightness(lit)).toBeGreaterThan(brightness(before) * 0.5);
  expect(lit.error).toBe("");
  await page.context().route("**/__lights-runtime.js", route => route.fulfill({
    contentType: "text/javascript", body: readFileSync("python/hmplot/static/standalone.js", "utf8"),
  }));
  const exported = await page.evaluate(async id => {
    const runtime = window.notebookRuntime;
    runtime.setSerializable(window.notebookState,
      key => Uint8Array.from(atob(window.notebookBuffers[key]), c => c.charCodeAt(0)),
      () => fetch("/__lights-runtime.js").then(response => response.text()));
    const { blob, warnings } = await runtime.exportHTML(id, { snapshot: false });
    return { html: await blob.text(), warnings, lights: runtime.browserSettings.get(id)?.lights,
      edits: window.notebookMessages.filter(message => message.type === "edit" && message.target === id) };
  }, pointId);
  expect(exported.warnings).toEqual([]);
  expect(exported.lights.map(light => light.intensity)).toEqual([2, 0]);
  expect(exported.edits.at(-1).props.lights).toEqual(exported.lights);
  await page.context().route("**/__lights-export.html", route => route.fulfill({ contentType: "text/html", body: exported.html }));
  const opened = await page.context().newPage();
  opened.on("pageerror", error => errors.push(error.message));
  await opened.goto("/__lights-export.html");
  await opened.waitForFunction(() => typeof window.hmplotExport === "function" &&
    document.querySelector(".canvas") && [...document.querySelectorAll(".canvas")].every(canvas => canvas.getAttribute("aria-busy") === "false"));
  await expect.poll(() => opened.evaluate(() => window.hmplotExport("settled").then(() => true, error => error.message)), { timeout: 60000 }).toBe(true);
  const replayed = await opened.evaluate(async id => {
    await window.hmplotExport("settled", id);
    const { payload } = await window.hmplotExport("export_png", id, { scale: 1 });
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${payload}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0); bitmap.close();
    return [...context.getImageData(0, 0, canvas.width, canvas.height).data].reduce((sum, v, i) => i % 4 === 3 ? sum : sum + v, 0);
  }, pointId);
  expect(Math.abs(replayed / brightness(lit) - 1)).toBeLessThan(0.05);
  await opened.close();
  expect(errors).toEqual([]);
});

test("the Python solar system renders its textured, lit bodies", async ({ page }) => {
  const errors = await open(page, "62_solar_system");
  const nodes = await page.evaluate(() => {
    const all = [];
    const walk = (node) => { all.push(node); (node.children ?? []).forEach(walk); };
    walk(window.notebookState.root);
    return all.map((node) => ({ kind: node.kind, lit: node.props.lit, placed: !!node.props.placement,
      lights: (node.props.lights ?? []).map((light) => light.kind),
      effects: (node.props.effects ?? []).map((effect) => effect.kind) }));
  });
  expect(nodes.filter((node) => node.kind === "Image" && node.lit === true)).toHaveLength(8);
  expect(nodes.filter((node) => node.kind === "Frame" && node.placed)).toHaveLength(18);
  expect(nodes.filter((node) => node.kind === "Plot" && node.lights.includes("point"))).toHaveLength(1);
  // The Milky Way behind, and the Sun's glow (TODO 37.5).
  expect(nodes.filter((node) => node.kind === "Plot" && node.effects.includes("sky"))).toHaveLength(1);
  const image = await exportPixels(page, "Solar system");
  expect(image.error).toBe("");
  const { data, width, height } = image;
  let sun = 0, sunX = 0, orbit = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > 180 && g > 50 && g < 0.8 * r && b < 0.4 * r) { sun++; sunX += x; }
    else if (b > 50 && b < 130 && b > r + 20 && g > r && b > g + 10) orbit++;
  }
  expect(sun).toBeGreaterThan(300);
  expect(Math.abs(sunX / sun / width - 0.5)).toBeLessThan(0.05);
  expect(orbit).toBeGreaterThan(1000);
  expect(errors).toEqual([]);
});

// Sky, glow and fog from Python (TODO 37.5). Each Plot is 320 x 320 with the camera at [0, 0, 100]
// looking at the origin (fov 50): a world point's pixel follows from its distance to the camera.
const pixel = ([x, y, z], radius = 0) => {
  const half = Math.tan((25 * Math.PI) / 180) * (100 - z);
  return { x: 160 + (x / half) * 160, y: 160 - (y / half) * 160, r: (radius / half) * 160 };
};
const at = ({ data, width }, x, y) => { const i = (Math.round(y) * width + Math.round(x)) * 4; return [data[i], data[i + 1], data[i + 2]]; };
/** The mean brightest channel over the ring from 1.3 to 1.7 radii around a disk. */
function ring(image, { x, y, r }) {
  let sum = 0, count = 0;
  for (let j = Math.floor(y - 1.7 * r); j <= y + 1.7 * r; j++) for (let i = Math.floor(x - 1.7 * r); i <= x + 1.7 * r; i++) {
    const d = Math.hypot(i - x, j - y);
    if (d < 1.3 * r || d > 1.7 * r || i < 0 || j < 0 || i >= image.width || j >= image.height) continue;
    sum += Math.max(...at(image, i, j)); count++;
  }
  return sum / count;
}
/** Picks at plot pixels in the Plot named `name` (by its Images' handles): which Image, or null. */
const picks = (page, name, points) => page.evaluate(async ({ name, points }) => {
  const nodes = [];
  const walk = (node, inside) => { if (node.kind === "Plot") inside = node.props.name === name; if (inside && node.kind === "Image") nodes.push(node); (node.children ?? []).forEach((child) => walk(child, inside)); };
  walk(window.notebookState.root, false);
  const marks = nodes.map((node) => window.notebookRuntime.reference(node.id).getMark());
  const renderer = marks[0].renderer, rect = renderer.domElement.getBoundingClientRect();
  const result = [];
  for (const [x, y] of points) {
    const hit = await marks[0].view.picking.context.current.pickAt(rect.left + x * rect.width / 320, rect.top + y * rect.height / 320);
    result.push(hit ? marks.indexOf(hit.object) : null);
  }
  return result;
}, { name, points });

test("Python glow and bloom, a sky effect sent as PNG bytes, and fog; picking ignores them", async ({ page }) => {
  const errors = await open(page, "lights");
  const glow = await exportPixels(page, "glow", [320, 320]);
  expect(glow.error).toBe("");
  const left = pixel([-25, 12, 0], 8), right = pixel([25, 12, 0], 8), front = pixel([0, -22, 10], 10);
  // Equally bright globes; only the glowing one has a halo, and the black globe in front hides the
  // glowing one behind it.
  expect(Math.abs(at(glow, left.x, left.y)[0] - at(glow, right.x, right.y)[0])).toBeLessThan(8);
  expect(at(glow, left.x, left.y)[0]).toBeGreaterThan(200);
  // (The left globe's wide bloom reaches the others' rings a little.)
  const halo = ring(glow, left);
  expect(halo).toBeGreaterThan(40);
  expect(ring(glow, right)).toBeLessThan(halo / 5);
  expect(ring(glow, front)).toBeLessThan(halo / 5);
  // Picks: a glowing globe is itself; its halo is no mark.
  expect(await picks(page, "glow", [[left.x, left.y], [left.x + 1.5 * left.r, left.y], [right.x, right.y]])).toEqual([0, null, 1]);
  const sky = await exportPixels(page, "sky", [320, 320]);
  expect(sky.error).toBe("");
  // The sky image: red above the horizon, blue below, shown as given (fog leaves it alone).
  const [r0, g0, b0] = at(sky, 160, 6), [r1, g1, b1] = at(sky, 160, 314);
  expect(r0).toBeGreaterThan(200); expect(g0).toBeLessThan(40); expect(b0).toBeLessThan(40);
  expect(b1).toBeGreaterThan(200); expect(r1).toBeLessThan(40); expect(g1).toBeLessThan(40);
  // The gray globe, 80 to 100 units away in fog from 60 to 140, is tinted toward the fog's green.
  const [r, g] = at(sky, 160, 160);
  expect(g).toBeGreaterThan(r + 20);
  expect(await picks(page, "sky", [[160, 6], [160, 160]])).toEqual([null, 0]);
  expect(errors).toEqual([]);
});

test.describe("hybrid 3D presentation", () => {
  test.use({ deviceScaleFactor: 2 });
  test("higher sampling preserves glow, sky, fog and picking on screen", async ({ page }) => {
    for (const mode of ["ssaa8", "ssaa16"]) {
      await page.route('**/test/notebook-lights.json', async route => {
        const response = await route.fetch(), payload = await response.json();
        const walk = node => {
          if (node.kind === 'Plot') node.props.antialias = mode;
          (node.children ?? []).forEach(walk);
        };
        walk(payload.state.root);
        await route.fulfill({ response, json: payload });
      });
      const errors = await open(page, "lights");
      await page.evaluate(async () => {
        const plots = [];
        const walk = node => {
          if (node.kind === 'Plot') plots.push(window.notebookRuntime.reference(node.id));
          (node.children ?? []).forEach(walk);
        };
        walk(window.notebookState.root);
        await Promise.all(plots.map(plot => plot.whenSettled()));
      });
      const screen = async name => {
        const image = (await page.getByRole('region', { name, exact: true }).locator('canvas').screenshot()).toString('base64');
        return page.evaluate(async image => {
          const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${image}`)).blob());
          const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 320;
          const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0, 320, 320); bitmap.close();
          return { data: Array.from(context.getImageData(0, 0, 320, 320).data), width: 320, height: 320 };
        }, image);
      };
      const glow = await screen('glow'), left = pixel([-25, 12, 0], 8), right = pixel([25, 12, 0], 8);
      expect(at(glow, left.x, left.y)[0]).toBeGreaterThan(200);
      expect(ring(glow, left)).toBeGreaterThan(40);
      expect(ring(glow, right)).toBeLessThan(ring(glow, left) / 5);
      const sky = await screen('sky');
      expect(at(sky, 160, 6)[0]).toBeGreaterThan(200);
      expect(at(sky, 160, 314)[2]).toBeGreaterThan(200);
      expect(at(sky, 160, 160)[1]).toBeGreaterThan(at(sky, 160, 160)[0] + 20);
      expect(await picks(page, "glow", [[left.x, left.y], [left.x + 1.5 * left.r, left.y], [right.x, right.y]])).toEqual([0, null, 1]);
      expect(await picks(page, "sky", [[160, 6], [160, 160]])).toEqual([null, 0]);
      expect(errors).toEqual([]);
      await page.unroute('**/test/notebook-lights.json');
    }
  });
});
