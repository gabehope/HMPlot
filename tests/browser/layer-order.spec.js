import { test, expect } from "./fixtures.js";
import { countMarkBuilds, installGpuCounters, countersDelta } from "./gpu-counters.js";

// Stage 22: declaration order decides which of two coplanar 2D marks is on top.
// Fixture: src/routes/test/layer-order. Pixels come from the canvas (what users see) and from
// the PNG export; both render the scene through the same merged, renderOrder-sorted queue.

const pureRed = (d, i) => d[i] >= 240 && d[i + 1] <= 15 && d[i + 2] <= 15;
const pureBlue = (d, i) => d[i + 2] >= 240 && d[i] <= 15 && d[i + 1] <= 15;
// The winner at an overlap pixel: the dominant channel, by a wide margin.
const blueWins = (d, i) => d[i + 2] - d[i] > 100;
const redWins = (d, i) => d[i] - d[i + 2] > 100;

async function open(page) {
  await page.goto("/test/layer-order");
  await page.waitForFunction(() => window.layerOrder && window.layerOrder.plots.gated && window.layerOrder.plots.surface, null, { timeout: 120000 });
  // Every plot initialized (not "Loading...") and idle.
  await page.waitForFunction(() => {
    const sections = [...document.querySelectorAll("[data-case]")];
    return sections.every((section) => section.querySelector("canvas")) &&
      [...document.querySelectorAll("[data-case] .canvas")].every((element) => element.getAttribute("aria-busy") === "false");
  }, null, { timeout: 120000 });
  await page.evaluate(() => Promise.all(Object.values(window.layerOrder.plots).map((plot) => plot.whenSettled())));
}
const canvasPixels = async (page, name) => {
  const shot = await page.locator(`[data-case="${name}"] canvas`).first().screenshot();
  return page.evaluate((b64) => window.layerOrder.decodeBase64(b64), shot.toString("base64"));
};
const exportPixels = (page, name) => page.evaluate((name) => window.layerOrder.exportPixels(name), name);
const show = (page, name, which) => page.evaluate(([name, which]) => window.layerOrder.show(name, which), [name, which]);
const setOrder = (page, name, order) => page.evaluate(([name, order]) => window.layerOrder.setOrder(name, order), [name, order]);

/**
 * Overlap interior (pure blue with only the mark shown, pure red with only the reference),
 * then how many overlap pixels have the wrong winner in each declaration order.
 */
async function overlapCheck(page, name, { markKey = "mark", refKey = "ref" } = {}) {
  const result = {};
  for (const source of ["canvas", "export"]) {
    const read = source === "canvas" ? canvasPixels : exportPixels;
    await show(page, name, "mark");
    const markOnly = await read(page, name);
    await show(page, name, "ref");
    const refOnly = await read(page, name);
    await show(page, name, "both");
    const overlap = [];
    for (let i = 0; i < markOnly.data.length; i += 4)
      if (pureBlue(markOnly.data, i) && pureRed(refOnly.data, i)) overlap.push(i);
    await setOrder(page, name, [refKey, markKey]);
    const markOnTop = await read(page, name);
    await setOrder(page, name, [markKey, refKey]);
    const refOnTop = await read(page, name);
    await setOrder(page, name, [refKey, markKey]);
    result[source] = {
      overlap: overlap.length,
      markOnTopMisses: overlap.filter((i) => !blueWins(markOnTop.data, i)).length,
      refOnTopMisses: overlap.filter((i) => !redWins(refOnTop.data, i)).length,
    };
  }
  return result;
}

