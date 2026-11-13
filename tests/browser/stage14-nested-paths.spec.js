import { test, expect } from "./fixtures.js";
import { installGpuCounters, countMarkBuilds, gpuCounters, countersDelta } from "./gpu-counters.js";

// Every plot is 400×400 CSS pixels without margins (axes2d off or promoted
// roots). Sample its native DPR export in that logical frame to compare with SVG.
async function open(page, scene) {
  await page.goto(`/test/stage14-nested-paths?scene=${scene}`);
  await page.waitForFunction(() => window.stage14NestedPaths?.plot?.whenSettled);
  await page.locator("canvas").first().waitFor();
}

/** Colored PNG pixels and the SVG polylines of each stroke color. `mode`
 *  "auto" lets raster-only content (a GeoJSON fill) join the export. */
function capture(page, mode = "vector") {
  return page.evaluate(async (mode) => {
    const plot = window.stage14NestedPaths.plot;
    await plot.whenSettled();
    const image = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = 400; canvas.height = 400;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height); image.close();
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const green = [], blue = [], violet = [], red = [];
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2];
      if (data[i + 3] < 128) continue;
      if (g > 110 && g > r * 1.5 && g > b * 1.2) green.push([x, y]);
      else if (b > 120 && b > r * 1.8 && b > g * 1.2) blue.push([x, y]);
      else if (b > 150 && r > 90 && r < 180 && g < 90) violet.push([x, y]);
      else if (r > 150 && g < 100 && b < 100) red.push([x, y]);
    }
    const output = await plot.exportSVG({ mode });
    const svg = await output.blob.text(), doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const strokes = {}, fills = {};
    for (const path of doc.querySelectorAll("path")) {
      const stroke = path.getAttribute("stroke"), fill = path.getAttribute("fill");
      const parts = (path.getAttribute("d") ?? "").split("M").filter(Boolean).map((part) =>
        [...("M" + part).matchAll(/[ML]([-\d.eE]+) ([-\d.eE]+)/g)].map((m) => [+m[1], +m[2]]));
      if (stroke && stroke !== "none") (strokes[stroke] ??= []).push(...parts);
      else if (fill && fill !== "none") (fills[fill] ??= []).push(...parts);
    }
    return { size: [canvas.width, canvas.height], green, blue, violet, red, strokes, fills,
      image: svg.includes("<image"), primitives: output.report.vectorPrimitives,
      warnings: output.report.warnings,
      error: plot.getRenderError() };
  }, mode);
}

/** The circle through three points: its center and radius. */
function circle([ax, ay], [bx, by], [cx, cy]) {
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by)),
    ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d,
    uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  return { center: [ux, uy], radius: Math.hypot(ax - ux, ay - uy) };
}

const near = (pixels, [x, y], radius = 4) =>
  pixels.some(([px, py]) => Math.abs(px - x) <= radius && Math.abs(py - y) <= radius);

/** Every exported vertex lies on the rendered stroke (vector/raster parity). */
function expectParity(pixels, polylines) {
  const points = polylines.flat();
  expect(points.length).toBeGreaterThan(1);
  const missing = points.filter((point) => !near(pixels, point));
  expect(missing, JSON.stringify(missing.slice(0, 4))).toEqual([]);
}

test("a ranged polar Line and error bar bend through their log/log parent", async ({ page }) => {
  await open(page, "polar-log");
  const result = await capture(page);
  expect(result.error).toBe("");
  expect(result.image).toBe(false);
  const line = result.strokes["#13bd4e"];
  expectParity(result.green, line);
  // Hand-computed: the child disk is centered at (50, 50) with radius 40 in
  // parent data; the parent maps log10 [1, 100] across 400 pixels.
  const data = ([x, y]) => [10 ** (x / 200), 10 ** ((400 - y) / 200)];
  // The rows join into one polyline (TODO 70.2): the quarter arc at radius 1 (rows 0 and 1) up
  // to angle 6, then the spoke (row 2).
  expect(line.length).toBe(1);
  const corner = line[0].findIndex(([x]) => Math.abs(x - 200 * Math.log10(50)) < 0.1),
    arc = line[0].slice(0, corner + 1), spoke = line[0].slice(corner);
  for (const point of arc) {
    const [x, y] = data(point);
    expect(Math.abs(Math.hypot(x - 50, y - 50) - 40), JSON.stringify(point)).toBeLessThan(0.6);
  }
  expect(arc.length).toBeGreaterThan(5);
  // The spoke at angle 6 is vertical and ends at radius 0.2 (Y = 58).
  for (const [x] of spoke) expect(Math.abs(x - 200 * Math.log10(50))).toBeLessThan(0.1);
  expect(Math.abs(data(spoke.at(-1))[1] - 58)).toBeLessThan(0.2);
  // The rendered arc passes through its 45-degree point, off the chord.
  const diagonal = 200 * Math.log10(50 + 40 * Math.SQRT1_2);
  expect(near(result.green, [diagonal, 400 - diagonal], 3)).toBe(true);
  // The angular error bar (radius 0.5, angles 9..15 of 24) stays on its
  // circle through both levels, with a cap at each end.
  const [bar, ...caps] = result.strokes["#8a2be2"];
  expect(caps.length).toBe(2);
  expect(bar.length).toBeGreaterThan(4);
  for (const point of bar) {
    const [x, y] = data(point);
    expect(Math.abs(Math.hypot(x - 50, y - 50) - 20), JSON.stringify(point)).toBeLessThan(0.3);
  }
  expectParity(result.violet, result.strokes["#8a2be2"]);
});

test("an orthographic child Line ends at its horizon without bridging the back", async ({ page }) => {
  await open(page, "orthographic-child");
  const result = await capture(page);
  expect(result.error).toBe("");
  expect(result.image).toBe(false);
  // The disk is x in [-0.8, 0.8] of a [-1, 1] root: 40 to 360 pixels.
  const points = result.strokes["#13bd4e"].flat();
  expect(Math.min(...points.map((p) => p[0]))).toBeCloseTo(40, 0);
  expect(Math.max(...points.map((p) => p[0]))).toBeCloseTo(360, 0);
  for (const [, y] of points) expect(Math.abs(y - 200)).toBeLessThan(0.01);
  expectParity(result.green, result.strokes["#13bd4e"]);
  const columns = result.green.map(([x]) => x);
  expect(Math.min(...columns)).toBeGreaterThan(34);
  expect(Math.max(...columns)).toBeLessThan(366);
  // Rotating the child's center moves the visible arc but never its extent.
  await page.evaluate(() => window.stage14NestedPaths.setCenter([45, 0]));
  await expect.poll(async () => {
    const moved = await capture(page);
    return moved.strokes["#13bd4e"]?.flat().length ?? 0;
  }).toBeGreaterThan(4);
  const moved = await capture(page);
  expect(moved.error).toBe("");
  const x = moved.strokes["#13bd4e"].flat().map((p) => p[0]);
  expect(Math.min(...x)).toBeGreaterThan(39);
  expect(Math.max(...x)).toBeLessThan(361);
  expectParity(moved.green, moved.strokes["#13bd4e"]);
});

