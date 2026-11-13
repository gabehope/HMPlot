import { test, expect } from "./fixtures.js";
import { ANCHOR_PICKING_ERROR } from "../../src/lib/plot/utils/connections.js";

const fixture = (page, name) => page.locator(`[data-fixture="${name}"]`);
async function open(page) {
  await page.goto("/test/connections");
  await page.waitForFunction(() => window.connectionsFixture?.domainPlot?.getFrames?.()[0]?.getAxisLayout());
}
const bounds = (page, key) => page.evaluate(async (key) => {
  const plot = window.connectionsFixture[key];
  await plot.whenSettled();
  const options = plot.getFrames()[0].getFrameOptions();
  return { x: options.get("xbounds"), y: options.get("ybounds") };
}, key);

test("anchor-domain: an Anchor widens the automatic domain but draws and picks nothing", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);
  // The control plot's domain comes from the probes alone; the Anchor's rows widen it.
  const control = await bounds(page, "controlPlot");
  expect(control.x[0]).toBeGreaterThan(20);
  expect(control.x[1]).toBeLessThan(80);
  await expect.poll(async () => {
    const { x, y } = await bounds(page, "domainPlot");
    return x[0] <= 0 && x[1] >= 100 && y[0] <= 23.7 && y[1] >= 60;
  }).toBe(true);

  // Export a PNG, locate the two green probes, and map data coordinates to pixels with them.
  const state = await page.evaluate(async () => {
    const { domainPlot, anchor, probe } = window.connectionsFixture;
    await domainPlot.whenSettled();
    const png = await domainPlot.exportPNG();
    const bitmap = await createImageBitmap(png);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    const green = [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 1] > data[i] + 60 && data[i + 1] > data[i + 2] + 60) green.push([x, y]);
    }
    // Two clusters: split by x at the midpoint of the green extent.
    const mid = (Math.min(...green.map(([x]) => x)) + Math.max(...green.map(([x]) => x))) / 2;
    const centroid = (points) => [points.reduce((s, [x]) => s + x, 0) / points.length, points.reduce((s, [, y]) => s + y, 0) / points.length];
    const a = centroid(green.filter(([x]) => x < mid)), b = centroid(green.filter(([x]) => x >= mid));
    // Probes at data (40, 40) and (60, 60).
    const pixel = ([dx, dy]) => [a[0] + (dx - 40) / 20 * (b[0] - a[0]), a[1] + (dy - 40) / 20 * (b[1] - a[1])];
    const at = (point) => [...context.getImageData(Math.round(point[0]), Math.round(point[1]), 1, 1).data];
    // The interior anchor row (73.3, 23.7), off any grid line: nothing may be drawn around it.
    const [ax, ay] = pixel([73.3, 23.7]);
    const neighborhood = [];
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) neighborhood.push(at([ax + dx, ay + dy]));
    const background = at([ax + 12, ay - 12]);
    // Picking: the probe is interactive (hover), the anchor is not a target.
    const rect = probe.getMark().renderer.domElement.getBoundingClientRect();
    const picking = probe.getMark().view.picking.context.current;
    const scale = rect.width / width;
    const pick = async ([x, y]) => {
      const hit = await picking.pickAt(rect.left + x * scale, rect.top + y * scale);
      return hit ? { object: hit.object === probe.getMark() ? "probe" : hit.object === anchor.getMark() ? "anchor" : "other" } : null;
    };
    const mark = anchor.getMark();
    return {
      error: domainPlot.getRenderError(), probes: [a, b], neighborhood, background,
      anchorPick: await pick([ax, ay]), probePick: await pick(b),
      anchorVisible: mark.visible, anchorInScene: !!mark.parent, anchorCount: mark.count,
      anchorFields: [...mark.fields.keys()], guideHandle: mark.guideHandle ?? null,
      legendSource: anchor.getLegendSource(),
    };
  });
  expect(state.error).toBe("");
  // Nothing drawn where the anchor is: every pixel matches the plot background there.
  for (const pixel of state.neighborhood) expect(pixel.slice(0, 3)).toEqual(state.background.slice(0, 3));
  expect(state.probePick?.object).toBe("probe");
  expect(state.anchorPick).toBeNull();
  // The mark keeps its three rows in one position field and nothing else, outside the scene.
  expect(state.anchorCount).toBe(3);
  expect(state.anchorFields).toEqual(["position"]);
  expect(state.anchorVisible).toBe(false);
  expect(state.anchorInScene).toBe(false);
  expect(state.guideHandle).toBeNull();
  expect(state.legendSource).toBeUndefined();
  expect(errors).toEqual([]);
});

test("anchor-legend: a labelled Anchor has no legend entry", async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.connectionsFixture.legendPlot.whenSettled());
  expect(await page.evaluate(() => window.connectionsFixture.legendAnchor.getMark().options.get("label"))).toBe("Hidden anchor");
  await expect(fixture(page, "anchor-legend").locator("[data-guide-position] button")).toHaveText(["Probe"]);
});

test("anchor-domain: an Anchor is a mark node in the settings tree", async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.connectionsFixture.domainPlot.openSettings());
  const panel = page.getByRole("dialog", { name: "Settings · Anchor domain", exact: true });
  await expect(panel.getByRole("treeitem", { name: "ends", exact: false })).toHaveCount(1);
});

