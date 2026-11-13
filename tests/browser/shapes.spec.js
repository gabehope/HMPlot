import { test, expect } from "./fixtures.js";
import { pixelReader } from "./png.js";
import { installGpuCounters, gpuCounters } from "./gpu-counters.js";

const fixture = (page, key) => page.evaluate(async (key) => {
  const mark = window.shapeFixture.marks[key].getMark();
  await mark.manager.chain;
  const codes = mark.fields.get("symbolCode");
  return { active: mark.symbolCodeActive, codes: codes?.data?.ref ? Array.from(await codes.data.ref.data()) : null };
}, key);

test.beforeEach(async ({ page }) => {
  await page.goto("/test/shapes");
  await page.waitForFunction(() => window.shapeFixture?.marks?.custom?.getLegendSource?.());
  await page.waitForFunction(() => [...document.querySelectorAll(".canvas")]
    .every(canvas => canvas.getAttribute("aria-busy") === "false"));
  await page.evaluate(() => Promise.all(Object.values(window.shapeFixture.plots).map((p) => p.whenSettled())));
});

test("shape names a column: a per-point symbol channel with its own legend", async ({ page }) => {
  await expect.poll(async () => (await fixture(page, "channel")).active).toBe(true);
  const { codes } = await fixture(page, "channel");
  // Biscoe rows get the first automatic symbol (circle, 0), Dream rows the second (triangle, 1).
  expect(codes).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);
  const legend = page.locator("[aria-label=Island]");
  await expect(legend.locator("button")).toHaveText(["Biscoe", "Dream"]);
  // A shape-only legend draws symbols in the mark's constant fill (here gray: fill is categorical elsewhere).
  const symbols = legend.locator("button svg circle, button svg path");
  await expect(symbols).toHaveCount(2);
  const fills = await symbols.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("fill")));
  expect(new Set(fills).size).toBe(1);
  // The custom plot's constant fill colors its shape legend.
  const custom = await page.locator("[aria-label=Custom] button svg path").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("fill")));
  expect(custom.map((fill) => fill.toLowerCase())).toEqual(["#c0504d", "#c0504d"]);
});

test("fill and shape from the same column: the shape legend's symbols carry the fill colors", async ({ page }) => {
  const shape = page.locator("[aria-label='Merged shape'] button"), fill = page.locator("[aria-label='Merged fill'] button");
  await expect(shape).toHaveText(["Biscoe", "Dream"]);
  const symbolFills = await shape.locator("svg circle, svg path").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("fill")));
  const swatchFills = await fill.locator("svg rect, svg circle, svg path").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("fill")));
  expect(symbolFills).toHaveLength(2);
  expect(new Set(symbolFills).size).toBe(2);
  expect(symbolFills).toEqual(swatchFills);
  // Biscoe draws the first automatic symbol (a circle), Dream the second (a triangle path).
  await expect(shape.nth(0).locator("svg circle")).toHaveCount(1);
  await expect(shape.nth(1).locator("svg path")).toHaveCount(1);
});

test("Points draw per-point and custom squares the size of the literal square", async ({ page }) => {
  for (const key of ["flatChannel"]) await expect.poll(async () => (await fixture(page, key)).active).toBe(true);
  expect((await fixture(page, "flatSquare")).active).toBe(false);
  // Red pixels in each quarter of the plot: circle, literal square, channel square, custom unit square.
  const counts = await page.evaluate(async () => {
    const plot = window.shapeFixture.plots.flat;
    await plot.whenSettled();
    const png = await plot.exportPNG(), bitmap = await createImageBitmap(png);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    const counts = [0, 0, 0, 0];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i] > 150 && data[i + 1] < 120 && data[i + 2] < 120) counts[Math.min(3, Math.floor((x / width) * 4))]++;
    }
    return counts;
  });
  const [circle, literal, channel, custom] = counts;
  expect(circle).toBeGreaterThan(100);
  // A square's area is 4/pi of its inscribed circle's.
  expect(literal / circle).toBeGreaterThan(1.15);
  expect(literal / circle).toBeLessThan(1.4);
  expect(Math.abs(channel - literal) / literal).toBeLessThan(0.05);
  expect(Math.abs(custom - literal) / literal).toBeLessThan(0.05);
});