test("an embedded map splits a Line at its periodic seam", async ({ page }) => {
  await open(page, "embedded-map");
  const result = await capture(page);
  expect(result.error).toBe("");
  expect(result.image).toBe(false);
  // The 360 x 180 placement spans the map at one pixel per degree: x = 200 + λ.
  const pixel = (longitude) => 200 + longitude;
  const crossing = result.strokes["#1a5fd0"];
  expect(crossing.length).toBe(2);
  const [right, left] = [...crossing].sort((a, b) => b[0][0] - a[0][0]);
  expect(Math.min(...right.map((p) => p[0]))).toBeCloseTo(pixel(120), 0);
  expect(Math.max(...right.map((p) => p[0]))).toBeCloseTo(pixel(180), 0);
  expect(Math.min(...left.map((p) => p[0]))).toBeCloseTo(pixel(-180), 0);
  expect(Math.max(...left.map((p) => p[0]))).toBeCloseTo(pixel(-120), 0);
  expectParity(result.blue, crossing);
  // Nothing of the seam-crossing Line bridges the map's middle.
  expect(result.blue.filter(([x]) => x > pixel(-110) && x < pixel(110))).toEqual([]);
  // Angular interpolation from 150 to -150 runs the long way through zero.
  const green = result.strokes["#13bd4e"];
  expect(green.length).toBe(1);
  expect(near(result.green, [200, 200 - 20])).toBe(true);
});

test("a Cartesian chart Line curves through its polar parent and picks its source row", async ({ page }) => {
  await open(page, "chart-in-polar");
  const result = await capture(page);
  expect(result.error).toBe("");
  expect(result.image).toBe(false);
  // Child y = 0.5 is parent radius 1.5 of [0, 3]: a 100-pixel half circle.
  const line = result.strokes["#13bd4e"];
  for (const [x, y] of line.flat())
    expect(Math.abs(Math.hypot(x - 200, y - 200) - 100), `${x},${y}`).toBeLessThan(0.05);
  expect(line.flat().length).toBeGreaterThan(8);
  expectParity(result.green, line);
  expect(near(result.green, [200, 100])).toBe(true);
  expect(result.green.filter(([, y]) => y > 204)).toEqual([]);
  const canvas = await page.locator("canvas").first().boundingBox();
  await page.mouse.click(canvas.x + 200 + 100 * Math.cos(Math.PI / 4),
    canvas.y + 200 - 100 * Math.sin(Math.PI / 4));
  await expect.poll(() => page.evaluate(() => window.stage14NestedPaths.lastPick?.instanceId)).toBe(0);
  const { axisValue } = await page.evaluate(() => window.stage14NestedPaths.lastPick);
  // A quarter of the way along the child's x domain, on its y = 0.5 line.
  expect(Math.abs(axisValue.x - 0.25)).toBeLessThan(0.03);
  expect(Math.abs(axisValue.y - 0.5)).toBeLessThan(0.03);
});

test("a polar ring on a rotating globe keeps its warm pipelines", async ({ page }) => {
  await page.addInitScript(installGpuCounters);
  await open(page, "polar-on-globe");
  const first = await capture(page);
  expect(first.error).toBe("");
  expect(first.image).toBe(false);
  expectParity(first.green, first.strokes["#13bd4e"]);
  await page.evaluate(() => window.stage14NestedPaths.setCenter([20, 0]));
  await capture(page);
  await page.waitForTimeout(150);
  await countMarkBuilds(page);
  const before = await gpuCounters(page);
  await page.evaluate(() => window.stage14NestedPaths.setCenter([40, 0]));
  const moved = await capture(page);
  await page.waitForTimeout(150);
  const work = await countersDelta(page, before, await gpuCounters(page));
  expect(moved.error).toBe("");
  // Longitude 60 rotates from R sin 60 to R sin 20 east of the disk center,
  // while longitude -60 passes behind the horizon and is cut there.
  const ring = first.strokes["#13bd4e"].flat(), xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
  const radius = (Math.max(...xs) - Math.min(...xs)) / 2 / Math.sin(Math.PI / 3),
    center = [(Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2];
  const turned = moved.strokes["#13bd4e"];
  expect(Math.abs(Math.max(...turned.flat().map((p) => p[0])) -
    (center[0] + radius * Math.sin(Math.PI / 9)))).toBeLessThan(1);
  // The two cut ends are the leftmost vertices, on the disk's horizon circle.
  const ends = turned.flatMap((part) => [part[0], part.at(-1)])
    .sort((a, b) => a[0] - b[0]).slice(0, 2);
  for (const end of ends)
    expect(Math.abs(Math.hypot(end[0] - center[0], end[1] - center[1]) - radius),
      JSON.stringify(end)).toBeLessThan(1);
  expect(Math.abs(ends[0][1] - ends[1][1])).toBeGreaterThan(40);
  expectParity(moved.green, moved.strokes["#13bd4e"]);
  const newVariants = await page.evaluate((start) => {
    const keys = window.__gpuCounters.state.renderKeys, existing = new Set(keys.slice(0, start));
    return keys.slice(start).filter((key) => !existing.has(key)).length;
  }, before.renderKeys);
  expect(newVariants, JSON.stringify(work)).toBe(0);
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.builds, JSON.stringify(work)).toBe(0);
});

test("Segments, Arrows3D and curved Segments cut at a nested horizon, with heads only at true ends", async ({ page }) => {
  await open(page, "path-family");
  const result = await capture(page);
  expect(result.error).toBe("");
  // The disk spans 40 to 360 pixels (radius 160) around (200, 200).
  const disk = ([longitude, latitude]) => {
    const lon = longitude * Math.PI / 180, lat = latitude * Math.PI / 180;
    return [200 + 160 * Math.cos(lat) * Math.sin(lon), 200 - 160 * Math.sin(lat)];
  };
  const inside = (pixels) => pixels.every(([x, y]) => Math.hypot(x - 200, y - 200) < 164);
  for (const color of ["green", "blue", "violet", "red"]) {
    expect(result[color].length, color).toBeGreaterThan(40);
    expect(inside(result[color]), color).toBe(true);
  }
  // The blue arrow heads west from -60 to the horizon at -90: a bare shaft.
  const blue = result.blue.map(([x]) => x);
  expect(Math.min(...blue)).toBeGreaterThan(36);
  expect(Math.max(...blue)).toBeLessThan(disk([-60, 0])[0] + 5);
  expect(result.blue.length).toBeLessThan(6 * (disk([-60, 0])[0] - 40) + 80);
  // The violet arrow's visible end keeps its head: a wide patch at the tip.
  const tip = disk([-45, -15]);
  const head = result.violet.filter(([x, y]) => Math.hypot(x - tip[0], y - tip[1]) < 18);
  expect(head.length).toBeGreaterThan(90);
  // The cubic Link's source midpoint (0, -62.5) is on its rendered curve.
  expect(near(result.red, disk([0, -62.5]), 4)).toBe(true);
  // Every path exports as vectors: the Segment along its visible great
  // circle, both arrow shafts, the cubic Link, and a solid head only on the
  // violet arrow, whose tip is its true end. An Arrows3D is a filled outline in
  // world units (TODO 64.4): its shaft's pieces as quads, then its head.
  expect(result.image).toBe(false);
  expectParity(result.green, result.strokes["#13bd4e"]);
  expectParity(result.blue, result.fills["#1a5fd0"]);
  expectParity(result.violet, result.fills["#8a2be2"]);
  expectParity(result.red, result.strokes["#d43735"]);
  expect(result.fills["#1a5fd0"].every((part) => part.length === 4)).toBe(true);
  const triangles = result.fills["#8a2be2"].filter((part) => part.length === 3);
  expect(triangles.length).toBe(1);
  expect(triangles[0].some(([x, y]) => Math.hypot(x - tip[0], y - tip[1]) < 0.5)).toBe(true);
  // The shaft stops at the head's base, 4.5 world units (18 pixels) before the tip: the
  // nearest quad's end edge.
  const ends = result.fills["#8a2be2"].filter((part) => part.length === 4)
    .map((quad) => [(quad[1][0] + quad[2][0]) / 2, (quad[1][1] + quad[2][1]) / 2]);
  const shaftEnd = Math.min(...ends.map(([x, y]) => Math.hypot(x - tip[0], y - tip[1])));
  expect(Math.abs(shaftEnd - 18)).toBeLessThan(0.5);
});