test("anchor-animate: animate() moves an Anchor's live positions on the View clock", async ({ page }) => {
  await open(page);
  const list = await page.evaluate(async () => {
    const f = window.connectionsFixture;
    await f.animatePlot.whenSettled();
    // whenSettled does not wait for animations: the mount's 1.2 s transition could still be
    // running, and its progress would read as this one's.
    await f.animatePlot.whenAnimationsFinished();
    f.raiseAnchor();
    const out = [];
    const started = performance.now();
    while (performance.now() - started < 4000) {
      const read = await f.readPosition(f.animateAnchor);
      out.push({ progress: read.progress, y: read.rows.map((row) => row[1]), active: read.active });
      if (out.length > 3 && !read.active) break;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    return out;
  });
  const sample = list.find((s) => s.progress !== null && s.progress > 0.3 && s.progress < 0.7);
  expect(sample, JSON.stringify(list.slice(0, 6))).toBeTruthy();
  // Linear easing from 0 to 8.
  for (const y of sample.y) expect(Math.abs(y - 8 * sample.progress)).toBeLessThan(1.5);
  expect(list.at(-1).y).toEqual([8, 8, 8]);
});

test("anchor-picking: select, hover, or brush on an Anchor names the fix", async ({ page }) => {
  await open(page);
  await expect.poll(() => page.evaluate(() => window.connectionsFixture.pickablePlot.getRenderError()))
    .toBe(`Anchor: ${ANCHOR_PICKING_ERROR}`);
});

// ---------------------------------------------------------------------------------------
// Chunk B: connections at rest. Endpoints are red and blue points (or invisible Anchors),
// connectors green; probes read the exported PNG.
// ---------------------------------------------------------------------------------------
const openConnections = async (page, key) => {
  await page.goto("/test/connections");
  await page.waitForFunction((key) => window.connectionsFixture?.[key]?.getFrames?.()[0]?.getAxisLayout(), key);
};
/** Probe `plot`: `probes(image, clusters)` runs in the page on the exported PNG. */
const probe = (page, key, probes) => page.evaluate(async ({ key, source }) => {
  const f = window.connectionsFixture, plot = f[key];
  const image = await f.image(plot);
  return { error: plot.getRenderError(), ...new Function("image", "clusters", `return (${source})(image, clusters);`)(image, f.clusters) };
}, { key, source: probes.toString() });
/** Rows of red (start) and blue (end) endpoint centroids, top to bottom, and connector probes between them. */
const rowProbes = (image, clusters) => {
  const red = clusters(image.points("red")), blue = clusters(image.points("blue"));
  const along = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return {
    red: red.length, blue: blue.length,
    rows: red.map((a, i) => blue[i] ? [0.25, 0.5, 0.75].map((t) => image.near(...along(a, blue[i], t), "green", 2)) : null),
  };
};

test("before-after: Arrows connect each id's before point to its after point on one table", async ({ page }) => {
  await openConnections(page, "beforeAfterPlot");
  await expect.poll(async () => (await probe(page, "beforeAfterPlot", rowProbes)).rows).toEqual(Array(3).fill([true, true, true]));
  expect((await probe(page, "beforeAfterPlot", rowProbes)).error).toBe("");
});

test("implicit: without a key, endpoints of one table match by source observation through a derived view", async ({ page }) => {
  await openConnections(page, "implicitPlot");
  // Sorted by x1 descending, the after rows run 3, 2, 1: a positional pairing would cross.
  await expect.poll(async () => (await probe(page, "implicitPlot", rowProbes)).rows).toEqual(Array(3).fill([true, true, true]));
  expect((await probe(page, "implicitPlot", rowProbes)).error).toBe("");
});

test("tables: explicit keys match two independent tables; reordered rows keep their pairs", async ({ page }) => {
  await openConnections(page, "tablesPlot");
  await expect.poll(async () => (await probe(page, "tablesPlot", rowProbes)).rows).toEqual(Array(3).fill([true, true, true]));
  // Reorder the right table (a keyed match must not pair rows by position).
  await page.evaluate(() => window.connectionsFixture.setRight({ name: ["c", "a", "b"], x: [90, 90, 90], y: [80, 20, 50] }));
  const crossed = (image, clusters) => {
    const red = clusters(image.points("red")), blue = clusters(image.points("blue"));
    // Row order (top to bottom) is c, b, a on both sides; a positional pairing would join a (bottom left) to c (top right).
    const [a, c] = [red[2], blue[0]];
    // (t = 0.5 is where it would cross the middle connector.)
    return { diagonal: [0.25, 0.75].some((t) => image.near(a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, "green", 1)) };
  };
  await expect.poll(async () => (await probe(page, "tablesPlot", rowProbes)).rows).toEqual(Array(3).fill([true, true, true]));
  expect((await probe(page, "tablesPlot", crossed)).diagonal).toBe(false);
});

test("tables: a missing key draws nothing; a duplicate key is an error naming the endpoint", async ({ page }) => {
  const { duplicateKeyError } = await import("../../src/lib/plot/utils/connections.js");
  await openConnections(page, "tablesPlot");
  await expect.poll(async () => (await probe(page, "tablesPlot", rowProbes)).rows).toEqual(Array(3).fill([true, true, true]));
  // "c" has no partner on the right ("d" none on the left): the top row draws no connector.
  await page.evaluate(() => window.connectionsFixture.setRight({ name: ["a", "b", "d"], x: [90, 90, 90], y: [20, 50, 80] }));
  await expect.poll(async () => (await probe(page, "tablesPlot", rowProbes)).rows)
    .toEqual([[false, false, false], [true, true, true], [true, true, true]]);
  await page.evaluate(() => window.connectionsFixture.setRight({ name: ["a", "a", "c"], x: [90, 90, 90], y: [20, 50, 80] }));
  await expect.poll(() => page.evaluate(() => window.connectionsFixture.tablesPlot.getRenderError()))
    .toBe(`Segments: ${duplicateKeyError("a", "right")}`);
  // A valid table clears the error and draws again.
  await page.evaluate(() => window.connectionsFixture.setRight({ name: ["a", "b", "c"], x: [90, 90, 90], y: [20, 50, 80] }));
  await expect.poll(async () => (await probe(page, "tablesPlot", rowProbes)).rows).toEqual(Array(3).fill([true, true, true]));
  expect(await page.evaluate(() => window.connectionsFixture.tablesPlot.getRenderError())).toBe("");
});

test("tables: a frame change re-gathers the endpoints (connectors stay attached at rest)", async ({ page }) => {
  await openConnections(page, "tablesPlot");
  await expect.poll(async () => (await probe(page, "tablesPlot", rowProbes)).rows).toEqual(Array(3).fill([true, true, true]));
  const before = await probe(page, "tablesPlot", (image, clusters) => ({ blue: clusters(image.points("blue"))[0] }));
  const counts = () => page.evaluate(() => {
    const counters = window.connectionsFixture.leftPoints.getMark().view.diagnostics.counters;
    return { matches: counters.connectionMatches, preparations: counters.connectionPreparations };
  });
  const initial = await counts();
  await page.evaluate(() => window.connectionsFixture.setTablesDomain([0, 200]));
  await expect.poll(async () => (await probe(page, "tablesPlot", (image, clusters) => ({ blue: clusters(image.points("blue"))[0] }))).blue[0])
    .toBeLessThan(before.blue[0] - 60);
  await expect.poll(async () => (await probe(page, "tablesPlot", rowProbes)).rows).toEqual(Array(3).fill([true, true, true]));
  // Nothing is left where the connectors ended before the change.
  const [bx, by] = before.blue;
  const stale = new Function(`return (image) => ({ stale: image.near(${bx - 12}, ${by}, "green", 1) })`)();
  expect((await probe(page, "tablesPlot", stale)).stale).toBe(false);
  // The camera is not part of a connection: panning and zooming neither re-match nor re-gather
  // (world positions do not depend on it), and the connectors stay on their endpoints.
  expect((await counts()).preparations).toBeGreaterThan(initial.preparations);
  const settled = await counts();
  await page.evaluate(async () => {
    const plot = window.connectionsFixture.tablesPlot;
    plot.setViewport({ x: 20, y: 10, zoom: 1.4 });
    await plot.whenSettled();
  });
  // This extreme normalized viewport reaches the upper-right clamp. With a
  // real 1.4 zoom all red endpoints are outside it; no connector can be
  // probed from an invisible red point, but the camera must not re-gather.
  await expect.poll(async () => (await probe(page, "tablesPlot", rowProbes)).red).toBe(0);
  expect(await counts()).toEqual(settled);
  await page.evaluate(async () => {
    const plot = window.connectionsFixture.tablesPlot;
    plot.setViewport({ x: 0, y: 0.5, zoom: 1.4 });
    await plot.whenSettled();
  });
  await expect.poll(async () => (await probe(page, "tablesPlot", rowProbes)).rows).toEqual(Array(3).fill([true, true, true]));
  expect(await counts()).toEqual(settled);
});

test("Line: connections together with x is an error", async ({ page }) => {
  const { connectionsChannelError } = await import("../../src/lib/plot/utils/connections.js");
  await openConnections(page, "lineErrorPlot");
  await expect.poll(() => page.evaluate(() => window.connectionsFixture.lineErrorPlot.getRenderError()))
    .toBe(connectionsChannelError("Line"));
});

// Data (x, y) to PNG pixels from the red (5, 5) and blue (95, 95) reference points (or other corners).
const calibrated = (low, high) => `(image, clusters) => {
  const red = clusters(image.points("red"))[0], blue = clusters(image.points("blue"))[0];
  const [lx, ly] = ${JSON.stringify(low)}, [hx, hy] = ${JSON.stringify(high)};
  const pixel = (x, y) => [red[0] + (x - lx) / (hx - lx) * (blue[0] - red[0]), red[1] + (y - ly) / (hy - ly) * (blue[1] - red[1])];
  const green = (x, y) => image.near(...pixel(x, y), "green", 1);
  return PROBES;
}`;
const attachmentProbes = (low, high, probes) => new Function(`return ${calibrated(low, high).replace("PROBES", probes)}`)();

test("attachments: label anchor, rect edge and center, segment start and end", async ({ page }) => {
  await openConnections(page, "attachPlot");
  const probes = attachmentProbes([5, 5], [95, 95], `{
    labelAnchor: green(60, 85), pastAnchor: green(75, 85),
    rectLeft: green(30, 62.5), insideRect: green(45, 62.5), rectCenter: green(55, 62.5), toCenter: green(75, 62.5),
    segmentStart: green(25, 30), segmentEnd: green(75, 40), onSegment: green(50, 35),
  }`);
  await expect.poll(async () => { const { error, ...rest } = await probe(page, "attachPlot", probes); return { error, ...rest }; }).toEqual({
    error: "",
    // Text: the data anchor, not the text 30px to its right. A forward reference (the
    // connector comes first in the markup) resolves once the endpoints mount.
    labelAnchor: true, pastAnchor: false,
    rectLeft: true, insideRect: false, rectCenter: true, toCenter: true,
    segmentStart: true, segmentEnd: true, onSegment: false,
  });
});

test("attachments: Histogram bars connect by an explicit key; without one they are an error", async ({ page }) => {
  const { aggregateEndpointError } = await import("../../src/lib/plot/utils/connections.js");
  await openConnections(page, "aggregatePlot");
  // Bins [0, 50) and [50, 100] hold 3 and 2 samples; each bar's value end joins an Anchor at y = 8.
  const probes = attachmentProbes([5, 0.5], [95, 9.5], `{
    firstBar: green(25, 5.5), secondBar: green(75, 5), insideFirst: green(25, 1.5), insideSecond: green(75, 1),
  }`);
  await expect.poll(() => probe(page, "aggregatePlot", probes)).toEqual({
    error: "", firstBar: true, secondBar: true, insideFirst: false, insideSecond: false,
  });
  await expect.poll(() => page.evaluate(() => window.connectionsFixture.aggregateErrorPlot.getRenderError()))
    .toBe(aggregateEndpointError("Segments", "bins", "Histogram"));
});

test("attachments: a Bar's value end is its top above the baseline and its bottom below it", async ({ page }) => {
  await openConnections(page, "barPlot");
  // Bars at x 25 (value 6) and 75 (value -4); Anchors at y 9 and -9.
  const probes = attachmentProbes([5, -9], [95, 9], `{
    positive: green(25, 7.5), insidePositive: green(25, 3), negative: green(75, -6.5), insideNegative: green(75, -2),
  }`);
  await expect.poll(() => probe(page, "barPlot", probes)).toEqual({
    error: "", positive: true, insidePositive: false, negative: true, insideNegative: false,
  });
});

test("picking: events carry the connection; a shared owner's connector drives its selection", async ({ page }) => {
  await openConnections(page, "tablesPlot");
  await expect.poll(async () => (await probe(page, "tablesPlot", rowProbes)).rows).toEqual(Array(3).fill([true, true, true]));
  // Cross-owner (two tables): click the middle connector; the event names both endpoints.
  const point = (key, handle) => page.evaluate(async ({ key, handle }) => {
    const f = window.connectionsFixture;
    const image = await f.image(f[key]);
    const red = f.clusters(image.points("red")), blue = f.clusters(image.points("blue"));
    const mid = [(red[1][0] + blue[1][0]) / 2, (red[1][1] + blue[1][1]) / 2];
    return f.clientPoint(f[handle], mid, image.width);
  }, { key, handle });
  let [x, y] = await point("tablesPlot", "leftPoints");
  await page.mouse.click(x, y);
  await expect.poll(() => page.evaluate(() => window.connectionsFixture.lastEvent?.connection?.key)).toBe("b");
  const event = await page.evaluate(() => window.connectionsFixture.lastEvent);
  expect(event.connection.source).toMatchObject({ slot: 0, label: "left", row: 1, kind: "Points" });
  expect(event.connection.target).toMatchObject({ slot: 1, label: "right", row: 1, kind: "Points" });
  expect(event.connection.pair.map((slot) => slot.label)).toEqual(["left", "right"]);
  expect(event.rowIndex).toBeNull();
  expect(JSON.parse(JSON.stringify(event.connection))).toEqual(event.connection);

  // Shared owner (one table, select on the Arrows): clicking the id 2 arrow selects that row;
  // the other arrows fade, and the before points (respond) fade with them.
  await page.evaluate(() => window.connectionsFixture.clearClicks());
  [x, y] = await point("beforeAfterPlot", "before");
  await page.mouse.click(x, y);
  await expect.poll(() => page.evaluate(() => window.connectionsFixture.lastEvent?.connection?.key)).toBe(2);
  const shared = await page.evaluate(() => {
    const { lastEvent, beforeAfterPlot } = window.connectionsFixture;
    const selection = beforeAfterPlot.getSelection();
    return { rowIndex: lastEvent.rowIndex, ownerRow: lastEvent.connection.ownerRow, rows: [...selection.rows(selection.owner ?? ((m) => m?.view.marks.of(m))(window.connectionsFixture.before.getMark())?.interaction.owner)] };
  });
  expect(shared).toEqual({ rowIndex: 1, ownerRow: 1, rows: [1] });
  await expect.poll(async () => (await probe(page, "beforeAfterPlot", (image, clusters) => ({
    red: clusters(image.points("red")).length,
  })))).toMatchObject({ red: 1 });
  // The connector's own feedback: the selected id's arrow keeps full opacity, the others take
  // selectionOpacity (read from its per-row opacity field; solid Arrows draw opaque unless
  // transparent, so the pixels do not show it).
  await expect.poll(() => page.evaluate(async () => {
    const data = window.connectionsFixture.beforeAfterArrows.getMark().fields.get("interactionOpacity")?.data;
    return data?.shape ? Array.from(await data.ref.data()) : null;
  })).toEqual([0.25, 1, 0.25]);
});

// Parallel coordinates: bands left to right hold the cells in facet order; each cell's magenta
// markers (the Anchors' positions) sort top to bottom by value.
const parallelProbes = (image, clusters) => {
  // Markers are 14px discs; a pixel or two where red and blue lines cross is not one.
  const markers = clusters(image.points("magenta"), 7).filter((m) => m[2] >= 5);
  const bands = [];
  for (const m of [...markers].sort((a, b) => a[0] - b[0])) {
    const band = bands.find((b) => Math.abs(b[0][0] - m[0]) < 20);
    if (band) band.push(m); else bands.push([m]);
  }
  bands.forEach((band) => band.sort((a, b) => a[1] - b[1]));
  const color = (x, y) => ["red", "green", "blue"].find((c) => image.near(x, y, c, 2)) ?? null;
  const right = Math.max(...markers.map((m) => m[0]));
  const colored = (x0) => image.points("line", [Math.round(x0), 0, image.width, image.height]).length;
  return { bands: bands.map((band) => band.map((m) => [Math.round(m[0]), Math.round(m[1])])), right, beyond: colored(right + 12),
    probe: (a, b) => color(a[0] + (b[0] - a[0]) * 0.25, a[1] + (b[1] - a[1]) * 0.25) };
};
/** Expected probe colors: for each adjacent pair of cells in `order`, each id's segment. */
async function parallelCheck(page, order, rows) {
  return page.evaluate(async ({ order, rows, source }) => {
    const f = window.connectionsFixture;
    const image = await f.image(f.parallelPlot);
    const measured = new Function("image", "clusters", `return (${source})(image, clusters);`)(image, f.clusters);
    const colors = { r: "red", g: "green", b: "blue" };
    // Marker of id i in band k: the band's markers sorted by value, highest on top.
    const marker = (k, i) => {
      const values = rows[order[k]], ids = rows.id.map((_, j) => j).filter((j) => Number.isFinite(values[j]));
      const ranked = ids.sort((a, b) => values[b] - values[a]);
      return measured.bands[k]?.[ranked.indexOf(i)];
    };
    const segments = [];
    for (let k = 0; k + 1 < order.length; k++)
      for (let i = 0; i < rows.id.length; i++) {
        const a = marker(k, i), b = marker(k + 1, i);
        segments.push(a && b ? measured.probe(a, b) === colors[rows.species[i]] : null);
      }
    return { error: f.parallelPlot.getRenderError(), bands: measured.bands.map((band) => band.length), segments, beyond: measured.beyond };
  }, { order, rows, source: parallelProbes.toString() });
}

test("parallel coordinates: facet.endpoint() connects repeated Anchors across embedded Facet cells", async ({ page }) => {
  await openConnections(page, "parallelPlot");
  const rows = { id: [1, 2, 3], species: ["r", "g", "b"], a: [1, 2, 3], b: [30, 20, 10], c: [5, 7, 6] };
  // Three cells a, b, c: every id's line crosses both cell boundaries in its species color.
  await expect.poll(() => parallelCheck(page, ["a", "b", "c"], rows))
    .toEqual({ error: "", bands: [3, 3, 3], segments: Array(6).fill(true), beyond: 0 });

  // columnOrder reorders the cells, and the path follows the new order.
  await page.evaluate(() => window.connectionsFixture.setParallelOrder(["b", "a", "c"]));
  await expect.poll(() => parallelCheck(page, ["b", "a", "c"], rows))
    .toEqual({ error: "", bands: [3, 3, 3], segments: Array(6).fill(true), beyond: 0 });
  await page.evaluate(() => window.connectionsFixture.setParallelOrder(undefined));

  // Removing a Fold field removes one slot: two cells, one segment per id, nothing beyond.
  await page.evaluate(() => window.connectionsFixture.setParallelFields(["a", "b"]));
  await expect.poll(() => parallelCheck(page, ["a", "b"], rows))
    .toEqual({ error: "", bands: [3, 3], segments: Array(3).fill(true), beyond: 0 });
  await page.evaluate(() => window.connectionsFixture.setParallelFields(["a", "b", "c"]));

  // A missing value breaks only that id's segment into the cell: id 2 (green) stops at cell b.
  const missing = { ...rows, c: [5, NaN, 6] };
  await page.evaluate((rows) => window.connectionsFixture.setParallelRows(rows), missing);
  await expect.poll(() => parallelCheck(page, ["a", "b", "c"], missing)).toEqual({
    error: "", bands: [3, 3, 2],
    // a -> b for ids 1-3, then b -> c: id 1 red, id 2 missing, id 3 blue.
    segments: [true, true, true, true, null, true], beyond: 0,
  });
  const greenBeyondB = await page.evaluate(async () => {
    const f = window.connectionsFixture, image = await f.image(f.parallelPlot);
    const bands = f.clusters(image.points("magenta"), 7).filter((m) => m[2] >= 5).map((m) => m[0]).sort((a, b) => a - b);
    const middle = bands[4];
    return image.points("green", [Math.round(middle) + 6, 0, image.width, image.height]).length;
  });
  expect(greenBeyondB).toBe(0);
});

test("partition.endpoint(): one repeated Anchor connected across Partition groups", async ({ page }) => {
  await openConnections(page, "partitionPlot");
  // Groups g1 (x = 10) and g2 (x = 90); ids 1 and 2 at y 20 and 60.
  const probes = attachmentProbes([5, 5], [95, 95], `{
    first: green(50, 20), second: green(50, 60), between: green(50, 40), outside: green(95, 20),
  }`);
  await expect.poll(() => probe(page, "partitionPlot", probes)).toEqual({
    error: "", first: true, second: true, between: false, outside: false,
  });
});

test("Facet.endpoint: an external Facet's cells are separate views", async ({ page }) => {
  const { EXTERNAL_FACET_ENDPOINT_ERROR } = await import("../../src/lib/plot/utils/connections.js");
  await page.goto("/test/connections");
  await page.waitForFunction(() => window.connectionsFixture?.externalFacet?.getFrames);
  await expect.poll(() => page.evaluate(() => {
    try { window.connectionsFixture.externalFacet.endpoint("tip"); return "no error"; }
    catch (error) { return error.message; }
  })).toBe(EXTERNAL_FACET_ENDPOINT_ERROR);
});

// ---------------------------------------------------------------------------------------
// Chunk C: the live gather (src/routes/test/connections/live). Connector rows are read back
// from their GPU buffers and compared with the endpoints' live rows mapped to world space.
// ---------------------------------------------------------------------------------------
// `blocks`: the fixture blocks to mount (?only=...), so no test shares the GPU with the others.
const openLive = async (page, key, blocks) => {
  await page.goto(`/test/connections/live?only=${blocks}`);
  await page.waitForFunction((key) => window.connectionsLive?.[key]?.getFrames?.()[0]?.getAxisLayout?.() !== undefined, key);
  await page.evaluate((key) => window.connectionsLive[key].whenSettled(), key);
};
const close = (a, b, tolerance = 1e-3) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tolerance * Math.max(1, Math.abs(b[i])));

