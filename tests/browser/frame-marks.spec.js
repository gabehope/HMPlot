import { test, expect } from "./fixtures.js";

// Export a plot as PNG, locate each colored probe point by the centroid of its pixels,
// and sample the color between pairs of probes: midway, or at fraction t of [a, b, t].
async function sample(page, key, pairs, columns = []) {
  return page.evaluate(async ({ key, pairs, columns }) => {
    const plot = window.frameMarks[key];
    for (let attempt = 0; attempt < 100 && !plot.getAxes()[0]?.getAxisLayout(); attempt++)
      await new Promise((resolve) => setTimeout(resolve, 50));
    await plot.whenSettled();
    let png;
    for (let attempt = 0; attempt < 100 && !png; attempt++) {
      try { png = await plot.exportPNG(); } catch { await new Promise((resolve) => setTimeout(resolve, 50)); }
    }
    const bitmap = await createImageBitmap(png);
    const canvas = document.createElement("canvas");
    // Distances and pointer coordinates in this helper are CSS pixels.
    const live = document.querySelectorAll(".canvas canvas")[{ nonlinear: 0, anchored: 1, sloped: 3 }[key]];
    canvas.width = live.clientWidth; canvas.height = Math.round(bitmap.height * live.clientWidth / bitmap.width);
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    // Rendering shifts exact colors, so classify by which channels are high:
    // green, magenta, cyan, yellow probes vs. the red rect, blue ribbon and gray axes.
    const over = (a, b) => a > b + 60;
    const classes = [
      (r, g, b) => over(g, r) && over(g, b),
      (r, g, b) => over(r, g) && over(b, g),
      (r, g, b) => over(g, r) && over(b, r),
      (r, g, b) => over(r, b) && over(g, b),
    ];
    const probes = classes.map((match) => {
      let sx = 0, sy = 0, n = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (match(data[i], data[i + 1], data[i + 2])) { sx += x; sy += y; n++; }
      }
      return n > 4 ? [sx / n, sy / n] : null;
    });
    const pixel = ([x, y]) => [...context.getImageData(Math.round(x), Math.round(y), 1, 1).data];
    const pixels = pairs.map(([a, b, t = 0.5]) => probes[a] && probes[b]
      ? pixel([probes[a][0] + (probes[b][0] - probes[a][0]) * t, probes[a][1] + (probes[b][1] - probes[a][1]) * t]) : null);
    // Every pixel down the column through probe a, from a to b.
    const column = columns.map(([a, b]) => {
      if (!probes[a] || !probes[b]) return null;
      const x = Math.round(probes[a][0]), out = [];
      for (let y = Math.round(probes[a][1]); y <= Math.round(probes[b][1]); y++) out.push([y, ...pixel([x, y]).slice(0, 3)]);
      return out;
    });
    return { error: plot.getRenderError(), probes, pixels, column };
  }, { key, pairs, columns });
}
// Count red pixels in a plot's PNG export.
async function redPixels(page, key) {
  return page.evaluate(async (key) => {
    const plot = window.frameMarks[key];
    await plot.whenSettled();
    const bitmap = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] > data[i + 1] + 60 && data[i] > data[i + 2] + 60) count++;
    return count;
  }, key);
}
const isRed = ([r, g, b]) => r > 180 && g < 80 && b < 80;
const isBlue = ([r, g, b]) => b > 180 && r < 80 && g < 80;

test("rects and ribbons render inside a log-parent range frame", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/test/frame-marks");
  await page.waitForFunction(() => window.frameMarks);
  const state = await sample(page, "nonlinear", [[0, 1], [2, 3]]);
  expect(state.error).toBe("");
  expect(state.probes.every(Boolean)).toBe(true);
  // Child x 40 and 60 map to parent 406 and 604 on a log axis: the rect is narrower in
  // pixels than its height would suggest from a linear parent, but still axis-aligned.
  expect(state.probes[1][0]).toBeGreaterThan(state.probes[0][0]);
  expect(state.probes[1][1]).toBeLessThan(state.probes[0][1]); // y up
  expect(isRed(state.pixels[0])).toBe(true);
  expect(isBlue(state.pixels[1])).toBe(true);
  expect(errors).toEqual([]);
});

