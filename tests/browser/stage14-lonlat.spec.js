import { test, expect } from "./fixtures.js";

// Rect, Area bands and ErrorBars in their own spherical frame are longitude and
// latitude pieces: edges along meridians and parallels, cut at the horizon.
async function open(page, scene, center = null) {
  await page.goto(`/test/stage14-lonlat?scene=${scene}`);
  await page.waitForFunction(() => window.stage14LonLat?.plot?.whenSettled);
  if (center) await page.evaluate((value) => window.stage14LonLat.setCenter(value), center);
  await expect.poll(() => page.evaluate(() =>
    [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false")))
    .toBe(true);
}

/** Colored pixels of the PNG and of the rasterized strict-vector SVG, and the red polylines. */
function capture(page) {
  return page.evaluate(async () => {
    const plot = window.stage14LonLat.plot;
    await plot.whenSettled();
    const read = (source, width, height) => {
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d");
      context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      const colors = { green: [], blue: [], violet: [], black: [], red: [] };
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], at = [(i / 4) % width, Math.floor(i / 4 / width)];
        if (g > 110 && g > r * 1.5 && g > b * 1.2) colors.green.push(at);
        else if (b > 120 && b > r * 1.8 && b > g * 1.2) colors.blue.push(at);
        // The translucent violet band is tinted; gray antialiased strokes are not violet.
        else if (b > r + 5 && r > g + 5 && r > 200 && g < 235 && g > 190) colors.violet.push(at);
        else if (r < 60 && g < 60 && b < 60) colors.black.push(at);
        else if (r > 150 && g < 100 && b < 100) colors.red.push(at);
      }
      return colors;
    };
    const output = await plot.exportSVG({ mode: "vector" }), svg = await output.blob.text();
    const image = new Image();
    image.src = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    await image.decode();
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const red = [...doc.querySelectorAll('path[stroke="#d43735"]')].flatMap((path) =>
      [...path.getAttribute("d").matchAll(/[ML]([-\d.eE]+) ([-\d.eE]+)/g)].map((m) => [+m[1], +m[2]]));
    // The geometry and tolerances below are in the SVG's CSS-pixel frame.
    const bitmap = await createImageBitmap(await plot.exportPNG());
    const result = { error: plot.getRenderError(), images: (svg.match(/<image/g) ?? []).length,
      raster: read(bitmap, image.width, image.height), vector: read(image, image.width, image.height), red };
    bitmap.close();
    URL.revokeObjectURL(image.src);
    return result;
  });
}

const box = (pixels) => ({ x0: Math.min(...pixels.map(([x]) => x)), x1: Math.max(...pixels.map(([x]) => x)),
  y0: Math.min(...pixels.map(([, y]) => y)), y1: Math.max(...pixels.map(([, y]) => y)) });

/** `tips`: colors whose shape ends in a needle-thin tip at the limb, where
 *  antialiasing drops sub-pixel slivers; their boxes are not compared. */
function expectParity(result, colors, slack = 3, tips = []) {
  expect(result.images).toBe(0);
  for (const color of colors) {
    const r = result.raster[color], v = result.vector[color];
    expect(r.length, color).toBeGreaterThan(20);
    expect(Math.abs(v.length - r.length) / r.length, `${color} count`).toBeLessThan(0.2);
    const a = box(r), b = box(v);
    if (tips.includes(color)) continue;
    for (const key of ["x0", "x1", "y0", "y1"]) expect(Math.abs(a[key] - b[key]), `${color} ${key}`).toBeLessThanOrEqual(slack);
  }
}

test("a lon/lat box on a root globe follows meridians and parallels", { tag: "@gpu" }, async ({ page }) => {
  await open(page, "globe");
  const result = await capture(page);
  expect(result.error).toBe("");
  // The red Line runs along latitude 10 from longitude -40 to 20: the box's top
  // edge. Its height on screen gives the globe's radius about (200, 200).
  const lineY = result.red.reduce((sum, [, y]) => sum + y, 0) / result.red.length, R = (200 - lineY) / Math.sin(10 * Math.PI / 180);
  expect(R).toBeGreaterThan(90);
  const green = box(result.raster.green);
  // Seen from (0, 0), parallels are horizontal: the top edge is the Line, the
  // bottom edge latitude -30.
  expect(Math.abs(green.y0 - lineY)).toBeLessThan(2.5);
  expect(Math.abs(green.y1 + 1 - (200 + R * Math.sin(30 * Math.PI / 180)))).toBeLessThan(2.5);
  // Meridians bend: the west edge (-40) is widest at the equator.
  const rows = (y) => result.raster.green.filter(([, py]) => py === Math.round(y)).map(([x]) => x);
  const westAt = (lat) => 200 + R * Math.cos(lat * Math.PI / 180) * Math.sin(-40 * Math.PI / 180);
  for (const lat of [0, -20]) expect(Math.abs(Math.min(...rows(200 - R * Math.sin(lat * Math.PI / 180))) - westAt(lat))).toBeLessThan(2.5);
  // The band along latitudes 35..45 and the error bar along latitude -60 draw.
  expect(result.raster.violet.length).toBeGreaterThan(100);
  expect(result.raster.black.length).toBeGreaterThan(20);
  expectParity(result, ["green", "blue", "violet", "black"]);
});

test("a lon/lat box across the limb fills exactly to the horizon on a turned globe", { tag: "@gpu" }, async ({ page }) => {
  await open(page, "globe", [40, 30]);
  const result = await capture(page);
  expect(result.error).toBe("");
  // The blue box (60..130, -50..-20) reaches the limb; the vector outline closes
  // along the limb and the GPU fill discards the back by its facing, so they
  // agree, up to antialiasing of the box's needle-thin tip at the limb.
  expectParity(result, ["green", "blue", "violet"], 3, ["blue"]);
  const blue = box(result.raster.blue);
  expect(blue.x1).toBeGreaterThan(280);
});

test("a lon/lat box on a root Mercator map is an axis-aligned rectangle", async ({ page }) => {
  await open(page, "map");
  const result = await capture(page);
  expect(result.error).toBe("");
  const green = box(result.raster.green), width = green.x1 - green.x0 + 1, height = green.y1 - green.y0 + 1;
  // Filled: a rectangle's area.
  expect(result.raster.green.length / (width * height)).toBeGreaterThan(0.97);
  // Mercator: 60 degrees of longitude against latitudes -30..10.
  const mercator = (lat) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  const expected = (60 * Math.PI / 180) / (mercator(10) - mercator(-30));
  expect(Math.abs(width / height - expected) / expected).toBeLessThan(0.04);
  // The box across the antimeridian is one piece that the map repeats: it shows
  // at both edges of the world, 20 degrees on each side, never across the middle.
  const blue = result.raster.blue.map(([x]) => x), pxPerDegree = width / 60;
  const east = blue.filter((x) => x > 200), west = blue.filter((x) => x < 200);
  expect(east.length).toBeGreaterThan(20);
  expect(west.length).toBeGreaterThan(20);
  expect(Math.abs(Math.max(...east) - Math.min(...east) + 1 - 20 * pxPerDegree)).toBeLessThan(3);
  expect(Math.abs(Math.max(...west) - Math.min(...west) + 1 - 20 * pxPerDegree)).toBeLessThan(3);
  expectParity(result, ["green", "blue"]);
});

test("a globe child holds a lon/lat box under its Line", async ({ page }) => {
  await open(page, "child");
  const result = await capture(page);
  expect(result.error).toBe("");
  expect(result.raster.green.length).toBeGreaterThan(500);
  const lineY = result.red.reduce((sum, [, y]) => sum + y, 0) / result.red.length;
  expect(Math.abs(box(result.raster.green).y0 - lineY)).toBeLessThan(2.5);
  expectParity(result, ["green"]);
});
