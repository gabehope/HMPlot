import { test, expect } from "./fixtures.js";

// The view as a prop (TODO 136.14): a new viewport or camera position eases there with the
// plot's animation settings, and the viewer's wheel cancels a 2D move where it is.
async function open(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/test/view-props");
  await page.waitForFunction(() => window.viewProps?.flat && window.viewProps?.solid);
  await page.evaluate(() => Promise.all([window.viewProps.flat.whenSettled(), window.viewProps.solid.whenSettled()]));
  await expect.poll(() => page.evaluate(() => Boolean(window.viewProps.solid.getCamera()))).toBe(true);
  return errors;
}

test("a new viewport eases there, and a wheel cancels it", async ({ page }) => {
  const errors = await open(page);
  const zooms = await page.evaluate(async () => {
    const plot = window.viewProps.flat, seen = [];
    window.viewProps.setViewport({ x: 0.5, y: 0.5, zoom: 4 });
    const start = performance.now();
    while (performance.now() - start < 900) {
      seen.push(plot.getViewport().zoom);
      await new Promise(requestAnimationFrame);
    }
    return seen;
  });
  // Part way it is between 1 and 4, and it lands on 4.
  expect(zooms.some((z) => z > 1.05 && z < 3.95)).toBe(true);
  expect(zooms.at(-1)).toBeCloseTo(4, 5);
  // Back to 1, with a wheel on the canvas part way: the move stops short of 1.
  const stopped = await page.evaluate(async () => {
    const plot = window.viewProps.flat, canvas = document.querySelector(".flat canvas");
    window.viewProps.setViewport({ x: 0.5, y: 0.5, zoom: 1 });
    const start = performance.now();
    while (performance.now() - start < 120 || plot.getViewport().zoom > 3.9)
      await new Promise(requestAnimationFrame);
    const box = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -1, clientX: box.left + box.width / 2,
      clientY: box.top + box.height / 2, bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 900));
    return plot.getViewport().zoom;
  });
  expect(stopped).toBeGreaterThan(1.2);
  expect(errors).toEqual([]);
});

test("a new camera position eases there", async ({ page }) => {
  const errors = await open(page);
  const xs = await page.evaluate(async () => {
    const plot = window.viewProps.solid, seen = [], from = plot.getCamera().position[0];
    window.viewProps.setPosition([0, 70, 160]);
    const start = performance.now();
    while (performance.now() - start < 900) {
      seen.push(plot.getCamera().position[0]);
      await new Promise(requestAnimationFrame);
    }
    return { from, seen };
  });
  expect(xs.seen.some((x) => x < xs.from - 1 && x > 1)).toBe(true);
  expect(xs.seen.at(-1)).toBeCloseTo(0, 3);
  expect(errors).toEqual([]);
});