test("an angular Area band's cross-section follows its polar arc", async ({ page }) => {
  await open(page, "band-angular");
  const result = await capture(page);
  expect(result.error).toBe("");
  expect(result.image).toBe(false);
  // Radius 2 is 200 pixels; the band spans radius 1 to 2 over a quarter turn.
  const at = (radius, degrees) => [200 + 100 * radius * Math.cos(degrees * Math.PI / 180),
    200 - 100 * radius * Math.sin(degrees * Math.PI / 180)];
  // Inside the true band but outside the old straight cross-section's quad,
  // and the reverse (the old chord quad reached radius 0.707 at 45 degrees).
  for (const [radius, degrees] of [[1.8, 45], [1.95, 30], [1.05, 45], [1.5, 80]])
    expect(near(result.green, at(radius, degrees), 1), `${radius} ${degrees}`).toBe(true);
  for (const [radius, degrees] of [[0.85, 45], [0.95, 20], [2.05, 45]])
    expect(near(result.green, at(radius, degrees), 1), `${radius} ${degrees}`).toBe(false);
  const outline = result.fills["#13bd4e"];
  expect(outline.length).toBe(1);
  for (const [x, y] of outline[0]) {
    const radius = Math.hypot(x - 200, y - 200) / 100;
    const spoke = Math.abs(y - 200) < 0.01 || Math.abs(x - 200) < 0.01;
    expect(spoke || Math.abs(radius - 1) < 0.005 || Math.abs(radius - 2) < 0.005, `${x},${y}`).toBe(true);
  }
  expect(outline[0].length).toBeGreaterThan(12);
  expectParity(result.green, outline);
});

test("an Area band in a polar child bends through log/log parents in both directions", async ({ page }) => {
  await open(page, "band-nested");
  const result = await capture(page);
  expect(result.error).toBe("");
  expect(result.image).toBe(false);
  const data = ([x, y]) => [10 ** (x / 200), 10 ** ((400 - y) / 200)];
  const pixel = ([x, y]) => [200 * Math.log10(x), 400 - 200 * Math.log10(y)];
  const outline = result.fills["#13bd4e"][0];
  for (const point of outline) {
    const [x, y] = data(point), radius = Math.hypot(x - 50, y - 50);
    const spoke = Math.abs(y - 50) < 0.05 || Math.abs(x - 50) < 0.05;
    expect(spoke || Math.abs(radius - 20) < 0.3 || Math.abs(radius - 40) < 0.3, JSON.stringify(point)).toBe(true);
  }
  // The middle of the band at 45 degrees and radius 30 is filled; the chord
  // between its outer corners (radius 28.3 at 45 degrees) is not the edge.
  const diagonal = (radius) => pixel([50 + radius * Math.SQRT1_2, 50 + radius * Math.SQRT1_2]);
  expect(near(result.green, diagonal(30), 1)).toBe(true);
  expect(near(result.green, diagonal(38.5), 1)).toBe(true);
  expect(near(result.green, diagonal(18), 1)).toBe(false);
  expectParity(result.green, [outline]);
});

test("an Area warped onto a globe is cut at both limbs and exports its limb arcs", async ({ page }) => {
  await open(page, "band-on-globe");
  const result = await capture(page);
  expect(result.error).toBe("");
  // The Line along child y = 0.9 (latitude 24) spans the visible hemisphere:
  // it fixes the disk's center and radius in pixels.
  const line = result.strokes["#1a5fd0"].flat(), xs = line.map((p) => p[0]);
  const radius = (Math.max(...xs) - Math.min(...xs)) / 2 / Math.cos(24 * Math.PI / 180),
    center = [(Math.max(...xs) + Math.min(...xs)) / 2, line[0][1] + radius * Math.sin(24 * Math.PI / 180)];
  const outside = result.green.filter(([x, y]) => Math.hypot(x - center[0], y - center[1]) > radius + 2);
  expect(outside, JSON.stringify(outside.slice(0, 4))).toEqual([]);
  // Latitudes -18..18 reach both limbs; the equator's limb points are filled.
  const columns = result.green.map(([x]) => x);
  expect(Math.min(...columns)).toBeLessThan(center[0] - radius + 3);
  expect(Math.max(...columns)).toBeGreaterThan(center[0] + radius - 3);
  expect(near(result.green, center, 1)).toBe(true);
  // Each horizon-cut interval (0..0.5 and 0.5..1) exports one vector
  // outline: its visible edges joined by a limb arc. Every vertex lies on the
  // rendered fill and within the disk; the arcs reach the limb at both sides.
  expect(result.image).toBe(false);
  const outlines = result.fills["#13bd4e"], outline = outlines.flat();
  expect(outlines.length).toBe(2);
  expectParity(result.green, outlines);
  const onLimb = outline.filter(([x, y]) => Math.abs(Math.hypot(x - center[0], y - center[1]) - radius) < 1.5);
  for (const [x, y] of outline) expect(Math.hypot(x - center[0], y - center[1])).toBeLessThan(radius + 1.5);
  expect(onLimb.some(([x]) => x < center[0]) && onLimb.some(([x]) => x > center[0])).toBe(true);
  expect(onLimb.length).toBeGreaterThan(8);
});

