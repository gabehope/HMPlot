import { test, expect } from "./fixtures.js";

// Colors of the five probe points from a PNG export: along the row through the points,
// each point is a run of non-white pixels; sample the middle of each wide run.
async function probes(page, key) {
  return page.evaluate(async (key) => {
    const plot = window.colorFixture.plots[key];
    await plot.whenSettled();
    const png = await plot.exportPNG(), bitmap = await createImageBitmap(png);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixel = (x, y) => [...data.slice((y * width + x) * 4, (y * width + x) * 4 + 3)];
    // Sample the rendered point centers; axis text and grids are not probe marks.
    const svg = new DOMParser().parseFromString(await (await plot.exportSVG()).blob.text(), 'image/svg+xml');
    const root = svg.documentElement, [,,w,h] = root.getAttribute('viewBox').split(/\s+/).map(Number);
    return [...svg.querySelectorAll('circle')].slice(0, 5).map(circle =>
      pixel(Math.round(Number(circle.getAttribute('cx')) * width / w),
        Math.round(Number(circle.getAttribute('cy')) * height / h)));
  }, key);
}
const near = (actual, expected, tolerance = 12) =>
  actual.every((value, index) => Math.abs(value - expected[index]) <= tolerance);

test.beforeEach(async ({ page }) => {
  await page.goto("/test/color");
  await page.waitForFunction(() => window.colorFixture?.marks?.custom?.getMark?.());
});

test("integer RGB columns are 0-255 per row", async ({ page }) => {
  const colors = await probes(page, "integers");
  [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [0, 0, 0]].forEach((expected, i) =>
    expect(near(colors[i], expected), `point ${i}: ${colors[i]}`).toBe(true));
});

test("float Nx3 rows are 0-1 per row", async ({ page }) => {
  const colors = await probes(page, "rows");
  [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [0, 0, 0]].forEach((expected, i) =>
    expect(near(colors[i], expected), `point ${i}: ${colors[i]}`).toBe(true));
});

test("an RGBA alpha channel becomes per-row opacity", async ({ page }) => {
  const colors = await probes(page, "rgba");
  expect(near(colors[0], [255, 0, 0])).toBe(true);
  // Alpha 0.2 over white: a pale red.
  expect(colors[1][0]).toBeGreaterThan(240);
  expect(colors[1][1]).toBeGreaterThan(180);
});

test("a custom colormap maps the domain ends to its first and last colors", async ({ page }) => {
  const colors = await probes(page, "custom");
  expect(near(colors[0], [255, 0, 0], 16), `low ${colors[0]}`).toBe(true);
  expect(near(colors[4], [0, 0, 255], 16), `high ${colors[4]}`).toBe(true);
  // Lab interpolation through the middle is neither endpoint.
  expect(near(colors[2], [255, 0, 0], 40) || near(colors[2], [0, 0, 255], 40)).toBe(false);
});

test("colormap positions move the stops", async ({ page }) => {
  const colors = await probes(page, "stepped");
  // Green sits at 0.9, so 0.75 is mostly between red and green (no blue).
  expect(colors[3][2]).toBeLessThan(40);
  expect(near(colors[4], [0, 0, 255], 16)).toBe(true);
});

test("a theme colormap is the default for continuous fills", async ({ page }) => {
  const colors = await probes(page, "theme");
  // Magma starts near black and ends pale yellow; Viridis would start dark purple and end yellow-green.
  expect(Math.max(...colors[0])).toBeLessThan(40);
  expect(colors[4][0]).toBeGreaterThan(230);
  expect(colors[4][2]).toBeGreaterThan(130);
});

test("out-of-range float RGB reports an error naming the channel", async ({ page }) => {
  await expect.poll(() => page.evaluate(() => window.colorFixture.plots.bad.getRenderError?.() ?? ""))
    .toContain("Points.fill RGB values must be between 0 and 1 for float data");
});

test("a custom colormap legend exports its colors as gradient stops", async ({ page }) => {
  const svg = await page.evaluate(async () => {
    const plot = window.colorFixture.plots.custom;
    await plot.whenSettled();
    return (await plot.exportSVG({ mode: "auto" })).blob.text();
  });
  const stops = [...svg.matchAll(/<stop offset="([\d.]+)" stop-color="(#[0-9a-f]{6})"/g)].map((m) => m[2]);
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  // Sampling stops just below 1, like the GPU lookup, so the last stop is within a step of blue.
  expect(near(rgb(stops[0]), [255, 0, 0], 6)).toBe(true);
  expect(near(rgb(stops.at(-1)), [0, 0, 255], 6)).toBe(true);
});

