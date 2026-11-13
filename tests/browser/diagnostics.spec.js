import { test, expect } from "./fixtures.js";

// TODO 136.6: a GPU validation error (a shader that does not compile) is the plot's error, listed
// with the plot's diagnostics, not only a console warning.
test("a GPU validation error is listed in the plot's diagnostics", async ({ page }) => {
  await page.goto("/test/blend");
  await page.waitForFunction(() => window.blendFixture?.plots?.normal);
  await page.waitForFunction(() => {
    const canvases = [...document.querySelectorAll(".canvas")];
    return canvases.length > 0 && canvases.every((canvas) => canvas.getAttribute("aria-busy") === "false");
  });
  expect(await page.evaluate(() => window.blendFixture.plots.normal.listDiagnostics())).toEqual([]);
  await page.evaluate(async () => (await import("/tests/browser/gpu-error-fixture.js")).provokeValidationError());
  await expect.poll(() => page.evaluate(() => window.blendFixture.plots.normal.listDiagnostics()
    .map(({ code, component }) => `${code} ${component}`))).toEqual(["gpu.validation Plot"]);
});