test("angular error bars arc in a polar root and cap across the radius", async ({ page }) => {
  await open(page, "errorbars-polar");
  const result = await capture(page);
  expect(result.error).toBe("");
  expect(result.image).toBe(false);
  // Radius 1.5 of [0, 2] is 150 pixels about (200, 200); angle 0 is right and
  // a quarter (6 of 24) is up. The body arcs; each cap is radial.
  const [body, ...caps] = result.strokes["#13bd4e"];
  expect(caps.length).toBe(2);
  expect(body.length).toBeGreaterThan(6);
  for (const point of body)
    expect(Math.abs(Math.hypot(point[0] - 200, point[1] - 200) - 150), JSON.stringify(point)).toBeLessThan(0.5);
  const [right, top] = caps;
  for (const [x] of top) expect(Math.abs(x - 200)).toBeLessThan(0.1);
  expect(top.map(([, y]) => y).sort((a, b) => a - b).map(Math.round)).toEqual([38, 62]);
  for (const [, y] of right) expect(Math.abs(y - 200)).toBeLessThan(0.1);
  expect(right.map(([x]) => x).sort((a, b) => a - b).map(Math.round)).toEqual([338, 362]);
  expectParity(result.green, result.strokes["#13bd4e"]);
  // Rendered: on the 45-degree point of the arc, off its chord, and the cap at
  // a quarter turn reaches radially past the body's width.
  expect(near(result.green, [200 + 150 * Math.SQRT1_2, 200 - 150 * Math.SQRT1_2], 2)).toBe(true);
  expect(near(result.green, [275, 125], 2)).toBe(false);
  expect(near(result.green, [200, 40], 1)).toBe(true);
  expect(near(result.green, [200, 60], 1)).toBe(true);
  // A radial bar stays straight with caps across it.
  const [spoke, ...ends] = result.strokes["#1a5fd0"];
  expect(ends.length).toBe(2);
  const direction = [spoke.at(-1)[0] - spoke[0][0], spoke.at(-1)[1] - spoke[0][1]];
  for (const cap of ends)
    expect(Math.abs((cap[1][0] - cap[0][0]) * direction[0] + (cap[1][1] - cap[0][1]) * direction[1]))
      .toBeLessThan(1e-3);
  expectParity(result.blue, result.strokes["#1a5fd0"]);
});

test("error bars on a rotating globe drop caps at a horizon cut and keep warm pipelines", async ({ page }) => {
  await page.addInitScript(installGpuCounters);
  await open(page, "errorbars-on-globe");
  const result = await capture(page);
  expect(result.error).toBe("");
  expect(result.image).toBe(false);
  // The green bar (latitude 30, longitude -135..135) is cut at both limbs, so
  // it has no caps. Its extent fixes the disk: 2 R cos 30 wide, R / 2 above center.
  const green = result.strokes["#13bd4e"];
  expect(green.length).toBe(1);
  const xs = green[0].map(([x]) => x), y30 = green[0][0][1];
  for (const [, y] of green[0]) expect(Math.abs(y - y30)).toBeLessThan(0.01);
  const radius = (Math.max(...xs) - Math.min(...xs)) / 2 / Math.cos(Math.PI / 6),
    center = [(Math.max(...xs) + Math.min(...xs)) / 2, y30 + radius / 2];
  const off = result.green.filter(([, y]) => Math.abs(y - y30) > 5);
  expect(off, JSON.stringify(off.slice(0, 4))).toEqual([]);
  expectParity(result.green, green);
  // The blue bar runs along longitude 0 from latitude -48 to -12, capped at both ends.
  const [spoke, ...caps] = result.strokes["#1a5fd0"];
  expect(caps.length).toBe(2);
  for (const [x] of spoke) expect(Math.abs(x - center[0])).toBeLessThan(0.5);
  const ys = spoke.map(([, y]) => y - center[1]).sort((a, b) => a - b);
  expect(Math.abs(ys[0] - radius * Math.sin(12 * Math.PI / 180))).toBeLessThan(0.5);
  expect(Math.abs(ys.at(-1) - radius * Math.sin(48 * Math.PI / 180))).toBeLessThan(0.5);
  for (const cap of caps) expect(Math.abs(cap[0][1] - cap[1][1])).toBeLessThan(1e-3);
  expectParity(result.blue, result.strokes["#1a5fd0"]);
  // Turned east, longitude 135 comes into view: that end gets its cap, across
  // the parallel (which stays horizontal at a zero center latitude).
  await page.evaluate(() => window.stage14NestedPaths.setCenter([100, 0]));
  await expect.poll(async () => (await capture(page)).strokes["#13bd4e"]?.length ?? 0).toBe(2);
  const turned = await capture(page);
  const [, cap] = turned.strokes["#13bd4e"];
  const capX = center[0] + radius * Math.cos(Math.PI / 6) * Math.sin(35 * Math.PI / 180);
  for (const [x] of cap) expect(Math.abs(x - capX)).toBeLessThan(0.5);
  expect(cap.map(([, y]) => y - (center[1] - radius / 2)).sort((a, b) => a - b).map(Math.round))
    .toEqual([-12, 12]);
  expectParity(turned.green, turned.strokes["#13bd4e"]);
  // A further turn compiles nothing and rebuilds no mark.
  await page.waitForTimeout(150);
  await countMarkBuilds(page);
  const before = await gpuCounters(page);
  await page.evaluate(() => window.stage14NestedPaths.setCenter([110, 0]));
  await capture(page);
  await page.waitForTimeout(150);
  const work = await countersDelta(page, before, await gpuCounters(page));
  const newVariants = await page.evaluate((start) => {
    const keys = window.__gpuCounters.state.renderKeys, existing = new Set(keys.slice(0, start));
    return keys.slice(start).filter((key) => !existing.has(key)).length;
  }, before.renderKeys);
  expect(newVariants, JSON.stringify(work)).toBe(0);
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.builds, JSON.stringify(work)).toBe(0);
});

