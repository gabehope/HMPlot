import { test, expect } from "./fixtures.js";

test.use({ deviceScaleFactor: 2 });
for (const [kind, patch] of [["Normalize", { method: "extent" }], ["Window", { size: 1 }]])
test(`${kind}: a transform template draws its caller's rows and preserves updates and status`, async ({ page }) => {
  await page.goto(`/test/stats-templates?kind=${kind}`);
  await page.waitForFunction(() => window.statsTemplates?.handles.template);
  const shapes = async () => {
    await expect(page.locator('.canvas[aria-busy="true"]')).toHaveCount(0);
    return page.evaluate(async () => {
      const fixture = window.statsTemplates, out = {};
      for (const [name, plot] of Object.entries(fixture.plots)) {
        await plot.whenSettled();
        const svg = await (await plot.exportSVG({ mode: "vector" })).blob.text();
        const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
        out[name] = [...doc.querySelectorAll("circle,path,polygon,polyline")].map(node => node.outerHTML);
      }
      return out;
    });
  };
  const initial = await shapes();
  expect(initial.template.length).toBeGreaterThanOrEqual(3);
  expect(initial.template).toEqual(initial.legacy);
  if (kind === "Normalize") {
    await page.getByLabel("Method", { exact: true }).selectOption("extent");
    const controlled = await shapes();
    expect(controlled.template).toEqual(controlled.legacy);
    expect(controlled.template).not.toEqual(initial.template);
    await page.getByLabel("Method", { exact: true }).selectOption("deviation");
    expect((await shapes()).template).toEqual(initial.template);
  }
  const status = await page.evaluate(async patch => {
    const statuses = [];
    const stop = window.statsTemplates.handles.template.subscribe(value => statuses.push(value));
    await Promise.all(Object.values(window.statsTemplates.handles).map(handle => handle.update(patch)));
    stop(); return statuses.at(-1);
  }, patch);
  expect(status).toMatchObject({ kind, pending: false, mounted: true, error: "" });
  const changed = await shapes();
  expect(changed.template).toEqual(changed.legacy);
  expect(changed.template).not.toEqual(initial.template);
  const rejected = await page.evaluate(async kind => {
    try { await window.statsTemplates.handles.template.update(kind === "Normalize" ? { method: "invalid" } : { size: 0 }); }
    catch (error) { return error.message; }
  }, kind);
  expect(rejected).toBeTruthy();
  expect((await shapes()).template).toEqual(changed.template);
  await page.evaluate(() => window.statsTemplates.data({ x: [2, 4, 6] }));
  const updated = await shapes();
  expect(updated.template).toEqual(updated.legacy);
  expect(updated.template).not.toEqual(changed.template);
});
