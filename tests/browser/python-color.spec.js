import { test, expect } from "./fixtures.js";

// 7C: Python snapshots rendered through /test/notebook. Fixtures come from Python:
// notebook-7c-color.json (plots "theme", "uint8", "rows", "image", "solid") and
// notebook-42_rgb_and_colormaps.json (python/examples/42_rgb_and_colormaps.py).

// Pixels of a named Plot's PNG export (Plot nodes are found by `name`, or by order).
async function exportPixels(page, which) {
  const { rgba, ...result } = await page.evaluate(async (which) => {
    const plots = [];
    const walk = (node) => { if (node.kind === "Plot") plots.push(node); (node.children ?? []).forEach(walk); };
    walk(window.notebookState.root);
    const node = typeof which === "number" ? plots[which] : plots.find((plot) => plot.props.name === which);
    const plot = window.notebookRuntime.reference(node.id);
    await plot.whenSettled();
    const png = await plot.exportPNG(), bitmap = await createImageBitmap(png);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    const svg = new DOMParser().parseFromString(await (await plot.exportSVG()).blob.text(), 'image/svg+xml');
    const [,,w,h] = svg.documentElement.getAttribute('viewBox').split(/\s+/).map(Number);
    const centers = [...svg.querySelectorAll('circle')].map(c =>
      [Number(c.getAttribute('cx')) * width / w, Number(c.getAttribute('cy')) * height / h]);
    // Transfer the exact native RGBA bytes; boxing millions of pixel values for
    // DevTools transport takes much longer than rendering or inspecting them.
    let binary = "";
    for (let offset = 0; offset < data.length; offset += 32768)
      binary += String.fromCharCode(...data.subarray(offset, offset + 32768));
    return { rgba: btoa(binary), width, height, centers, error: plot.getRenderError?.() ?? "" };
  }, which);
  return { ...result, data: Buffer.from(rgba, "base64") };
}

// The five probe points along their row: [x fraction of the image, [r, g, b]] per wide run.
function probes({ data, width, centers }) {
  return centers.map(([x, y]) => {
    const i = (Math.round(y) * width + Math.round(x)) * 4;
    return [x / width, data.slice(i, i + 3)];
  });
}

const near = (actual, expected, tolerance = 12) =>
  actual.every((value, index) => Math.abs(value - expected[index]) <= tolerance);