test("every 2D vertex path follows declaration order over and under an opaque mark", async ({ page }) => {
  test.setTimeout(600000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await open(page);
  const names = await page.evaluate(() => window.layerOrder.cases);
  const report = {};
  for (const name of names) report[name] = await overlapCheck(page, name);
  const failures = Object.entries(report).filter(([, r]) =>
    ["canvas", "export"].some((s) => r[s].overlap < 50 || r[s].markOnTopMisses || r[s].refOnTopMisses));
  expect(failures, JSON.stringify(report, null, 1)).toEqual([]);
  expect(errors).toEqual([]);
});

test("marks created in reverse order keep declaration order in pixels, picking, and SVG", async ({ page }) => {
  test.setTimeout(240000);
  await page.addInitScript(installGpuCounters);
  await open(page);
  // Creation order C, B, A: the inversion Routes causes.
  for (const gate of ["C", "B", "A"]) await page.evaluate((gate) => window.layerOrder.open(gate), gate);
  // Probes in data units (domain 0..100 on a 200 px plot): A red Rect, B green translucent
  // Area band, C blue points.
  const probes = { ABC: [57, 50], AB: [45, 25], BC: [66, 50], A: [20, 50], B: [82, 50] };
  const colorAt = async (pixels, [x, y]) => {
    const px = Math.round(x / 100 * (pixels.width - 1)), py = Math.round((1 - y / 100) * (pixels.height - 1));
    const i = (py * pixels.width + px) * 4, d = pixels.data;
    return d[i] > 200 && d[i + 1] < 60 && d[i + 2] < 60 ? "red" : d[i + 1] > 200 && d[i] < 60 && d[i + 2] < 60 ? "green"
      : d[i + 2] > 200 && d[i] < 60 && d[i + 1] < 60 ? "blue" : `rgb(${d[i]},${d[i + 1]},${d[i + 2]})`;
  };
  const winners = async () => {
    const out = {};
    for (const source of ["canvas", "export"]) {
      const pixels = source === "canvas" ? await canvasPixels(page, "gated") : await exportPixels(page, "gated");
      out[source] = {};
      for (const [probe, at] of Object.entries(probes)) out[source][probe] = await colorAt(pixels, at);
    }
    return out;
  };
  const declared = { ABC: "blue", AB: "green", BC: "blue", A: "red", B: "green" };
  expect(await winners()).toEqual({ canvas: declared, export: declared });
  const info = await page.evaluate(() => window.layerOrder.info("gated"));
  expect(info.layered).toBe(true);
  expect(info.hooked).toBe(true);
  expect(info.ordered.map((o) => o.type)).toEqual(["PrismObject", "Uncertainty", "ScatterSprite"]);

  // Picking: the upper interactive mark receives the click.
  const box = await page.locator('[data-case="gated"] canvas').first().boundingBox();
  const click = async ([x, y]) => {
    await page.evaluate(() => { window.layerOrder.clicks.length = 0; });
    await page.mouse.click(box.x + x / 100 * box.width, box.y + (1 - y / 100) * box.height);
    await page.waitForFunction(() => window.layerOrder.clicks.length > 0, null, { timeout: 10000 });
    return page.evaluate(() => window.layerOrder.clicks[0]);
  };
  expect(await click(probes.ABC)).toBe("C");
  expect(await click(probes.AB)).toBe("B");

  // SVG export paints in the same order: the red rect, the green ribbon, then the blue point.
  const svgOrder = async () => {
    const svg = await page.evaluate(async () => (await window.layerOrder.plots.gated.exportSVG({ mode: "auto" })).blob.text());
    const at = (pattern) => svg.search(pattern);
    return { A: at(/#ff0000|rgb\(255,\s*0,\s*0\)/i), B: at(/#00ff00|rgb\(0,\s*255,\s*0\)/i), C: at(/#0000ff|rgb\(0,\s*0,\s*255\)/i) };
  };
  const first = await svgOrder();
  expect(first.A).toBeGreaterThan(-1);
  expect(first.A).toBeLessThan(first.B);
  expect(first.B).toBeLessThan(first.C);

  // Keyed reorder: C, B, A. The same objects, new layers: no mark rebuilds, pipelines, kernels,
  // or GPU buffers.
  await countMarkBuilds(page);
  const snapshot = () => page.evaluate(() => window.__gpuCounters.snapshot());
  const before = await snapshot();
  await setOrder(page, "gated", ["C", "B", "A"]);
  const work = await countersDelta(page, before, await snapshot());
  expect({ builds: work.builds, render: work.render, compute: work.compute, buffers: work.buffers })
    .toEqual({ builds: 0, render: 0, compute: 0, buffers: 0 });
  const reversed = { ABC: "red", AB: "red", BC: "green", A: "red", B: "green" };
  expect(await winners()).toEqual({ canvas: reversed, export: reversed });
  expect(await click(probes.ABC)).toBe("A");
  const second = await svgOrder();
  expect(second.C).toBeLessThan(second.B);
  expect(second.B).toBeLessThan(second.A);

  // Conditional removal and late re-insertion: B returns to its declared place, between C and A.
  await page.evaluate(() => window.layerOrder.close("B"));
  expect((await page.evaluate(() => window.layerOrder.info("gated"))).slots).toBe(2);
  await page.evaluate(() => window.layerOrder.open("B"));
  expect((await page.evaluate(() => window.layerOrder.info("gated"))).slots).toBe(3);
  expect(await winners()).toEqual({ canvas: reversed, export: reversed });

  // Idle frames do no ordering work.
  const sorts = (await page.evaluate(() => window.layerOrder.info("gated"))).sorts;
  await page.evaluate(async () => { for (let i = 0; i < 10; i++) { window.layerOrder.plots.gated; await new Promise(requestAnimationFrame); } });
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.move(box.x + 50, box.y + 50);
  expect((await page.evaluate(() => window.layerOrder.info("gated"))).sorts).toBe(sorts);
});

test("DAG nodes cover routed edges when declared after them, and not when declared before", async ({ page }) => {
  test.setTimeout(240000);
  await open(page);
  // The reference here is the nodes mark (blue points); the edges are the red routes.
  const nodesAsMark = async () => {
    const result = {};
    for (const source of ["canvas", "export"]) {
      const read = source === "canvas" ? canvasPixels : exportPixels;
      const hide = (which) => page.evaluate(async (which) => {
        const nodes = window.layerOrder.handles.dagNodes.getMark();
        let scene = nodes; while (scene.parent) scene = scene.parent;
        scene.traverse((o) => { if (o.material && (o.isPlotObject || o.options) && !o.userData?.omitOverview)
          o.visible = o === nodes ? which !== "nodes" : which !== "edges"; });
        nodes.invalidate();
        await window.layerOrder.settle(window.layerOrder.plots.dag);
      }, which);
      await hide("edges");
      const nodesOnly = await read(page, "dag");
      await hide("nodes");
      const edgesOnly = await read(page, "dag");
      await hide("none");
      const overlap = [];
      for (let i = 0; i < nodesOnly.data.length; i += 4)
        if (pureBlue(nodesOnly.data, i) && pureRed(edgesOnly.data, i)) overlap.push(i);
      await setOrder(page, "dag", ["edges", "nodes"]);
      const nodesOnTop = await read(page, "dag");
      await setOrder(page, "dag", ["nodes", "edges"]);
      const edgesOnTop = await read(page, "dag");
      await setOrder(page, "dag", ["edges", "nodes"]);
      result[source] = {
        overlap: overlap.length,
        nodesOnTopMisses: overlap.filter((i) => !blueWins(nodesOnTop.data, i)).length,
        edgesOnTopMisses: overlap.filter((i) => !redWins(edgesOnTop.data, i)).length,
      };
    }
    return result;
  };
  const result = await nodesAsMark();
  for (const source of ["canvas", "export"]) {
    // Routes end at node centers, so every node disk overlaps the edges ending there.
    expect(result[source].overlap, JSON.stringify(result)).toBeGreaterThan(200);
    expect(result[source].nodesOnTopMisses, JSON.stringify(result)).toBe(0);
    expect(result[source].edgesOnTopMisses, JSON.stringify(result)).toBe(0);
  }
  // SVG: with edges declared first, the route paths come before the node circles.
  const svg = await page.evaluate(async () => (await window.layerOrder.plots.dag.exportSVG({ mode: "auto" })).blob.text());
  const edge = svg.search(/#ff0000|rgb\(255,\s*0,\s*0\)/i), node = svg.search(/#0000ff|rgb\(0,\s*0,\s*255\)/i);
  expect(edge).toBeGreaterThan(-1);
  expect(edge).toBeLessThan(node);
});

test("a 3D view keeps native queues and orders; switching back restores the layers", async ({ page }) => {
  test.setTimeout(180000);
  await open(page);
  const info = () => page.evaluate(() => window.layerOrder.info("mode"));
  let state = await info();
  expect(state.layered).toBe(true);
  expect(state.ordered.map((o) => o.renderOrder)).toEqual([0, 1]);
  await page.evaluate(() => window.layerOrder.setType("3d"));
  state = await info();
  expect(state.layered).toBe(false);
  expect(state.ordered.map((o) => o.renderOrder)).toEqual([0, 0]);
  await page.evaluate(() => window.layerOrder.setType("2d"));
  state = await info();
  expect(state.layered).toBe(true);
  expect(state.ordered.map((o) => o.renderOrder)).toEqual([0, 1]);
});

test("a surface chart layers its own marks in declaration order", async ({ page }) => {
  test.setTimeout(180000);
  await open(page);
  // Child scene: red Rect (opaque) over the left half, blue Area band (translucent) in the middle.
  const middle = async (order) => {
    await setOrder(page, "surface", order);
    await page.waitForTimeout(300);
    const pixels = await canvasPixels(page, "surface");
    // A point inside both: x = 35, y = 50 of the chart.
    const px = Math.round(0.35 * (pixels.width - 1)), py = Math.round(0.5 * (pixels.height - 1));
    const i = (py * pixels.width + px) * 4, d = pixels.data;
    return d[i] - d[i + 2] > 100 ? "red" : d[i + 2] - d[i] > 100 ? "blue" : `rgb(${d[i]},${d[i + 1]},${d[i + 2]})`;
  };
  expect(await middle(["ribbon", "rect"])).toBe("red");
  expect(await middle(["rect", "ribbon"])).toBe("blue");
  const info = await page.evaluate(() => window.layerOrder.info("surface"));
  expect(info.layered).toBe(true);
  expect(info.slots).toBe(2);
});
