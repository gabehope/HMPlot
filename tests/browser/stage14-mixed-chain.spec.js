import { test, expect } from "./fixtures.js";

test("polar fit and Cartesian ranges compose through a spherical ancestor", async ({ page }) => {
  await page.goto("/test/stage14-mixed-chain");
  await page.waitForFunction(() => window.stage14MixedChain?.disk?.getFrameOptions());
  const result = await page.evaluate(async () => {
    const plot = window.stage14MixedChain.plot;
    await plot.whenSettled();
    const image = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0); image.close();
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const groups = Object.fromEntries(["green", "teal", "red", "orange"].map(key =>
      [key, { x: 0, y: 0, count: 0 }]));
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4,
        r = data[i], g = data[i + 1], b = data[i + 2];
      // Tone-mapped interior colors, excluding blended overlap/antialias pixels that
      // otherwise classify a red/green edge as orange at the other marker's position.
      const targets = { green: [0, 153, 70], teal: [0, 154, 169],
        red: [223, 50, 49], orange: [226, 164, 52] };
      const key = Object.keys(targets).find(key => targets[key].every((v, i) =>
        Math.abs([r, g, b][i] - v) < 25));
      if (key) { groups[key].x += x; groups[key].y += y; groups[key].count++; }
    }
    for (const group of Object.values(groups)) {
      group.x /= group.count;
      group.y /= group.count;
    }
    const svg = await (await plot.exportSVG({ mode: "vector" })).blob.text();
    return { groups, svg, error: plot.getRenderError(), width: canvas.width };
  });
  expect(result.error).toBe("");
  expect(result.svg).not.toContain("<image");
  for (const fill of ["#168b47", "#178c9b", "#d43735", "#e69024"])
    expect(result.svg).toContain(fill);
  const { green, teal, red, orange } = result.groups;
  for (const group of Object.values(result.groups)) expect(group.count).toBeGreaterThan(10);
  // The composed points land within 1.5% of the plot's width of their spherical twins (the
  // smaller marker hides part of the larger one, which moves its centroid).
  const near = 0.015 * result.width;
  expect(Math.hypot(green.x - red.x, green.y - red.y), JSON.stringify(result)).toBeLessThan(near);
  expect(Math.hypot(teal.x - orange.x, teal.y - orange.y)).toBeLessThan(near);
  expect(Math.hypot(red.x - orange.x, red.y - orange.y)).toBeGreaterThan(60);
});