test.describe("Python color fixtures", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/test/notebook?fixture=7c-color");
    await page.waitForFunction(() => window.notebookReady);
  });

  test("a continuous scale without a colormap inherits the theme's colormap", async ({ page }) => {
    const points = probes(await exportPixels(page, "theme"));
    expect(points.length).toBe(5);
    // Magma: 0 is near black and 0.5 is magenta (Viridis would give purple and teal).
    expect(Math.max(...points[0][1])).toBeLessThan(40);
    const [r, g, b] = points[2][1];
    expect(r).toBeGreaterThan(g + 60);
    expect(r).toBeGreaterThan(b);
  });

  test("uint8 columns through hm.rgb are 0-255 colors", async ({ page }) => {
    const shot = await exportPixels(page, "uint8");
    expect(shot.error).toBe("");
    const colors = probes(shot).map(([, color]) => color);
    expect(colors.length).toBe(5);
    [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [0, 0, 0]]
      .forEach((expected, index) => expect(near(colors[index], expected), `point ${index}: ${colors[index]}`).toBe(true));
  });

  test("a uint8 N x 3 array colors rows, and integer x and y land at their values", async ({ page }) => {
    const shot = await exportPixels(page, "rows");
    expect(shot.error).toBe("");
    const points = probes(shot);
    expect(points.length).toBe(5);
    [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [0, 0, 0]]
      .forEach((expected, index) => expect(near(points[index][1], expected), `point ${index}: ${points[index][1]}`).toBe(true));
    // x = 10, 30, ..., 90 are evenly spaced (decoding relative to the first value put them at 0, 20, ...).
    const gaps = points.slice(1).map(([x], index) => x - points[index][0]);
    for (const gap of gaps) expect(Math.abs(gap - gaps[0])).toBeLessThan(0.02);
    expect(points[0][0]).toBeGreaterThan(gaps[0] * 0.4);
  });

  test("a uint8 [H, W, 3] Image is 0-255", async ({ page }) => {
    const { data, error } = await exportPixels(page, "image");
    expect(error).toBe("");
    const counts = { red: 0, green: 0, blue: 0, yellow: 0 };
    const targets = { red: [128, 0, 0], green: [0, 128, 0], blue: [0, 0, 128], yellow: [128, 128, 0] };
    for (let i = 0; i < data.length; i += 4)
      for (const [name, [r, g, b]] of Object.entries(targets))
        if (Math.abs(data[i] - r) < 8 && Math.abs(data[i + 1] - g) < 8 && Math.abs(data[i + 2] - b) < 8) counts[name]++;
    for (const [name, count] of Object.entries(counts)) expect(count, name).toBeGreaterThan(400);
  });

  // TODO 69.17: under the dark theme, a Points3D, an Arrows3D and a Text3D with no color draw the
  // theme's Points fill, Arrows color (both #60a5fa) and Text color (#e5e7eb).
  test("Python 3D marks with no color take the theme's colors", async ({ page }) => {
    const { data, error } = await exportPixels(page, "solid");
    expect(error).toBe("");
    const count = ([r, g, b]) => {
      let n = 0;
      for (let i = 0; i < data.length; i += 4)
        if (Math.abs(data[i] - r) < 6 && Math.abs(data[i + 1] - g) < 6 && Math.abs(data[i + 2] - b) < 6) n++;
      return n;
    };
    const counts = { blue: count([0x60, 0xa5, 0xfa]), text: count([0xe5, 0xe7, 0xeb]),
      oldDefaults: count([0, 255, 0]) + count([0x46, 0x82, 0xb4]) + count([0x30, 0x37, 0x4a]) };
    expect(counts.blue, JSON.stringify(counts)).toBeGreaterThan(3000);
    expect(counts.text, JSON.stringify(counts)).toBeGreaterThan(150);
    expect(counts.oldDefaults, JSON.stringify(counts)).toBe(0);
  });
});

test("python/examples/42 renders its RGB grid and theme colormap", async ({ page }) => {
  await page.goto("/test/notebook?fixture=42_rgb_and_colormaps");
  await page.waitForFunction(() => window.notebookReady);
  const grid = await exportPixels(page, 0);
  expect(grid.error).toBe("");
  // The grid runs red with x and green with y, over a constant blue of 140. Only pixels whose
  // 3 x 3 neighborhood is inside a square count (antialiased edges blend toward white).
  const { data, width, height } = grid;
  const inked = (x, y) => Math.min(data[(y * width + x) * 4], data[(y * width + x) * 4 + 1], data[(y * width + x) * 4 + 2]) < 235;
  const interior = [];
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    let inside = true;
    for (let dy = -1; dy <= 1 && inside; dy++) for (let dx = -1; dx <= 1 && inside; dx++) inside = inked(x + dx, y + dy);
    if (inside) interior.push([x / width, y / height, ...data.slice((y * width + x) * 4, (y * width + x) * 4 + 3)]);
  }
  expect(interior.length).toBeGreaterThan(1000);
  // (Axis text also has inked neighborhoods; it is a small share.)
  expect(interior.filter(([, , , , blue]) => Math.abs(blue - 140) < 6).length).toBeGreaterThan(interior.length * 0.95);
  const mean = (rows, index) => rows.reduce((sum, row) => sum + row[index], 0) / rows.length;
  expect(mean(interior.filter(([x]) => x > 0.7), 2)).toBeGreaterThan(mean(interior.filter(([x]) => x < 0.3), 2) + 120);
  expect(mean(interior.filter(([, y]) => y < 0.3), 3)).toBeGreaterThan(mean(interior.filter(([, y]) => y > 0.7), 3) + 120);
  for (const index of [1, 2, 3]) expect((await exportPixels(page, index)).error).toBe("");
});