test("follow: at setAnimationTime(mid) a connector's rows equal its animated Anchor's live positions", async ({ page }) => {
  await openLive(page, "followPlot", "follow");
  const result = await page.evaluate(async () => {
    const f = window.connectionsLive, plot = f.followPlot, renderer = f.moving.getMark().renderer, counters = f.moving.getMark().view.diagnostics.counters;
    // Freeze the clock, then change the data: the transition starts at t0 and holds there.
    const t0 = plot.getAnimationTime();
    await plot.setAnimationTime(t0);
    f.raise();
    await plot.whenSettled();
    const gathers = counters.connectionGathers;
    await plot.setAnimationTime(t0 + 600);
    const anchor = await f.readField(f.moving, "position");
    const starts = await f.readField(f.followSegments, "start");
    const lineRows = await f.readField(f.followLine, "end");
    const fixedRows = await f.readField(f.fixed, "position");
    const after = counters.connectionGathers;
    // Source motion (T5): scrubbing the clock re-gathers without compiling a program, rebuilding
    // the connector or re-preparing it.
    const device = renderer.backend.device, names = ["createRenderPipeline", "createRenderPipelineAsync", "createComputePipeline", "createComputePipelineAsync"];
    const saved = names.map((name) => device[name]);
    let pipelines = 0, builds = 0;
    names.forEach((name, i) => { device[name] = function (...args) { pipelines++; return saved[i].apply(this, args); }; });
    const connector = f.followSegments.getMark(), build = connector.build;
    connector.build = function (...args) { builds++; return build.apply(this, args); };
    const preparations = counters.connectionPreparations;
    let scrubbed;
    try {
      for (const t of [300, 900, 450]) await plot.setAnimationTime(t0 + t);
      const rows = await f.readField(f.moving, "position");
      scrubbed = { expected: rows.map((row) => f.mapped(f.moving, row)), starts: await f.readField(f.followSegments, "start") };
    } finally {
      names.forEach((name, i) => { device[name] = saved[i]; });
      connector.build = build;
    }
    const motion = { pipelines, builds, preparations: counters.connectionPreparations - preparations };
    await plot.setAnimationTime(null);
    await plot.whenAnimationsFinished();
    const settled = await f.readField(f.followSegments, "start");
    return {
      anchor, fixedRows, gathers: after - gathers,
      expected: anchor.map((row) => f.mapped(f.moving, row)),
      starts, lineRows, settled, target: [2, 5, 8].map((x) => f.mapped(f.moving, [x, 6, 0])), scrubbed, motion,
    };
  });
  // Linear easing: halfway from y 1 to 6.
  for (const row of result.anchor) expect(Math.abs(row[1] - 3.5)).toBeLessThan(1e-3);
  expect(result.gathers).toBeGreaterThan(0);
  result.expected.forEach((point, i) => {
    expect(close(result.starts[i], point), JSON.stringify([result.starts[i], point])).toBe(true);
    // The Line runs fixed -> moving: segment i * 3 ends at the moving Anchor (rows: c0s0 c0s1 | sep | c1s0 ...).
    expect(close(result.lineRows[i * 3], point), JSON.stringify([result.lineRows[i * 3], point])).toBe(true);
  });
  result.target.forEach((point, i) => expect(close(result.settled[i], point)).toBe(true));
  result.scrubbed.expected.forEach((point, i) => expect(close(result.scrubbed.starts[i], point), JSON.stringify(result.scrubbed)).toBe(true));
  expect(result.motion).toEqual({ pipelines: 0, builds: 0, preparations: 0 });
});