test("RGB points export per-point fills to SVG", async ({ page }) => {
  const svg = await page.evaluate(async () => {
    const plot = window.colorFixture.plots.integers;
    await plot.whenSettled();
    return (await plot.exportSVG({ mode: "vector" })).blob.text();
  });
  const fills = new Set([...svg.matchAll(/<circle[^>]*fill="(#[0-9a-f]{6})"/g)].map((m) => m[1]));
  for (const color of ["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#000000"]) expect(fills.has(color), color).toBe(true);
});

test("Points blend RGBA alpha per row", async ({ page }) => {
  const colors = await probes(page, "rgba2d");
  expect(near(colors[0], [255, 0, 0])).toBe(true);
  expect(colors[1][0]).toBeGreaterThan(240);
  expect(colors[1][1]).toBeGreaterThan(180);
  const transparent = await page.evaluate(() => window.colorFixture.marks.rgba2d.getMark().material.transparent);
  expect(transparent).toBe(true);
});

// Glyphs, one per column cluster of reddish pixels: the most saturated pixel of each (its
// lowest green value) tells an opaque red glyph from a 0.2-alpha one on white.
async function glyphSaturation(page, key) {
  return page.evaluate(async (key) => {
    const plot = window.colorFixture.plots[key];
    await plot.whenSettled();
    const png = await plot.exportPNG(), bitmap = await createImageBitmap(png);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    const lowest = Array(width).fill(Infinity);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i] > 200 && data[i] > data[i + 1] + 30) lowest[x] = Math.min(lowest[x], data[i + 1]);
    }
    const glyphs = [];
    for (let x = 0, start = -1, min = Infinity; x <= width; x++) {
      const inside = x < width && lowest[x] < Infinity;
      if (inside) { if (start < 0) { start = x; min = Infinity; } min = Math.min(min, lowest[x]); }
      else if (start >= 0) { glyphs.push(min); start = -1; }
    }
    return glyphs;
  }, key);
}

test("a Label with N x 4 colors draws translucent glyphs", async ({ page }) => {
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await expect.poll(async () => (await glyphSaturation(page, "rgbaLabel")).length).toBe(5);
  const glyphs = await glyphSaturation(page, "rgbaLabel");
  // Rows 1, 3, 5 are opaque red; rows 2 and 4 have alpha 0.2 (about 255, 204, 204 on white).
  for (const index of [0, 2, 4]) expect(glyphs[index]).toBeLessThan(60);
  for (const index of [1, 3]) expect(glyphs[index]).toBeGreaterThan(170);
  expect(errors.filter((e) => /vertex buffer/i.test(e))).toEqual([]);
});

// TODO 17.10: RGBA fill, per-row outline colors and per-row sizes need more than WebGPU's 8
// vertex buffers; the fields past the budget are read from storage buffers instead, and the
// points render with every channel (they used to report an error and draw nothing).
test("points over the vertex buffer limit read the extra channels from storage and render", async ({ page }) => {
  const colors = await probes(page, "overflow");
  expect(await page.evaluate(() => window.colorFixture.plots.overflow.getRenderError?.() ?? "")).toBe("");
  expect(colors.length).toBe(5);
  // Alpha 1, 0.2, 1, 0.2, 1 (the per-row opacity channel), all red.
  for (const [index, color] of colors.entries())
    expect(near(color, index % 2 ? [255, 204, 204] : [255, 0, 0], 30), `point ${index}: ${color}`).toBe(true);
  expect(await page.evaluate(() => [...window.colorFixture.marks.overflow.getMark().storageFields ?? []]).then((fields) => fields.length))
    .toBeGreaterThan(0);
});

test("GeoJSON RGB rows from GPU arrays are range-checked and recover", async ({ page }) => {
  await page.getByLabel("GeoJSON RGB recovery", { exact: true }).scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => window.colorFixture.plots.geoBad.getRenderError?.() ?? ""))
    .toContain("GeoJSON.fill RGB values must be between 0 and 255 for integer data");
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.evaluate(() => window.colorFixture.setGeoValid(true));
    await expect(page.locator('.canvas[aria-busy="true"]')).toHaveCount(0);
    const { counts, error } = await quadrantCounts(page, "geoBad");
    expect(error).toBe("");
    expect(counts.red).toBeGreaterThan(1000);
    await page.evaluate(() => window.colorFixture.setGeoValid(false));
    await expect.poll(() => page.evaluate(() => window.colorFixture.plots.geoBad.getRenderError?.() ?? ""))
      .toContain("GeoJSON.fill RGB values must be between 0 and 255 for integer data");
  }
});

