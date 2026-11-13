import { test, expect } from "./fixtures.js";
test("arrows and links stay GPU-resident through curves, dashes, updates and teardown", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("favicon"))
      errors.push(m.text());
  });
  await page.goto("/gpu-marks-fixture");
  await expect(page.locator("canvas")).toBeVisible();
  await page.evaluate(() => window.__gpuMarks.settle());
  const canvas = page.locator("canvas");
  await page.mouse.move(900, 800);
  const curved = await canvas.screenshot();
  const before = await page.evaluate(() => window.__gpuMarks.diagnostics());
  await page.evaluate(() => window.__gpuMarks.set({ straight: true }));
  expect((await canvas.screenshot()).equals(curved)).toBe(false);
  await page.evaluate(() => window.__gpuMarks.set({ straight: false }));
  expect((await canvas.screenshot()).equals(curved)).toBe(true);
  await page.evaluate(() => window.__gpuMarks.update());
  await page.evaluate(() => window.__gpuMarks.settle());
  await page.evaluate(() => window.__gpuMarks.set({ subdivisions: 24 }));
  await page.evaluate(() => window.__gpuMarks.set({ subdivisions: 12 }));
  await page.evaluate(() => window.__gpuMarks.set({ mode: "3d" }));
  await page.screenshot({ path: "test-results/gpu-arrows-links-3d.png" });
  await page.evaluate(() => window.__gpuMarks.set({ mode: "2d" }));
  await canvas.screenshot(); // Wait for the new camera render targets to be allocated.
  const after = await page.evaluate(() => window.__gpuMarks.diagnostics());
  expect(after.readbacks).toBe(0);
  expect(after.memory).toEqual(before.memory);
  await page.evaluate(() => window.__gpuMarks.set({ zeroOnly: true }));
  await canvas.click({ position: { x: 240, y: 160 } });
  await page.waitForTimeout(150);
  expect(
    (await page.evaluate(() => window.__gpuMarks.diagnostics())).hits,
  ).toBe(0);
  await page.mouse.move(900, 800);
  const zero = await canvas.screenshot();
  await page.evaluate(() => window.__gpuMarks.set({ showArrows: false }));
  expect((await canvas.screenshot()).equals(zero)).toBe(true);
  await page.evaluate(() => window.__gpuMarks.set({ showArrows: true }));
  await page.evaluate(() => window.__gpuMarks.set({ mounted: false }));
  await page.evaluate(() => window.__gpuMarks.set({ mounted: true }));
  await expect(canvas).toBeVisible();
  await page.evaluate(() => window.__gpuMarks.settle());
  expect((await canvas.screenshot()).equals(zero)).toBe(true);
  expect(
    (await page.evaluate(() => window.__gpuMarks.diagnostics())).readbacks,
  ).toBe(0);
  const validation = await page.evaluate(() => window.__gpuMarks.error());
  expect({ errors, validation }).toEqual({ errors: [], validation: null });
});
