import { test, expect } from "./fixtures.js";

const PLOTS = ["cluster", "band", "framed", "feedback", "explicit", "clicky", "faceted", "logband"];
// Page pixel for a root data position on a plot with domains [0, extent] x [0, extent],
// scrolled into view first.
async function pixelFor(page, key, [x, y], extent = 100) {
  return page.evaluate(async ({ key, x, y, extent, index }) => {
    const plot = window.nearbyFixture[key];
    for (let i = 0; i < 100 && !plot.getAxes()[0]?.getAxisLayout(); i++) await new Promise((r) => setTimeout(r, 50));
    await plot.whenSettled();
    const element = document.querySelectorAll("canvas")[index];
    element.scrollIntoView({ block: "center" });
    await new Promise((r) => requestAnimationFrame(r));
    const layout = plot.getAxes()[0].getAxisLayout(), canvas = element.getBoundingClientRect();
    return [canvas.left + layout.left + (x / extent) * (layout.right - layout.left),
      canvas.top + layout.bottom - (y / extent) * (layout.bottom - layout.top)];
  }, { key, x, y, extent, index: PLOTS.indexOf(key) });
}
// Count opaque and faded red pixels in a PNG export of one plot (see opacity.spec.js).
const census = (page, key) => page.evaluate(async (key) => {
  const plot = window.nearbyFixture[key];
  await plot.whenSettled();
  const png = await plot.exportPNG(), bitmap = await createImageBitmap(png);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  let darkRed = 0, lightRed = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    if (r > 150 && g < 90 && b < 90) darkRed++;
    else if (r > 225 && g > 120 && g < 235 && Math.abs(g - b) < 25 && r > g + 15) lightRed++;
  }
  return { darkRed, lightRed };
}, key);
// Rows currently in the nearby preview, read from the GPU mask.
const nearbyCount = (page, marks) => page.evaluate(async (marks) => {
  const binding = ((m) => m?.view.marks.of(m))(window.nearbyFixture[marks].getMark())?.interaction;
  const mask = binding.nearby.mask(binding.owner, binding.owner.length, "preview");
  return Array.from(await mask.data()).reduce((sum, v) => sum + Number(v), 0);
}, marks);

test("nearby counts every overplotted point under the pointer and clears on leave", async ({ page }) => {
  await page.goto("/test/nearby");
  await page.waitForFunction(() => ((m) => m?.view.marks.of(m))(window.nearbyFixture?.clusterPoints?.getMark())?.interaction);
  const [x, y] = await pixelFor(page, "cluster", [50, 50]);
  await page.mouse.move(x, y);
  await expect.poll(() => nearbyCount(page, "clusterPoints")).toBe(50);
  const constraints = await page.evaluate(() => {
    const b = ((m) => m?.view.marks.of(m))(window.nearbyFixture.clusterPoints.getMark())?.interaction;
    return b.nearby.getConstraints(b.owner);
  });
  expect(constraints).toHaveLength(1);
  expect(constraints[0].type).toBe("radius");
  // The size channel reads @nearby, so the stacked rows grow to 7 and the far ones stay 3.
  const sizes = () => page.evaluate(async () => {
    const field = window.nearbyFixture.clusterPoints.getMark().fields.get("size");
    await field.manager?.chain;
    const data = field.data?.ref ? Array.from(await field.data.ref.data()) : Array.from(field.data ?? []);
    const channels = data.length / 54; // 54 rows; size may carry several channels per row
    return [Math.max(...data), Math.min(...data), data.filter((v) => v === 7).length / channels];
  });
  await expect.poll(sizes).toEqual([7, 3, 50]);
  await page.mouse.move(x + 60, y); // 60 px away: outside the 24 px radius
  await expect.poll(() => nearbyCount(page, "clusterPoints")).toBe(0);
  await page.mouse.move(x, y);
  await expect.poll(() => nearbyCount(page, "clusterPoints")).toBe(50);
  await page.mouse.move(2, 2); // leave the canvas
  await expect.poll(() => nearbyCount(page, "clusterPoints")).toBe(0);
  await expect.poll(sizes).toEqual([3, 3, 0]);
});