test("procedural: a connector follows an @time Anchor at the frozen clock time", async ({ page }) => {
  await openLive(page, "orbitPlot", "procedural");
  const result = await page.evaluate(async () => {
    const f = window.connectionsLive, plot = f.orbitPlot;
    const read = async (time) => {
      await plot.setAnimationTime(time);
      const anchor = await f.readField(f.orbit, "position");
      return { anchor, expected: anchor.map((row) => f.mapped(f.orbit, row)), starts: await f.readField(f.orbitSegments, "start") };
    };
    return [await read(1000), await read(1700)];
  });
  for (const { anchor, expected, starts } of result) {
    expect(anchor.length).toBe(2);
    expected.forEach((point, i) => expect(close(starts[i], point), JSON.stringify([starts[i], point])).toBe(true));
  }
  // y = 5 + 3 sin(t / 500) at t = 1000 and 1700.
  expect(Math.abs(result[0].anchor[0][1] - (5 + 3 * Math.sin(2)))).toBeLessThan(1e-3);
  expect(Math.abs(result[1].anchor[0][1] - (5 + 3 * Math.sin(3.4)))).toBeLessThan(1e-3);
});

// T5: a frame slider moved every frame is followed by the live gather alone.
const countPipelines = `async (device, run) => {
  let count = 0;
  const names = ["createRenderPipeline", "createRenderPipelineAsync", "createComputePipeline", "createComputePipelineAsync"];
  const saved = names.map((name) => device[name]);
  names.forEach((name, i) => { device[name] = function (...args) { count++; return saved[i].apply(this, args); }; });
  try { await run(); } finally { names.forEach((name, i) => { device[name] = saved[i]; }); }
  return count;
}`;
test("frame: a Frame's bounds moved 60 times keep the connector on its endpoint through the live gather alone (T5)", async ({ page }) => {
  await openLive(page, "framePlot", "frame");
  const result = await page.evaluate(async (source) => {
    const count = eval(source);
    const f = window.connectionsLive, plot = f.framePlot, connector = f.frameSegments.getMark(), renderer = connector.renderer, viewCounters = connector.view.diagnostics.counters;
    const options = f.innerFrame.getFrameOptions();
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const check = async () => {
      const starts = await f.readField(f.frameSegments, "start");
      const expected = [[2, 3, 0], [8, 7, 0]].map((point) => f.mapped(f.frameAnchor, point));
      return { starts, expected };
    };
    const counters = () => ({
      matches: viewCounters.connectionMatches, preparations: viewCounters.connectionPreparations,
      gathers: viewCounters.connectionGathers, marks: viewCounters.markPreparations,
    });
    // The settings pane's bounds slider sets the Frame's option; the first move warms up.
    options.set("xbounds", [0.1, 10.1]); await plot.whenSettled(); await frame();
    const source0 = connector.fields.get("start").bufferNodeSource, before = counters();
    let builds = 0;
    const build = connector.build;
    connector.build = function (...args) { builds++; return build.apply(this, args); };
    let during, mid, readbacks = 0;
    // GPU -> host reads (picking images, position transfers) while the frame moves; the check at
    // i = 30 is the test's own readback and is not counted.
    const mapAsync = GPUBuffer.prototype.mapAsync;
    let counting = true;
    GPUBuffer.prototype.mapAsync = function (...args) { if (counting) readbacks++; return mapAsync.apply(this, args); };
    let pipelines;
    try {
      pipelines = await count(renderer.backend.device, async () => {
        for (let i = 0; i < 60; i++) {
          options.set("xbounds", [i * 0.1, 10 + i * 0.1]);
          await frame();
          if (i === 30) { counting = false; mid = await check(); counting = true; }
        }
        during = counters();
        counting = false;
        await plot.whenSettled();
      });
    } finally { GPUBuffer.prototype.mapAsync = mapAsync; }
    connector.build = build;
    const settled = await check();
    return { before, during, after: counters(), builds, pipelines, readbacks, mid, settled, sameBuffer: connector.fields.get("start").bufferNodeSource === source0 };
  }, countPipelines);
  const near = ({ starts, expected }) => expected.every((point, i) => close(starts[i], point));
  expect(near(result.mid), JSON.stringify(result.mid)).toBe(true);
  expect(near(result.settled), JSON.stringify(result.settled)).toBe(true);
  // No program compiled, no material rebuilt, the same buffer bound, no endpoint re-prepared,
  // nothing read back to the host while moving.
  expect(result.pipelines).toBe(0);
  expect(result.readbacks).toBe(0);
  expect(result.builds).toBe(0);
  expect(result.sameBuffer).toBe(true);
  expect(result.during.marks - result.before.marks).toBe(0);
  // The match is cached; no Tier 1 preparation while the frame moves; one at rest afterwards.
  expect(result.after.matches - result.before.matches).toBe(0);
  expect(result.during.preparations - result.before.preparations).toBe(0);
  expect(result.after.preparations - result.before.preparations).toBeLessThanOrEqual(2);
  // Bounded: at most one gather per move (plus the rest re-publish).
  const gathers = result.after.gathers - result.before.gathers;
  expect(gathers).toBeGreaterThan(10);
  expect(gathers).toBeLessThanOrEqual(64);
});