test("RGBA alpha exports per-point opacity to SVG", async ({ page }) => {
  const svg = await page.evaluate(async () => {
    const plot = window.colorFixture.plots.rgba;
    await plot.whenSettled();
    return (await plot.exportSVG({ mode: "vector" })).blob.text();
  });
  const opacities = [...svg.matchAll(/<circle[^>]*opacity="([\d.]+)"/g)].map((m) => Number(m[1]));
  expect(opacities.length).toBe(5);
  expect(opacities.filter((o) => Math.abs(o - 0.2) < 0.01).length).toBe(2);
  expect(opacities.filter((o) => o === 1).length).toBe(3);
});

// 7C B1: count pixels near each quadrant color of a 2 x 2 image.
async function quadrantCounts(page, key, level = 255) {
  return page.evaluate(async ({ key, level: v }) => {
    const plot = window.colorFixture.plots[key];
    await plot.whenSettled();
    const png = await plot.exportPNG(), bitmap = await createImageBitmap(png);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const targets = { red: [v, 0, 0], green: [0, v, 0], blue: [0, 0, v], yellow: [v, v, 0] }, counts = {};
    for (const name of Object.keys(targets)) counts[name] = 0;
    for (let i = 0; i < data.length; i += 4)
      for (const [name, [r, g, b]] of Object.entries(targets))
        if (Math.abs(data[i] - r) < 12 && Math.abs(data[i + 1] - g) < 12 && Math.abs(data[i + 2] - b) < 12) counts[name]++;
    return { counts, error: plot.getRenderError?.() ?? "" };
  }, { key, level });
}

test("Image draws [H, W, 3] float 0-1 and integer 0-255 colors", async ({ page }) => {
  await page.waitForFunction(() => window.colorFixture.plots.imageInt && window.colorFixture.plots.imageGpu);
  for (const [key, level] of [["imageFloat", 255], ["imageInt", 128], ["imageGpu", 128]]) {
    const { counts, error } = await quadrantCounts(page, key, level);
    expect(error, key).toBe("");
    for (const [name, count] of Object.entries(counts)) expect(count, `${key} ${name}`).toBeGreaterThan(400);
  }
});

test("Image range-checks its colors and Heatmap points RGB grids to Image", async ({ page }) => {
  await expect.poll(() => page.evaluate(() => window.colorFixture.plots.imageBad.getRenderError?.() ?? ""))
    .toContain("Image.data RGB values must be between 0 and 1 for float data; found 0 to 2.");
  // A GPU float image is checked beside its upload and still reports the error.
  await expect.poll(() => page.evaluate(() => window.colorFixture.plots.imageGpuBad?.getRenderError?.() ?? ""))
    .toContain("Image.data RGB values must be between 0 and 1 for float data; found 0 to 2.");
  await expect.poll(() => page.evaluate(() => window.colorFixture.plots.heatmapRgb.getRenderError?.() ?? ""))
    .toContain("Heatmap.fill has shape [2, 2, 3], an RGB image: Heatmap colors one value per cell through a colormap. Use Image (data=...) for [height, width, 3 or 4] colors.");
});

test("categorical Interpolate heatmaps draw their palette colors exactly", async ({ page }) => {
  // The Plot mounts once Interpolate has prepared its cells.
  await page.waitForFunction(() => window.colorFixture.plots.catGrid);
  const counts = await page.evaluate(async () => {
    const plot = window.colorFixture.plots.catGrid;
    await plot.whenSettled();
    const png = await plot.exportPNG(), bitmap = await createImageBitmap(png);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const near = (i, [r, g, b]) => Math.abs(data[i] - r) < 6 && Math.abs(data[i + 1] - g) < 6 && Math.abs(data[i + 2] - b) < 6;
    let blue = 0, gray = 0;
    for (let i = 0; i < data.length; i += 4) { if (near(i, [76, 120, 168])) blue++; if (near(i, [128, 128, 128])) gray++; }
    return { blue, gray };
  });
  // #4c78a8 and #808080; the image path used to linearize the (already linear) palette twice
  // and add it again as emissive, drawing (29, 69, 138) and (78, 78, 78).
  expect(counts.blue).toBeGreaterThan(2000);
  expect(counts.gray).toBeGreaterThan(2000);
});

