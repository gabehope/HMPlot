import { test, expect } from "./fixtures.js";

test.use({ deviceScaleFactor: 2 });

// TODO 144: the chained-pipeline recipes (src/recipes/fluent), whose chains are built outside any
// block and sent with the scene that draws them, draw and respond as the nested recipes do.
const open = async (page, fixture) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/test/notebook?fixture=${fixture}`);
  await page.waitForFunction(() => window.notebookReady, null, { timeout: 90000 });
  return errors;
};
const plots = (page) => page.evaluate(() => {
  const found = [];
  const visit = (node) => { if (node.kind === "Plot") found.push(node.id); (node.children ?? []).forEach(visit); };
  visit(window.notebookState.root);
  return found;
});
/** The plot's vector export: its circles' radii and its texts, in drawing order. */
const shapes = (page, id) => page.evaluate(async (id) => {
  const plot = window.notebookRuntime.reference(id);
  await plot.whenSettled();
  const svg = await (await plot.exportSVG({ mode: "vector" })).blob.text();
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  return {
    circles: [...doc.querySelectorAll("circle")].map((c) => Math.round(Number(c.getAttribute("r")) * 10) / 10),
    texts: [...doc.querySelectorAll("text")].map((t) => t.textContent.trim()).filter(Boolean),
  };
}, id);
/** A digest of the plot's PNG: it changes when what it draws changes. */
const digest = (page, id) => page.evaluate(async (id) => {
  const plot = window.notebookRuntime.reference(id);
  await plot.whenSettled();
  const bytes = await (await plot.exportPNG()).arrayBuffer();
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}, id);
const brush = async (page, index, from, to) => {
  const box = await page.locator('[aria-label="Plot canvas"]').nth(index).boundingBox();
  await page.keyboard.down("Shift");
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
};

test("a chained Join of a brushed group_by resizes the routes", async ({ page }) => {
  const errors = await open(page, "91_fluent_live_route_statistics");
  const [, routes] = await plots(page);
  const before = await shapes(page, routes);
  expect(before.circles).toHaveLength(5);
  await brush(page, 0, [0.15, 0.15], [0.45, 0.75]);
  await expect.poll(async () => JSON.stringify((await shapes(page, routes)).circles)).not.toBe(JSON.stringify(before.circles));
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a chained filter of the brushed rows feeds another plot", async ({ page }) => {
  const errors = await open(page, "89_fluent_linked_brushing");
  const [, histogram] = await plots(page);
  const before = await digest(page, histogram);
  await brush(page, 0, [0.4, 0.3], [0.6, 0.6]);
  await expect.poll(() => digest(page, histogram)).not.toBe(before);
  expect(errors).toEqual([]);
});

test("a click on a chained group_by's bar drills the other chain down", async ({ page }) => {
  const errors = await open(page, "90_fluent_click_drilldown");
  const [regions, products] = await plots(page);
  const before = await digest(page, products);
  // North's bar is the left one, from the axis up.
  const box = await page.locator('[aria-label="Plot canvas"]').first().boundingBox();
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.7);
  await expect.poll(() => digest(page, products)).not.toBe(before);
  expect(regions).toBeTruthy();
  expect(errors).toEqual([]);
});

test("a chained group_by() total and a readout title follow the brush", async ({ page }) => {
  const errors = await open(page, "92_fluent_live_readout");
  const [plot] = await plots(page);
  await brush(page, 0, [0.1, 0.1], [0.5, 0.9]);
  await expect.poll(async () => (await shapes(page, plot)).texts.some((t) => /^\$[\d,]+$/.test(t))).toBe(true);
  const title = await page.evaluate(() => {
    let id;
    const visit = (node) => { if (node.kind === "Title") id = node.id; (node.children ?? []).forEach(visit); };
    visit(window.notebookState.root);
    return window.notebookRuntime.reference(id)?.getTitle?.();
  });
  expect(title).toMatch(/^Selected trips: [1-9][\d,]* · mean fare \$\d+\.\d\d$/);
  expect(errors).toEqual([]);
});