test("frame: a Frame's range prop change keeps the connector attached at rest", async ({ page }) => {
  await openLive(page, "framePlot", "frame");
  const result = await page.evaluate(async () => {
    const f = window.connectionsLive, plot = f.framePlot;
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
    f.setFrameRange([30, 80]);
    await frame(); await plot.whenSettled(); await frame(); await plot.whenSettled();
    const starts = await f.readField(f.frameSegments, "start");
    return { starts, expected: [[2, 3, 0], [8, 7, 0]].map((point) => f.mapped(f.frameAnchor, point)) };
  });
  result.expected.forEach((point, i) => expect(close(result.starts[i], point), JSON.stringify(result)).toBe(true));
});

test("dodge: connectors start at Dodge-displaced points (pixel offsets gathered live)", async ({ page }) => {
  await openLive(page, "dodgePlot", "dodge");
  const result = await page.evaluate(async () => {
    const f = window.connectionsLive, plot = f.dodgePlot;
    await plot.whenSettled();
    const lift = await f.readField(f.dodgePoints, "dy", 1);
    const offsets = await f.readField(f.dodgeSegments, "endpointOffset", 4);
    const image = await f.image(plot);
    const red = f.clusters(image.points("red"));
    // Each displaced red point (16 px apart) has its own connector leaving it to the left;
    // undisplaced starts would all leave the middle point.
    const leaving = red.map(([x, y]) => image.near(x - 6, y, "green", 2));
    return { lift: lift?.map((row) => row[0]) ?? null, offsets, red: red.length, leaving, error: plot.getRenderError() };
  });
  expect(result.error).toBe("");
  expect(result.lift).not.toBeNull();
  // The three points spread apart vertically; each connector row starts at its point's offset.
  expect(new Set(result.lift.map((v) => Math.round(v))).size).toBe(3);
  result.offsets.forEach((row, i) => {
    expect(Math.abs(row[1] - result.lift[i])).toBeLessThan(1e-3);
    expect(row[0]).toBe(0);
  });
  expect(result.red).toBe(3);
  expect(result.leaving).toEqual([true, true, true]);
});