test("the settings pane shows a custom colormap as Custom with its gradient", async ({ page }) => {
  // The fixture plot is below the trigger's minimum height; open the pane directly.
  await page.evaluate(() => window.colorFixture.plots.custom.openSettings());
  const panel = page.getByRole("dialog", { name: "Settings · Custom colormap", exact: true });
  await panel.getByRole("treeitem", { name: "Custom points", exact: false }).click();
  const row = panel.locator('[data-setting="cmapIndex"]');
  const select = row.locator("select");
  await expect(select).toHaveValue("__custom-colormap");
  await expect(select.locator("option:checked")).toHaveText("Custom");
  const background = await row.locator(".gradient").evaluate((el) => el.style.background);
  // Red to blue (the redBlue scale), not the white placeholder.
  expect(background).toContain("rgb(255, 0, 0)");
  expect(background).toContain("rgb(0, 0, 255)");
});


// TODO 69.17: in a plot's PNG export at twice its size, how many pixels are each of `colors`
// (within 6 per channel), and with `outline`, its one shape's radius along 360 rays from its
// centroid (the coverage of `outline` over white, integrated along the ray).
const exportStats = (page, key, colors, outline) => page.evaluate(async ([key, colors, outline]) => {
  const plot = window.colorFixture.plots[key];
  await plot.whenSettled();
  const bitmap = await createImageBitmap(await plot.exportPNG({ scale: 2 }));
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
  const hex = (color) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  const counts = Object.fromEntries(colors.map((color) => {
    const [r, g, b] = hex(color);
    let n = 0;
    for (let i = 0; i < data.length; i += 4)
      if (Math.abs(data[i] - r) < 6 && Math.abs(data[i + 1] - g) < 6 && Math.abs(data[i + 2] - b) < 6) n++;
    return [color, n];
  }));
  if (!outline) return { counts };
  const span = 255 - hex(outline)[0];
  const coverage = (x, y) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;
    return Math.max(0, Math.min(1, (255 - data[(y * width + x) * 4]) / span));
  };
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) if (coverage(x, y) > 0.5) { sx += x; sy += y; n++; }
  const radii = [];
  for (let k = 0; k < 360; k++) {
    const a = (k * Math.PI) / 180;
    let r = 0;
    for (let s = 0; s < width / 2; s += 0.25) r += coverage(sx / n + s * Math.cos(a), sy / n + s * Math.sin(a)) * 0.25;
    radii.push(r);
  }
  return { counts, radii };
}, [key, colors, outline]);

test("a Points3D sphere is round by default, and an explicit detail keeps its own (TODO 69.17)", async ({ page }) => {
  await page.waitForFunction(() => window.colorFixture.marks.coarse?.getMark?.());
  // An icosahedron divided 3 times draws 320 triangles; detail={1} 80. Setup used to set 1 over the default.
  const vertices = await page.evaluate(async () => {
    await window.colorFixture.plots.solidMarks.whenSettled();
    const { sphere, coarse } = window.colorFixture.marks;
    return [sphere, coarse].map((mark) => mark.getMark().geometry.attributes.position.count);
  });
  expect(vertices).toEqual([320 * 3, 80 * 3]);
  // The centered sphere's outline: a polygon's radius dips between its corners. At the old
  // default of 1 the radii spread over about 6% of the radius, at 3 under 2%.
  const { counts, radii } = await exportStats(page, "solid", ["#4c78a8"], "#4c78a8");
  const mean = radii.reduce((a, b) => a + b) / radii.length, spread = (Math.max(...radii) - Math.min(...radii)) / mean;
  expect(mean).toBeGreaterThan(80);
  expect(spread, `radius ${mean.toFixed(1)}px, spread ${(spread * 100).toFixed(2)}%`).toBeLessThan(0.04);
  // In the theme's Points color.
  expect(counts["#4c78a8"]).toBeGreaterThan(20000);
});

