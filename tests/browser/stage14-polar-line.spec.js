import { test, expect } from "./fixtures.js";

test("polar Line follows the angular path and a live period", async ({ page }) => {
  await page.goto("/test/stage14-polar-line");
  await page.waitForFunction(() => window.stage14PolarLine?.plot?.whenSettled);
  await page.locator("canvas").waitFor();
  const sample = () => page.evaluate(async () => {
    const plot = window.stage14PolarLine.plot;
    await plot.whenSettled();
    const image = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0); image.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let upper = 0, lower = 0, left = 0, right = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const offset = (y * canvas.width + x) * 4;
      const [r, g, b, a] = pixels.subarray(offset, offset + 4);
      if (a < 128 || g < 110 || g < r * 1.5 || g < b * 1.2) continue;
      if (y < canvas.height / 2 - 20) upper++;
      if (y > canvas.height / 2 + 20) lower++;
      if (x < canvas.width / 2 - 20) left++;
      if (x > canvas.width / 2 + 20) right++;
    }
    return { upper, lower, left, right, error: plot.getRenderError() };
  });
  await expect.poll(async () => (await sample()).upper).toBeGreaterThan(150);
  const before = await sample();
  expect(before.left).toBeGreaterThan(80);
  expect(before.right).toBeGreaterThan(80);
  expect(before.lower).toBeLessThan(10);
  expect(before.error).toBe("");
  const vector = await page.evaluate(async () => {
    const output = await window.stage14PolarLine.plot.exportSVG({ mode: "vector" });
    const svg = await output.blob.text(), document = new DOMParser().parseFromString(svg, "image/svg+xml");
    const points = [...document.querySelectorAll("path")].flatMap((path) =>
      [...(path.getAttribute("d") ?? "").matchAll(/[ML]([-\d.eE]+) ([-\d.eE]+)/g)]
        .map((match) => [Number(match[1]), Number(match[2])]));
    return { svg, report: output.report, points };
  });
  // Its rows join into one polyline (TODO 70.2).
  expect((vector.svg.match(/<path\b/g) ?? []).length).toBeGreaterThanOrEqual(1);
  expect(vector.svg).not.toContain("<image");
  expect(vector.report.vectorPrimitives).toBeGreaterThan(2);
  expect(Math.min(...vector.points.map((point) => point[0]))).toBeLessThan(150);
  expect(Math.max(...vector.points.map((point) => point[0]))).toBeGreaterThan(250);
  expect(Math.min(...vector.points.map((point) => point[1]))).toBeLessThan(150);
  await expect(page.evaluate(() => window.stage14PolarLine.plot.exportSVG({
    mode: "vector", primitiveBudget: 2,
  }))).rejects.toThrow(/a vector export of .* needs more than [\d,]+ primitives/);
  const budgeted = await page.evaluate(async () => {
    const output = await window.stage14PolarLine.plot.exportSVG({ mode: "auto", primitiveBudget: 2 });
    return { svg: await output.blob.text(), report: output.report };
  });
  expect(budgeted.svg).toContain("<image");
  expect(budgeted.report.warnings.some((warning) => warning.includes("vector primitive budget"))).toBe(true);
  await page.evaluate(() => window.stage14PolarLine.setPeriod(48));
  await expect.poll(async () => (await sample()).left).toBeLessThan(10);
  const after = await sample();
  expect(after.upper).toBeGreaterThan(150);
  expect(after.right).toBeGreaterThan(80);
  expect(after.error).toBe("");
});