test("hide: hiding an endpoint's category breaks its connector; hiding the whole mark does not", async ({ page }) => {
  await openLive(page, "hidePlot", "hide");
  // Probe the canvas, excluding the automatic legend within the plot's total height.
  const rows = () => page.evaluate(async () => {
    const f = window.connectionsLive, image = await f.image(f.hidePlot);
    // Rows a, b, c at y 20, 50, 80 from x 10 to 90: probe the middle of each connector.
    const points = ["red", "magenta", "blue"].map((color) => f.clusters(image.points(color, [0, 0, image.width, document.querySelector('[data-fixture="hide"] .canvas').getBoundingClientRect().height]))[0] ?? null);
    return { error: f.hidePlot.getRenderError(), midpoints: points.map((p) => (p ? image.near(image.width / 2, p[1], "green", 2) : null)) };
  });
  await expect.poll(async () => (await rows()).midpoints).toEqual([true, true, true]);
  await page.evaluate(() => { const mark = window.connectionsLive.hidePoints.getMark(); mark.view.marks.of(mark).legend.toggle("fill", "b"); });
  // The b point is hidden and its connector gone; a and c stay connected.
  const state = await page.evaluate(async () => {
    const f = window.connectionsLive, image = await f.image(f.hidePlot);
    const plot = [0, 0, image.width, document.querySelector('[data-fixture="hide"] .canvas').getBoundingClientRect().height], red = f.clusters(image.points("red", plot))[0], blue = f.clusters(image.points("blue", plot))[0];
    const middleY = (red[1] + blue[1]) / 2;
    return {
      error: f.hidePlot.getRenderError(), magenta: image.points("magenta", plot).length,
      a: image.near(image.width / 2, red[1], "green", 2), b: image.near(image.width / 2, middleY, "green", 2),
      c: image.near(image.width / 2, blue[1], "green", 2), rows: [red[1], middleY, blue[1]],
    };
  });
  expect({ ...state, rows: undefined }).toEqual({ error: "", magenta: 0, a: true, b: false, c: true, rows: undefined });
  // Hiding the endpoint mark itself (its "visible" option: the settings pane or legend) keeps its
  // positional role: no point draws, the a and c connectors stay.
  const hidden = await page.evaluate(async (rows) => {
    const f = window.connectionsLive;
    f.hidePoints.getMark().options.set("visible", false);
    const image = await f.image(f.hidePlot);
    return {
      error: f.hidePlot.getRenderError(), points: ["red", "magenta", "blue"].map((color) => image.points(color, [0, 0, image.width, document.querySelector('[data-fixture="hide"] .canvas').getBoundingClientRect().height]).length),
      connectors: rows.map((y) => image.near(image.width / 2, y, "green", 2)),
    };
  }, state.rows);
  expect(hidden).toEqual({ error: "", points: [0, 0, 0], connectors: [true, false, true] });
});

test("offscreen: an endpoint outside the domain still connects; the visible part draws", async ({ page }) => {
  await openLive(page, "offPlot", "offscreen");
  const state = await page.evaluate(async () => {
    const f = window.connectionsLive, image = await f.image(f.offPlot);
    // Blue references at data (5, 10) and (45, 90); the red start at (20, 50); the Anchor at x 80 is off the plot.
    const blue = f.clusters(image.points("blue"));
    const [low, high] = [blue.find((b) => b[1] > image.height / 2), blue.find((b) => b[1] < image.height / 2)];
    const pixel = (x, y) => [low[0] + (x - 5) / 40 * (high[0] - low[0]), low[1] + (y - 10) / 80 * (high[1] - low[1])];
    return {
      error: f.offPlot.getRenderError(),
      probes: [30, 40, 48].map((x) => image.near(...pixel(x, 50), "green", 2)),
      before: image.near(...pixel(12, 50), "green", 2),
    };
  });
  expect(state).toEqual({ error: "", probes: [true, true, true], before: false });
  // Vector export draws the connector from the connection's live rows: it starts at the red
  // point's circle and runs toward the Anchor beyond the right edge (x 80 of the 0-50 domain).
  const svg = await page.evaluate(async () => (await window.connectionsLive.offPlot.exportSVG({ mode: "vector" })).blob.text());
  const red = svg.match(/<circle cx="([\d.]+)" cy="([\d.]+)"[^>]*fill="#ff0000"/).slice(1).map(Number);
  const path = svg.match(/<path d="M([\d.]+) ([\d.]+) L([\d.]+) ([\d.]+)"[^>]*stroke="#00c800"/).slice(1).map(Number);
  expect(Math.hypot(path[0] - red[0], path[1] - red[1])).toBeLessThan(0.01);
  expect(Math.abs(path[3] - red[1])).toBeLessThan(0.01);
  const width = Number(svg.match(/<svg[^>]*width="([\d.]+)"/)[1]);
  expect(path[2]).toBeGreaterThan(width);
});

test("chord: 3D connectors are world-space chords, also to an Anchor in a placed (world-size) Frame", async ({ page }) => {
  await openLive(page, "chordPlot", "chord");
  const state = await page.evaluate(async () => {
    const f = window.connectionsLive, plot = f.chordPlot;
    const image = await f.image(plot);
    const red = f.clusters(image.points("red"))[0], blue = f.clusters(image.points("blue"))[0], magenta = f.clusters(image.points("magenta"))[0];
    const along = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    // The placed Anchor's connector ends where the magenta point (same data, same Frame) is drawn.
    const placedEnd = (await f.readField(f.placedSegments, "end"))[0];
    const expected = f.mapped(f.placedAnchor, [5, 5, 2]);
    return {
      error: plot.getRenderError(), found: [!!red, !!blue, !!magenta],
      chord: [0.3, 0.5, 0.7].map((t) => image.near(...along(red, blue, t), "green", 2)),
      placed: [0.3, 0.5, 0.7].map((t) => image.near(...along(blue, magenta, t), "green", 2)),
      placedEnd, expected,
    };
  });
  expect(state.error).toBe("");
  expect(state.found).toEqual([true, true, true]);
  expect(state.chord).toEqual([true, true, true]);
  expect(state.placed).toEqual([true, true, true]);
  expect(close(state.placedEnd, state.expected), JSON.stringify(state)).toBe(true);
});