test("Rects in a Cartesian chart warp through their polar parent as annular patches", async ({ page }) => {
  await open(page, "rects-in-polar");
  const result = await capture(page);
  expect(result.error).toBe("");
  expect(result.image).toBe(false);
  // The Line along the Rect's lower edge is the radius 1.25 arc (child y 0.25
  // in range [1, 2]) from 45 to 135 degrees (child x 0.25..0.75 of [0, 12] hours).
  const edge = result.strokes["#d43735"].flat();
  const { center, radius } = circle(edge[0], edge[Math.floor(edge.length / 2)], edge.at(-1));
  const scale = radius / 1.25, polar = ([x, y]) => [Math.hypot(x - center[0], y - center[1]) / scale,
    Math.atan2(center[1] - y, x - center[0]) * 180 / Math.PI];
  for (const point of edge) expect(Math.abs(polar(point)[0] - 1.25), JSON.stringify(point)).toBeLessThan(0.005);
  // The patch outline lies on its two arcs and two radial sides, and it
  // contains the Line's refined vertices: one edge, one refinement.
  const [outline] = result.fills["#13bd4e"];
  expect(outline.length).toBeGreaterThan(12);
  for (const point of outline) {
    const [r, angle] = polar(point);
    const onArc = Math.abs(r - 1.25) < 0.005 || Math.abs(r - 1.75) < 0.005,
      onSide = (Math.abs(angle - 45) < 0.2 || Math.abs(angle - 135) < 0.2) && r > 1.24 && r < 1.76;
    expect(onArc || onSide, JSON.stringify([point, r, angle])).toBe(true);
  }
  for (const point of edge)
    expect(outline.some((q) => Math.hypot(q[0] - point[0], q[1] - point[1]) < 1e-4), JSON.stringify(point)).toBe(true);
  expectParity(result.green, [outline]);
  // Rendered: the top of the annulus is filled; the chord quad's band below it is not.
  const at = (r, angle) => [center[0] + r * scale * Math.cos(angle * Math.PI / 180),
    center[1] - r * scale * Math.sin(angle * Math.PI / 180)];
  expect(near(result.green, at(1.5, 90), 1)).toBe(true);
  expect(near(result.green, at(1.05, 90), 1)).toBe(false);
  // The turned Rect (90 degrees about its center) spans child x 0..0.2 and
  // y 0.45..0.55: angles 0..36 and radii 1.45..1.55.
  const [turned] = result.fills["#1a5fd0"];
  for (const point of turned) {
    const [r, angle] = polar(point);
    expect(r, JSON.stringify(point)).toBeGreaterThan(1.445);
    expect(r, JSON.stringify(point)).toBeLessThan(1.555);
    expect(angle).toBeGreaterThan(-0.2);
    expect(angle).toBeLessThan(36.2);
  }
  expect(Math.max(...turned.map((point) => polar(point)[1]))).toBeGreaterThan(35.8);
  expectParity(result.blue, [turned]);
  // A click inside the patch picks its source row.
  const canvas = await page.locator("canvas").first().boundingBox(), inside = at(1.5, 70);
  await page.mouse.click(canvas.x + inside[0], canvas.y + inside[1]);
  await expect.poll(() => page.evaluate(() => window.stage14NestedPaths.lastPick?.instanceId)).toBe(0);
});

test("a polar sector bends through its log/log parents and matches a Line along its edge", async ({ page }) => {
  await open(page, "sectors-in-log");
  const result = await capture(page);
  expect(result.error).toBe("");
  expect(result.image).toBe(false);
  // Hand-computed: the child disk is centered at (50, 50) with radius 40 in
  // parent data; the sector spans angles 0..90 and radii 0.5..1 (20..40).
  const data = ([x, y]) => [10 ** (x / 200), 10 ** ((400 - y) / 200)];
  const [outline] = result.fills["#13bd4e"];
  expect(outline.length).toBeGreaterThan(10);
  for (const point of outline) {
    const [x, y] = data(point), r = Math.hypot(x - 50, y - 50);
    const onArc = Math.abs(r - 20) < 0.3 || Math.abs(r - 40) < 0.3,
      onSide = (Math.abs(x - 50) < 0.1 || Math.abs(y - 50) < 0.1) && r > 19.7 && r < 40.3;
    expect(onArc || onSide, JSON.stringify([point, x, y])).toBe(true);
  }
  const edge = result.strokes["#d43735"].flat();
  for (const point of edge)
    expect(outline.some((q) => Math.hypot(q[0] - point[0], q[1] - point[1]) < 1e-4), JSON.stringify(point)).toBe(true);
  expectParity(result.green, [outline]);
  // The middle of the outer arc is filled, off the chord between its corners.
  const middle = [50 + 40 * Math.SQRT1_2 - 1, 50 + 40 * Math.SQRT1_2 - 1].map((v) => 200 * Math.log10(v));
  expect(near(result.green, [middle[0], 400 - middle[1]], 1)).toBe(true);
});

test("a Rect on a rotating globe is cut at both limbs, exports its limb arcs and keeps warm pipelines", async ({ page }) => {
  await page.addInitScript(installGpuCounters);
  await open(page, "rects-on-globe");
  const result = await capture(page);
  expect(result.error).toBe("");
  // The Line along child y = 0.9 (latitude 24) fixes the disk, as for bands.
  const line = result.strokes["#1a5fd0"].flat(), xs = line.map((p) => p[0]);
  const radius = (Math.max(...xs) - Math.min(...xs)) / 2 / Math.cos(24 * Math.PI / 180),
    center = [(Math.max(...xs) + Math.min(...xs)) / 2, line[0][1] + radius * Math.sin(24 * Math.PI / 180)];
  const outside = result.green.filter(([x, y]) => Math.hypot(x - center[0], y - center[1]) > radius + 2);
  expect(outside, JSON.stringify(outside.slice(0, 4))).toEqual([]);
  // Latitudes -6..6 (child y 0.3..0.7) reach both limbs.
  const columns = result.green.map(([x]) => x);
  expect(Math.min(...columns)).toBeLessThan(center[0] - radius + 3);
  expect(Math.max(...columns)).toBeGreaterThan(center[0] + radius - 3);
  expect(near(result.green, center, 1)).toBe(true);
  // The cut Rect exports as one vector outline closed along both limbs.
  expect(result.image).toBe(false);
  const [outline] = result.fills["#13bd4e"];
  expectParity(result.green, [outline]);
  const onLimb = outline.filter(([x, y]) => Math.abs(Math.hypot(x - center[0], y - center[1]) - radius) < 1.5);
  expect(onLimb.some(([x]) => x < center[0]) && onLimb.some(([x]) => x > center[0])).toBe(true);
  // Turning the globe compiles nothing and rebuilds no mark once warm.
  await page.evaluate(() => window.stage14NestedPaths.setCenter([20, 0]));
  await capture(page);
  await page.waitForTimeout(150);
  await countMarkBuilds(page);
  const before = await gpuCounters(page);
  await page.evaluate(() => window.stage14NestedPaths.setCenter([40, 0]));
  const moved = await capture(page);
  await page.waitForTimeout(150);
  const work = await countersDelta(page, before, await gpuCounters(page));
  expect(moved.error).toBe("");
  const newVariants = await page.evaluate((start) => {
    const keys = window.__gpuCounters.state.renderKeys, existing = new Set(keys.slice(0, start));
    return keys.slice(start).filter((key) => !existing.has(key)).length;
  }, before.renderKeys);
  expect(newVariants, JSON.stringify(work)).toBe(0);
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.builds, JSON.stringify(work)).toBe(0);
});

test("a turned Rect under log/log parents curves its edges with the Line between its corners", async ({ page }) => {
  await open(page, "turned-rect-log");
  const result = await capture(page);
  expect(result.error).toBe("");
  expect(result.image).toBe(false);
  // Its lower edge is the Line from child corner (27.68, 11.34) to
  // (62.32, 31.34): one edge, one refinement, curved by both parent logs.
  const [outline] = result.fills["#13bd4e"], edge = result.strokes["#d43735"].flat();
  expect(edge.length).toBeGreaterThan(2);
  for (const point of edge)
    expect(outline.some((q) => Math.hypot(q[0] - point[0], q[1] - point[1]) < 1e-4), JSON.stringify(point)).toBe(true);
  // Child [0, 100] fills parent [10, 90]; the parent maps log10 [1, 100] to 400 px.
  const pixel = ([x, y]) => [200 * Math.log10(10 + 0.8 * x), 400 - 200 * Math.log10(10 + 0.8 * y)];
  const [first, last] = [pixel([27.679, 11.340]), pixel([62.321, 31.340])];
  expect(Math.hypot(edge[0][0] - first[0], edge[0][1] - first[1])).toBeLessThan(0.1);
  expect(Math.hypot(edge.at(-1)[0] - last[0], edge.at(-1)[1] - last[1])).toBeLessThan(0.1);
  // The data-space midpoint of that edge maps off the pixel chord.
  const middle = pixel([45, 21.34]), chord = [(first[0] + last[0]) / 2, (first[1] + last[1]) / 2];
  expect(Math.hypot(middle[0] - chord[0], middle[1] - chord[1])).toBeGreaterThan(2);
  expect(outline.some((q) => Math.hypot(q[0] - middle[0], q[1] - middle[1]) < 0.6)).toBe(true);
  expectParity(result.green, [outline]);
});

