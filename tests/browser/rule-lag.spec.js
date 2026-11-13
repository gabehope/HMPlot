import { test, expect } from "./fixtures.js";

// TODO 130.1's RuleX lag check: while the view pans and zooms, a RuleX (its ends @view_y_min and
// @view_y_max, red) reaches the frame's edges in every frame, as far as a Plot rule laid out with
// the axes (blue) does, and moving the view prepares nothing. The canvas is sampled right after
// each GPU submit, inside the frame, while its texture is current.
const measure = (page, steps) => page.evaluate(async (steps) => {
  const plot = window.ruleLag.plot, canvas = document.querySelector("canvas");
  const out = document.createElement("canvas");
  out.width = canvas.width; out.height = canvas.height;
  const context = out.getContext("2d", { willReadFrequently: true });
  // The first and last rows a color reaches.
  const extent = (data, width, height, color) => {
    let top = -1, bottom = -1;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (color(data[i], data[i + 1], data[i + 2])) { if (top < 0) top = y; bottom = y; break; }
      }
    return [top, bottom];
  };
  const samples = [], before = plot.getDiagnostics().markPreparations;
  const submit = GPUQueue.prototype.submit;
  GPUQueue.prototype.submit = function (...args) {
    const result = submit.apply(this, args);
    queueMicrotask(() => {
      context.clearRect(0, 0, out.width, out.height);
      context.drawImage(canvas, 0, 0);
      const { data, width, height } = context.getImageData(0, 0, out.width, out.height);
      const red = extent(data, width, height, (r, g, b) => r > 180 && g < 100 && b < 100);
      const blue = extent(data, width, height, (r, g, b) => b > 180 && r < 100 && g < 100);
      if (red[0] >= 0 && blue[0] >= 0) samples.push({ red, blue });
    });
    return result;
  };
  try {
    for (const step of steps) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      plot.setViewport(step);
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  } finally {
    GPUQueue.prototype.submit = submit;
  }
  return { samples, preparations: plot.getDiagnostics().markPreparations - before };
}, steps);

test("a RuleX reaches the frame's edges in every frame of a pan and a zoom, preparing nothing", async ({ page }) => {
  await page.goto("/test/rule-lag");
  await page.waitForFunction(() => window.ruleLag?.plot);
  await page.evaluate(() => window.ruleLag.plot.whenSettled());
  await page.waitForTimeout(300);
  const zoom = Array.from({ length: 30 }, (_, i) => ({ zoom: 2 / (1 + i * 0.1), x: 0.5, y: 0.5 }));
  const pan = Array.from({ length: 30 }, (_, i) => ({ zoom: 2, x: 0.5, y: 0.5 + i * 0.01 }));
  for (const steps of [zoom, pan]) {
    const { samples, preparations } = await measure(page, steps);
    expect(samples.length).toBeGreaterThan(steps.length / 2);
    // At the frame's edges in every frame. Where a tick label changes the axis margin, the axes'
    // own rule and the camera's plot area can take it a frame apart: at most one frame (two
    // submits), by that margin. Before the shader read the edges, most frames fell short.
    const short = samples.filter(({ red, blue }) => red[0] > blue[0] + 2 || red[1] < blue[1] - 2);
    expect(short.length, JSON.stringify(short)).toBeLessThanOrEqual(2);
    expect(short.every(({ red, blue }) => red[0] - blue[0] <= 12 && blue[1] - red[1] <= 12), JSON.stringify(short)).toBe(true);
    expect(preparations).toBe(0);
  }
});

// TODO 134.29: a rule's label sits beside its line, above a horizontal one with its descenders
// clear of it, in the theme's text size (Text's and Callout's: 14).
test("a rule's label sits beside its line, not on it", async ({ page }) => {
  await page.goto("/test/rule-lag");
  await page.waitForFunction(() => window.ruleLag?.plot && document.querySelector(".canvas")?.getAttribute("aria-busy") === "false");
  const result = await page.evaluate(async () => {
    await window.ruleLag.plot.whenSettled();
    const layout = window.ruleLag.plot.getAxisLayout(), texts = [...document.querySelectorAll("svg.axes text")];
    const label = (text) => { const element = texts.find((t) => t.textContent === text), box = element.getBoundingClientRect(),
      svg = element.ownerSVGElement.getBoundingClientRect();
      return { left: box.left - svg.left, bottom: box.bottom - svg.top, size: Number(element.getAttribute("font-size")), width: svg.width, height: svg.height }; };
    const x = label("three"), y = label("five, dashed");
    return { x, y, at: { x: layout.x.reference[0].fraction * x.width, y: (1 - layout.y.reference[0].fraction) * y.height } };
  });
  expect(result.x.left).toBeGreaterThan(result.at.x + 1.5 + 2);
  expect(result.y.bottom).toBeLessThan(result.at.y - 1);
  expect([result.x.size, result.y.size]).toEqual([14, 14]);
});