test("replace: replacing the table re-pairs the connectors by source identity", async ({ page }) => {
  await openLive(page, "replacePlot", "replace");
  const probeRows = () => page.evaluate(async () => {
    const f = window.connectionsLive, image = await f.image(f.replacePlot);
    const red = f.clusters(image.points("red")), blue = f.clusters(image.points("blue"));
    const along = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    return { error: f.replacePlot.getRenderError(),
      rows: red.map((a, i) => blue[i] ? [0.25, 0.5].map((t) => image.near(...along(a, blue[i], t), "green", 2)) : null) };
  });
  await expect.poll(async () => (await probeRows()).rows).toEqual(Array(3).fill([true, true]));
  // Reordered rows (same ids): still each id's own pair. A positional pairing would cross.
  await page.evaluate(() => window.connectionsLive.setReplaceRows({ id: [3, 1, 2], x0: [20, 10, 15], x1: [90, 80, 85], y: [80, 20, 50] }));
  await expect.poll(async () => (await probeRows()).rows).toEqual(Array(3).fill([true, true]));
  // A new table with fewer rows at new heights: the arrows follow.
  await page.evaluate(() => window.connectionsLive.setReplaceRows({ id: [7, 8], x0: [10, 10], x1: [90, 90], y: [35, 65] }));
  await expect.poll(async () => probeRows()).toEqual({ error: "", rows: [[true, true], [true, true]] });
});

test("box: BoxPlot quartile and median attachments", async ({ page }) => {
  await openLive(page, "boxPlotPlot", "box");
  const state = await page.evaluate(async () => {
    const f = window.connectionsLive, plot = f.boxPlotPlot;
    await plot.whenSettled();
    const lower = await f.readField(f.box, "position"), upper = await f.readField(f.box, "extent");
    const at = (value) => lower.map((lo, i) => f.mapped(f.box, [(lo[0] + upper[i][0]) / 2, value[i], 0]));
    const read = async (handle) => (await f.readField(handle, "start")) ?? [];
    return {
      error: plot.getRenderError(), lower, upper,
      q1: await read(f.q1Segments), median: await read(f.medianSegments), q3: await read(f.q3Segments),
      expected: { q1: at([2, 6]), median: at([3, 7]), q3: at([4, 8]) },
    };
  });
  expect(state.error).toBe("");
  // Groups a (1..5) and b (5..9): quartiles 2 / 4 and 6 / 8, medians 3 and 7.
  expect(state.lower.map((row) => row[1])).toEqual([2, 6]);
  expect(state.upper.map((row) => row[1])).toEqual([4, 8]);
  for (const name of ["q1", "median", "q3"])
    state.expected[name].forEach((point, i) => expect(close(state[name][i], point), `${name} ${JSON.stringify(state[name])}`).toBe(true));
});

test("curves: a catmull-rom Line and a dashed Segments draw on connections", async ({ page }) => {
  await openLive(page, "curvePlot", "curves");
  const state = await page.evaluate(async () => {
    const f = window.connectionsLive, image = await f.image(f.curvePlot);
    const red = f.clusters(image.points("red"))[0], blue = f.clusters(image.points("blue"))[0];
    const pixel = (x, y) => [red[0] + (x - 5) / 90 * (blue[0] - red[0]), red[1] + (y - 5) / 90 * (blue[1] - red[1])];
    // The curve passes through its three anchors and bulges above the straight chords at x 30 and 70.
    const through = [[10, 20], [50, 80], [90, 20]].map(([x, y]) => image.near(...pixel(x, y), "green", 3));
    // The dashed chord at y 20: both dashes and gaps along it.
    const along = Array.from({ length: 60 }, (_, i) => image.near(...pixel(20 + i, 20), "blue", 1));
    return { error: f.curvePlot.getRenderError(), through, dashes: along.filter(Boolean).length, gaps: along.filter((v) => !v).length };
  });
  expect(state.error).toBe("");
  expect(state.through).toEqual([true, true, true]);
  expect(state.dashes).toBeGreaterThan(10);
  expect(state.gaps).toBeGreaterThan(10);
});

for (const [block, prefix, what] of [["facet-pairs", "facetPairs", "an embedded Facet pairs= matrix"]])
test(`${block}: facet order visits ${what}'s cells row-major`, async ({ page }) => {
  await openLive(page, `${prefix}Plot`, block);
  const state = await page.evaluate(async (prefix) => {
    const f = window.connectionsLive, plot = f[`${prefix}Plot`], facet = f[`${prefix}Facet`], line = f[`${prefix}Line`];
    await plot.whenSettled();
    // Each cell's world rectangle (its Frame's composed ranges).
    const cells = facet.getFrames().map(({ frame, row, column }) => {
      const options = frame.getFrameOptions();
      return { name: `${row}${column}`, x: options.get("xrange"), y: options.get("yrange") };
    });
    const cellOf = ([x, y]) => cells.find((cell) =>
      x >= Math.min(...cell.x) && x <= Math.max(...cell.x) && y >= Math.min(...cell.y) && y <= Math.max(...cell.y))?.name ?? null;
    // Two connections of four slots: vertices c0s0..c0s3, a separator, c1s0..c1s3 (segment r: vertex r -> r + 1).
    const start = await f.readField(line, "start"), end = await f.readField(line, "end");
    const image = await f.image(plot);
    return {
      error: plot.getRenderError(), cells: cells.length,
      first: start.slice(0, 4).map(cellOf), second: end.slice(4, 8).map(cellOf),
      separator: start[4].every((v) => v === null || Number.isNaN(v)),
      green: image.points("green").length,
    };
  }, prefix);
  expect(state.error).toBe("");
  expect(state.cells).toBe(4);
  // Row-major (row = y field, column = x field): (a, a), (a, b), (b, a), (b, b).
  expect(state.first).toEqual(["aa", "ab", "ba", "bb"]);
  expect(state.second).toEqual(["aa", "ab", "ba", "bb"]);
  expect(state.separator).toBe(true);
  expect(state.green).toBeGreaterThan(100);
});

test("layouts: connectors start at Tree- and Force-displaced Nodes (and follow Force steps)", async ({ page }) => {
  await openLive(page, "treePlot", "tree,force");
  await page.waitForFunction(() => window.connectionsLive?.forcePlot?.getFrames?.()[0]?.getAxisLayout?.() !== undefined);
  const state = await page.evaluate(async () => {
    const f = window.connectionsLive;
    const read = async (points, segments) => {
      const rows = await f.readField(points, "position");
      return { rows, expected: rows.map((row) => f.mapped(points, row)), starts: await f.readField(segments, "start") };
    };
    await f.treePlot.whenSettled();
    const tree = await read(f.treePoints, f.treeSegments);
    // Let the simulation run a little, then pause it and step it twice: both states stay attached.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await f.forceLayout.action("pause");
    await f.forcePlot.whenSettled();
    const paused = await read(f.forcePoints, f.forceSegments);
    await f.forceLayout.action("step");
    await f.forceLayout.action("step");
    await f.forcePlot.whenSettled();
    const stepped = await read(f.forcePoints, f.forceSegments);
    return { errors: [f.treePlot.getRenderError(), f.forcePlot.getRenderError()], tree, paused, stepped };
  });
  expect(state.errors).toEqual(["", ""]);
  // The Tree places root R at the origin and its children L, M one level below, half a unit apart.
  expect(state.tree.rows.map((row) => row.slice(0, 2).map((v) => v + 0))).toEqual([[0, 0], [-0.5, -1], [0.5, -1]]);
  for (const { expected, starts } of [state.tree, state.paused, state.stepped])
    expected.forEach((point, i) => expect(close(starts[i], point), JSON.stringify([starts[i], point])).toBe(true));
  // The steps moved the nodes (so the second check is a new layout, not the same rows).
  expect(state.stepped.rows.some((row, i) => Math.abs(row[0] - state.paused.rows[i][0]) + Math.abs(row[1] - state.paused.rows[i][1]) > 1e-3)).toBe(true);
});

