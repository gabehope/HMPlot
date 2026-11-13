import { test, expect } from "./fixtures.js";
import { pixelReader } from "./png.js";

test.use({ deviceScaleFactor: 2 });

test("Python root Facet shares hover expressions across indexed cells", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/test/notebook?fixture=facet-hover");
  await page.waitForFunction(() => window.notebookReady);
  await expect(page.locator(".facet-cell")).toHaveCount(2);
  await expect(page.locator('.canvas[aria-busy="false"]')).toHaveCount(2);
  await page.evaluate(() => Promise.all([...window.notebookRuntime.handles.values()]
    .filter(({ handle }) => handle?.getHover && handle?.whenSettled)
    .map(({ handle }) => handle.whenSettled())));

  const canvas = page.locator(".facet-cell").last().locator("canvas").first();
  const box = await canvas.boundingBox();
  // Root Facet handles can expose another cell's axis layout. Pick the blue point actually
  // drawn in this cell, including its own margins, instead of borrowing a sibling's fractions.
  const png = await canvas.screenshot(), pixel = pixelReader(png);
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  let xTotal = 0, yTotal = 0, count = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [r, g, b] = pixel(x, y);
    if (b > r + 60 && b > g + 20) { xTotal += x; yTotal += y; count++; }
  }
  expect(count).toBeGreaterThan(0);
  const point = { x: xTotal / count / width, y: yTotal / count / height };
  await page.mouse.move(box.x + box.width * point.x, box.y + box.height * point.y);
  await expect.poll(() => page.evaluate(() => {
    const plot = [...window.notebookRuntime.handles.values()].find(
      ({ handle }) => handle?.getHover,
    );
    return plot.handle.getHover().status().previewCount;
  })).toBe(1);
  const positionVersions = () => page.evaluate(() => [...window.notebookRuntime.handles.values()]
    .map(e => e.handle?.getMark?.()).filter(m => m?.fields?.has("size"))
    .map(m => m.fields.get("position").version));
  const initialPositions = await positionVersions();
  const sizes = () => page.evaluate(async () => {
    const marks = [...window.notebookRuntime.handles.values()]
      .map(({handle}) => handle?.getMark?.()).filter(mark => mark?.fields?.has("size"));
    return Promise.all(marks.map(async mark => {
      const array = mark.fields.get("size").data;
      return array ? (await array.ref.jsAsync()).flat(Infinity) : [];
    }));
  });
  await expect.poll(sizes).toContainEqual([9, 9, 9, 6, 6, 6]);
  for (let i = 0; i < 12; i++) {
    await page.mouse.move(box.x + box.width * point.x + i % 2, box.y + box.height * point.y);
    await page.waitForTimeout(80);
    await expect.poll(sizes).toContainEqual([9, 9, 9, 6, 6, 6]);
  }
  // The fixture's Points ask for the fade (respond="hovered"): hover alone fades nothing
  // since Stage 62.
  await expect.poll(() => page.evaluate(async () => {
    const marks = [...window.notebookRuntime.handles.values()].map(({handle}) => handle?.getMark?.()).filter(m => m?.fields?.has("size"));
    return Promise.all(marks.map(async m => {
      const a = m.fields.get("interactionOpacity")?.data;
      return a ? (await a.ref.jsAsync()).flat(Infinity) : [];
    }));
  })).toContainEqual([0.25, 0.25]);
  for (let i = 0; i < 4; i++) {
    await page.mouse.move(1, 1);
    await expect.poll(sizes).toEqual([[6, 6, 6, 6, 6, 6], [6, 6, 6, 6, 6, 6]]);
    await page.mouse.move(box.x + box.width * point.x, box.y + box.height * point.y);
    await expect.poll(sizes).toContainEqual([9, 9, 9, 6, 6, 6]);
  }
  await page.mouse.move(1, 1);
  await expect.poll(sizes).toEqual([[6, 6, 6, 6, 6, 6], [6, 6, 6, 6, 6, 6]]);
  expect(await positionVersions()).toEqual(initialPositions);
  expect(errors).toEqual([]);
});

test("scrolling away and back retains recently visible facet renderers", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/test/notebook?fixture=facet-hover");
  await page.waitForFunction(() => window.notebookReady);
  await expect(page.locator(".facet-cell canvas")).toHaveCount(2);
  await page.evaluate(() => {
    window.savedFacetCanvases = [...document.querySelectorAll(".facet-cell canvas")];
    const spacer = document.createElement("div");
    spacer.style.height = "3000px";
    document.body.append(spacer);
    window.scrollTo(0, 1800);
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
  await page.waitForTimeout(300); // Allow IntersectionObserver to deliver the offscreen transition.
  expect(await page.evaluate(() => window.savedFacetCanvases.every(c => c.isConnected))).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator(".facet-cell canvas").first()).toBeInViewport();
  expect(await page.evaluate(() => [...document.querySelectorAll(".facet-cell canvas")]
    .every((c, i) => c === window.savedFacetCanvases[i]))).toBe(true);
  expect(errors).toEqual([]);
});
