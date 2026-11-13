import { test, expect } from "./fixtures.js";

// TODO 138.3: a plugin's shade on marks (the docs' hatch, a rim light, a shade passing too many
// values between the stages). Pixels come from PNG exports of 300 x 200 plots over 0-10 domains.
async function open(page, query = "") {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (process.env.SHADE_DEBUG) console.log("[console]", message.type(), message.text().slice(0, 600)); });
  await page.goto(`/test/plugin-shade${query}`);
  await page.waitForFunction((wide) => wide ? window.pluginShade?.plots?.wide : window.pluginShade?.marks?.hatch && window.pluginShade?.plots?.rim3d,
    !!query, { timeout: 30000 });
  await expect.poll(() => page.evaluate(() =>
    [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"))).toBe(true);
  return errors;
}

/** The hatched point at x = 2.5: how many of the 24 x 24 pixels around its center are ink (red) and fill (blue). */
const stripes = (page) => page.evaluate(async () => {
  const plot = window.pluginShade.plots.hatch;
  await plot.whenSettled();
  const image = await createImageBitmap(await plot.exportPNG());
  const canvas = document.createElement("canvas");
  canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const scale = canvas.width / 300, size = Math.round(24 * scale);
  const data = context.getImageData(Math.round(75 * scale) - size / 2, Math.round(100 * scale) - size / 2, size, size).data;
  let ink = 0, fill = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 180 && data[i + 2] < 100) ink++;
    else if (data[i + 2] > 180 && data[i] < 100) fill++;
  }
  return { ink, fill, total: data.length / 4, error: plot.getRenderError() };
});

/** The row picked at each point's center (x = 2.5 and 7.5, y = 5) and between them. */
const picks = (page) => page.evaluate(async () => {
  const mark = window.pluginShade.marks.hatch.getMark(), rect = mark.renderer.domElement.getBoundingClientRect();
  const result = [];
  for (const x of [2.5, 5, 7.5]) {
    const hit = await mark.view.picking.context.current.pickAt(rect.left + (x / 10) * rect.width, rect.top + rect.height / 2);
    result.push(hit ? hit.instanceId : null);
  }
  return result;
});

const diagnostics = (page, name) => page.evaluate((name) =>
  window.pluginShade.plots[name].listDiagnostics().map(({ code, message }) => ({ code, message })), name);

test("a plugin's shade: hatch stripes a mark, its parameters compile nothing, exports rasterize it, picking is unchanged; rim needs normals", async ({ page }) => {
  const errors = await open(page);
  // The hatch: red stripes over the blue fill, about half of each.
  let hatch = await stripes(page);
  expect(hatch.error).toBe("");
  expect(hatch.ink).toBeGreaterThan(hatch.total * 0.25);
  expect(hatch.fill).toBeGreaterThan(hatch.total * 0.25);
  const shadedPicks = await picks(page);
  expect(shadedPicks).toEqual([0, null, 1]);

  // A new spacing and ink are uniforms: no pipeline or shader module is made.
  await page.evaluate(() => window.pluginShade.plots.hatch.getDiagnostics({ enabled: true }));
  const gpu = () => page.evaluate(() => {
    const d = window.pluginShade.plots.hatch.getDiagnostics();
    return { frame: d.completedFrame, ...d.instrumentation.gpu };
  });
  const before = await gpu();
  // (Any CSS color the browser draws: three reads only hex, rgb(), hsl() and names.)
  await page.evaluate(() => window.pluginShade.set({ spacing: 4, ink: "oklch(0.63 0.26 29)" }));
  await expect.poll(async () => (await gpu()).frame, { timeout: 10000 }).toBeGreaterThan(before.frame);
  const after = await gpu();
  expect(after.pipelines - before.pipelines).toBe(0);
  expect(after.shaderModules - before.shaderModules).toBe(0);
  // (Two-pixel stripes: more of the pixels are a blend of the two.)
  hatch = await stripes(page);
  expect(hatch.ink).toBeGreaterThan(hatch.total * 0.15);
  expect(hatch.fill).toBeGreaterThan(hatch.total * 0.15);

  // SVG ("auto") draws the shaded mark as an image of itself; "vector" refuses.
  const exported = await page.evaluate(async () => {
    const plot = window.pluginShade.plots.hatch;
    const svg = await plot.exportSVG({ mode: "auto" });
    let vector = "";
    try { await plot.exportSVG({ mode: "vector" }); } catch (error) { vector = error.message; }
    return { warnings: svg.report.warnings, vector };
  });
  expect(exported.warnings.some((warning) => warning.includes("was rasterized because its shade hatch has no vector equivalent"))).toBe(true);
  expect(exported.vector).toContain("is shaded by hatch, which SVG cannot express");
  // In a 3D view too, where a 2D mark otherwise exports as vectors.
  const vector3d = await page.evaluate(async () => {
    try { await window.pluginShade.plots.hatch3d.exportSVG({ mode: "vector" }); return ""; } catch (error) { return error.message; }
  });
  expect(vector3d).toContain("is shaded by hatch, which has no vector form");

  // Unshaded: the same rows picked, and no stripes.
  await page.evaluate(() => window.pluginShade.set({ shaded: false }));
  await expect.poll(async () => (await stripes(page)).ink).toBe(0);
  expect(await picks(page)).toEqual(shadedPicks);

  // A rim reads normals: an error on Points, which has none; drawn on Points3D.
  const rim = await diagnostics(page, "rim");
  expect(rim).toEqual([expect.objectContaining({ code: "plugin.input" })]);
  expect(rim[0].message).toMatch(/^Points\.shade: rim reads normalView, and Points has no surface normals\. The marks that have it: Points3D/);
  expect(await diagnostics(page, "rim3d")).toEqual([]);
  // Drawn unshaded, the rim's Points export as vectors.
  expect(await page.evaluate(async () => (await window.pluginShade.plots.rim.exportSVG({ mode: "vector" })).report.rasterLayers.length)).toBe(0);

  expect(errors).toEqual([]);
});

// Alone on its page: an invalid pipeline fails the device's other plots' frames too.
test("a shade passing too many values between the stages is the mark's limit.varyings error", async ({ page }) => {
  const errors = await open(page, "?wide");
  // Sixteen values of the shade's own between the stages: past the limit, named for the mark.
  // (The device's own validation error for the pipeline comes with it.)
  await expect.poll(() => diagnostics(page, "wide")).toEqual(expect.arrayContaining([expect.objectContaining({ code: "limit.varyings" })]));
  const varyings = (await diagnostics(page, "wide")).find(({ code }) => code === "limit.varyings");
  expect(varyings.message).toMatch(/^Points\b/);
  expect(errors).toEqual([]);
});
