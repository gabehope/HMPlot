import { test, expect } from "./fixtures.js";

test.use({ deviceScaleFactor: 2 });

// TODO 136.16: the readout, focus+context and stacked-panels recipes drawn from Python scenes;
// 137.6: the layered-DAG and Sankey recipes (Routes and Flow stay marks, not chart parts).
const open = async (page, fixture) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/test/notebook?fixture=${fixture}`);
  await page.waitForFunction(() => window.notebookReady, null, { timeout: 90000 });
  return errors;
};
const nodes = (page, kind) => page.evaluate((kind) => {
  const found = [];
  const visit = (node) => { if (node.kind === kind) found.push(node.id); (node.children ?? []).forEach(visit); };
  visit(window.notebookState.root);
  return found;
}, kind);
const svgTexts = (page, id) => page.evaluate(async (id) => {
  const plot = window.notebookRuntime.reference(id);
  await plot.whenSettled();
  const svg = await (await plot.exportSVG({ mode: "vector" })).blob.text();
  return [...new DOMParser().parseFromString(svg, "image/svg+xml").querySelectorAll("text")].map((t) => t.textContent.trim());
}, id);

test("a Python Title readout and a keyless Group's Text follow the brush", async ({ page }) => {
  const errors = await open(page, "84_live_readout");
  const [title] = await nodes(page, "Title"), [plot] = await nodes(page, "Plot");
  const shown = () => page.evaluate((id) => window.notebookRuntime.reference(id)?.getTitle?.(), title);
  await expect.poll(shown).toBe("Selected trips: 0 · mean fare —");
  const box = await page.locator('[aria-label="Plot canvas"]').first().boundingBox();
  await page.keyboard.down("Shift");
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.15);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.85, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect.poll(shown).toMatch(/^Selected trips: [1-9][\d,]* · mean fare \$\d+\.\d\d$/);
  await expect.poll(async () => (await svgTexts(page, plot)).some((t) => /^\$[\d,]+$/.test(t))).toBe(true);
  expect(errors).toEqual([]);
});

test("a Python FocusContext and Panels draw their views", async ({ page }) => {
  let errors = await open(page, "85_focus_context");
  const [figure] = await nodes(page, "FocusContext");
  expect(await page.evaluate(async (id) => {
    const handle = window.notebookRuntime.reference(id);
    await handle.whenSettled();
    return [handle.view("main")?.getFrames?.().length, handle.view("context")?.getFrames?.().length];
  }, figure)).toEqual([1, 1]);
  expect(errors).toEqual([]);
  errors = await open(page, "86_stacked_panels");
  const plots = await nodes(page, "Plot");
  expect(plots.length).toBe(2);
  const [upper, lower] = [await svgTexts(page, plots[0]), await svgTexts(page, plots[1])];
  expect(lower).toContain("Trading day");
  expect(upper).not.toContain("Trading day");
  const bounds = await page.evaluate((ids) => ids.map((id) => window.notebookRuntime.reference(id).getFrames()[0].getFrameOptions().get("xbounds")), plots);
  expect(bounds[0]).toEqual(bounds[1]);
  expect(errors).toEqual([]);
});

test("the Python layered-DAG and Sankey recipes draw their graphs", async ({ page }) => {
  let errors = await open(page, "87_layered_dag");
  let [plot] = await nodes(page, "Plot");
  expect(await svgTexts(page, plot)).toEqual(expect.arrayContaining(["Ingest", "Parse", "Validate", "Enrich", "Archive", "Report"]));
  expect(await nodes(page, "Routes")).toHaveLength(1);
  expect(errors).toEqual([]);
  errors = await open(page, "88_sankey");
  [plot] = await nodes(page, "Plot");
  expect(await svgTexts(page, plot)).toEqual(expect.arrayContaining(["Budget", "Staff", "Services", "Salaries", "Hosting"]));
  // The bands and nodes are drawn: a fifth of the PNG is off the white background.
  const inked = await page.evaluate(async (id) => {
    const handle = window.notebookRuntime.reference(id);
    await handle.whenSettled();
    const bitmap = await createImageBitmap(await handle.exportPNG());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let colored = 0;
    for (let i = 0; i < data.length; i += 4)
      if (255 * 3 - data[i] - data[i + 1] - data[i + 2] > 60) colored++;
    return colored / (data.length / 4);
  }, plot);
  expect(inked).toBeGreaterThan(0.2);
  expect(await nodes(page, "Flow")).toHaveLength(1);
  expect(errors).toEqual([]);
});
