import { test, expect } from "./fixtures.js";
async function open(page, id = "geojson-mixed") {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/examples/" + id);
  await page.waitForFunction(
    () => window.__geo?.mark || window.__geoExample?.mark,
  );
  await expect(page.locator('.canvas[aria-busy="true"]')).toHaveCount(0);
  await page.evaluate(() =>
    (window.__geo ?? window.__geoExample).plot.whenSettled(),
  );
  return errors;
}
async function metrics(page) {
  return page.evaluate(async () => {
    const x = window.__geo ?? window.__geoExample;
    await x.mark.whenSettled();
    const b = await x.plot.exportPNG();
    const image = await createImageBitmap(b);
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    const p = ctx.getImageData(0, 0, image.width, image.height).data;
    let color = 0,
      blue = 0;
    for (let i = 0; i < p.length; i += 4) {
      if (
        Math.max(p[i], p[i + 1], p[i + 2]) -
          Math.min(p[i], p[i + 1], p[i + 2]) >
        30
      )
        color++;
      if (p[i + 2] > p[i] + 25) blue++;
    }
    image.close();
    return { color, blue, width: canvas.width, height: canvas.height };
  });
}
test("GeoJSON picks feature faces and holes, exports and toggles all feature geometry", async ({
  page,
}) => {
  const errors = await open(page);
  const initial = await metrics(page);
  expect(initial.color).toBeGreaterThan(1000);
  // Auto-fit centers the whole asymmetric collection, not the region's (0, 0) hole.
  const positions = await page.evaluate(async () => {
    const { framePoint } = await import("/src/lib/plot/utils/framePlacement.js");
    const mark = window.__geo.mark.getMark(), camera = mark.view.picking.camera.current();
    const rect = mark.renderer.domElement.getBoundingClientRect();
    return [[0, 0, 0], [20, 0, 0]].map((point) => {
      const projected = camera.position.clone().set(...framePoint(mark.options, point)).applyMatrix4(mark.matrixWorld).project(camera);
      return [rect.left + (projected.x + 1) * rect.width / 2, rect.top + (1 - projected.y) * rect.height / 2];
    });
  });
  await page.mouse.click(...positions[0]);
  await page.evaluate(() => window.__geo.plot.whenSettled());
  expect(await page.evaluate(() => window.__geo.hits)).toBe(0);
  await page.mouse.click(...positions[1]);
  await expect(
    page.getByText("Selected: Region", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Toggle A", exact: true }).click();
  await page.evaluate(() => window.__geo.mark.whenSettled());
  const hidden = await metrics(page);
  expect(hidden.blue).toBeLessThan(initial.blue / 2);
  await page.getByRole("button", { name: "Toggle A", exact: true }).click();
  await page.evaluate(() => window.__geo.mark.whenSettled());
  expect((await metrics(page)).blue).toBeGreaterThan(hidden.blue);
  expect(errors).toEqual([]);
});
test("GeoJSON switches globe and projected extrusion while keeping category identity", async ({
  page,
}) => {
  const errors = await open(page);
  await page.locator(".controls select").nth(0).selectOption("3d");
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__geo.mark.whenSettled());
  expect((await metrics(page)).color).toBeGreaterThan(200);
  await page.locator(".controls select").nth(1).selectOption("projected");
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__geo.mark.whenSettled());
  expect((await metrics(page)).color).toBeGreaterThan(100);
  await page.locator('input[aria-label="Height"]').fill("0.4");
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__geo.mark.whenSettled());
  expect(errors).toEqual([]);
});
test("joined country metrics render with missing regions and a colorbar", async ({
  page,
}) => {
  const errors = await open(page, "geojson-joined");
  expect((await metrics(page)).color).toBeGreaterThan(500);
  await expect(
    page.getByText("Illustrative index", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("FeatureCollection filtering and facet geometry remain structured metadata", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/examples/geojson-facets");
  await expect(page.locator(".facet-cell")).toHaveCount(3);
  await page.waitForTimeout(1800);
  expect(await page.locator("canvas").count()).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("GeoJSON metric edits reuse geometry and malformed replacements retain the frame", async ({
  page,
}) => {
  const errors = await open(page);
  await page.evaluate(() => {
    const proto = Object.getPrototypeOf(
      window.__geo.mark.getMark().fields.get("position").data,
    );
    const original = proto.data;
    window.__geoReadbacks = [];
    proto.data = function (...args) {
      if (this.shape.reduce((n, d) => n * d, 1) > 16)
        window.__geoReadbacks.push(this.shape);
      return original.apply(this, args);
    };
    window.__restoreGeoReads = () => (proto.data = original);
  });
  const before = await page.evaluate(() => ({
    diagnostics: window.__geo.mark.getDiagnostics(),
    count: window.__geo.mark.getMark().count,
    buffer: window.__geo.mark.getMark().fields.get("position").buffer.id,
  }));
  for (const v of ["0.15", "0.25", "0.35"]) {
    await page.locator('input[aria-label="Height"]').fill(v);
    await page.evaluate(() => window.__geo.mark.whenSettled());
  }
  const after = await page.evaluate(() => ({
    diagnostics: window.__geo.mark.getDiagnostics(),
    count: window.__geo.mark.getMark().count,
    buffer: window.__geo.mark.getMark().fields.get("position").buffer.id,
  }));
  expect(after).toEqual(before);
  expect(await page.evaluate(() => window.__geoReadbacks)).toEqual([]);
  await page.evaluate(() => window.__restoreGeoReads());
  await page.evaluate(() =>
    window.__geo.replace({
      type: "Feature",
      id: "bad",
      properties: {},
      geometry: { type: "Point", coordinates: [0, 95] },
    }),
  );
  await page.evaluate(() => window.__geo.mark.whenSettled());
  await expect(page.getByRole("alert")).toContainText("latitude");
  expect(await page.evaluate(() => window.__geo.mark.getMark().count)).toBe(
    before.count,
  );
  await page.evaluate(() => window.__geo.restore());
  await page.evaluate(() => window.__geo.mark.whenSettled());
  expect(errors.filter((e) => !e.includes("latitude"))).toEqual([]);
});

test("flat GeoJSON remains interactive inside a surface texture", async ({
  page,
}) => {
  const errors = await open(page);
  await page.getByLabel("Paint on surface").check();
  await page.waitForTimeout(100);
  await page.evaluate(() => window.__geo.plot.whenSettled());
  await page.waitForTimeout(500);
  const box = await page.locator("canvas").first().boundingBox();
  await page.mouse.click(box.x + box.width * 0.53, box.y + box.height * 0.54);
  await expect(
    page.getByText("Selected: Region", { exact: true }),
  ).toBeVisible();
  expect((await metrics(page)).color).toBeGreaterThan(500);
  expect(errors).toEqual([]);
});

test("GeoJSON feature tooltips and hover share joined rows across multipart geometry", async ({ page }) => {
  await page.goto("/test/stage14-geojson?scene=interaction");
  await page.waitForFunction(() => window.stage14GeoJSON?.probe && [...document.querySelectorAll('.canvas')].every(node => node.getAttribute('aria-busy') === 'false'));
  await page.evaluate(() => stage14GeoJSON.plot.whenSettled());
  const box = await page.locator('[aria-label="Plot canvas"]').boundingBox();
  const move = (x, y) => page.mouse.move(box.x + box.width * x, box.y + box.height * y);
  await move(0.25, 0.375);
  const tooltip = page.locator('.plot-tooltip');
  await expect(tooltip).toContainText('Left region');
  await expect(tooltip).toContainText('10');
  await expect.poll(() => page.evaluate(() => Array.from(stage14GeoJSON.plot.getHover().rows(undefined, 'preview')))).toEqual([1]);
  await move(0.25, 0.625);
  await expect(tooltip).toContainText('Left region');
  await expect.poll(async () => page.evaluate(async () => {
    await stage14GeoJSON.plot.whenSettled();
    const bitmap = await createImageBitmap(await stage14GeoJSON.plot.exportPNG());
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0); bitmap.close();
    return ctx.getImageData(Math.floor(canvas.width * 0.75), Math.floor(canvas.height * 0.5), 1, 1).data[0];
  })).toBeGreaterThan(180);
  await move(0.75, 0.5);
  await expect(tooltip).toContainText('Right region');
  await expect(tooltip).toContainText('20');
  await expect.poll(() => page.evaluate(() => Array.from(stage14GeoJSON.plot.getHover().rows(undefined, 'preview')))).toEqual([0]);
  await page.mouse.move(box.x + box.width + 30, box.y);
  await expect(tooltip).toBeHidden();
  await expect.poll(() => page.evaluate(() => stage14GeoJSON.plot.getHover().previewActive)).toBe(false);
});