test("axis x in data units selects the whole column under the pointer", async ({ page }) => {
  await page.goto("/test/nearby");
  await page.waitForFunction(() => ((m) => m?.view.marks.of(m))(window.nearbyFixture?.bandPoints?.getMark())?.interaction);
  const [x, y] = await pixelFor(page, "band", [31, 90]);
  await page.mouse.move(x, y);
  await expect.poll(() => nearbyCount(page, "bandPoints")).toBe(10);
  // The center is the data value under the pointer, not one rescaled by the axis margins.
  const center = await page.evaluate(() => {
    const b = ((m) => m?.view.marks.of(m))(window.nearbyFixture.bandPoints.getMark())?.interaction;
    return b.nearby.getConstraints(b.owner)[0].center.x;
  });
  expect(center).toBeCloseTo(31, 0);
  const [x2] = await pixelFor(page, "band", [50, 50]);
  await page.mouse.move(x2, y);
  await expect.poll(() => nearbyCount(page, "bandPoints")).toBe(0);
});

test("a data radius on a log axis is measured after the log", async ({ page }) => {
  await page.goto("/test/nearby");
  await page.waitForFunction(() => ((m) => m?.view.marks.of(m))(window.nearbyFixture?.logbandPoints?.getMark())?.interaction);
  // Log x over [1, 1000]: data v sits at 100 * log10(v) / 3 percent of the width.
  const at = (v) => pixelFor(page, "logband", [100 * Math.log10(v) / 3, 50]);
  await page.mouse.move(...await at(15)); // within a factor of 2 of 10, but 5 data units away
  await expect.poll(() => nearbyCount(page, "logbandPoints")).toBe(10);
  const constraint = await page.evaluate(() => {
    const b = ((m) => m?.view.marks.of(m))(window.nearbyFixture.logbandPoints.getMark())?.interaction;
    return b.nearby.getConstraints(b.owner)[0];
  });
  expect(constraint.transform).toEqual({ x: "log" });
  expect(constraint.center.x).toBeCloseTo(15, 0);
  await page.mouse.move(...await at(40)); // 10 and 100 are both more than a factor of 2 away
  await expect.poll(() => nearbyCount(page, "logbandPoints")).toBe(0);
  await page.mouse.move(...await at(150));
  await expect.poll(() => nearbyCount(page, "logbandPoints")).toBe(10);
});

test("nearby follows a child frame's mapping", async ({ page }) => {
  await page.goto("/test/nearby");
  await page.waitForFunction(() => ((m) => m?.view.marks.of(m))(window.nearbyFixture?.framedPoints?.getMark())?.interaction);
  // Child x 50 maps into parent x 75 (child range [50, 100]).
  const [x, y] = await pixelFor(page, "framed", [75, 50]);
  await page.mouse.move(x, y);
  await expect.poll(() => nearbyCount(page, "framedPoints")).toBe(50);
  const [x2] = await pixelFor(page, "framed", [50, 50]); // parent 50 is child 0: nothing there
  await page.mouse.move(x2, y);
  await expect.poll(() => nearbyCount(page, "framedPoints")).toBe(0);
});

test("nearby in embedded facet cells matches only the cell under the pointer", async ({ page }) => {
  await page.goto("/test/nearby");
  await page.waitForFunction(() => window.nearbyFixture?.facet?.getFrames()?.length === 2);
  // Page pixel of y = 50 at a category tick of the facet's x axis (one cell per tick).
  const cell = (label) => page.evaluate(async (label) => {
    const plot = window.nearbyFixture.faceted;
    await plot.whenSettled();
    const element = document.querySelectorAll("canvas")[6];
    element.scrollIntoView({ block: "center" });
    await new Promise((r) => requestAnimationFrame(r));
    const layout = plot.getAxes()[0].getAxisLayout(), rect = element.getBoundingClientRect();
    const tick = layout.x.major.find((t) => t.label === label);
    // The fixture's y domain is [0, 100]; 50 is its midpoint, whether or not it is a tick.
    return [rect.left + tick.fraction * rect.width, rect.top + (layout.top + layout.bottom) / 2];
  }, label);
  // Rows 0-9 are cell a and rows 10-19 cell b; every row sits at (50, 50) of its own cell.
  const rows = () => page.evaluate(async () => {
    const owner = window.nearbyFixture.faceted.getSelection().owner;
    return Array.from(await owner.nearby.mask(owner, owner.length, "preview").data()).join("");
  });
  const [ax, ay] = await cell("a"), [bx] = await cell("b");
  await page.mouse.move(ax, ay);
  await expect.poll(rows).toBe("1".repeat(10) + "0".repeat(10));
  await page.mouse.move(bx, ay);
  await expect.poll(rows).toBe("0".repeat(10) + "1".repeat(10));
  await page.mouse.move((ax + bx) / 2, ay); // between the cells: nothing within 24 px
  await expect.poll(rows).toBe("0".repeat(20));
  expect(await page.evaluate(() => window.nearbyFixture.faceted.getRenderError())).toBe("");
});