test("filter: a Filter on one endpoint breaks the filtered rows' connectors; changing it re-pairs them", async ({ page }) => {
  await openLive(page, "filterPlot", "filter");
  const read = (threshold) => page.evaluate(async (threshold) => {
    const f = window.connectionsLive, plot = f.filterPlot;
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
    if (threshold !== undefined) f.setFilterThreshold(threshold);
    await frame(); await plot.whenSettled(); await frame(); await plot.whenSettled();
    const before = await f.readField(f.filterBefore, "position"), after = await f.readField(f.filterAfter, "position");
    const starts = await f.readField(f.filterSegments, "start"), ends = await f.readField(f.filterSegments, "end");
    const finite = (row) => row.every((v) => v !== null && Number.isFinite(v));
    return {
      error: plot.getRenderError(),
      before: before.map((row) => f.mapped(f.filterBefore, row)), after: after.map((row) => f.mapped(f.filterAfter, row)),
      drawn: starts.map((start, i) => (finite(start) ? [start, ends[i]] : null)).filter(Boolean),
    };
  }, threshold);
  // x0 = 10, 20, 30 at y 20, 50, 80: thresholds 15, 5 and 25 keep 2, 3 and 1 rows.
  for (const [threshold, kept] of [[undefined, 2], [5, 3], [25, 1]]) {
    const state = await read(threshold);
    expect(state.error).toBe("");
    expect(state.before.length).toBe(kept);
    expect(state.drawn.length, JSON.stringify(state)).toBe(kept);
    // Each drawn connector runs from a shown start point to the end point of the same row (same y).
    for (const [start, end] of state.drawn) {
      expect(state.before.some((point) => close(start, point)), JSON.stringify(state)).toBe(true);
      expect(state.after.some((point) => close(end, point) && Math.abs(point[1] - start[1]) < 1e-3), JSON.stringify(state)).toBe(true);
    }
  }
});

test("hover: a shared-owner connector fades with hover; hover changes re-prepare and compile nothing (T5)", async ({ page }) => {
  await openLive(page, "hoverPlot", "hover");
  const state = await page.evaluate(async () => {
    const f = window.connectionsLive, plot = f.hoverPlot, hover = f.hoverData.getHover();
    const connector = f.hoverSegments.getMark(), renderer = connector.renderer, viewCounters = connector.view.diagnostics.counters;
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const settle = async () => { await frame(); await plot.whenSettled(); await frame(); };
    // Rows y = 20, 50, 80: which connectors draw at full color (red points sorted top to bottom).
    const drawn = async () => {
      const image = await f.image(plot);
      return f.clusters(image.points("red")).map(([, y]) => image.near(image.width / 2, y, "green", 2)).reverse();
    };
    const counters = () => ({
      preparations: viewCounters.connectionPreparations, matches: viewCounters.connectionMatches,
      marks: viewCounters.markPreparations,
    });
    // Warm up: the first hover may build the fading variant.
    hover.replace(hover.owner, [0], { phase: "preview" }); await settle();
    const first = await drawn();
    hover.cancelPreview(); await settle();
    const source0 = connector.fields.get("start").bufferNodeSource, before = counters();
    let builds = 0;
    const build = connector.build;
    connector.build = function (...args) { builds++; return build.apply(this, args); };
    // Pipelines compiled by the hover changes themselves (the PNG export the probe uses is not counted).
    const device = renderer.backend.device, names = ["createRenderPipeline", "createRenderPipelineAsync", "createComputePipeline", "createComputePipelineAsync"];
    const saved = names.map((name) => device[name]);
    let pipelines = 0, counting = true;
    names.forEach((name, i) => { device[name] = function (...args) { if (counting) pipelines++; return saved[i].apply(this, args); }; });
    const seen = [];
    try {
      for (const row of [1, 2]) {
        hover.replace(hover.owner, [row], { phase: "preview" }); await settle();
        counting = false; seen.push(await drawn()); counting = true;
      }
      hover.cancelPreview(); await settle();
    } finally { names.forEach((name, i) => { device[name] = saved[i]; }); }
    connector.build = build;
    return {
      error: plot.getRenderError(), first, seen, rest: await drawn(), pipelines, builds, before, after: counters(),
      sameBuffer: connector.fields.get("start").bufferNodeSource === source0,
    };
  });
  expect(state.error).toBe("");
  // Hovering row i keeps its connector and fades the others; no hover draws all three.
  expect(state.first).toEqual([true, false, false]);
  expect(state.seen).toEqual([[false, true, false], [false, false, true]]);
  expect(state.rest).toEqual([true, true, true]);
  expect(state.pipelines).toBe(0);
  expect(state.builds).toBe(0);
  expect(state.sameBuffer).toBe(true);
  expect(state.after).toEqual(state.before);
});

test("facet-partition: facet order visits a Partition inside embedded Facet cells cell by cell, groups in order", async ({ page }) => {
  await openLive(page, "fpPlot", "facet-partition");
  const state = await page.evaluate(async () => {
    const f = window.connectionsLive, plot = f.fpPlot;
    await plot.whenSettled();
    const cells = f.fpFacet.getFrames().map(({ frame, column }) => ({ column, x: frame.getFrameOptions().get("xrange") }));
    // One connection of four slots: vertices 0..3 (segment r runs vertex r -> r + 1).
    const start = await f.readField(f.fpLine, "start"), end = await f.readField(f.fpLine, "end");
    const vertices = [...start.slice(0, 3), end[2]];
    return {
      error: plot.getRenderError(),
      visits: vertices.map(([x, y]) => {
        const cell = cells.find((c) => x >= Math.min(...c.x) && x <= Math.max(...c.x));
        // Group p sits at (2, 2) in its cell, group q at (8, 8): below / above the middle.
        return `${cell?.column ?? "?"}${y < 0 ? "p" : "q"}`;
      }),
    };
  });
  expect(state).toEqual({ error: "", visits: ["Lp", "Lq", "Rp", "Rq"] });
});

test("each-frames: unnamed marks in {#each} Frames are four endpoints, not one repeated definition", async ({ page }) => {
  const { singleEndpointError } = await import("../../src/lib/plot/utils/connections.js");
  await openLive(page, "eachPlot", "each-frames");
  const read = () => page.evaluate(async () => {
    const f = window.connectionsLive, plot = f.eachPlot;
    await plot.whenSettled();
    const label = f.eachAxes[0].getMark().options.presentation.label, error = plot.getRenderError();
    if (error) return { error, label };
    // Three connections of four slots: vertex r = connection * 5 + slot (a separator between
    // connections); segment r runs vertex r -> r + 1.
    const start = await f.readField(f.eachLine, "start"), end = await f.readField(f.eachLine, "end");
    const vertex = (r) => (r < start.length ? start[r] : end[r - 1]);
    const drawn = [], expected = [];
    for (let c = 0; c < 3; c++)
      for (let s = 0; s < 4; s++) {
        drawn.push(vertex(c * 5 + s));
        expected.push(f.mapped(f.eachAxes[s], [0, f.eachRows[f.eachFields[s]][c], 0]));
      }
    return { error, drawn, expected, label };
  });
  const state = await read();
  expect(state.error).toBe("");
  // Every vertex sits on its own frame's point: four distinct columns, each id's value in each.
  expect(state.drawn.every((point, i) => close(point, state.expected[i])), JSON.stringify(state)).toBe(true);
  expect(new Set(state.expected.map((point) => point[0].toFixed(3))).size).toBe(4);
  // One of the handles alone is a single mark: nothing to connect, and no mention of facet cells.
  await page.evaluate(() => window.connectionsLive.setEachSingle(true));
  await expect.poll(() => page.evaluate(() => window.connectionsLive.eachPlot.getRenderError()))
    .toBe(`Line: ${singleEndpointError(state.label)}`);
});
