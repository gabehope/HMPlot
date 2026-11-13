import { test, expect } from "./fixtures.js";

test.use({ deviceScaleFactor: 2 });

// The graticule and reference rules are drawn on the GPU (TODO 141): the spec reads them from the
// vector export, which samples the same lines, and from the canvas's pixels.
test("orthographic graticules follow source angular ticks and rotate with the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 600 });
  await page.goto("/test/stage14-orthographic-guides");
  const guides = page.locator('svg[aria-label="Orthographic geographic guides"]');
  await expect(guides).toHaveCount(1);
  const snapshot = () => page.evaluate(async () => {
    const plot = window.stage14OrthographicGuides.plot;
    await plot.whenSettled();
    const output = await plot.exportSVG({ mode: "vector" });
    const svg = await output.blob.text();
    const root = new DOMParser().parseFromString(svg, "image/svg+xml");
    const paths = [...root.querySelectorAll("path[data-globe-guide]")].map((path) => ({
      axis: path.dataset.globeGuide, value: Number(path.dataset.value), d: path.getAttribute("d"),
      minor: path.dataset.minor === "true", reference: path.dataset.reference === "true",
      stroke: path.getAttribute("stroke"), dash: path.getAttribute("stroke-dasharray"),
    }));
    const collect = (axis, minor = false) => paths.filter((path) => path.axis === axis && !path.reference && path.minor === minor);
    // The reference rules, one entry per rule (a dashed rule is a path per visible run).
    const reference = [...new Map(paths.filter((path) => path.reference)
      .map((path) => [`${path.axis}:${path.value}`, path])).values()];
    // The live canvas: where the dashed red meridian's pixels are.
    const live = document.querySelector(".canvas canvas");
    const image = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = live.clientWidth; canvas.height = live.clientHeight;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let red = 0, redX = 0, blue = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const index = (y * canvas.width + x) * 4, r = pixels[index], g = pixels[index + 1], b = pixels[index + 2];
      if (r > 130 && r > g * 1.6 && r > b * 1.6) { red++; redX += x; }
      if (b > 130 && b > r * 1.6 && b > g * 1.3) blue++;
    }
    return { x: collect("x"), minor: collect("x", true), y: collect("y"), reference, image: /<image\b/.test(svg),
      labels: [...document.querySelectorAll('svg[aria-label="Orthographic geographic guides"] text')].map((text) => text.textContent),
      exportedLabels: svg.includes("Meridian") && svg.includes("Parallel"),
      red, redX: redX / red, blue, error: plot.getRenderError() };
  });
  const first = await snapshot();
  const longestChord = (d) => {
    const commands = [...d.matchAll(/([ML])\s*(-?\d+(?:\.\d+)?(?:e-?\d+)?)[ ,](-?\d+(?:\.\d+)?(?:e-?\d+)?)/g)];
    let previous, longest = 0;
    for (const [, command, x, y] of commands) {
      const point = [Number(x), Number(y)];
      if (command === "L" && previous) longest = Math.max(longest,
        Math.hypot(point[0] - previous[0], point[1] - previous[1]));
      previous = point;
    }
    return longest;
  };
  expect(first.error).toBe("");
  expect(first.image).toBe(false);
  expect(first.x.length).toBeGreaterThan(3);
  expect(first.y.length).toBeGreaterThan(3);
  expect(first.labels.length).toBeGreaterThan(2);
  expect(first.x.every(({ value }) => value % 3 === 0)).toBe(true);
  expect(first.minor.length).toBeGreaterThan(0);
  expect(first.minor.every(({ value }) => value % 1.5 === 0 && value % 3 !== 0)).toBe(true);
  expect(first.y.every(({ value }) => value % 2 === 0)).toBe(true);
  expect(first.reference.map(({ axis, value }) => [axis, value])).toEqual([["x", 3], ["y", 2]]);
  expect(first.reference.map(({ stroke, dash }) => [stroke, !!dash])).toEqual([["#a1423b", true], ["#3b60a1", false]]);
  // A rule replaces its coincident grid line.
  expect(first.x.some(({ value }) => value === 3)).toBe(false);
  expect(first.y.some(({ value }) => value === 2)).toBe(false);
  expect(first.labels).toEqual(expect.arrayContaining(["Meridian", "Parallel"]));
  expect(first.exportedLabels).toBe(true);
  expect(first.labels.every((label) => !label.includes("°"))).toBe(true);
  expect([...first.x, ...first.y].every(({ d }) => d && !/NaN|Infinity/.test(d) && longestChord(d) < 20)).toBe(true);
  // Drawn: the dashed red meridian east of the center, the blue parallel across.
  expect(first.red).toBeGreaterThan(50);
  expect(first.blue).toBeGreaterThan(100);
  await page.evaluate(() => window.stage14OrthographicGuides.plot.setViewport({ center: [6, 2] }));
  await expect.poll(async () => (await snapshot()).reference.map(({ d }) => d).join(""))
    .not.toBe(first.reference.map(({ d }) => d).join(""));
  const second = await snapshot();
  expect(second.error).toBe("");
  expect(second.x.every(({ value }) => value % 3 === 0)).toBe(true);
  expect(second.y.every(({ value }) => value % 2 === 0)).toBe(true);
  expect([...second.x, ...second.y].every(({ d }) => longestChord(d) < 20)).toBe(true);
  expect(second.reference.every(({ d }) => d && !/NaN|Infinity/.test(d) && longestChord(d) < 20)).toBe(true);
  // Turned 90° east (6 of 24 hours), the meridian at 3 hours moved west of where it was.
  expect(second.red).toBeGreaterThan(50);
  expect(second.redX).toBeLessThan(first.redX - 50);
});
