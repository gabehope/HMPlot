import { test, expect } from "./fixtures.js";

// SVG geometry, region probes and picks use this fixture's 400×400 CSS-pixel frame.
// Resample only the scratch canvas; the live plot and its PNG export keep native DPR.

test("a placed polar inset maps source points once through its Cartesian parent", async ({ page }) => {
  await page.goto("/test/stage14-polar-inset");
  await page.waitForFunction(() => window.stage14PolarInset?.inset?.getFrameOptions());
  const result = await page.evaluate(async () => {
    const plot = window.stage14PolarInset.plot;
    await plot.whenSettled();
    const image = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = 400; canvas.height = 400;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const svg = new DOMParser().parseFromString(await (await plot.exportSVG({ mode: "vector" })).blob.text(), "image/svg+xml");
    const points = [...svg.querySelectorAll('circle[fill="#2468a0"]')];
    const center = ["cx", "cy"].map(key => points.reduce((sum, p) => sum + Number(p.getAttribute(key)), 0) / points.length);
    const counts = { right: 0, top: 0, left: 0, bottom: 0 };
    let topX = 0, topY = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const offset = (y * canvas.width + x) * 4,
        r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
      if (!(b > 95 && b > r * 1.3 && b > g * 1.15)) continue;
      const dx = x - center[0], dy = y - center[1];
      if (dx > 20 && Math.abs(dy) < 18) counts.right++;
      if (dy < -20 && Math.abs(dx) < 18) { counts.top++; topX += x; topY += y; }
      if (dx < -20 && Math.abs(dy) < 18) counts.left++;
      if (dy > 20 && Math.abs(dx) < 18) counts.bottom++;
    }
    return { counts, top: [topX / counts.top, topY / counts.top],
      error: plot.getRenderError(), size: (await plot.exportPNG()).size };
  });
  expect(result.error).toBe("");
  expect(result.size).toBeGreaterThan(1000);
  for (const count of Object.values(result.counts)) expect(count).toBeGreaterThan(20);
  const canvas = page.locator("canvas").first(), bounds = await canvas.boundingBox();
  await page.mouse.click(bounds.x + result.top[0] * bounds.width / 400,
    bounds.y + result.top[1] * bounds.height / 400);
  await expect.poll(() => page.evaluate(() => window.stage14PolarInset.lastPick?.instanceId)).toBe(1);
  const picked = await page.evaluate(() => window.stage14PolarInset.lastPick.axisValue);
  expect(Math.abs(picked.x - 6)).toBeLessThan(0.15);
  expect(Math.abs(picked.y - 0.7)).toBeLessThan(0.05);
});

test("a placed polar Line exports adaptive paths in the same space as its points", async ({ page }) => {
  await page.goto("/test/stage14-polar-inset");
  await page.waitForFunction(() => window.stage14PolarInset?.inset?.getFrameOptions());
  const vector = await page.evaluate(async () => {
    const plot = window.stage14PolarInset.plot;
    await plot.whenSettled();
    const output = await plot.exportSVG({ mode: "vector" });
    const svg = await output.blob.text();
    const svgDocument = new DOMParser().parseFromString(svg, "image/svg+xml");
    const paths = [...svgDocument.querySelectorAll('path[stroke="#13bd4e"]')].map((path) =>
      [...path.getAttribute("d").matchAll(/[ML]([-\d.eE]+) ([-\d.eE]+)/g)]
        .map((match) => [Number(match[1]), Number(match[2])]));
    const points = [...svgDocument.querySelectorAll('circle[fill="#2468a0"]')].map((point) =>
      [Number(point.getAttribute("cx")), Number(point.getAttribute("cy"))]);
    const bitmap = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = 400; canvas.height = 400;
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const rasterAtMiddle = paths.map((path) => {
      const [x, y] = path[Math.floor(path.length / 2)] ?? [];
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const col = Math.round(x) + dx, row = Math.round(y) + dy;
        if (col < 0 || row < 0 || col >= canvas.width || row >= canvas.height) continue;
        const index = (row * canvas.width + col) * 4,
          r = pixels[index], g = pixels[index + 1], b = pixels[index + 2];
        if (g > 110 && g > r * 1.5 && g > b * 1.2) return true;
      }
      return false;
    });
    const labels = [...svgDocument.querySelectorAll("text")].map((text) => text.textContent);
    return { paths, points, labels, rasterAtMiddle,
      image: !!svgDocument.querySelector("image"), report: output.report };
  });
  expect(vector.image).toBe(false);
  // The Line's two rows join into one polyline (TODO 70.2) through the first three points.
  expect(vector.paths).toHaveLength(1);
  expect(vector.points).toHaveLength(4);
  expect(vector.labels).toContain("Dial");
  expect(vector.report.vectorPrimitives).toBeGreaterThan(4);
  expect(vector.rasterAtMiddle).toEqual([true]);
  const [path] = vector.paths, close = (point, symbol) => Math.hypot(point[0] - symbol[0], point[1] - symbol[1]) < 1;
  expect(path.length).toBeGreaterThan(4);
  expect(close(path[0], vector.points[0])).toBe(true);
  expect(path.slice(1, -1).some((point) => close(point, vector.points[1]))).toBe(true);
  expect(close(path.at(-1), vector.points[2])).toBe(true);
  await expect(page.evaluate(() => window.stage14PolarInset.plot.exportSVG({
    mode: "vector", primitiveBudget: 3,
  }))).rejects.toThrow(/a vector export of .* needs more than [\d,]+ primitives/);
  const fallback = await page.evaluate(async () => {
    const output = await window.stage14PolarInset.plot.exportSVG({ mode: "auto", primitiveBudget: 3 });
    return { svg: await output.blob.text(), warnings: output.report.warnings };
  });
  expect(fallback.svg).toContain("<image");
  expect(fallback.warnings.some((warning) => warning.includes("vector primitive budget"))).toBe(true);
});