test("3D marks with no color take the theme's and follow a theme change; explicit and scaled fills keep theirs (TODO 69.17)", async ({ page }) => {
  await page.waitForFunction(() => window.colorFixture.marks.coarse?.getMark?.());
  const check = async (expected) => {
    const sphere = (await exportStats(page, "solid", [expected.points, "#00ff00"])).counts;
    const marks = (await exportStats(page, "solidMarks", [expected.arrows, expected.text, "#ff8800", "#0000ff", "#4682b4", "#30374a"])).counts;
    const message = JSON.stringify({ expected, sphere, marks });
    expect(sphere[expected.points], message).toBeGreaterThan(20000);
    expect(marks[expected.arrows], message).toBeGreaterThan(2000);
    expect(marks[expected.text], message).toBeGreaterThan(300);
    // The explicit fill and the scaled one (redBlue at 1).
    expect(marks["#ff8800"], message).toBeGreaterThan(5000);
    expect(marks["#0000ff"], message).toBeGreaterThan(5000);
    // The marks' old defaults: Points3D's green, Arrows3D's steel blue, Text3D's slate.
    expect(sphere["#00ff00"] + marks["#4682b4"] + marks["#30374a"], message).toBe(0);
  };
  // The default theme's Points fill, Arrows color and Text color.
  await check({ points: "#4c78a8", arrows: "#4c78a8", text: "#344054" });
  await page.evaluate(() => window.colorFixture.solidTheme.replace({ extends: "dark" }));
  await check({ points: "#60a5fa", arrows: "#60a5fa", text: "#e5e7eb" });
  // A Points3D entry of the theme's own wins over the Points fill.
  await page.evaluate(() => window.colorFixture.solidTheme.replace({ extends: "dark", marks: { Points3D: { fill: "#e45756" } } }));
  await check({ points: "#e45756", arrows: "#60a5fa", text: "#e5e7eb" });
});

test("Rect, Histogram, Bar and Prism with no fill take the theme's first palette color and follow a theme change; explicit and mapped fills keep theirs (TODO 73.6)", async ({ page }) => {
  await page.waitForFunction(() => window.colorFixture.plots.filled?.whenSettled);
  // Pixels of each color in a band around each mark's center (data x, the plot spanning 0-100).
  const bands = (colors) => page.evaluate(async (colors) => {
    const plot = window.colorFixture.plots.filled;
    await plot.whenSettled();
    const bitmap = await createImageBitmap(await plot.exportPNG({ scale: 2 }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    const rgb = (color) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
    return Object.fromEntries([["rect", 7], ["histogram", 24], ["bar", 40], ["prism", 55], ["explicit", 71], ["mapped", 88]].map(([mark, center]) => {
      const counts = {};
      for (const color of colors) {
        const [r, g, b] = rgb(color);
        let n = 0;
        for (let y = 0; y < height; y++)
          for (let x = Math.round(((center - 2) / 100) * width); x <= Math.round(((center + 2) / 100) * width); x++) {
            const i = (y * width + x) * 4;
            if (Math.abs(data[i] - r) < 6 && Math.abs(data[i + 1] - g) < 6 && Math.abs(data[i + 2] - b) < 6) n++;
          }
        counts[color] = n;
      }
      return [mark, counts];
    }));
  }, colors);
  const check = async (expected) => {
    const counts = await bands([...new Set(Object.values(expected)), "#547ba2", "#ff8800", "#0000ff"]);
    const message = JSON.stringify({ expected, counts });
    for (const [mark, color] of Object.entries(expected)) expect(counts[mark][color], `${mark} ${message}`).toBeGreaterThan(1000);
    expect(counts.explicit["#ff8800"], message).toBeGreaterThan(1000);
    expect(counts.mapped["#0000ff"], message).toBeGreaterThan(1000);
    // The marks' old default fill.
    expect(Object.values(counts).reduce((sum, band) => sum + band["#547ba2"], 0), message).toBe(0);
  };
  // The default theme's first palette color, then dark's.
  await check({ rect: "#4c78a8", histogram: "#4c78a8", bar: "#4c78a8", prism: "#4c78a8" });
  await page.evaluate(() => window.colorFixture.solidTheme.replace({ extends: "dark" }));
  await check({ rect: "#60a5fa", histogram: "#60a5fa", bar: "#60a5fa", prism: "#60a5fa" });
  // A custom palette, and a Rect entry of the theme's own, which Histogram's bars (Rects) take too.
  await page.evaluate(() => window.colorFixture.solidTheme.replace({ extends: "dark", palette: ["#e45756", "#72b7b2"],
    marks: { Rect: { fill: "#ffd84d" } } }));
  await check({ rect: "#ffd84d", histogram: "#ffd84d", bar: "#e45756", prism: "#e45756" });
});
