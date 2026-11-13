import { test, expect } from "./fixtures.js";
import { installGpuCounters, gpuCounters } from "./gpu-counters.js";

// TODO 29.1: a brushable mark receives every pointer move (an internal handler), and a pointer
// event on the root scope's rows is its source row: moving over the points reads nothing back
// from jax (picking still reads its pixel).
test("pointer moves over a brushable mark's points read nothing back from jax", async ({
  page,
}) => {
  await page.addInitScript(installGpuCounters);
  await page.goto("/test/line-buffers");
  await page.waitForFunction(
    () => ((m) => m?.view.marks.of(m))(window.lineBuffers?.marks.columnA?.getMark())?.interaction,
  );
  // Counters cover the whole page, including the other plots in this fixture.
  await page.waitForFunction(() => [...document.querySelectorAll(".canvas")]
    .every(canvas => canvas.getAttribute("aria-busy") === "false"));
  await page.evaluate(() => Promise.all(Object.values(window.lineBuffers.plots)
    .map(plot => plot.whenSettled())));
  const box = await page
    .locator('[data-fixture="connector"] canvas')
    .first()
    .boundingBox();
  const before = await gpuCounters(page);
  // Column A's points are at x 10 (of 0-100), y 20, 50 and 80: move around each.
  for (const y of [0.8, 0.5, 0.2])
    for (const dx of [-0.01, 0, 0.01])
      await page.mouse.move(
        box.x + box.width * (0.1 + dx),
        box.y + box.height * y,
      );
  await page.evaluate(() => window.lineBuffers.plots.connector.whenSettled());
  const after = await gpuCounters(page);
  expect(
    after.readbackKinds.picking - before.readbackKinds.picking,
  ).toBeGreaterThan(0);
  expect(after.readbackKinds.jax - before.readbackKinds.jax).toBe(0);
});
