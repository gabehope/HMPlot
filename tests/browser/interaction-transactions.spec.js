import { test, expect } from "./fixtures.js";

// TODO 136.8: moving the pointer from one point straight to another, the hover's leave and enter
// publish together. Before, the leave published at once and the enter after its row readback, so
// between them the selection said nothing was hovered and a frame drew that (the flash).
test("hovering from one point to the next never publishes a state with nothing hovered", async ({ page }) => {
  await page.goto("/test/hover3d");
  await page.waitForFunction(() => window.__hover3d?.points);
  await page.evaluate(() => window.__hover3d.plot.whenSettled());
  const at = (i) => page.evaluate(async (i) => {
    const { guideObject } = await import("/src/lib/plot/utils/guides.js");
    const { points, data } = window.__hover3d, m = guideObject(points.getLegendSource()), c = m.view.picking.camera.current();
    const xyz = ["x", "y", "z"].map((a) => {
      const b = m.options.get(a + "bounds"), v = m.options.get(a + "range");
      return v[0] + (data[a][i] - b[0]) / (b[1] - b[0]) * (v[1] - v[0]);
    });
    const pos = c.position.clone().set(...xyz).applyMatrix4(m.matrixWorld).project(c), rect = m.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (pos.x + 1) * rect.width / 2, y: rect.top + (1 - pos.y) * rect.height / 2 };
  }, i);
  const hovered = () => page.evaluate(() => window.__hover3d.plot.getHover().status().previewCount);
  const a = await at(0), b = await at(2);
  await page.mouse.move(a.x, a.y);
  await expect.poll(hovered).toBe(1);
  await page.evaluate(() => {
    window.__published = [];
    window.__stop = window.__hover3d.plot.getHover().subscribe((status) => window.__published.push(status.previewCount));
  });
  await page.mouse.move(b.x, b.y);
  await expect.poll(() => page.evaluate(() => window.__published.length)).toBeGreaterThan(1);
  await page.evaluate(() => window.__hover3d.plot.whenSettled());
  const published = await page.evaluate(() => { window.__stop(); return window.__published; });
  // The first entry is the subscription's current state; every one after it has a hovered row.
  expect(published.slice(1).filter((count) => count === 0)).toEqual([]);
  expect(published.at(-1)).toBe(1);
});
