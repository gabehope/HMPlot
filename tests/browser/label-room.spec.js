import { test, expect } from "./fixtures.js";

// Label room as pixels, not domain (TODO 136.15): long labels at the data's ends are inset inside
// the plot area, and the axis's domain stays the data's.
test("labels at the ends get room inside the plot area; the domain stays the data's", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/test/label-room");
  await page.waitForFunction(() => window.labelRoom?.plot);
  await expect.poll(() => page.evaluate(() =>
    [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"))).toBe(true);
  await page.evaluate(() => window.labelRoom.plot.whenSettled());
  await expect.poll(() => page.evaluate(() => {
    const major = window.labelRoom.plot.getAxisLayout()?.x?.major ?? [];
    const at = (v) => major.find((t) => t.value === v)?.fraction;
    // The data run 0 to 10: the major ticks stay there, and the labels' room insets both ends.
    return major.length > 1 && major.every((t) => t.value >= 0 && t.value <= 10) && at(0) > 0 && at(10) < 0.8;
  })).toBe(true);
  // The insets are uneven (the labels sit right of their points): zooming keeps the point under
  // the pointer there.
  const at = await page.evaluate(() => {
    const layout = window.labelRoom.plot.getAxisLayout(), place = (axis, v) => {
      const [a, b] = [axis.major[0], axis.major.at(-1)];
      return a.fraction + (v - a.value) * (b.fraction - a.fraction) / (b.value - a.value);
    };
    return [place(layout.x, 7.5), 1 - place(layout.y, 2)];
  });
  const box = await page.locator('[data-fixture="labels"] .canvas').boundingBox(), hovered = () => page.evaluate(() => window.labelRoom.plot.getHover().status().previewCount);
  const point = { x: box.x + box.width * at[0], y: box.y + box.height * at[1] };
  await page.mouse.move(point.x, point.y);
  await expect.poll(hovered).toBe(1);
  await page.mouse.wheel(0, -400);
  await expect.poll(() => page.evaluate(() => window.labelRoom.plot.getViewport().zoomX)).toBeGreaterThan(1.2);
  await page.mouse.move(point.x + 1, point.y);
  await page.mouse.move(point.x, point.y);
  await page.evaluate(() => window.labelRoom.plot.whenSettled());
  await expect.poll(hovered).toBe(1);
  // Zoomed in, the data fill the gutters too, and so do the ticks.
  await page.evaluate(() => window.labelRoom.plot.setViewport({ x: 0.5, y: 0.5, zoom: 4 }));
  await page.evaluate(() => window.labelRoom.plot.whenSettled());
  await expect.poll(() => page.evaluate(() => window.labelRoom.plot.getAxisLayout().x.major.at(-1).fraction)).toBeGreaterThan(0.85);
  expect(errors).toEqual([]);
});

// Rounded ends (TODO 136.17): an automatic scatter's axes end on ticks past its data, five or more.
test("an automatic scatter's axes end on labeled ticks past the data", async ({ page }) => {
  await page.goto("/test/label-room");
  await page.waitForFunction(() => window.labelRoom?.nice);
  await expect.poll(() => page.evaluate(() =>
    [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"))).toBe(true);
  await page.evaluate(() => window.labelRoom.nice.whenSettled());
  const ticks = await page.evaluate(() => {
    const layout = window.labelRoom.nice.getAxisLayout();
    return ["x", "y"].map((a) => layout[a].major.filter((t) => t.showLabel).map((t) => t.value));
  });
  for (const [values, [low, high]] of [[ticks[0], [2.1, 47.3]], [ticks[1], [-3.2, 8.7]]]) {
    expect(values.length).toBeGreaterThanOrEqual(5);
    expect(values[0]).toBeLessThan(low);
    expect(values.at(-1)).toBeGreaterThan(high);
  }
});