// `west`: the screen side of the west edge; the polar parent's angle turns
// counter-clockwise, so there longitude increases leftward.
for (const [scene, parents, west] of [["geojson-child", "log/log parents", 0], ["geojson-in-polar", "polar parent", 1]])
test(`GeoJSON in an orthographic child bends through its ${parents} with Lines along its edges`, async ({ page }) => {
  await open(page, scene);
  const result = await capture(page, "auto");
  expect(result.error).toBe("");
  expect(result.green.length).toBeGreaterThan(500);
  // Each edge Line exports on the CPU through the chain; the GPU fill must
  // reach it and stop there. The 2 px Line covers the fill's edge, so the
  // outermost green pixel sits a pixel or two inside its center line.
  const rows = new Map(), columns = new Map();
  for (const [x, y] of result.green) {
    const row = rows.get(y) ?? [Infinity, -Infinity], column = columns.get(x) ?? [Infinity, -Infinity];
    rows.set(y, [Math.min(row[0], x), Math.max(row[1], x)]);
    columns.set(x, [Math.min(column[0], y), Math.max(column[1], y)]);
  }
  const edges = { "#d43735": [columns, 0, 1], "#d43736": [columns, 1, 1], "#d43737": [rows, west, 0], "#d43738": [rows, 1 - west, 0] };
  for (const [color, [spans, side, axis]] of Object.entries(edges)) {
    const all = result.strokes[color].flat();
    expect(all.length, color).toBeGreaterThan(3);
    // Skip the corners, where two edges meet and the fill's tip is thin.
    const points = all.slice(Math.ceil(all.length * 0.1), Math.floor(all.length * 0.9));
    let checked = 0;
    for (const point of points) {
      const span = spans.get(Math.round(point[1 - axis]));
      if (!span || !Number.isFinite(span[side])) continue;
      expect(Math.abs(span[side] - point[axis]), `${color} ${JSON.stringify(point)}`).toBeLessThan(3.5);
      checked++;
    }
    expect(checked, color).toBeGreaterThan(2);
  }
});

test("a globe inside a custom-period polar dial reads its own degrees", async ({ page }) => {
  // The dial measures angles in sixths of a turn. The globe does not set an
  // angle unit, so it reads degrees, its own default; inheriting the dial's
  // period would put latitude 40 at 40 sixths of a turn, which is invalid.
  await open(page, "geojson-in-polar");
  const result = await capture(page, "auto");
  expect(result.error).toBe("");
  const north = result.strokes["#d43735"].flat(), corner = north.at(-1);
  expect(north.length).toBeGreaterThan(3);
  expect(near(result.blue, corner, 4), JSON.stringify(corner)).toBe(true);
});

test("a Bar chart in a chart bent by a polar parent draws radial bars along its Lines", async ({ page }) => {
  await open(page, "bars-in-polar");
  const result = await capture(page);
  expect(result.error).toBe("");
  expect(result.image).toBe(false);
  // The Line along the first bar's top is the radius 1.5 arc from 27 to 63
  // degrees (child x 0.15..0.35 of [0, 12] hours, y 0.5 of [1, 2]).
  const edge = result.strokes["#d43735"].flat();
  const { center, radius } = circle(edge[0], edge[Math.floor(edge.length / 2)], edge.at(-1));
  const scale = radius / 1.5, polar = ([x, y]) => [Math.hypot(x - center[0], y - center[1]) / scale,
    Math.atan2(center[1] - y, x - center[0]) * 180 / Math.PI];
  const bars = result.fills["#13bd4e"];
  expect(bars.length).toBe(2);
  const bounds = [[27, 63, 1, 1.5], [117, 153, 1, 2]];
  for (const [index, [a0, a1, r0, r1]] of bounds.entries()) {
    const outline = bars.find((part) => Math.abs(polar(part[0])[1] - a0) < 1 || Math.abs(polar(part[0])[1] - a1) < 1);
    expect(outline, `bar ${index}`).toBeTruthy();
    for (const point of outline) {
      const [r, angle] = polar(point);
      const onArc = (Math.abs(r - r0) < 0.01 || Math.abs(r - r1) < 0.01) && angle > a0 - 0.3 && angle < a1 + 0.3,
        onSide = (Math.abs(angle - a0) < 0.3 || Math.abs(angle - a1) < 0.3) && r > r0 - 0.01 && r < r1 + 0.01;
      expect(onArc || onSide, JSON.stringify([index, point, r, angle])).toBe(true);
    }
    expectParity(result.green, [outline]);
  }
  // The top edge, traversed backwards in the outline, has the Line's vertices.
  for (const point of edge)
    expect(bars.flat().some((q) => Math.hypot(q[0] - point[0], q[1] - point[1]) < 1e-4), JSON.stringify(point)).toBe(true);
});