test("200 moves in one frame make at most two updates and no readbacks, with picking live", async ({ page }) => {
  await page.goto("/test/nearby");
  await page.waitForFunction(() => ((m) => m?.view.marks.of(m))(window.nearbyFixture?.clickyPoints?.getMark())?.interaction);
  const [x, y] = await pixelFor(page, "clicky", [50, 50]);
  await page.mouse.move(x, y); // let the pick pass for this plot come up to date
  await expect.poll(() => nearbyCount(page, "clickyPoints")).toBe(50);
  const counts = await page.evaluate(async ([x, y]) => {
    const mark = window.nearbyFixture.clickyPoints.getMark(), binding = ((m) => m?.view.marks.of(m))(mark)?.interaction;
    const counts = { updates: 0, pickReads: 0, otherReads: 0, arrayReads: 0,
      picking: mark.view.picking.context.current?.interactiveObjects.length ?? 0 };
    const set = binding.nearby.setConstraints;
    binding.nearby.setConstraints = (...args) => { counts.updates++; return set.apply(binding.nearby, args); };
    // Every GPU buffer read, split into the picking system's pixel reads and anything else.
    const mapAsync = GPUBuffer.prototype.mapAsync;
    GPUBuffer.prototype.mapAsync = function (...args) {
      new Error().stack.includes("readPixel") ? counts.pickReads++ : counts.otherReads++;
      return mapAsync.apply(this, args);
    };
    // Every JAX array read back to the host (a count or mask readback).
    const probe = binding.nearby.mask(binding.owner, binding.owner.length), proto = Object.getPrototypeOf(probe);
    probe.dispose();
    const reads = Object.fromEntries(["data", "dataSync", "js", "jsAsync"].map((key) => [key, proto[key]]));
    for (const key in reads) proto[key] = function (...args) { counts.arrayReads++; return reads[key].apply(this, args); };
    try {
      // 200 moves inside one task: one animation frame for all of them.
      const canvas = document.querySelectorAll("canvas")[5];
      for (let i = 0; i < 200; i++)
        canvas.dispatchEvent(new PointerEvent("pointermove", { clientX: x + (i % 20) - 10, clientY: y + (i % 7) - 3,
          bubbles: true, pointerType: "mouse", pointerId: 1 }));
      for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => setTimeout(r, 300));
    } finally {
      binding.nearby.setConstraints = set;
      GPUBuffer.prototype.mapAsync = mapAsync;
      Object.assign(proto, reads);
    }
    return counts;
  }, [x, y]);
  expect(counts.picking).toBeGreaterThan(0); // the onclick mark keeps picking live
  expect(counts.pickReads).toBeGreaterThan(0); // and the read hook sees its reads
  expect(counts.updates).toBeGreaterThan(0);
  expect(counts.updates).toBeLessThanOrEqual(2);
  expect(counts.otherReads).toBe(0);
  expect(counts.arrayReads).toBe(0);
  await expect.poll(() => nearbyCount(page, "clickyPoints")).toBe(50);
});

test("Escape over the plot clears nearby", async ({ page }) => {
  await page.goto("/test/nearby");
  await page.waitForFunction(() => ((m) => m?.view.marks.of(m))(window.nearbyFixture?.clusterPoints?.getMark())?.interaction);
  const [x, y] = await pixelFor(page, "cluster", [50, 50]);
  await page.mouse.move(x, y);
  await expect.poll(() => nearbyCount(page, "clusterPoints")).toBe(50);
  await page.locator('[aria-label="Plot canvas"]').first().focus();
  await page.keyboard.press("Escape");
  await expect.poll(() => nearbyCount(page, "clusterPoints")).toBe(0);
  await expect.poll(() => page.evaluate(() => ((m) => m?.view.marks.of(m))(window.nearbyFixture.clusterPoints.getMark())?.interaction.nearby.previewActive)).toBe(false);
});

