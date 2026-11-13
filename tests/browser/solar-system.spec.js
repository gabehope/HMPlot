import { test, expect } from "./fixtures.js";

// The 3D solar system gallery example: textured spherical Frames placed in a Cartesian scene,
// moved every animation frame. The page draws the paired program's scene (TODO 69.10): its Date
// Playback is the clock, and each Frame's placement is an expression of it.
async function open(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/examples/solar-system");
  await page.waitForFunction(() => window.__examples?.plot?.whenSettled, null, { timeout: 60000 });
  await expect.poll(() => page.evaluate(() =>
    [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"))).toBe(true);
  return errors;
}

/** Pixel counts of the exported image: the Sun's orange and the orbit lines' blue-gray. */
const scan = (page) => page.evaluate(async () => {
  const plot = window.__examples.plot;
  await plot.whenSettled();
  const image = await createImageBitmap(await plot.exportPNG());
  const canvas = document.createElement("canvas");
  canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0); image.close();
  const { width, height } = canvas, pixels = context.getImageData(0, 0, width, height).data;
  const sun = { count: 0, x: 0, y: 0 };
  let orbit = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    if (r > 180 && g > 50 && g < 0.8 * r && b < 0.4 * r) { sun.count++; sun.x += x; sun.y += y; }
    else if (b > 50 && b < 130 && b > r + 20 && g > r && b > g + 10) orbit++;
  }
  sun.x /= sun.count; sun.y /= sun.count;
  return { sun, orbit, width, height, error: plot.getRenderError() };
});
/**
 * The exported image around the Sun (TODO 37): the mean brightness of a ring just outside its disk,
 * the stars in the top band (sky only), and how much the region far from the Sun differs from the
 * export saved as `compare` (stored as `save`).
 */
const look = (page, { save, compare } = {}) => page.evaluate(async ({ save, compare }) => {
  const plot = window.__examples.plot;
  await plot.whenSettled();
  const image = await createImageBitmap(await plot.exportPNG());
  const canvas = document.createElement("canvas");
  canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0); image.close();
  const { width, height } = canvas, pixels = context.getImageData(0, 0, width, height).data;
  let count = 0, sx = 0, sy = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    if (r > 180 && g > 50 && g < 0.8 * r && b < 0.4 * r) { count++; sx += x; sy += y; }
  }
  const cx = sx / count, cy = sy / count, radius = Math.sqrt(count / Math.PI);
  let ring = 0, ringCount = 0, stars = 0, far = 0, farCount = 0;
  const regions = (window.__solarRegions ??= {}), kept = save ? new Uint8ClampedArray(pixels.length) : null;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, bright = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
    const distance = Math.hypot(x - cx, y - cy);
    if (distance > radius * 1.25 && distance < radius * 1.7) { ring += bright; ringCount++; }
    if (y < height * 0.15 && bright > 35) stars++;
    if (distance > width * 0.3) {
      if (kept) for (let c = 0; c < 3; c++) kept[i + c] = pixels[i + c];
      if (compare) { for (let c = 0; c < 3; c++) far += Math.abs(pixels[i + c] - regions[compare][i + c]); farCount++; }
    }
  }
  if (save) regions[save] = kept;
  return { ring: ring / ringCount, stars, far: compare ? far / farCount : null, radius };
}, { save, compare });
const diagnostics = (page) => page.evaluate(() => {
  const d = window.__examples.plot.getDiagnostics();
  return { frame: d.completedFrame, marks: d.markPreparations, configurations: d.frameConfigurations };
});
// The Date control's value: a time in milliseconds.
const date = (page) => page.getByRole("slider", { name: "Date", exact: true }).inputValue();

test("the solar system plays by moving its frames only", { tag: ["@gpu", "@timing"] }, async ({ page }) => {
  const errors = await open(page);
  const live = page.locator(".live");
  await expect(live.getByText("Solar System Scope")).toBeVisible();
  await expect(live.getByRole("alert")).toHaveCount(0);
  const before = await diagnostics(page), start = await date(page);
  // Animation frames render (however slowly the machine runs them); none re-prepares a mark or
  // re-configures a frame.
  await expect.poll(async () => (await diagnostics(page)).frame - before.frame, { timeout: 5000 }).toBeGreaterThan(10);
  const after = await diagnostics(page);
  expect(after.marks).toBe(before.marks);
  expect(after.configurations).toBe(before.configurations);
  expect(await date(page)).not.toBe(start);
  const shown = await scan(page);
  expect(shown.error).toBe("");
  // The Sun, textured, at the middle of the scene.
  expect(shown.sun.count).toBeGreaterThan(300);
  expect(Math.abs(shown.sun.x / shown.width - 0.5)).toBeLessThan(0.05);
  expect(shown.orbit).toBeGreaterThan(1000);
  expect(errors).toEqual([]);
});