test("a sloped band edge in a log-parent frame follows the Line drawn along it", async ({ page }) => {
  await page.goto("/test/frame-marks");
  await page.waitForFunction(() => window.frameMarks?.sloped);
  // Probes at child (50, 70) and (50, 10); the band's upper edge and the Line pass (50, 50),
  // at t = 1/3 between them. A chord between the interval's mapped endpoints would put the
  // edge at child y 69 in this column instead.
  const state = await sample(page, "sloped", [[0, 1, 7/30], [0, 1, 13/30]], [[0, 1]]);
  expect(state.error).toBe("");
  expect(state.probes[0] && state.probes[1]).toBeTruthy();
  const [above, below] = state.pixels;
  expect(isBlue(above)).toBe(false); // child y 56
  expect(Math.min(...above.slice(0, 3))).toBeGreaterThan(200);
  expect(isBlue(below)).toBe(true); // child y 44
  // Down the column, the band starts where the Line is drawn.
  const column = state.column[0];
  const top = column.find(([, r, g, b]) => isBlue([r, g, b]))[0];
  const line = column.filter(([, r, g, b]) => Math.max(r, g, b) < 90).map(([y]) => y);
  const edge = state.probes[0][1] + (state.probes[1][1] - state.probes[0][1]) / 3;
  expect(line.length).toBeGreaterThan(0);
  expect(Math.abs(top - edge)).toBeLessThan(4); // one-pixel line overlaps the first filled row
  expect(Math.abs((Math.min(...line) + Math.max(...line)) / 2 - edge)).toBeLessThan(2);
});

// Count pixels of each family's color near where the log-parent frame maps a child point.
// Probes at child (0, 0) and (100, 100) calibrate x = log10(10 + 0.9 * childX) and linear y.
async function familyPixels(page, checks) {
  return page.evaluate(async (checks) => {
    const plot = window.frameMarks.families;
    for (let attempt = 0; attempt < 100 && !plot.getAxes()[0]?.getAxisLayout(); attempt++)
      await new Promise((resolve) => setTimeout(resolve, 50));
    await plot.whenSettled();
    const bitmap = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    const colors = {
      green: (r, g, b) => g > r + 60 && g > b + 60, magenta: (r, g, b) => r > g + 60 && b > g + 60,
      blue: (r, g, b) => b > r + 60 && b > g + 60, red: (r, g, b) => r > g + 60 && r > b + 60,
      teal: (r, g, b) => g > r + 60 && b > r + 60, olive: (r, g, b) => r > b + 60 && g > b + 60 && Math.abs(r - g) < 40,
      orange: (r, g, b) => r > 180 && b < 100 && g > 100 && r > g + 20,
    };
    const centroid = (match) => {
      let sx = 0, sy = 0, n = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (match(data[i], data[i + 1], data[i + 2])) { sx += x; sy += y; n++; }
      }
      return [sx / n, sy / n];
    };
    const [g, m] = [centroid(colors.green), centroid(colors.magenta)];
    const at = ([x, y]) => [g[0] + (Math.log10(10 + 0.9 * x) - 1) * (m[0] - g[0]), g[1] + y / 100 * (m[1] - g[1])];
    return { error: plot.getRenderError(), counts: checks.map(({ color, point, pixel, radius }) => {
      const [cx, cy] = pixel ? [g[0] + pixel[0] * (m[0] - g[0]), g[1] + pixel[1] * (m[1] - g[1])] : at(point);
      let n = 0;
      for (let y = Math.round(cy - radius); y <= Math.round(cy + radius); y++)
        for (let x = Math.round(cx - radius); x <= Math.round(cx + radius); x++) {
          const i = (y * width + x) * 4;
          if (colors[color](data[i], data[i + 1], data[i + 2])) n++;
        }
      return n;
    }) };
  }, checks);
}