test("marks that cannot produce nearby say why", async ({ page }) => {
  await page.goto("/test/nearby-errors");
  await page.waitForFunction(() => window.nearbyErrors?.literal);
  const error = (key) => page.evaluate((key) => window.nearbyErrors[key].getRenderError(), key);
  // The point kinds come from their declarations (utils/markKinds.js, TODO 32.7).
  await expect.poll(() => error("line")).toBe("Line: nearby is supported by point marks (Points, Points3D, Text) in Cartesian 2D; Line may still respond to @nearby.");
  await expect.poll(() => error("view3d")).toBe("Points: nearby is supported by point marks in Cartesian 2D; this Points is not in a Cartesian 2D view.");
  await expect.poll(() => error("rotated")).toBe("Points: Points cannot use nearby in a rotated Frame; it can still respond to @nearby.");
  await expect.poll(() => error("literal")).toBe("Points: Points nearby needs x or y to name a one-dimensional data column.");
});

test("nearby fades the other points only while something is nearby", async ({ page }) => {
  await page.goto("/test/nearby");
  await page.waitForFunction(() => ((m) => m?.view.marks.of(m))(window.nearbyFixture?.feedbackPoints?.getMark())?.interaction);
  await page.mouse.move(2, 2);
  await expect.poll(async () => (await census(page, "feedback")).darkRed).toBeGreaterThan(800);
  const rest = await census(page, "feedback");
  // Empty plot space: the pointer is inside the plot, but no point is within 24 px.
  const [ex, ey] = await pixelFor(page, "feedback", [25, 40], 50);
  await page.mouse.move(ex, ey);
  await expect.poll(() => page.evaluate(() => ((m) => m?.view.marks.of(m))(window.nearbyFixture.feedbackPoints.getMark())?.interaction.nearby.previewActive)).toBe(true);
  const empty = await census(page, "feedback");
  expect(empty.darkRed).toBeGreaterThan(rest.darkRed * 0.9);
  expect(empty.lightRed).toBeLessThan(rest.lightRed + 100);
  // On the first point: it stays opaque and the other three fade.
  const [px, py] = await pixelFor(page, "feedback", [10, 15], 50);
  await page.mouse.move(px, py);
  await expect.poll(async () => (await census(page, "feedback")).darkRed).toBeLessThan(rest.darkRed * 0.45);
  const near = await census(page, "feedback");
  expect(near.darkRed).toBeGreaterThan(rest.darkRed * 0.1);
  expect(near.lightRed).toBeGreaterThan(rest.lightRed + 200);
});

// The explicit mark also reads opacity from an expression, so its feedback takes the multi-mask path.
test("an explicit nearby resource lights the near point instead of dimming every point", async ({ page }) => {
  await page.goto("/test/nearby");
  await page.waitForFunction(() => ((m) => m?.view.marks.of(m))(window.nearbyFixture?.explicitPoints?.getMark())?.interaction);
  await page.mouse.move(2, 2);
  await expect.poll(async () => (await census(page, "explicit")).darkRed).toBeGreaterThan(800);
  const rest = await census(page, "explicit");
  const [ex, ey] = await pixelFor(page, "explicit", [25, 40], 50);
  await page.mouse.move(ex, ey);
  await expect.poll(() => page.evaluate(() => window.nearbyFixture.pointer.previewActive)).toBe(true);
  expect((await census(page, "explicit")).darkRed).toBeGreaterThan(rest.darkRed * 0.9); // nothing near: no fading
  const [px, py] = await pixelFor(page, "explicit", [10, 15], 50);
  await page.mouse.move(px, py);
  await expect.poll(() => page.evaluate(() => {
    const { explicitPoints, pointer } = window.nearbyFixture;
    return pointer.previewActive && ((m) => m?.view.marks.of(m))(explicitPoints.getMark())?.interaction.nearby === pointer;
  })).toBe(true);
  await expect.poll(async () => (await census(page, "explicit")).darkRed).toBeLessThan(rest.darkRed * 0.45);
  const near = await census(page, "explicit");
  expect(near.darkRed).toBeGreaterThan(rest.darkRed * 0.1); // the near point stays opaque
  expect(near.lightRed).toBeGreaterThan(rest.lightRed + 200); // the other three fade
});
