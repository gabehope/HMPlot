import { test, expect } from "./fixtures.js";

// TODO 138.3: a plugin's effect (the docs' vignette) on a white plot. Its number and color
// parameters are uniforms: changing one compiles nothing. The PNG export draws it as the screen
// does; SVG and PDF in mode "auto" draw the plot as one raster and name it; a kind registered
// after the plot mounted draws once its plugin arrives.
async function open(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/test/plugin-effects");
  await page.waitForFunction(() => window.pluginEffects?.plots?.late, null, { timeout: 30000 });
  await expect.poll(() => page.evaluate(() =>
    [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"))).toBe(true);
  return errors;
}

/** A plot's PNG export (or its SVG export's raster) at the center and a corner, in 300 x 200 plot pixels. */
const sample = (page, name, from = "png") => page.evaluate(async ({ name, from }) => {
  const plot = window.pluginEffects.plots[name];
  await plot.whenSettled();
  const source = from === "png" ? await createImageBitmap(await plot.exportPNG()) : await (async () => {
      const svg = await plot.exportSVG({ mode: "auto" });
      const text = await svg.blob.text(), image = new DOMParser().parseFromString(text, "image/svg+xml").querySelector("image");
      window.__svgReport = svg.report;
      return createImageBitmap(await (await fetch(image.getAttribute("href"))).blob());
  })();
  const canvas = document.createElement("canvas");
  canvas.width = source.width; canvas.height = source.height;
  const context = canvas.getContext("2d");
  context.drawImage(source, 0, 0);
  const scale = canvas.width / 300, at = (x, y) => [...context.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data];
  return { center: at(150, 100), corner: at(4, 4), error: plot.getRenderError() };
}, { name, from });

test("a plugin's vignette: parameters compile nothing; PNG, SVG and PDF draw it; a late plugin draws when it arrives", async ({ page }) => {
  const errors = await open(page);
  // The vignette darkens the corners and leaves the center white.
  let png = await sample(page, "main");
  expect(png.error).toBe("");
  expect(png.center[0]).toBeGreaterThan(245);
  expect(png.corner[0]).toBeLessThan(160);
  // The screen shows what the PNG does.
  const shot = (await page.locator("canvas").first().screenshot()).toString("base64");
  const screen = await page.evaluate(async (data) => {
    const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const scale = canvas.width / 300, at = (x, y) => [...context.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data];
    return { center: at(150, 100), corner: at(4, 4) };
  }, shot);
  for (const where of ["center", "corner"])
    for (let c = 0; c < 3; c++) expect(Math.abs(screen[where][c] - png[where][c])).toBeLessThan(12);

  // A stronger amount and a red color: uniforms only.
  await page.evaluate(() => window.pluginEffects.plots.main.getDiagnostics({ enabled: true }));
  const gpu = () => page.evaluate(() => {
    const d = window.pluginEffects.plots.main.getDiagnostics();
    return { frame: d.completedFrame, ...d.instrumentation.gpu };
  });
  const before = await gpu();
  await page.evaluate(() => window.pluginEffects.set({ amount: 1, color: "#ff0000" }));
  await expect.poll(async () => (await gpu()).frame, { timeout: 5000 }).toBeGreaterThan(before.frame);
  const after = await gpu();
  expect(after.pipelines - before.pipelines).toBe(0);
  expect(after.shaderModules - before.shaderModules).toBe(0);
  png = await sample(page, "main");
  const [r, g, b] = png.corner;
  expect(r).toBeGreaterThan(200);
  expect(g).toBeLessThan(80);
  expect(b).toBeLessThan(80);
  expect(png.center[1]).toBeGreaterThan(245);

  // SVG and PDF ("auto") draw the plot as one raster with the vignette, naming it; "vector" refuses.
  const svg = await sample(page, "main", "svg");
  expect(svg.corner[0]).toBeGreaterThan(200);
  expect(svg.corner[1]).toBeLessThan(80);
  const reports = await page.evaluate(async () => {
    const plot = window.pluginEffects.plots.main;
    const pdf = await plot.exportPDF({ mode: "auto" });
    let vector = "";
    try { await plot.exportSVG({ mode: "vector" }); } catch (error) { vector = error.message; }
    return { svg: window.__svgReport, pdf: pdf.report, pdfSignature: new TextDecoder().decode((await pdf.blob.arrayBuffer()).slice(0, 4)), vector };
  });
  expect(reports.svg.rasterLayers.map((layer) => layer.kind)).toEqual(["plot"]);
  expect(reports.svg.warnings).toContain("The plot was exported as one raster image because it shows vignette, which has no vector form.");
  expect(reports.pdfSignature).toBe("%PDF");
  expect(reports.pdf.rasterLayers.map((layer) => layer.kind)).toEqual(["plot"]);
  expect(reports.vector).toBe('Vector export cannot draw the plot\'s vignette. Use mode="auto" to export the plot as one raster image.');

  // A kind no plugin registers yet: the plot draws without it (no error), then with it.
  let late = await sample(page, "late");
  expect(late.error).toBe("");
  expect(late.corner[0]).toBeGreaterThan(245);
  await page.evaluate(() => window.pluginEffects.registerLate());
  await expect.poll(async () => (await sample(page, "late")).corner[1], { timeout: 10000 }).toBeLessThan(80);
  expect(errors).toEqual([]);
});