test("links, text, areas, error bars and prisms follow a log-parent frame", async ({ page }) => {
  await page.goto("/test/frame-marks");
  await page.waitForFunction(() => window.frameMarks?.families);
  const { error, counts } = await familyPixels(page, [
    // The cubic link is built in data space and each sample mapped, like Line: its midpoint
    // is at child (50, 60). Mapping the control points first and evaluating the curve after
    // would put the midpoint half-way across the child's parent interval instead, which is
    // log10 1.5 of [1, 2]: 0.5 of the calibrated span at the same height.
    { color: "blue", point: [50, 60], radius: 2 },
    { color: "blue", pixel: [0.5, 0.6], radius: 3 },
    { color: "orange", point: [80, 12], radius: 2 },
    { color: "teal", point: [20, 15], radius: 1 },
    { color: "olive", point: [42, 12], radius: 1 },
    { color: "red", point: [80, 45], radius: 16 },
  ]);
  expect(error).toBe("");
  const [link, linkIfMappedFirst, area, errorBar, prism, text] = counts;
  expect(link).toBeGreaterThan(3);
  expect(linkIfMappedFirst).toBe(0);
  expect(area).toBe(25);
  expect(errorBar).toBe(9);
  expect(prism).toBe(9);
  expect(text).toBeGreaterThan(10);
});

// TODO 69: a straight line from a log parent's low end needed more than the 256 pieces a segment
// may have to meet the tolerance at each parameter (at a device pixel ratio of 2, also the
// gallery's frame-mark-families), so it drew nothing, logged an error and refused PNG export.
test.describe("at a device pixel ratio of 2", () => {
  test.use({ deviceScaleFactor: 2 });
  test("a straight line across a log parent from its low end draws and exports", async ({ page }) => {
    await page.goto("/test/frame-marks");
    await page.waitForFunction(() => window.frameMarks?.lowEnd?.getAxes()[0]?.getAxisLayout());
    // Two decades of a 650 px plot, 3 px wide, in device pixels: about 800 by 6.
    expect(await redPixels(page, "lowEnd")).toBeGreaterThan(3000);
    expect(await page.evaluate(() => window.frameMarks.lowEnd.getRenderError())).toBe("");
  });
});

test("moving an anchored frame does not rebuild mark materials", async ({ page }) => {
  await page.goto("/test/frame-marks");
  await page.waitForFunction(() => window.frameMarks?.anchoredRect?.getMark() && window.frameMarks.anchored.getAxes()[0]?.getAxisLayout());
  const result = await page.evaluate(async () => {
    const { anchored, anchoredRect, moveAnchor } = window.frameMarks;
    await anchored.whenSettled();
    const mark = anchoredRect.getMark(), build = mark.build.bind(mark);
    let builds = 0;
    mark.build = (...args) => { builds++; return build(...args); };
    for (let i = 0; i < 60; i++) {
      moveAnchor([40 + (i % 20), 45 + (i % 10)]);
      if (i % 10 === 9) await anchored.whenSettled();
    }
    await anchored.whenSettled();
    let node = mark.options;
    while (node && !node.frameDefinition?.placement) node = node.defaults;
    return { builds, error: anchored.getRenderError(), same: anchoredRect.getMark() === mark,
      anchor: node?.frameDefinition.placement.anchor };
  });
  expect(result.error).toBe("");
  expect(result.same).toBe(true);
  expect(result.anchor).toEqual([59, 54]); // the last move actually re-placed the frame
  expect(result.builds).toBe(0);
});