test("a placed polar Rect sector preserves its source pick and curved vector boundary", async ({ page }) => {
  await page.goto("/test/stage14-polar-inset");
  await page.waitForFunction(() => window.stage14PolarInset?.inset?.getFrameOptions());
  const result = await page.evaluate(async () => {
    const plot = window.stage14PolarInset.plot;
    await plot.whenSettled();
    const output = await plot.exportSVG({ mode: "vector" });
    const svg = new DOMParser().parseFromString(await output.blob.text(), "image/svg+xml");
    const sector = svg.querySelector('path[fill="#b42ca0"]');
    const points = [...(sector?.getAttribute("d") ?? "").matchAll(/[ML]([-\d.eE]+) ([-\d.eE]+)/g)]
      .map((match) => [Number(match[1]), Number(match[2])]);
    const bitmap = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = 400; canvas.height = 400;
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0, xsum = 0, ysum = 0;
    const bounds = [Infinity, Infinity, -Infinity, -Infinity];
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const offset = (y * canvas.width + x) * 4;
      const [r, g, b] = pixels.subarray(offset, offset + 3);
      if (!(r > 100 && b > 80 && g < 100 && r > g * 1.8 && b > g * 1.5)) continue;
      count++; xsum += x; ysum += y;
      bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y);
      bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], y);
    }
    return { points, count, center: [xsum / count, ysum / count], bounds,
      report: output.report, image: !!svg.querySelector("image"), error: plot.getRenderError() };
  });
  expect(result.error).toBe("");
  expect(result.image).toBe(false);
  expect(result.points.length).toBeGreaterThan(8);
  expect(result.count).toBeGreaterThan(50);
  expect(result.report.vectorPrimitives).toBeGreaterThan(result.points.length);
  const vectorBounds = [Math.min(...result.points.map((point) => point[0])),
    Math.min(...result.points.map((point) => point[1])),
    Math.max(...result.points.map((point) => point[0])),
    Math.max(...result.points.map((point) => point[1]))];
  for (let i = 0; i < 4; i++) expect(Math.abs(vectorBounds[i] - result.bounds[i])).toBeLessThan(7);
  const canvas = page.locator("canvas").first(), bounds = await canvas.boundingBox();
  await page.mouse.click(bounds.x + result.center[0] * bounds.width / 400,
    bounds.y + result.center[1] * bounds.height / 400);
  await expect.poll(() => page.evaluate(() => window.stage14PolarInset.sectorPick?.instanceId)).toBe(0);
  const picked = await page.evaluate(() => window.stage14PolarInset.sectorPick.axisValue);
  expect(picked.x).toBeGreaterThan(15);
  expect(picked.x).toBeLessThan(18);
  expect(picked.y).toBeGreaterThan(0.2);
  expect(picked.y).toBeLessThan(0.5);
  await expect(page.evaluate(() => window.stage14PolarInset.plot.exportSVG({
    mode: "vector", primitiveBudget: 5,
  }))).rejects.toThrow(/a vector export of .* needs more than [\d,]+ primitives/);
});
