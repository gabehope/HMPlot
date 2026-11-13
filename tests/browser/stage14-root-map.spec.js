import { test, expect } from "./fixtures.js";

/** Strict vector and PNG exports of the root-map fixture, compared by color:
 *  each color's pixel count, bounding box, and the separate blobs its points
 *  make along the equator row band. */
async function exports(page, query) {
  await page.goto(`/test/stage14-root-map?${query}`);
  await page.waitForFunction(() => window.stage14RootMap?.plot?.whenSettled);
  await expect.poll(() => page.evaluate(() =>
    [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false")))
    .toBe(true);
  return page.evaluate(async () => {
    const plot = window.stage14RootMap.plot;
    await plot.whenSettled();
    const draw = (source, width = source.width, height = source.height) => {
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d");
      context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source, 0, 0, width, height);
      return { width: canvas.width, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
    };
    const output = await plot.exportSVG({ mode: "vector" }), svg = await output.blob.text();
    const image = new Image();
    image.src = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    await image.decode();
    // Rasterize both at the PNG's resolution so their edge coverage is comparable,
    // then report the measurements in CSS pixels alongside the vector dimensions.
    const bitmap = await createImageBitmap(await plot.exportPNG());
    const vector = draw(image, bitmap.width, bitmap.height), raster = draw(bitmap);
    bitmap.close(); URL.revokeObjectURL(image.src);
    const kind = (r, g, b) => r > 110 && r < 170 && g < 80 && b > 190 ? "purple"
      : r > 200 && g > 130 && g < 190 && b < 60 ? "gold"
      : r > 170 && g < 90 && b < 90 ? "red" : g > 110 && r < 90 && b < 120 ? "green"
      : b > 150 && r < 90 && g > 70 && g < 150 ? "blue" : null;
    const stats = ({ width, data }) => {
      const scale = width / image.width;
      const colors = {};
      for (let i = 0; i < data.length; i += 4) {
        const color = kind(data[i], data[i + 1], data[i + 2]);
        if (!color) continue;
        const x = ((i / 4) % width) / scale, y = Math.floor(i / 4 / width) / scale;
        const entry = colors[color] ??= { count: 0, x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, columns: [] };
        entry.count++;
        entry.x0 = Math.min(entry.x0, x); entry.x1 = Math.max(entry.x1, x);
        entry.y0 = Math.min(entry.y0, y); entry.y1 = Math.max(entry.y1, y);
        entry.columns.push(x);
      }
      // Blue points: count runs of columns separated by a gap.
      const xs = [...new Set(colors.blue?.columns ?? [])].sort((a, b) => a - b);
      colors.blueBlobs = xs.filter((x, k) => k === 0 || x - xs[k - 1] > 3).length;
      for (const entry of Object.values(colors)) if (entry?.columns) {
        entry.count /= scale * scale;
        delete entry.columns;
      }
      return colors;
    };
    return { error: plot.getRenderError(), images: (svg.match(/<image/g) ?? []).length,
      outcomes: output.report.markOutcomes.map((outcome) => outcome.rendering),
      vector: stats(vector), raster: stats(raster) };
  });
}

// Zoomed out to half size, the Arrow and Link are a few pixels across and
// their antialiasing differs more between SVG and GPU rasterization.
for (const [query, blobs, tolerance] of [
  ["projection=equirectangular", 2, 0.2], ["projection=equirectangular&zoom=0.5", 4, 0.3],
  ["projection=mercator", 2, 0.2], ["projection=equal-area&zoom=0.6", 2, 0.2],
]) {
  test(`a root flat map exports every visible wrap as vectors (${query})`, { tag: "@gpu" }, async ({ page }) => {
    const result = await exports(page, query);
    expect(result.error).toBe("");
    // Strict vector mode succeeded: no raster layer, every mark a vector.
    expect(result.images).toBe(0);
    expect(result.outcomes.every((rendering) => rendering === "vector")).toBe(true);
    // Points, the seam-crossing Line, Segment, Arrow and Link, and the
    // GeoJSON outline land where the live render draws them, in every copy.
    for (const color of ["red", "green", "blue", "gold", "purple"]) {
      const v = result.vector[color], r = result.raster[color];
      expect(v, color).toBeTruthy();
      for (const key of ["x0", "x1", "y0", "y1"]) expect(Math.abs(v[key] - r[key]), `${color} ${key}`).toBeLessThanOrEqual(2);
      expect(Math.abs(v.count - r.count) / r.count, `${color} count`).toBeLessThan(tolerance);
    }
    expect(result.vector.blueBlobs).toBe(blobs);
    expect(result.raster.blueBlobs).toBe(blobs);
  });
}

// TODO 39.5-39.6: joint projections. Pixel runs by color from a PNG export of the plot.
async function colorBoxes(page) {
  return page.evaluate(async () => {
    const plot = window.stage14RootMap.plot;
    await plot.whenSettled();
    const bitmap = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    const bounds = document.querySelector("section.plot").getBoundingClientRect();
    canvas.width = bounds.width; canvas.height = bounds.height;
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    const { data, width } = context.getImageData(0, 0, canvas.width, canvas.height);
    const kind = (r, g, b) => r > 170 && g < 90 && b < 90 ? "red" : g > 110 && r < 90 && b < 120 ? "green"
      : b > 150 && r < 90 && g < 150 ? "blue" : null;
    const boxes = {};
    for (let i = 0; i < data.length; i += 4) {
      const color = kind(data[i], data[i + 1], data[i + 2]);
      if (!color) continue;
      const x = (i / 4) % width, y = Math.floor(i / 4 / width);
      const box = boxes[color] ??= { count: 0, x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, xs: [] };
      box.count++; box.xs.push(x);
      box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x); box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y);
    }
    return { width: canvas.width, height: canvas.height, boxes };
  });
}
const settled = async (page) => {
  await page.waitForFunction(() => window.stage14RootMap?.plot?.whenSettled &&
    [...document.querySelectorAll(".canvas")].length > 0 &&
    [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"));
};

test("an equal-earth map draws its outline, cuts Lines and a polygon at the seam, and a click inverts it", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Centered at 30°: the seam is at 210° (-150°), and the fixture's crossing marks follow it.
  await page.goto("/test/stage14-root-map?scene=world&projection=equal-earth&center=30");
  await settled(page);
  await page.waitForSelector("path.map-outline");
  // The outline (its seam meridians and pole lines) and a graticule every 15°: no edge axes.
  const guides = await page.evaluate(() => {
    const outline = document.querySelector("path.map-outline"), box = outline.getBBox(),
      svg = outline.ownerSVGElement.getBoundingClientRect();
    return { d: outline.getAttribute("d"), graticule: document.querySelectorAll("path.map-graticule").length,
      box: { x: box.x + svg.left, y: box.y + svg.top, width: box.width, height: box.height },
      canvas: document.querySelector("canvas").getBoundingClientRect().toJSON(),
      axes: document.querySelectorAll('[aria-label="2D coordinate axes"]').length };
  });
  expect(guides.d).toMatch(/^M.*Z$/);
  expect(guides.graticule).toBe(34);
  expect(guides.axes).toBe(0);
  // The outline spans Equal Earth's bounds, 2.7066 by 1.3174 radii.
  expect(guides.box.width / guides.box.height).toBeCloseTo(2.7066 / 1.3174, 1);
  // Lines from 180° to 240° and a polygon from 202° to 218° cross the seam at 210°: a piece at
  // each edge and nothing between (the red Line has a vertex exactly on the seam).
  const { boxes } = await colorBoxes(page);
  const left = guides.box.x - guides.canvas.x, right = left + guides.box.width;
  for (const color of ["red", "green", "blue"]) {
    const xs = boxes[color].xs;
    expect(xs.some((x) => x < left + 0.2 * (right - left)), color).toBe(true);
    expect(xs.some((x) => x > left + 0.8 * (right - left)), color).toBe(true);
    expect(xs.filter((x) => x > left + 0.3 * (right - left) && x < left + 0.7 * (right - left)), color).toEqual([]);
  }
  // A click on the map at (20°, 5°) reports that longitude and latitude (Equal Earth's inverse,
  // around the center).
  const target = await page.evaluate(async ({ box }) => {
    const { jointForward } = await import("/src/lib/plot/utils/mapProjections.js");
    const [x, y] = jointForward("equal-earth", (20 - 30) * Math.PI / 180, 5 * Math.PI / 180);
    return { x: box.x + (x / 2.7066299836960748 + 1) / 2 * box.width, y: box.y + (1 - y / 1.3173627591574133) / 2 * box.height };
  }, guides);
  await page.mouse.click(target.x, target.y);
  await expect.poll(() => page.evaluate(() => window.stage14RootMap.picked?.geographic)).toBeTruthy();
  const picked = await page.evaluate(() => window.stage14RootMap.picked);
  expect(picked.geographic[0]).toBeCloseTo(20, 0);
  expect(picked.geographic[1]).toBeCloseTo(5, 0);
  expect(errors).toEqual([]);
});

test("an albers-usa map draws Alaska and Hawaii in their insets", async ({ page }) => {
  await page.goto("/test/stage14-root-map?scene=insets");
  await settled(page);
  const { width, height, boxes } = await colorBoxes(page);
  const center = (box) => [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
  const [alaska, hawaii, kansas] = ["red", "green", "blue"].map((color) => {
    expect(boxes[color]?.count, color).toBeGreaterThan(20);
    return center(boxes[color]);
  });
  // d3.geoAlbersUsa's layout: Kansas near the middle, the insets below it at the left,
  // Alaska left of Hawaii.
  expect(Math.abs(kansas[0] - width / 2)).toBeLessThan(0.15 * width);
  expect(alaska[0]).toBeLessThan(hawaii[0]);
  expect(hawaii[0]).toBeLessThan(kansas[0]);
  expect(alaska[1]).toBeGreaterThan(kansas[1] + 0.2 * height);
  expect(hawaii[1]).toBeGreaterThan(kansas[1] + 0.2 * height);
});
