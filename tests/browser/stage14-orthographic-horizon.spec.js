import { test, expect } from "./fixtures.js";

test("an orthographic Line ends at the geographic horizon", async ({ page }) => {
  await page.goto("/test/stage14-orthographic-horizon");
  await page.locator("canvas").waitFor();
  const result = await page.evaluate(async () => {
    const plot = window.stage14OrthographicHorizon.plot;
    await plot.whenSettled();
    const image = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    const bounds = document.querySelector("section.plot").getBoundingClientRect();
    canvas.width = bounds.width; canvas.height = bounds.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let near = 0, rim = 0, beyond = 0, leftArc = 0, rightArc = 0, hiddenBridge = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const offset = (y * canvas.width + x) * 4;
      const [r, g, b, a] = pixels.subarray(offset, offset + 4);
      if (a >= 128 && b > 100 && b > r * 1.5 && b > g * 1.3) {
        if (x > 105 && x < 155) leftArc++;
        if (x > 245 && x < 295) rightArc++;
        if (x > 170 && x < 230) hiddenBridge++;
      }
      if (a < 128 || r < 125 || r < g * 1.5 || r < b * 1.5) continue;
      if (x > canvas.width * 0.5 && x < canvas.width * 0.65) near++;
      if (x > canvas.width * 0.7 && x < canvas.width * 0.76) rim++;
      if (x > canvas.width * 0.78) beyond++;
    }
    return { near, rim, beyond, leftArc, rightArc, hiddenBridge,
      error: plot.getRenderError() };
  });
  expect(result.error).toBe("");
  expect(result.near).toBeGreaterThan(70);
  expect(result.rim).toBeGreaterThan(20);
  expect(result.beyond).toBeLessThan(10);
  expect(result.leftArc).toBeGreaterThan(25);
  expect(result.rightArc).toBeGreaterThan(25);
  expect(result.hiddenBridge).toBeLessThan(10);
  const vector = await page.evaluate(async () => {
    const output = await window.stage14OrthographicHorizon.plot.exportSVG({ mode: "vector" });
    const svg = new DOMParser().parseFromString(await output.blob.text(), "image/svg+xml");
    const path = (color) => svg.querySelector(`path[stroke="${color}"]`)?.getAttribute("d") ?? "";
    return { red: path("#e35836"), blue: path("#2b63da"),
      image: !!svg.querySelector("image"), count: output.report.vectorPrimitives };
  });
  expect(vector.image).toBe(false);
  expect(vector.count).toBeGreaterThan(100);
  const red = [...vector.red.matchAll(/[ML]([-\d.eE]+) ([-\d.eE]+)/g)]
    .map((match) => [Number(match[1]), Number(match[2])]);
  expect(red.length).toBeGreaterThan(20);
  expect(red[0][0]).toBeCloseTo(200, 0);
  expect(red.at(-1)[0]).toBeGreaterThan(290);
  expect(red.at(-1)[0]).toBeLessThan(310);
  const blue = vector.blue.split(/(?=M)/).filter(Boolean);
  expect(blue).toHaveLength(2);
  for (const arc of blue) {
    const xs = [...arc.matchAll(/[ML]([-\d.eE]+) ([-\d.eE]+)/g)].map((match) => Number(match[1]));
    expect(xs.length).toBeGreaterThan(20);
    expect(Math.max(...xs) < 175 || Math.min(...xs) > 225).toBe(true);
  }
  await expect(page.evaluate(() => window.stage14OrthographicHorizon.plot.exportSVG({
    mode: "vector", primitiveBudget: 5,
  }))).rejects.toThrow(/a vector export of .* needs more than [\d,]+ primitives/);
  const budgeted = await page.evaluate(async () => {
    const output = await window.stage14OrthographicHorizon.plot.exportSVG({ mode: "auto", primitiveBudget: 5 });
    return { svg: await output.blob.text(), warnings: output.report.warnings };
  });
  expect(budgeted.svg).toContain("<image");
  expect(budgeted.warnings.some((warning) => warning.includes("vector primitive budget"))).toBe(true);
  await page.evaluate(() => window.stage14OrthographicHorizon.plot.setViewport({ center: [30, 0] }));
  const rotated = await page.evaluate(async () => {
    const plot = window.stage14OrthographicHorizon.plot;
    await plot.whenSettled();
    const output = await plot.exportSVG({ mode: "vector" });
    const svg = new DOMParser().parseFromString(await output.blob.text(), "image/svg+xml");
    return svg.querySelector('path[stroke="#e35836"]')?.getAttribute("d") ?? "";
  });
  expect(rotated).not.toBe(vector.red);
  const rotatedFirst = rotated.match(/M([-\d.eE]+) ([-\d.eE]+)/);
  expect(Number(rotatedFirst?.[1])).toBeGreaterThan(145);
  expect(Number(rotatedFirst?.[1])).toBeLessThan(155);
});

test("a Line whose horizon lies on a refinement vertex ends flat at the limb", async ({ page }) => {
  // Bisecting toward that limb could step just past it and emit a sliver;
  // joined to it, the visible piece drew a round cap past the limb.
  await page.goto("/test/stage14-orthographic-horizon?scene=dyadic");
  await page.waitForFunction(() => window.stage14OrthographicHorizon?.plot?.whenSettled);
  const rightmost = await page.evaluate(async () => {
    const plot = window.stage14OrthographicHorizon.plot;
    await plot.whenSettled();
    const image = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    const bounds = document.querySelector("section.plot").getBoundingClientRect();
    canvas.width = bounds.width; canvas.height = bounds.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
    const { data, width } = context.getImageData(0, 0, canvas.width, canvas.height);
    let max = -1;
    for (let i = 0; i < data.length; i += 4)
      if (data[i + 2] > 150 && data[i] < 150) max = Math.max(max, (i / 4) % width);
    return max;
  });
  // The 400 px globe has radius 100 about (200, 200); latitude 30's limb is at 200 + 100 cos 30.
  expect(rightmost).toBeGreaterThan(280);
  expect(rightmost).toBeLessThanOrEqual(200 + 100 * Math.cos(Math.PI / 6) + 0.5);
});

