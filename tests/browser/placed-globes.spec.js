import { test, expect } from "./fixtures.js";

// Textured globes, a ring and a bare Frame placed in a 3D Cartesian scene (the solar system
// example's parts): /test/placed-globes. Colors: the moving globe's front hemisphere red, its
// back blue; a uniform gray globe (a lit Image) lit from the front right; a green ring; a
// magenta point and label; a flat lit yellow Image facing the camera.
async function open(page, query = "") {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/test/placed-globes${query}`);
  await page.waitForFunction(() => window.placedGlobes?.plot);
  await expect.poll(() => page.evaluate(() =>
    [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"))).toBe(true);
  return errors;
}

/** The exported image's pixel classes: per class its count, centroid, and bounding box. */
const scan = (page) => page.evaluate(async () => {
  const plot = window.placedGlobes.plot;
  await plot.whenSettled();
  const image = await createImageBitmap(await plot.exportPNG());
  const canvas = document.createElement("canvas");
  canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0); image.close();
  const { width, height } = canvas, pixels = context.getImageData(0, 0, width, height).data;
  const classes = {}, at = (x, y) => pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 3);
  const add = (key, x, y) => {
    const c = (classes[key] ??= { count: 0, x: 0, y: 0, r: 0, left: width, right: 0, top: height, bottom: 0 });
    c.count++; c.x += x; c.y += y; c.r += at(x, y)[0];
    c.left = Math.min(c.left, x); c.right = Math.max(c.right, x); c.top = Math.min(c.top, y); c.bottom = Math.max(c.bottom, y);
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [r, g, b] = at(x, y);
    if (r > 40 && r > 2 * g && r > 2 * b && !(b > 0.6 * r)) add("red", x, y);
    else if (b > 60 && b > 1.8 * r && b > 1.2 * g) add("blue", x, y);
    else if (g > 90 && g > 2 * r && g > 1.5 * b) add("green", x, y);
    else if (r > 120 && b > 120 && g < 0.5 * r) add("magenta", x, y);
    else if (r > 50 && g > 0.7 * r && g < 1.05 * r && b < 0.4 * g) add("yellow", x, y);
    else if (Math.abs(r - g) < 12 && Math.abs(g - b) < 12 && r > 30) add(x > width / 2 ? "gray" : "neutral", x, y);
  }
  for (const c of Object.values(classes)) { c.x /= c.count; c.y /= c.count; c.r /= c.count; }
  // The gray globe's brightness along its middle row, left to right.
  const gray = classes.gray, row = [];
  if (gray) {
    const y = Math.round((gray.top + gray.bottom) / 2);
    for (let x = gray.left + 2; x <= gray.right - 2; x++) row.push(at(x, y)[0]);
  }
  return { classes, row, width, height, error: plot.getRenderError(), diagnostics: plot.getDiagnostics() };
});

test("globes, a ring and a bare Frame render at their placements in a 3D scene", async ({ page }) => {
  const errors = await open(page);
  const { classes, width, height, error } = await scan(page);
  expect(error).toBe("");
  const { red, gray, green } = classes;
  // A lit textured globe (a Heatmap its Image paints) at each placement: its front hemisphere
  // faces the camera.
  expect(red.count).toBeGreaterThan(4000);
  expect(red.x).toBeLessThan(width / 2);
  expect(red.y).toBeLessThan(height / 2);
  expect(classes.blue?.count ?? 0).toBeLessThan(red.count / 10);
  expect(gray.count).toBeGreaterThan(4000);
  expect(gray.y).toBeLessThan(height / 2);
  // The ring, 20 across like the gray globe, fits its placement: outer radius 20 / 2, inner
  // radius half that (its image spans radius 1 to 2 of the polar Frame's [0, 2]).
  const outer = (green.right - green.left) / 2, globe = (gray.right - gray.left) / 2;
  expect(Math.abs(outer / globe - 1)).toBeLessThan(0.08);
  expect(green.x).toBeGreaterThan(width / 2);
  expect(green.y).toBeGreaterThan(height / 2);
  const hole = await page.evaluate(async ({ x, y }) => {
    const image = await createImageBitmap(await window.placedGlobes.plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0); image.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    // The first green pixel right of the center: the inner radius.
    for (let d = 0; d < canvas.width / 2; d++) {
      const i = (y * canvas.width + x + d) * 4;
      if (pixels[i + 1] > 90 && pixels[i + 1] > 2 * pixels[i]) return d;
    }
    return null;
  }, { x: Math.round(green.x), y: Math.round(green.y) });
  expect(Math.abs(hole / outer - 0.5)).toBeLessThan(0.08);
  expect(errors).toEqual([]);
});

test("a lit globe is shaded smoothly toward its light", async ({ page }) => {
  await open(page);
  const { row } = await scan(page);
  expect(row.length).toBeGreaterThan(80);
  const quarter = Math.floor(row.length / 4), mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;
  // The light is to the front right.
  expect(mean(row.slice(-quarter))).toBeGreaterThan(mean(row.slice(0, quarter)) + 40);
  // Per-pixel normals, not flat facets: no jumps between neighboring pixels.
  const steps = row.slice(1).map((value, i) => Math.abs(value - row[i]));
  expect(Math.max(...steps)).toBeLessThan(8);
});

test("a lit Image takes the Plot's lights; unlit, it shows its exact colors", async ({ page }) => {
  const errors = await open(page);
  const quarter = (row) => Math.floor(row.length / 4), mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;
  const front = await scan(page);
  // The flat image faces the camera and the light in front of it.
  expect(front.classes.yellow.count).toBeGreaterThan(4000);
  await page.evaluate(() => window.placedGlobes.moveLight([300, 0, -150]));
  // With the light behind it, only the ambient light reaches its visible face.
  await expect.poll(async () => (await scan(page)).classes.yellow?.r ?? 0).toBeLessThan(front.classes.yellow.r - 40);
  await page.evaluate(() => { window.placedGlobes.moveLight([300, 0, 150]); window.placedGlobes.setGrayLit(false); });
  // Unlit, the gray globe is one flat color (0.8), brighter than its lit shadow side.
  await expect.poll(async () => {
    const { row } = await scan(page);
    return row.length > 80 && Math.max(...row) - Math.min(...row) < 6;
  }).toBe(true);
  const unlit = await scan(page);
  expect(mean(unlit.row)).toBeGreaterThan(mean(front.row.slice(0, quarter(front.row))) + 40);
  await page.evaluate(() => window.placedGlobes.setGrayLit(true));
  await expect.poll(async () => {
    const { row } = await scan(page);
    return mean(row.slice(-quarter(row))) - mean(row.slice(0, quarter(row)));
  }).toBeGreaterThan(40);
  expect((await scan(page)).error).toBe("");
  expect(errors).toEqual([]);
});

test("a bare placed Frame draws its box only when its axes show", async ({ page }) => {
  await open(page);
  const hidden = await scan(page);
  expect(hidden.classes.magenta?.count).toBeGreaterThan(0);
  expect(hidden.classes.neutral?.count ?? 0).toBeLessThan(5);
  await open(page, "?box=shown");
  const shown = await scan(page);
  expect(shown.classes.neutral?.count).toBeGreaterThan(200);
});

test("moving and spinning placed frames re-runs no frame configuration and re-prepares no mark", async ({ page }) => {
  await open(page);
  const before = await scan(page);
  await page.evaluate(() => window.placedGlobes.move(-15));
  await expect.poll(async () => (await scan(page)).classes.red.x).toBeGreaterThan(before.classes.red.x + 30);
  await page.evaluate(() => window.placedGlobes.turn(180));
  // The back hemisphere turns to the camera.
  await expect.poll(async () => {
    const { classes } = await scan(page);
    return (classes.blue?.count ?? 0) > 10 * (classes.red?.count ?? 0);
  }).toBe(true);
  const after = await scan(page);
  expect(after.error).toBe("");
  expect(after.diagnostics.markPreparations).toBe(before.diagnostics.markPreparations);
  expect(after.diagnostics.frameConfigurations).toBe(before.diagnostics.frameConfigurations);
  expect(after.diagnostics.completedFrame).toBeGreaterThan(before.diagnostics.completedFrame);
});

// TODO 37.6: an atmosphere around the gray globe tints a rim just outside its disk; a pick there
// finds no mark, and the globe itself still picks.
test("a globe's atmosphere tints a rim outside its disk and is not picked", async ({ page }) => {
  const errors = await open(page);
  const { gray } = (await scan(page)).classes;
  const disk = { x: (gray.left + gray.right) / 2, y: (gray.top + gray.bottom) / 2, radius: (gray.right - gray.left) / 2 };
  const rim = () => page.evaluate(async ({ x, y, radius }) => {
    const plot = window.placedGlobes.plot;
    await plot.whenSettled();
    const image = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0); image.close();
    const { width, pixels } = { width: canvas.width, pixels: context.getImageData(0, 0, canvas.width, canvas.height).data };
    // A circle just outside the gray globe's disk.
    let sum = [0, 0, 0], count = 0;
    for (let angle = 0; angle < 2 * Math.PI; angle += Math.PI / 32) {
      const i = (Math.round(y + Math.sin(angle) * (radius + 3)) * width + Math.round(x + Math.cos(angle) * (radius + 3))) * 4;
      for (let c = 0; c < 3; c++) sum[c] += pixels[i + c];
      count++;
    }
    const rect = window.placedGlobes.gray.getMark().renderer.domElement.getBoundingClientRect(), scale = rect.width / width;
    const picking = window.placedGlobes.gray.getMark().view.picking.context.current;
    const pick = async (px, py) => ((await picking.pickAt(rect.left + px * scale, rect.top + py * scale))?.object === window.placedGlobes.gray.getMark());
    return { color: sum.map((v) => v / count), centre: await pick(x, y), rim: await pick(x + radius + 3, y), error: plot.getRenderError() };
  }, disk);
  const bare = await rim();
  expect(bare.error).toBe("");
  expect(Math.max(...bare.color)).toBeLessThan(20);
  await page.evaluate(() => window.placedGlobes.setAtmosphere({ color: "#ff8800", thickness: 0.2 }));
  await expect.poll(async () => (await rim()).color[0]).toBeGreaterThan(40);
  const lit = await rim();
  expect(lit.error).toBe("");
  expect(lit.color[0]).toBeGreaterThan(lit.color[2] + 30);
  expect([lit.centre, lit.rim]).toEqual([true, false]);
  // Like a sky, fog or glow, it has no vector form.
  expect(await page.evaluate(() => window.placedGlobes.plot.exportSVG({ mode: "vector" }).then(() => "", (error) => error.message)))
    .toBe('Vector export cannot draw the plot\'s atmosphere. Use mode="auto" to export the plot as one raster image.');
  // Moved, it follows its Frame: off again, the rim is dark.
  await page.evaluate(() => window.placedGlobes.setAtmosphere(false));
  await expect.poll(async () => Math.max(...(await rim()).color)).toBeLessThan(20);
  expect(errors).toEqual([]);
});
