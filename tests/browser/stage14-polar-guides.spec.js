import { test, expect } from "./fixtures.js";

test("polar reference rules follow angular and radial coordinates", async ({ page }) => {
  await page.goto("/test/stage14-polar-guides");
  const axes = page.locator('svg[aria-label="Polar coordinate axes"]');
  await expect(axes).toHaveCount(1);
  const snapshot = () => page.evaluate(async () => {
    const plot = window.stage14PolarGuides.plot;
    await plot.whenSettled();
    const root = document.querySelector('svg[aria-label="Polar coordinate axes"]');
    const line = root.querySelector('line.polar-reference[data-axis="x"]');
    const circle = root.querySelector('ellipse.polar-reference[data-axis="y"]');
    return {
      line: { value: Number(line.dataset.value), x1: Number(line.getAttribute("x1")),
        y1: Number(line.getAttribute("y1")), x2: Number(line.getAttribute("x2")),
        y2: Number(line.getAttribute("y2")), color: line.getAttribute("stroke"),
        dash: line.getAttribute("stroke-dasharray") },
      circle: { value: Number(circle.dataset.value), rx: Number(circle.getAttribute("rx")),
        ry: Number(circle.getAttribute("ry")), color: circle.getAttribute("stroke") },
      ordinaryLines: root.querySelectorAll("line.guide:not(.polar-reference)").length,
      ordinaryCircles: root.querySelectorAll("ellipse:not(.polar-reference)").length,
      labels: [...root.querySelectorAll("text")].map((node) => node.textContent),
      error: plot.getRenderError(),
    };
  });
  const first = await snapshot();
  expect(first.error).toBe("");
  expect(first.line.value).toBe(6);
  expect(first.circle.value).toBe(2);
  expect(first.line.color).toBe("#a1423b");
  expect(first.line.dash).toBe("5 3");
  expect(first.circle.color).toBe("#3b60a1");
  expect(first.labels).toEqual(expect.arrayContaining(["Quarter", "Orbit"]));
  expect(first.ordinaryLines).toBe(3);
  expect(first.ordinaryCircles).toBe(2);
  expect(Math.abs(first.line.x2 - first.line.x1)).toBeLessThan(1);
  expect(first.line.y2).toBeLessThan(first.line.y1 - 50);
  expect(first.circle.rx).toBeGreaterThan(50);
  expect(first.circle.ry).toBeGreaterThan(50);

  await page.evaluate(() => window.stage14PolarGuides.setPeriod(48));
  await expect.poll(async () => (await snapshot()).line.x2).toBeGreaterThan(first.line.x2 + 40);
  const second = await snapshot();
  expect(second.error).toBe("");
  // The ring keeps its radius; the disk may give a pixel to the moved angle labels' margins.
  expect(Math.abs(second.circle.rx - first.circle.rx)).toBeLessThan(2);
  const svg = await page.evaluate(async () => {
    const output = await window.stage14PolarGuides.plot.exportSVG({ mode: "vector" });
    return output.blob.text();
  });
  expect(svg).toContain("Quarter");
  expect(svg).toContain("Orbit");
  expect(svg).toContain("polar-reference");
  expect(svg).not.toMatch(/<image\b/);
});