test("pause stops the clock; the orbit, label, star and glow switches change their parts", async ({ page }) => {
  const errors = await open(page);
  await page.getByRole("button", { name: "Pause Date" }).click();
  await expect(page.getByRole("button", { name: "Play Date" })).toBeVisible();
  const paused = await date(page);
  await page.waitForTimeout(400);
  expect(await date(page)).toBe(paused);
  const withOrbits = await scan(page);
  await page.getByLabel("Orbits").uncheck();
  await expect.poll(async () => (await scan(page)).orbit).toBeLessThan(withOrbits.orbit * 0.3);
  await page.getByLabel("Labels").uncheck();
  await page.getByLabel("Labels").check();
  await page.getByLabel("Orbits").check();
  await expect.poll(async () => (await scan(page)).orbit).toBeGreaterThan(withOrbits.orbit * 0.8);
  expect((await scan(page)).error).toBe("");
  // The Sun glows (TODO 37): a ring just outside its disk is brighter with glow on, and the
  // region far from the Sun is unchanged.
  const glowing = await look(page, { save: "glowing" });
  await page.getByLabel("Glow").uncheck();
  await expect.poll(async () => (await look(page)).ring).toBeLessThan(glowing.ring - 8);
  const plain = await look(page, { compare: "glowing" });
  expect(plain.far).toBeLessThan(0.5);
  // The stars: the sky fills the top band, which is empty (the background) without them.
  expect(glowing.stars).toBeGreaterThan(200);
  await page.getByLabel("Stars").uncheck();
  await expect.poll(async () => (await look(page)).stars).toBeLessThan(10);
  await page.getByLabel("Stars").check();
  await page.getByLabel("Glow").check();
  await expect.poll(async () => (await look(page)).ring).toBeGreaterThan(glowing.ring - 2);
  expect((await scan(page)).error).toBe("");
  await page.getByRole("button", { name: "Play Date" }).click();
  await expect.poll(() => date(page)).not.toBe(paused);
  expect(errors).toEqual([]);
});

// TODO 37: the sky and the Sun's glow at a device pixel ratio of 2. Frames keep completing; a
// Bloom setting is a uniform (it compiles nothing); with the glow off its attachment and blur
// targets are gone, and turning it off and on again allocates nothing new.
test.describe("at a device pixel ratio of 2", () => {
  test.use({ deviceScaleFactor: 2 });
  test("the sky and glow keep frames coming; their settings compile nothing; glow off frees its passes", { tag: ["@gpu", "@timing"] }, async ({ page }) => {
    const errors = await open(page);
    await page.evaluate(() => window.__examples.plot.getDiagnostics({ enabled: true }));
    const gpu = () => page.evaluate(() => {
      const d = window.__examples.plot.getDiagnostics();
      return { frame: d.completedFrame, ...d.instrumentation.gpu };
    });
    // Playing with the stars and the glow on, frames complete.
    let before = await gpu();
    await page.waitForTimeout(1500);
    let after = await gpu();
    expect(after.frame - before.frame).toBeGreaterThan(20);
    // A Bloom setting (the settings pane's Bloom strength) changes a uniform only.
    await page.getByRole("button", { name: "Pause Date" }).click();
    await page.evaluate(() => window.__examples.plot.openSettings());
    const dialog = page.getByRole("dialog", { name: /^Settings/ });
    await dialog.getByText("Rendering", { exact: true }).click();
    const dim = await look(page);
    before = await gpu();
    const strength = dialog.getByRole("textbox", { name: "Bloom strength value" });
    await strength.fill("2.5");
    await strength.press("Enter");
    // (Counted over the live frames: an export builds a bloom of its own.)
    await expect.poll(async () => (await gpu()).frame, { timeout: 5000 }).toBeGreaterThan(before.frame);
    after = await gpu();
    expect(after.pipelines - before.pipelines).toBe(0);
    expect(after.shaderModules - before.shaderModules).toBe(0);
    expect((await look(page)).ring).toBeGreaterThan(dim.ring + 5);
    await page.evaluate(() => window.__examples.plot.closeSettings());
    // Glow off: the glow attachment and the bloom's eleven targets go. (The counters see only
    // what is created after they start: glow is turned off and on once first.)
    await page.getByLabel("Glow").uncheck();
    await page.getByLabel("Glow").check();
    await expect.poll(async () => (await look(page)).ring).toBeGreaterThan(dim.ring + 5);
    const glowing = await gpu();
    await page.getByLabel("Glow").uncheck();
    await expect.poll(async () => glowing.textures - (await gpu()).textures, { timeout: 5000 }).toBeGreaterThanOrEqual(11);
    // Disposing bloom can precede the next beauty frame, which owns the three plain
    // color/MSAA/depth attachments. Compare allocations after that frame lands.
    await expect.poll(async () => (await gpu()).frame, { timeout: 5000 }).toBeGreaterThan(glowing.frame);
    const plain = await gpu();
    // On and off again: the same allocations.
    await page.getByLabel("Glow").check();
    await expect.poll(async () => (await gpu()).textures, { timeout: 5000 }).toBe(glowing.textures);
    const again = await gpu();
    await page.getByLabel("Glow").uncheck();
    await expect.poll(async () => (await gpu()).frame, { timeout: 5000 }).toBeGreaterThan(again.frame);
    await expect.poll(async () => (await gpu()).textures, { timeout: 5000 }).toBe(plain.textures);
    after = await gpu();
    expect(Math.abs(after.bufferBytes - plain.bufferBytes)).toBeLessThan(64 * 1024);
    expect(errors).toEqual([]);
  });
});
