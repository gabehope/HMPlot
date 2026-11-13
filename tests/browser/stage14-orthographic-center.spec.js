import { test, expect } from "./fixtures.js";
import { installGpuCounters, countMarkBuilds, gpuCounters, countersDelta } from "./gpu-counters.js";

test.use({ deviceScaleFactor: 2 });

// Measure the rendered surface feature in CSS pixels, the same space as pointer events.
async function bluePoint(page) {
  return page.evaluate(async () => {
    const plot = window.stage14Orthographic.plot;
    await plot.whenSettled();
    const image = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0); image.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let x = 0, y = 0, count = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const [r, g, b, a] = pixels.subarray(i, i + 4);
      if (a > 128 && b > 90 && b > r * 1.3 && b > g * 1.05) {
        x += (i / 4) % canvas.width + 0.5;
        y += Math.floor(i / 4 / canvas.width) + 0.5;
        count++;
      }
    }
    const box = document.querySelector("canvas").getBoundingClientRect();
    return { x: x / count * box.width / canvas.width, y: y / count * box.height / canvas.height, count };
  });
}

test("surface pixels follow drag, wheel and pinch anchors", async ({ page }) => {
  await page.goto("/test/stage14-orthographic-center");
  await page.locator('.canvas[aria-busy="false"]').waitFor();
  const box = await page.locator("canvas").boundingBox(), initial = await bluePoint(page);
  expect(initial.count).toBeGreaterThan(100);
  const target = { x: initial.x + 40, y: initial.y + 20 };
  await page.mouse.move(box.x + initial.x, box.y + initial.y);
  await page.mouse.down();
  await page.mouse.move(box.x + target.x, box.y + target.y, { steps: 8 });
  await page.mouse.up();
  const error = async (at) => {
    const rendered = await bluePoint(page);
    return Math.hypot(rendered.x - at.x, rendered.y - at.y);
  };
  await expect.poll(() => error(target)).toBeLessThan(1);
  await page.mouse.wheel(0, -400);
  await expect.poll(() => page.evaluate(() => window.stage14Orthographic.plot.getViewport().zoom)).toBeGreaterThan(1.1);
  await expect.poll(() => error(target)).toBeLessThan(1);

  const cdp = await page.context().newCDPSession(page);
  const fingers = (step) => [0, 1].map((id) => ({ id,
    x: box.x + target.x + step * 2 + (id ? 1 : -1) * (30 + step * 2),
    y: box.y + target.y + step,
  }));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: fingers(0) });
  for (let step = 1; step <= 8; step++)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: fingers(step) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => error({ x: target.x + 16, y: target.y + 8 })).toBeLessThan(1.5);
});

test("explicit orthographic center changes the visible hemisphere", async ({ page }) => {
  await page.goto("/test/stage14-orthographic-center");
  await page.waitForFunction(() => window.stage14Orthographic?.plot?.whenSettled);
  await page.locator("canvas").waitFor();
  const colors = () => page.evaluate(async () => {
    const plot = window.stage14Orthographic.plot;
    await plot.whenSettled();
    const image = await createImageBitmap(await plot.exportPNG());
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0); image.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let blue = 0, orange = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const [r, g, b, a] = pixels.subarray(offset, offset + 4);
      if (a < 128) continue;
      if (b > 90 && b > r * 1.3 && b > g * 1.05) blue++;
      if (r > 130 && r > g * 1.3 && r > b * 1.3) orange++;
    }
    return { blue, orange, error: plot.getRenderError() };
  });
  await expect.poll(async () => (await colors()).blue).toBeGreaterThan(100);
  expect((await colors()).orange).toBe(0);
  await page.evaluate(() => window.stage14Orthographic.center([-60, 0]));
  await expect.poll(async () => (await colors()).orange).toBeGreaterThan(100);
  expect((await colors()).blue).toBe(0);
  expect((await colors()).error).toBe("");
  await page.evaluate(() => window.stage14Orthographic.plot.setViewport({ center: [60, 0] }));
  await expect.poll(() => page.evaluate(() =>
    window.stage14Orthographic.plot.getViewport().center?.[0])).toBe(60);
  await expect.poll(async () => (await colors()).blue).toBeGreaterThan(100);
  const canvas = page.getByRole("application", { name: "Plot canvas" });
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  const dragged = await page.evaluate(() => window.stage14Orthographic.plot.getViewport());
  expect(dragged.center[0]).toBeLessThan(60);
  expect([dragged.x, dragged.y]).toEqual([0.5, 0.5]);
  await page.mouse.wheel(0, -150);
  await expect.poll(() => page.evaluate(() =>
    window.stage14Orthographic.plot.getViewport().zoom)).toBeGreaterThan(1);
  const zoomed = await page.evaluate(() => window.stage14Orthographic.plot.getViewport());
  expect(zoomed.zoomX).toBe(zoomed.zoomY);
  expect([zoomed.x, zoomed.y]).toEqual([0.5, 0.5]);
  await expect(page.evaluate(() => window.stage14Orthographic.plot.setViewport({
    zoomX: 2, zoomY: 3,
  }))).rejects.toThrow(/equal x and y zoom/);
  await expect(page.evaluate(() => window.stage14Orthographic.plot.setViewport({
    center: [0, 91],
  }))).rejects.toThrow(/between the poles/);
  expect(await page.evaluate(() => window.stage14Orthographic.plot.getViewport())).toEqual(zoomed);
});