test("rects and Text3D follow anchored frames", async ({ page }) => {
  await page.goto("/test/frame-marks");
  await page.waitForFunction(() => window.frameMarks);
  const state = await sample(page, "anchored", [[0, 1], [2, 3]]);
  expect(state.error).toBe("");
  expect(state.probes.every(Boolean)).toBe(true);
  expect(state.probes[1][0] - state.probes[0][0]).toBeCloseTo(40, -1); // 2 of 10 units across 200 px
  expect(isRed(state.pixels[0])).toBe(true);
  expect(isRed(state.pixels[1])).toBe(false);
  // Picking inside the anchored frame reports the frame and local data coordinates.
  const center = [(state.probes[0][0] + state.probes[1][0]) / 2, (state.probes[0][1] + state.probes[1][1]) / 2];
  const hit = await page.evaluate(async ([x, y]) => {
    const canvas = document.querySelectorAll("canvas")[1].getBoundingClientRect();
    const picking = window.frameMarks.anchoredRect.getMark().view.picking.context.current;
    const result = await picking.pickAt(canvas.left + x, canvas.top + y);
    const anchoredKey = window.frameMarks.anchored.getFrames().map((f) => f.getFrameOptions())
      .find((options) => options.frameDefinition?.placement)?.axisFrameKey;
    return result && { frame: result.frame, anchoredKey, x: result.axisValue?.x, y: result.axisValue?.y };
  }, center);
  expect(hit?.anchoredKey).toBeTruthy();
  expect(hit.frame).toBe(hit.anchoredKey); // not merely truthy: the root frame has a key too
  expect(hit.x).toBeCloseTo(5, 0);
  expect(hit.y).toBeCloseTo(5, 0);
  // Text is a Text: it maps through the anchored placement on the GPU. Its
  // red glyphs (the only red in that plot) center on the inset's (5, 5), the
  // plot center, since the inset is centered at parent (50, 50).
  expect(await page.evaluate(() => window.frameMarks.anchoredText.getRenderError())).toBe("");
  const glyphs = await page.evaluate(async () => {
    const plot = window.frameMarks.anchoredText;
    await plot.whenSettled();
    const bitmap = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height), xs = [], ys = [];
    for (let i = 0; i < data.length; i += 4) if (data[i] > data[i + 1] + 60 && data[i] > data[i + 2] + 60) {
      xs.push((i / 4) % canvas.width); ys.push(Math.floor(i / 4 / canvas.width));
    }
    const l=plot.getAxisLayout(),scale=canvas.width/document.querySelectorAll("canvas")[2].clientWidth;
    return { size: [(l.left+l.right)*scale,(l.top+l.bottom)*scale], count: xs.length,
      center: xs.length ? [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2] : null };
  });
  expect(glyphs.count).toBeGreaterThan(20);
  expect(Math.abs(glyphs.center[0] - glyphs.size[0] / 2)).toBeLessThan(3);
  expect(Math.abs(glyphs.center[1] - glyphs.size[1] / 2)).toBeLessThan(3);
});

test("each mark prepares once on mount when the frame check does not change", async ({ page }) => {
  await page.goto("/test/frame-marks");
  await page.waitForFunction(() => window.frameMarks?.plain?.getAxes()[0]?.getAxisLayout());
  const count = () => page.evaluate(async () => {
    const plot = window.frameMarks.plain;
    await plot.whenSettled();
    await new Promise((resolve) => setTimeout(resolve, 300));
    return plot.getDiagnostics().markPreparations;
  });
  // Three marks: the Plot's own topology announcement must not prepare each one twice.
  expect(await count()).toBe(3);
  expect(await count()).toBe(3); // and stays there once settled
});

test("GeoJSON reports that it cannot render in anchored or nonlinear frames, and draws nothing", async ({ page }) => {
  await page.goto("/test/frame-marks");
  await page.waitForFunction(() => window.frameMarks?.geoAnchored && window.frameMarks?.geoNonlinear);
  for (const [key, frame] of [["geoAnchored", "anchored"], ["geoNonlinear", "nonlinear"]]) {
    await expect.poll(() => page.evaluate((key) => window.frameMarks[key].getRenderError(), key))
      .toMatch(new RegExp(`GeoJSON: GeoJSON triangulates its features in data space and does not support ${frame} Frames`));
    expect(await redPixels(page, key)).toBe(0);
  }
});
