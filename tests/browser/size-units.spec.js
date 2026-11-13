import { test, expect } from "./fixtures.js";

// The widest run of red pixels in a PNG export: the point's rendered width.
const width = (page, key) => page.evaluate(async (key) => {
  const plot = window.sizeFixture.plots[key];
  await plot.whenSettled();
  const png = await plot.exportPNG(), bitmap = await createImageBitmap(png);
  const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
  const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
  let best = 0;
  for (let y = 0; y < height; y++) {
    let run = 0;
    for (let x = 0; x < width; x++) { const i = (y * width + x) * 4; if (data[i] > 150 && data[i + 1] < 120) run++; }
    best = Math.max(best, run);
  }
  return best;
}, key);
async function open(page) {
  await page.goto("/test/size-units");
  await page.waitForFunction(() => Object.keys(window.sizeFixture?.plots ?? {}).length === 8);
  await page.evaluate(() => Promise.all(Object.values(window.sizeFixture.plots).map((plot) => plot.whenSettled())));
  await page.waitForTimeout(800);
}
// The point's width on the live canvas (exports render the fitted view, not the zoom).
async function liveWidth(page, key, physical = false) {
  const keys = await page.evaluate(() => Object.keys(window.sizeFixture.plots));
  const canvas = page.locator("canvas").nth(keys.indexOf(key));
  const bounds = await canvas.boundingBox();
  const buffer = await canvas.screenshot();
  return page.evaluate(async ({ b64, cssWidth, physical }) => {
    const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let best = 0;
    for (let y = 0; y < height; y++) {
      let run = 0;
      for (let x = 0; x < width; x++) { const i = (y * width + x) * 4; if (data[i] > 150 && data[i + 1] < 120) run++; }
      best = Math.max(best, run);
    }
    // Screenshot pixels include DPR. Public size units and the default assertions are CSS pixels.
    // The explicit HiDPI case also checks the native physical footprint.
    return physical ? best : best / (c.width / cssWidth);
  }, { b64: buffer.toString("base64"), cssWidth: bounds.width, physical });
}
async function zoomIn(page, key) {
  const keys = await page.evaluate(() => Object.keys(window.sizeFixture.plots));
  await page.locator("canvas").nth(keys.indexOf(key)).hover();
  // CDP wheel deltas are native pixels; preserve this authored CSS-pixel gesture at HiDPI.
  await page.mouse.wheel(0, -400 * await page.evaluate(() => devicePixelRatio));
  await page.waitForTimeout(500);
}

// TODO 73.1: a literal size is the point's diameter in CSS pixels (it drew at half its value), as a
// size column mapped through sizeScale's range is, on screen and in the SVG export.
test("a literal size and a mapped size are both the point's diameter in CSS pixels", async ({ page }) => {
  await open(page);
  expect(Math.abs(await liveWidth(page, "px") - 20)).toBeLessThanOrEqual(1);
  expect(await liveWidth(page, "mapped")).toBe(await liveWidth(page, "px"));
  const radii = await page.evaluate(async () => Promise.all(["px", "mapped"].map(async (key) => {
    const svg = await (await window.sizeFixture.plots[key].exportSVG()).blob.text();
    return Number(new DOMParser().parseFromString(svg, "image/svg+xml").querySelector("circle[fill='#e0301e']")?.getAttribute("r"));
  })));
  expect(radii).toEqual([10, 10]);
});

test("data-unit points scale with the axis under zoom while pixel points keep their width", async ({ page }) => {
  await open(page);
  // 10 data units on a 400 px, 100-unit axis span 40 px.
  expect(await liveWidth(page, "data")).toBe(40);
  expect(await liveWidth(page, "px")).toBe(await liveWidth(page, "default"));
  const before = { data: await liveWidth(page, "data"), px: await liveWidth(page, "px") };
  await zoomIn(page, "data");
  await zoomIn(page, "px");
  const after = { data: await liveWidth(page, "data"), px: await liveWidth(page, "px") };
  expect(after.data).toBeGreaterThan(before.data * 1.3);
  expect(Math.abs(after.px - before.px)).toBeLessThanOrEqual(1);
});

// TODO 64.4: an Arrows3D's sizes are world units, a curved one's too, in 3D and in 2D (they were
// pixels), at any device pixel ratio: 12 world units on a 400 px, 100-unit plot are 48 CSS px.
test("Arrows3D: curved arrows are sized as straight ones, in world units, in 2D and 3D", async ({ page, browser, baseURL }) => {
  await open(page);
  expect(await liveWidth(page, "curved3d")).toBe(await liveWidth(page, "straight3d"));
  expect(await liveWidth(page, "straight")).toBe(48);
  expect(await liveWidth(page, "curved")).toBe(48);
  const context = await browser.newContext({ baseURL, deviceScaleFactor: 2 }), sharp = await context.newPage();
  await open(sharp);
  expect(await liveWidth(sharp, "curved", true)).toBe(96);
  await context.close();
});