test("warm orthographic center changes create no new pipelines", async ({ page }) => {
  await page.addInitScript(installGpuCounters);
  await page.goto("/test/stage14-orthographic-center");
  await page.locator('.canvas[aria-busy="false"]').waitFor();
  const move = async (center) => {
    await page.evaluate((value) => window.stage14Orthographic.plot.setViewport({ center: value }), center);
    await page.evaluate(() => window.stage14Orthographic.plot.whenSettled());
    await page.waitForTimeout(150);
  };
  await move([20, 5]);
  await countMarkBuilds(page);
  const before = await gpuCounters(page);
  const frame = await page.evaluate(() => window.stage14Orthographic.plot.getDiagnostics().completedFrame);
  await move([-35, -10]);
  const work = await countersDelta(page, before, await gpuCounters(page));
  expect(work.render, JSON.stringify(work)).toBe(0);
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.builds, JSON.stringify(work)).toBe(0);
  expect(work.buffers, JSON.stringify(work)).toBe(0);
  expect(work.readbacks, JSON.stringify(work)).toBe(0);
  expect(await page.evaluate(() => window.stage14Orthographic.plot.getDiagnostics().completedFrame)).toBeGreaterThan(frame);
});

test("orthographic dragging stops at a pole without a longitude flip", async ({ page }) => {
  await page.goto("/test/stage14-orthographic-center");
  await page.locator("canvas").waitFor();
  await page.evaluate(() => window.stage14Orthographic.plot.setViewport({ center: [0, 80] }));
  const box = await page.getByRole("application", { name: "Plot canvas" }).boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 100, { steps: 8 });
  await page.mouse.up();
  const center = await page.evaluate(() => window.stage14Orthographic.plot.getViewport().center);
  expect(center[0]).toBeCloseTo(0, 5);
  expect(center[1]).toBeCloseTo(90, 5);
  expect(await page.evaluate(() => window.stage14Orthographic.plot.getRenderError())).toBe("");
});

test("a globe drag keeps the grabbed point under the pointer", async ({ page }) => {
  await page.goto("/test/stage14-orthographic-center");
  await page.locator("canvas").waitFor();
  const box = await page.getByRole("application", { name: "Plot canvas" }).boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const turn = async (latitude) => {
    await page.evaluate((latitude) => window.stage14Orthographic.plot.setViewport({ center: [0, latitude], zoom: 1, zoomX: 1, zoomY: 1 }), latitude);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 30, y, { steps: 6 });
    await page.mouse.up();
    return page.evaluate(() => window.stage14Orthographic.plot.getViewport().center);
  };
  // A parallel at 60 degrees is half the equator: the same drag turns twice the longitude, and
  // the grabbed point stays on its parallel.
  const equator = await turn(0), north = await turn(60);
  expect(north[0] / equator[0]).toBeGreaterThan(1.9);
  expect(north[0] / equator[0]).toBeLessThan(2.2);
  expect(north[1]).toBeGreaterThan(60);
});

test("orthographic pinch zooms while its moving midpoint rotates the globe", async ({ page }) => {
  await page.goto("/test/stage14-orthographic-center");
  await page.locator("canvas").waitFor();
  await page.evaluate(() => window.stage14Orthographic.plot.setViewport({
    center: [0, 0], zoom: 1, zoomX: 1, zoomY: 1,
  }));
  const box = await page.getByRole("application", { name: "Plot canvas" }).boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const fingers = (cx, cy, spread) => [[cx - spread / 2, cy, 0], [cx + spread / 2, cy, 1]];
  const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", {
    type, touchPoints: points.map(([px, py, id]) => ({ x: px, y: py, id })),
  });
  await touch("touchStart", fingers(x, y, 80).slice(0, 1));
  await touch("touchStart", fingers(x, y, 80));
  for (let step = 1; step <= 8; step++)
    await touch("touchMove", fingers(x + step * 5, y + step * 2.5, 80 + step * 10));
  await expect.poll(() => page.evaluate(() =>
    window.stage14Orthographic.plot.getViewport().zoom)).toBeGreaterThan(1.6);
  const viewport = await page.evaluate(() => window.stage14Orthographic.plot.getViewport());
  expect(viewport.center[0]).toBeLessThan(-5);
  expect(viewport.center[1]).toBeGreaterThan(1);
  expect(viewport.zoomX).toBe(viewport.zoomY);
  expect([viewport.x, viewport.y]).toEqual([0.5, 0.5]);
  await touch("touchEnd", []);
});

test("orthographic wheel zoom stays centered on the globe and turns it to keep the point under the pointer", async ({ page }) => {
  await page.goto("/test/stage14-orthographic-center");
  await page.locator("canvas").waitFor();
  await page.evaluate(() => window.stage14Orthographic.plot.setViewport({
    center: [20, 10], zoom: 1, zoomX: 1, zoomY: 1,
  }));
  const box = await page.getByRole("application", { name: "Plot canvas" }).boundingBox();
  // Off-center: a Cartesian wheel would pan toward the cursor.
  await page.mouse.move(box.x + box.width * 0.58, box.y + box.height * 0.4);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(40); }
  await expect.poll(() => page.evaluate(() =>
    window.stage14Orthographic.plot.getViewport().zoom)).toBeGreaterThan(1.2);
  const viewport = await page.evaluate(() => window.stage14Orthographic.plot.getViewport());
  expect([viewport.x, viewport.y]).toEqual([0.5, 0.5]);
  expect(viewport.zoomX).toBe(viewport.zoomY);
  // The pointer is up and right of the center: the globe turns that way, so the point under it
  // stays (north stays up).
  expect(viewport.center[0]).toBeGreaterThan(20.5);
  expect(viewport.center[1]).toBeGreaterThan(10.5);
});