test("a per-row array of shape names maps directly", async ({ page }) => {
  await expect.poll(async () => (await fixture(page, "literal")).codes).toEqual([0, 3, 7]);
});

test("custom shapes render in the shader, legends, and SVG export", async ({ page }) => {
  // The first custom shape follows the 23 built-ins.
  await expect.poll(async () => (await fixture(page, "custom")).codes?.[0]).toBe(23);
  const legendPath = await page.locator("[aria-label=Custom] button").first().locator("path").getAttribute("d");
  expect(legendPath.match(/L/g)).toHaveLength(4); // five vertices
  const svg = await page.evaluate(async () => (await window.shapeFixture.plots.custom.exportSVG({ mode: "vector" })).blob.text());
  const pentagons = [...svg.matchAll(/<path[^>]*d="M[^"]*"/g)].filter((m) => (m[0].match(/ L/g) ?? []).length === 4);
  expect(pentagons.length).toBeGreaterThanOrEqual(5);
  // Pixels: the pentagon's center is filled, the corner of its bounding square is not.
  // One pixel inward reaches its antialiased edge at DPR 1; sample the actual corner.
  const [inside, corner] = await page.evaluate(async (source) => {
    const plot = window.shapeFixture.plots.custom;
    const png = await plot.exportPNG(), bitmap = await createImageBitmap(png);
    const canvas = document.createElement("canvas");
    // Axis-layout probes use CSS coordinates; native PNG pixels include DPR.
    const root = new DOMParser().parseFromString(source, "image/svg+xml").documentElement;
    canvas.width = Number(root.getAttribute("width")); canvas.height = Number(root.getAttribute("height"));
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    const { data, width } = context.getImageData(0, 0, canvas.width, canvas.height);
    // Find the first pentagon's red pixels and its bounding box.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const layout=plot.getAxisLayout();
    for (let y = Math.ceil(layout.top); y < (layout.top+layout.bottom)/2; y++) for (let x = Math.ceil(layout.left); x < layout.left+(layout.right-layout.left)/4; x++) {
      const i = (y * width + x) * 4;
      if (data[i] > 150 && data[i + 1] < 120 && data[i + 2] < 120) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    }
    const at = (x, y) => [...data.slice((y * width + x) * 4, (y * width + x) * 4 + 3)];
    return [at(Math.round((minX + maxX) / 2), Math.round((minY + maxY) / 2)), at(minX, maxY)];
  }, svg);
  expect(inside[0]).toBeGreaterThan(150);
  expect(inside[1]).toBeLessThan(120);
  expect(corner[1]).toBeGreaterThan(200); // bottom-left of the bounding box is background
});

test("registering a shape after mount rebuilds no mark: per-point symbols read its new field layer", async ({ page }) => {
  const builds = await page.evaluate(async () => {
    const counts = {};
    for (const key of ["channel", "constant"]) {
      const mark = window.shapeFixture.marks[key].getMark();
      const build = mark.build.bind(mark);
      counts[key] = 0;
      mark.build = (...args) => { counts[key]++; return build(...args); };
    }
    window.shapeFixture.registerShape("late", [[0, 1], [1, -1], [-1, -1]]);
    return counts;
  });
  // TODO 55: the distance-field texture gains a layer; only its growth (a power of two) rebuilds.
  expect(builds).toEqual({ channel: 0, constant: 0 });
});

test("every built-in and a curved custom shape, in one column, draw like their exported outlines", async ({ page }) => {
  // Each cell's ink in the PNG (the shader: closed forms and the distance field) against the
  // SVG export rasterized at the same size (exact outlines): area within 7% and centroid within
  // 1.5 px, so a wrong, flipped or blurred field layer fails. At twice the size, so a pixel of
  // antialiasing on a small glyph is not the error measured.
  await page.waitForFunction(() => window.shapeFixture?.plots.gallery?.whenSettled);
  const cells = await page.evaluate(async () => {
    const plot = window.shapeFixture.plots.gallery;
    await plot.whenSettled();
    const png = await createImageBitmap(await plot.exportPNG({ scale: 2 }));
    const svg = await (await plot.exportSVG({ mode: "vector" })).blob.text();
    const image = new Image();
    image.src = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    await image.decode();
    const pixels = (source) => {
      const canvas = document.createElement("canvas");
      canvas.width = png.width; canvas.height = png.height;
      const context = canvas.getContext("2d");
      context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const [a, b] = [pixels(png), pixels(image)], { width, height } = png;
    return Array.from({ length: 24 }, (_, i) => {
      const cx = (10 + (i % 6) * 16) / 100 * width, cy = (1 - (85 - Math.floor(i / 6) * 23) / 100) * height;
      const measure = (data) => {
        let n = 0, sx = 0, sy = 0;
        for (let y = Math.round(cy - 0.11 * height); y < cy + 0.11 * height; y++)
          for (let x = Math.round(cx - 0.075 * width); x < cx + 0.075 * width; x++) {
            const k = (y * width + x) * 4;
            if (data[k + 2] - data[k] > 60) { n++; sx += x; sy += y; }
          }
        return { n, x: sx / n, y: sy / n };
      };
      return { png: measure(a), svg: measure(b) };
    });
  });
  cells.forEach(({ png, svg }, i) => {
    expect(svg.n, `cell ${i} exported outline`).toBeGreaterThan(40);
    expect(png.n / svg.n, `cell ${i} area`).toBeGreaterThan(0.93);
    expect(png.n / svg.n, `cell ${i} area`).toBeLessThan(1.07);
    expect(Math.hypot(png.x - svg.x, png.y - svg.y), `cell ${i} centroid`).toBeLessThan(1.5);
  });
});

test("per-row shape names prepared before registerShape pick up the shape once it exists", async ({ page }) => {
  // "pending" is not a shape yet: the column is categorical, with automatic symbols.
  await expect.poll(async () => (await fixture(page, "pending")).codes).toEqual([0, 1, 1]);
  const code = await page.evaluate(() => window.shapeFixture.registerShape("pending", [[0, 1], [1, -1], [-1, -1]]));
  expect(code).toBeGreaterThanOrEqual(8);
  await expect.poll(async () => (await fixture(page, "pending")).codes).toEqual([code, 0, 0]);
});

test("a Swarm with shape=\"col\" spaces glyphs by their square; circles pack tighter", async ({ page }) => {
  const spread = (key) => page.evaluate(async (key) => {
    const handle = window.shapeFixture.marks[key];
    await handle.whenSettled();
    const mark = handle.getMark();
    await mark.manager.chain;
    const data = mark.fields.get("dx")?.data;
    return data?.ref ? Math.max(...Array.from(await data.ref.data()).map(Math.abs)) : null;
  }, key);
  await expect.poll(() => spread("swarmShape")).toBeGreaterThan(0);
  const [shape, circle] = [await spread("swarmShape"), await spread("swarmCircle")];
  expect(circle).toBeLessThan(shape * 0.9);
});

test("a theme's default shape stays a symbol when a column has the same name", async ({ page }) => {
  const warnings = [];
  page.on("console", (message) => { if (message.type() === "warning") warnings.push(message.text()); });
  await page.reload();
  await page.waitForFunction(() => window.shapeFixture?.marks?.themed?.getMark?.());
  await page.evaluate(() => window.shapeFixture.plots.themed.whenSettled());
  const state = await fixture(page, "themed");
  expect(state.active).toBe(false);
  expect(await page.evaluate(() => window.shapeFixture.marks.themed.getMark().options.get("shape"))).toBe("circle");
  expect(warnings.filter((text) => text.includes("names both a column and a shape"))).toEqual([]);
});

// TODO 64: fill="transparent" is a hollow point (three.js drew it white), in its SVG export too.
test("Points with fill=\"transparent\" draw their outline alone, over what is behind", async ({ page }) => {
  const drawn = await page.evaluate(async () => {
    const plot = window.shapeFixture.plots.hollow;
    await plot.whenSettled();
    const bitmap = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    const at = (x, y) => Array.from(context.getImageData(Math.round(x * canvas.width), Math.round(y * canvas.height), 1, 1).data);
    const svg = await (await plot.exportSVG({ mode: "vector" })).blob.text();
    // The center (the red point), and between the red point and the ring (the background).
    return { center: at(0.5, 0.5), gap: at(0.5, 0.5 + 30 / 200), svg: svg.match(/<circle[^>]*stroke[^>]*>/)?.[0] ?? "" };
  });
  expect(drawn.center[0]).toBeGreaterThan(180);
  expect(drawn.center[2]).toBeLessThan(80);
  expect(Math.min(...drawn.gap.slice(0, 3))).toBeGreaterThan(200);
  expect(drawn.svg).toContain('fill="transparent"');
  expect(drawn.svg).toContain('stroke="#2040d0"');
});

test.describe("small outlined points", () => {
  test.use({ deviceScaleFactor: 2 });
  test("contrasting rims blend smoothly and live width edits keep rendering", async ({ page }) => {
    await page.addInitScript(installGpuCounters);
    await page.reload();
    await page.waitForFunction(() => window.shapeFixture?.marks.outlined?.getMark());
    await page.waitForFunction(() => [...document.querySelectorAll('.canvas')].every(c => c.getAttribute('aria-busy') === 'false'));
    await page.evaluate(() => window.shapeFixture.plots.outlined.whenSettled());
    const canvas = page.getByRole("application", { name: "Plot canvas", exact: true }).last().locator("canvas");
    const pixels = pixelReader(await canvas.screenshot());
    expect(pixels(96, 120)[0]).toBeGreaterThan(160); // orange center
    expect(pixels(96, 120)[2]).toBeLessThan(120);
    expect(pixels(103, 127)).toEqual([87, 126, 172]); // outside the circle's corner
    const colors = new Set();
    for (let y = 111; y < 129; y++) for (let x = 87; x < 105; x++) {
      const rgb = pixels(x, y);
      if (rgb[0] > 185 && rgb[1] > 155 && rgb[2] > 140) colors.add(rgb.join(','));
    }
    expect(colors.size).toBeGreaterThan(8); // a smooth rim, beyond four coverage levels
    const state = () => page.evaluate(() => {
      const mark = window.shapeFixture.marks.outlined.getMark();
      return { transparent: mark.material.transparent, coverage: mark.material.alphaToCoverage };
    });
    expect(await state()).toEqual({ transparent: true, coverage: false });
    const change = width => page.evaluate(async width => {
      window.shapeFixture.setOutlineWidth(width);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      await window.shapeFixture.plots.outlined.whenSettled();
    }, width);
    await change(0);
    expect(await state()).toEqual({ transparent: false, coverage: true });
    await change(0.7); // warm the outlined pipeline again
    const before = await gpuCounters(page);
    const frame = await page.evaluate(() => window.shapeFixture.plots.outlined.getDiagnostics().completedFrame);
    for (const width of [0.5, 0.9, 0.7]) await change(width);
    const after = await gpuCounters(page);
    expect(after.shaders).toBe(before.shaders);
    expect(after.render).toBe(before.render);
    expect(after.readbacks).toBe(before.readbacks);
    expect(await page.evaluate(() => window.shapeFixture.plots.outlined.getDiagnostics().completedFrame)).toBeGreaterThan(frame);
  });
});