test("a chart bent by a polar parent draws its guides along the chain", async ({ page }) => {
  await open(page, "guides-in-polar");
  await page.evaluate(() => window.stage14NestedPaths.plot.whenSettled());
  const guides = await page.evaluate(() => {
    const parse = (d) => (d ?? "").split("M").filter(Boolean).map((part) =>
      [...("M" + part).matchAll(/[ML]([-\d.eE]+) ([-\d.eE]+)/g)].map((m) => [+m[1], +m[2]]));
    const svg = document.querySelector('svg[aria-label="Warped frame guides"]');
    if (!svg) return null;
    const pick = (selector) => [...svg.querySelectorAll(selector)].map((node) =>
      ({ value: +node.dataset.value, points: parse(node.getAttribute("d")).flat() }));
    return {
      x: pick('.warped-grid[data-axis="x"]:not([data-minor])'), y: pick('.warped-grid[data-axis="y"]:not([data-minor])'),
      edgeX: parse(svg.querySelector('.warped-edge[data-axis="x"]')?.getAttribute("d")).flat(),
      labels: [...svg.querySelectorAll(".warped-label")].map((node) =>
        ({ axis: node.dataset.axis, value: +node.dataset.value, x: +node.getAttribute("x"), y: +node.getAttribute("y") })),
    };
  });
  expect(guides).not.toBeNull();
  // Child x spans angles 0..180 (range [0, 12] hours), child y radii 1..2.
  // The x = 0 grid line is the horizontal ray from radius 1 to 2: it fixes
  // the parent's center and pixels per unit (visible axes reserve margins).
  const ray = guides.x.find((tick) => tick.value === 0).points, rayX = ray.map(([x]) => x);
  const k = Math.max(...rayX) - Math.min(...rayX), center = [Math.min(...rayX) - k, ray[0][1]];
  for (const [, y] of ray) expect(Math.abs(y - center[1])).toBeLessThan(0.05);
  const polar = ([x, y]) => [Math.hypot(x - center[0], y - center[1]) / k,
    Math.atan2(center[1] - y, x - center[0]) * 180 / Math.PI];
  expect(guides.x.length).toBeGreaterThanOrEqual(2);
  for (const tick of guides.x) for (const point of tick.points) {
    const [r, angle] = polar(point);
    expect(Math.abs(angle - 180 * tick.value), JSON.stringify([tick.value, point])).toBeLessThan(0.3);
    expect(r).toBeGreaterThan(0.99); expect(r).toBeLessThan(2.01);
  }
  expect(guides.y.length).toBeGreaterThanOrEqual(1);
  for (const tick of guides.y) for (const point of tick.points) {
    const [r, angle] = polar(point);
    expect(Math.abs(r - (1 + tick.value)), JSON.stringify([tick.value, point])).toBeLessThan(0.02);
    expect(angle).toBeGreaterThan(-0.3); expect(angle).toBeLessThan(180.3);
  }
  // The x axis is the inner arc (child y = 0), and its labels sit inside it.
  for (const point of guides.edgeX) expect(Math.abs(polar(point)[0] - 1)).toBeLessThan(0.02);
  const xLabels = guides.labels.filter((label) => label.axis === "x");
  expect(xLabels.length).toBeGreaterThanOrEqual(2);
  for (const label of xLabels) expect(polar([label.x, label.y])[0]).toBeLessThan(1);
  // Titles sit inside the chart at each axis's end: X by angle 180 just
  // outside the inner arc, Y by the outer end of the angle-0 ray, above it.
  const titles = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll(
    'svg[aria-label="Warped frame guides"] .warped-title')].map((node) => [node.textContent, [+node.getAttribute("x"), +node.getAttribute("y")]])));
  const [xr, xa] = polar(titles.X), [yr, ya] = polar(titles.Y);
  expect(xr).toBeGreaterThan(1); expect(xr).toBeLessThan(1.5);
  expect(xa).toBeGreaterThan(150); expect(xa).toBeLessThan(180);
  expect(yr).toBeGreaterThan(1.5); expect(yr).toBeLessThan(2);
  expect(ya).toBeGreaterThan(0); expect(ya).toBeLessThan(30);
  // The document export carries the bent guides as vector paths.
  const svg = await page.evaluate(async () =>
    (await window.stage14NestedPaths.plot.exportSVG({ mode: "vector" })).blob.text());
  // The guides take the theme's axis line color, so they are found by class (Svelte may add its
  // scoping class after it).
  expect((svg.match(/class="warped-grid[" ]/g) ?? []).length).toBeGreaterThanOrEqual(guides.x.length + guides.y.length);
});

/** The warped-guide overlay's paths and labels, parsed. */
function readGuides(page) {
  return page.evaluate(async () => {
    await window.stage14NestedPaths.plot.whenSettled();
    const parse = (d) => (d ?? "").split("M").filter(Boolean).map((part) =>
      [...("M" + part).matchAll(/[ML]([-\d.eE]+) ([-\d.eE]+)/g)].map((m) => [+m[1], +m[2]]));
    const svg = document.querySelector('svg[aria-label="Warped frame guides"]');
    if (!svg) return null;
    const pick = (selector) => [...svg.querySelectorAll(selector)].map((node) =>
      ({ axis: node.dataset.axis, value: +node.dataset.value, points: parse(node.getAttribute("d")).flat() }));
    return { grid: pick(".warped-grid:not([data-minor])"), edges: pick(".warped-edge"),
      labels: [...svg.querySelectorAll(".warped-label")].map((node) => ({ axis: node.dataset.axis, value: +node.dataset.value })) };
  });
}

test("a chart warped onto a globe cuts its guides at the horizon", async ({ page }) => {
  await open(page, "guides-on-globe");
  const result = await capture(page), guides = await readGuides(page);
  expect(result.error).toBe("");
  expect(guides).not.toBeNull();
  // The Line along child y = 0.5 (the equator, longitudes -150..150) is cut
  // at both limbs: it is the disk's diameter.
  const line = result.strokes["#13bd4e"].flat(), xs = line.map(([x]) => x);
  const R = (Math.max(...xs) - Math.min(...xs)) / 2, center = [(Math.max(...xs) + Math.min(...xs)) / 2, line[0][1]];
  const points = [...guides.grid, ...guides.edges].flatMap((guide) => guide.points);
  expect(points.length).toBeGreaterThan(4);
  for (const point of points)
    expect(Math.hypot(point[0] - center[0], point[1] - center[1]), JSON.stringify(point)).toBeLessThan(R + 1);
  // The x edge (latitude -40) runs limb to limb: R cos 40 to either side.
  const edge = guides.edges.find((guide) => guide.axis === "x").points.map(([x]) => x);
  expect(Math.abs(Math.max(...edge) - center[0] - R * Math.cos(40 * Math.PI / 180))).toBeLessThan(1);
  expect(Math.abs(center[0] - Math.min(...edge) - R * Math.cos(40 * Math.PI / 180))).toBeLessThan(1);
  // Grid lines at longitudes -150 and 150 are behind the globe: none drawn.
  expect(guides.grid.filter((guide) => guide.axis === "x" && (guide.value === 0 || guide.value === 1))).toEqual([]);
  expect(guides.grid.some((guide) => guide.axis === "x" && guide.value === 0.5)).toBe(true);
});

test("a polar child in log/log parents draws rings and spokes through both logs", async ({ page }) => {
  await open(page, "guides-polar-child");
  const guides = await readGuides(page);
  expect(guides).not.toBeNull();
  // The disk is centered at (50, 50) with radius 40 in parent data; the parent
  // maps log10 [1, 100] across 400 pixels. Rings are y = v, spokes x = v.
  const data = ([x, y]) => [10 ** (x / 200), 10 ** ((400 - y) / 200)];
  const rings = guides.grid.filter((guide) => guide.axis === "y" && guide.value > 0);
  expect(rings.length).toBeGreaterThanOrEqual(1);
  for (const ring of rings) for (const point of ring.points) {
    const [x, y] = data(point);
    expect(Math.abs(Math.hypot(x - 50, y - 50) - 40 * ring.value), JSON.stringify([ring.value, point])).toBeLessThan(0.4);
  }
  const spokes = guides.grid.filter((guide) => guide.axis === "x");
  expect(spokes.length).toBeGreaterThanOrEqual(3);
  for (const spoke of spokes) for (const point of spoke.points) {
    const [x, y] = data(point);
    if (Math.hypot(x - 50, y - 50) < 1) continue;
    const angle = ((Math.atan2(y - 50, x - 50) * 180 / Math.PI) + 360) % 360;
    expect(Math.min(Math.abs(angle - spoke.value * 15), 360 - Math.abs(angle - spoke.value * 15)),
      JSON.stringify([spoke.value, point])).toBeLessThan(0.3);
  }
  // The angular axis is the outer ring, labelled outside it.
  const ring = guides.edges.find((guide) => guide.axis === "x").points;
  for (const point of ring) {
    const [x, y] = data(point);
    expect(Math.abs(Math.hypot(x - 50, y - 50) - 40)).toBeLessThan(0.4);
  }
  expect(guides.labels.filter((label) => label.axis === "x").length).toBeGreaterThanOrEqual(3);
});

