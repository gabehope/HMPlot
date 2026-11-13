import { test, expect } from "./fixtures.js";

test.use({ deviceScaleFactor: 2 });

async function open(page, scene) {
  await page.goto(`/test/root-coordinates?case=${scene}`);
  await page.waitForFunction(() => window.rootCoordinates?.plot?.whenSettled);
  await expect.poll(() => page.evaluate(() =>
    [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"))).toBe(true);
  await page.evaluate(() => window.rootCoordinates.plot.whenSettled());
}
/** The id of the visible settings select labelled `label`. */
const select = (page, label) => page.evaluate((label) => [...document.querySelectorAll("select")]
  .find((s) => s.offsetParent && s.labels?.[0]?.textContent.trim() === label)?.id, label);

test("a Plot whose root Frame is polar shows and edits the Frame's coordinates in its settings", async ({ page }) => {
  await open(page, "frame");
  await page.evaluate(() => window.rootCoordinates.plot.openSettings());
  const section = page.locator("summary").filter({ hasText: /^Coordinates/ });
  if ((await section.getAttribute("aria-expanded")) !== "true") await section.click();
  const id = await select(page, "Coordinates");
  expect(id).toBeTruthy();
  const coordinates = page.locator(`[id="${id}"]`);
  await expect(coordinates).toHaveValue("polar");
  await expect(page.locator(`[id="${await select(page, "Angle units")}"]`)).toHaveValue("custom");
  // An edit goes to the Frame the Plot draws in.
  await coordinates.selectOption("cartesian");
  await expect.poll(() => page.evaluate(() => window.rootCoordinates.frame.getFrameOptions().get("coordinates"))).toBe("cartesian");
  expect(await page.evaluate(() => window.rootCoordinates.plot.getRenderError())).toBe("");
});

test("dragging a globe sideways near a pole turns it steadily, whatever the vertical jitter", async ({ page }) => {
  await open(page, "globe");
  const box = await page.locator(".canvas").first().boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const jitter = 1 / await page.evaluate(() => devicePixelRatio);
  const center = () => page.evaluate(() => window.rootCoordinates.plot.getDiagnostics().viewport.center);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  const longitudes = [], latitudes = [];
  for (let i = 1; i <= 12; i++) {
    // Stay within the reach of the grabbed latitude and wobble one physical pixel.
    // Curved plots now fit without automatic axis gutters; a canvas-wide gesture can
    // cross that latitude's horizon, where no north-up center keeps it under the pointer.
    await page.mouse.move(cx + i * box.width * 0.075 / 12, cy + (i % 2 ? -jitter : jitter));
    const [longitude, latitude] = await center();
    longitudes.push(longitude); latitudes.push(latitude);
  }
  await page.mouse.up();
  // Longitude falls steadily (the globe turns with the pointer). Keeping the grabbed point (at
  // 60 degrees) level with a pointer moving sideways tilts the globe toward the pole, so the
  // center's latitude rises; the wobble only shakes it by fractions of a degree.
  for (let i = 1; i < longitudes.length; i++) expect(longitudes[i], JSON.stringify(longitudes)).toBeLessThan(longitudes[i - 1]);
  expect(longitudes[0] - longitudes.at(-1)).toBeGreaterThan(10);
  for (let i = 1; i < latitudes.length; i++) expect(latitudes[i], JSON.stringify(latitudes)).toBeGreaterThan(latitudes[i - 1] - 0.5);
  expect(latitudes.at(-1)).toBeLessThan(90);
});

// Sibling Frames (tests/frames.mjs, moved here): a click picks in the Frame that drew the point,
// reporting that Frame's values, and one zoom moves both Frames' shared x.
test("sibling Frames pick in their own coordinates and zoom together", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/frames");
  await page.waitForFunction(() => window.framesView?.getAxes().length === 3);
  await page.evaluate(() => window.framesView.whenSettled());
  const point = await page.evaluate(() => {
    const layout = window.framesView.getAxes()[2].getAxisLayout(), rect = document.querySelector("canvas").getBoundingClientRect();
    return { x: rect.x + layout.x.major.find((t) => t.value === 1).fraction * rect.width,
      y: rect.y + (1 - layout.y.major.find((t) => t.value === 20).fraction) * rect.height };
  });
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(() => window.framePick);
  const pick = await page.evaluate(() => window.framePick);
  expect(pick.instanceId).toBe(1);
  expect(Math.abs(pick.axisValue.y - 20)).toBeLessThan(0.5);
  await page.evaluate(() => window.framesView.setViewport({ zoomX: 2, zoomY: 2, x: 0.5, y: 0.5 }));
  await expect.poll(() => page.evaluate(() => {
    const [, left, right] = window.framesView.getAxes().map((axes) => axes.getAxisLayout());
    return JSON.stringify(left.x.major) === JSON.stringify(right.x.major);
  })).toBe(true);
  expect(errors).toEqual([]);
});
