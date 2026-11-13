import { test, expect } from "./fixtures.js";

// TODO 136.9: WebGPU guarantees 16 inter-stage locations (maxInterStageShaderVariables). Each mark
// family in its widest configuration builds within them; a build past them would be the mark's
// limit.varyings error (rendering/varyingsCheck.js) instead of a WGSL validation error.
test("the widest mark configurations build within 16 varyings", async ({
  page,
}) => {
  await page.goto("/test/varyings");
  await page.waitForFunction(
    () => window.varyings?.plots.flat && window.varyings?.plots.cube,
  );
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".canvas")].every(
      (canvas) => canvas.getAttribute("aria-busy") === "false",
    ),
  );
  const result = await page.evaluate(async () => {
    const plots = Object.values(window.varyings.plots);
    await Promise.all(plots.map((plot) => plot.whenSettled()));
    return plots.map((plot) => ({
      peak: plot.getDiagnostics().peakVaryings,
      // This fixture intentionally combines unexplained color channels to stress the shader.
      errors: plot.listDiagnostics().filter((entry) => entry.severity !== "lint").map((entry) => entry.code),
    }));
  });
  console.log(
    "peak varyings per plot",
    result.map((plot) => plot.peak),
  );
  for (const plot of result) {
    expect(plot.errors).toEqual([]);
    expect(plot.peak).toBeGreaterThan(0);
    expect(plot.peak).toBeLessThanOrEqual(16);
  }
});