/** Each drawn warped-guide label's and title's box on the overlay, and the overlay size. */
const labelBoxes = (page) => page.evaluate(async () => {
  await window.stage14NestedPaths.plot.whenSettled();
  const svg = document.querySelector('svg[aria-label="Warped frame guides"]');
  const boxes = (selector) => [...svg.querySelectorAll(selector)].map((node) => {
    const box = node.getBBox();
    return { axis: node.dataset.axis, value: +node.dataset.value, text: node.textContent,
      x0: box.x, x1: box.x + box.width, y0: box.y, y1: box.y + box.height };
  });
  const labels = boxes(".warped-label"), titles = boxes(".warped-title");
  return { width: +svg.getAttribute("width"), height: +svg.getAttribute("height"),
    ticks: labels, titles, labels: [...labels, ...titles] };
});

test("warped guide labels never overlap each other or leave the canvas", async ({ page }) => {
  // A full turn: X's first and last labels would sit on one spot, next to Y's first.
  await open(page, "guides-full-turn");
  const turn = await labelBoxes(page);
  const xs = turn.ticks.filter((label) => label.axis === "x").map((label) => label.value);
  expect(xs).toContain(0);
  expect(xs).not.toContain(1);
  expect(turn.ticks.filter((label) => label.axis === "y").length).toBeGreaterThanOrEqual(2);
  // The bent chart titles both axes, like a Cartesian child.
  expect(turn.titles.map((title) => title.text).sort()).toEqual(["X", "Y"]);
  // A polar child in log parents reaches the canvas corner: its outermost
  // labels are dropped, not cut in half.
  await open(page, "guides-polar-child");
  const corner = await labelBoxes(page);
  expect(corner.ticks.length).toBeGreaterThanOrEqual(3);
  // A polar child draws no axis titles, like a polar root.
  expect(corner.titles).toEqual([]);
  for (const { labels, width, height } of [turn, corner]) {
    for (const [k, a] of labels.entries()) {
      expect(a.x0, a.text).toBeGreaterThanOrEqual(-0.5);
      expect(a.x1, a.text).toBeLessThanOrEqual(width + 0.5);
      expect(a.y0, a.text).toBeGreaterThanOrEqual(-0.5);
      expect(a.y1, a.text).toBeLessThanOrEqual(height + 0.5);
      for (const b of labels.slice(k + 1))
        expect(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0,
          `${a.axis} ${a.text} overlaps ${b.axis} ${b.text}`).toBe(true);
    }
  }
});

test("an explicit tick step rules a short bent edge; only its labels thin", async ({ page }) => {
  await open(page, "guides-step");
  const guides = await readGuides(page);
  expect(guides).not.toBeNull();
  const xs = guides.grid.filter((guide) => guide.axis === "x").map((guide) => guide.value);
  expect(xs.length).toBe(11);
  for (const [k, value] of xs.entries()) expect(value).toBeCloseTo(k / 10, 9);
  const labels = guides.labels.filter((label) => label.axis === "x").map((label) => label.value);
  expect(labels.length).toBeGreaterThanOrEqual(2);
  expect(labels.length).toBeLessThan(11);
  for (const value of labels) expect(xs.some((x) => Math.abs(x - value) < 1e-9)).toBe(true);
});

test("a larger export refines a bent path to the same output-pixel error", async ({ page }) => {
  // The Line is the radius 1.5 arc of a chart bent by its polar parent. At
  // 4x the output size its chords must hug the arc as closely, in output
  // pixels, as at 1x: the refinement tolerance follows the output size.
  await open(page, "chart-in-polar");
  const exports = await page.evaluate(async () => {
    const plot = window.stage14NestedPaths.plot;
    await plot.whenSettled();
    const read = async (options) => {
      const svg = await (await plot.exportSVG({ mode: "vector", ...options })).blob.text();
      const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
      const path = [...doc.querySelectorAll("path")].find((node) => node.getAttribute("stroke") === "#13bd4e");
      return [...path.getAttribute("d").matchAll(/[ML]([-\d.eE]+) ([-\d.eE]+)/g)].map((m) => [+m[1], +m[2]]);
    };
    return { small: await read({}), large: await read({ width: 1600, height: 1600 }) };
  });
  expect(exports.large.length).toBeGreaterThan(exports.small.length * 1.5);
  const points = exports.large, { center, radius } = circle(points[0], points[Math.floor(points.length / 2)], points.at(-1));
  // The worst chord midpoint's distance from the arc, in output pixels (4 per viewBox unit).
  const sag = Math.max(...points.slice(1).map((point, k) => {
    const mid = [(point[0] + points[k][0]) / 2, (point[1] + points[k][1]) / 2];
    return Math.abs(radius - Math.hypot(mid[0] - center[0], mid[1] - center[1])) * 4;
  }));
  expect(sag).toBeLessThan(0.6);
});


test("the path-refinement pipelines compile within budget on a cold cache", async ({ page }) => {
  // Every call site of operationPoint is a full inlined copy of the operation
  // table (TODO 57): the pipelines once took 7.6 s and 2.2 s to create on an
  // Apple GPU and never finished on SwiftShader. A random constant in each entry
  // point keeps Metal's system-wide shader cache (which fresh profiles share)
  // from hiding the cost.
  await open(page, "polar-log");
  const result = await page.evaluate(async () => {
    const { curvedPathShader } = await import("/src/lib/plot/utils/curvedPathShader.js");
    const salt = `${1 + Math.floor(Math.random() * 2e9)}u`;
    const code = curvedPathShader.replace(/(@compute[^\n]*?fn\s+\w+\(.*?\)\s*\{)/g, `$1if(p.source.x==${salt}){return;}`);
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter.requestDevice();
    const module = device.createShaderModule({ code });
    const ms = {};
    for (const entryPoint of ["countPaths", "scanBlocks", "scanTops", "scanRows", "fillPaths"]) {
      const start = performance.now();
      await device.createComputePipelineAsync({ layout: "auto", compute: { module, entryPoint } });
      ms[entryPoint] = performance.now() - start;
    }
    device.destroy();
    return { ms, software: adapter.info?.architecture === "swiftshader" };
  });
  // About 0.7 s at most on the GPU and 4.7 s on SwiftShader (2026-09-28).
  const budget = result.software ? 20000 : 2500;
  for (const [entryPoint, ms] of Object.entries(result.ms)) expect(ms, entryPoint).toBeLessThan(budget);
});
