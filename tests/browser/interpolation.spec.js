import { test, expect } from "./fixtures.js";
test("GPU interpolation matches known values and gradients", async ({
  page,
}) => {
  await page.goto("/test/playground");
  await expect(
    page.getByRole("button", { name: "Generate data" }),
  ).toBeEnabled();
  const { bilinear, cubicCorner, error } = await page.evaluate(async () => {
    const { checkInterpolation } =
      await import("/tests/browser/gpu-fixtures.js");
    return checkInterpolation();
  });
  expect(error).toBeNull();
  expect(bilinear[0]).toBeCloseTo(0.25, 4);
  expect(bilinear[1]).toBeCloseTo(2 / 3, 4);
  expect(bilinear[2]).toBeCloseTo(4 / 3, 4);
  expect(bilinear[3]).toBe(1);
  expect(cubicCorner[0]).toBeCloseTo(0, 4);
  expect(cubicCorner.every(Number.isFinite)).toBe(true);
});


test("Slice preserves topology within brackets and redraws interpolated values across endpoints", async ({ page }) => {
  await page.goto("/test/slice-topology");
  const snapshot = async (at) => {
    await page.waitForFunction(at => {
      const fixture = window.sliceTopology;
      return fixture?.slice?.slice?.at === at && fixture?.grid?.parent === fixture.slice;
    }, at);
    await expect(page.locator('.canvas[aria-busy="true"]')).toHaveCount(0);
    return page.evaluate(async () => {
      const fixture = window.sliceTopology;
      await Promise.all(fixture.plots.map(plot => plot.whenSettled()));
      const circles = [];
      for (const plot of fixture.plots) {
        const svg = await (await plot.exportSVG({ mode: "vector" })).blob.text();
        const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
        circles.push([...doc.querySelectorAll("circle")].map(node => Number(node.getAttribute("cy"))));
      }
      return { topology: fixture.slice.topology, circles,
        values: Array.from(await fixture.grid.get("value").ref.data()),
        errors: fixture.plots.map(plot => plot.getRenderError()) };
    });
  };
  let previous = await snapshot(0.25);
  expect(previous.circles.map(points => points.length)).toEqual([2, 3]);
  for (const at of [0.75, 1, 1.25, 1.75]) {
    await page.evaluate(at => window.sliceTopology.update(at), at);
    const current = await snapshot(at);
    if (at === 0.75 || at === 1.75) expect(current.topology).toBe(previous.topology);
    else expect(current.topology).not.toBe(previous.topology);
    const offset = 10 * Math.min(at, 2 - at);
    current.values.forEach((value, i) => expect(value).toBeCloseTo(offset + 5 * i, 4));
    expect(current.circles.map(points => points.length)).toEqual([2, 3]);
    for (let plot = 0; plot < 2; plot++)
      for (let point = 0; point < current.circles[plot].length; point++)
        expect(Math.abs(current.circles[plot][point] - previous.circles[plot][point])).toBeGreaterThan(1);
    expect(current.errors.every(error => !error)).toBe(true);
    previous = current;
  }
});
