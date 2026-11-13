import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { pixelReader } from "../browser/png.js";
const base = process.env.HEATMAP_TEST_URL ?? "http://[::1]:5184";
const browser = await chromium.launch({
  channel: "chrome",
  args: ["--enable-unsafe-webgpu"],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 2 });
async function load(fixture) {
  await page.goto(`${base}/test/notebook?fixture=${fixture}`);
  await page.waitForFunction(
    () => window.notebookReady,
    {},
    { timeout: 20000 },
  );
  await page.waitForFunction(() => {
    const canvases = [...document.querySelectorAll(".canvas")];
    return canvases.length && canvases.every(canvas => canvas.getAttribute("aria-busy") === "false");
  }, null, { timeout: 20000 });
  await page.evaluate(() => Promise.all([...window.notebookRuntime.handles.values()]
    .filter(entry => entry.handle.whenSettled).map(entry => entry.handle.whenSettled())));
}
try {
  await load("09_callbacks");
  const point = await page.evaluate(() => {
    const h = [...window.notebookRuntime.handles.values()].find(
        (h) => h.handle.getAxisLayout,
      ),
      l = h.handle.getAxisLayout(),
      r = h.element.getBoundingClientRect();
    // The middle point, at (1, 0.5): halfway between the y ticks 0 and 1.
    const y0 = l.y.major.find((t) => t.value === 0).fraction, y1 = l.y.major.find((t) => t.value === 1).fraction;
    return {
      x: r.x + l.x.major.find((t) => t.value === 1).fraction * r.width,
      y: r.y + (1 - (y0 + y1) / 2) * r.height,
    };
  });
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(() =>
    window.notebookMessages.some((m) => m.type === "event"),
  );
  assert.equal(
    await page.evaluate(
      () =>
        window.notebookMessages.find((m) => m.type === "event").payload
          .source_index,
    ),
    1,
  );
  console.log("Picking: original source identity after automatic bounds");
  await load("05_linked");
  await page.evaluate(() => {
    const p = [...window.notebookRuntime.handles.values()].filter(
      (h) => h.handle.getAxisLayout,
    );
    p[1].handle.setViewport({ x: 0.5, y: 0.6, zoomX: 1, zoomY: 2 });
  });
  await page.waitForTimeout(300);
  const anchor = await page.evaluate(() => {
    const h = [...window.notebookRuntime.handles.values()].find(
        (h) => h.handle.getAxisLayout,
      ),
      r = h.element.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.bottom - 10 };
  });
  await page.mouse.move(anchor.x, anchor.y);
  await page.mouse.wheel(0, -180);
  await page.waitForTimeout(350);
  const views = await page.evaluate(() =>
    [...window.notebookRuntime.handles.values()]
      .filter((h) => h.handle.getAxisLayout)
      .map((h) => h.handle.getDiagnostics().viewport),
  );
  assert.equal(views[0].zoomX, views[1].zoomX);
  assert.equal(views[1].zoomY, 2);
  assert.equal(views[0].zoomY, 1);
  assert.ok(Math.abs(views[0].x - views[1].x) < 1e-5);
  console.log("Linked X: independent Y and no feedback");
  await load("03_facets");
  // Inputs (TODO 41): the Bins slider re-bins every facet cell, and its value is sent to Python.
  const binCounts = (bins) => page.waitForFunction((bins) => {
    const counts = [...window.notebookRuntime.handles.values()].map((h) => h.handle?.getMark?.()?.count).filter((n) => n !== undefined);
    return counts.length === 3 && counts.every((n) => n === bins);
  }, bins);
  await binCounts(12);
  const slider = await page.evaluate(() => {
    const find = (node) => (node.kind === "Slider" ? node : node.children.map(find).find(Boolean));
    return find(window.notebookState.root).id;
  });
  await page.getByRole("slider", { name: "Bins" }).fill("8");
  await binCounts(8);
  const sent = await page.evaluate(() =>
    (window.notebookMessages ?? []).filter((m) => m.type === "input").map(({ target, value }) => ({ target, value })));
  assert.deepEqual(sent, [{ target: slider, value: 8 }]);
  console.log("Inputs: a moved slider re-bins every cell and is sent to Python");
  await load("63_dragging");
  {
  // TODO 38.5: a drag sends the table's offsets and the dragend event to Python. A point is
  // found as a saturated pixel on the canvas.
  const canvas = page.locator(".canvas canvas").first();
  const read = pixelReader(await canvas.screenshot()), box = await canvas.boundingBox();
  const scale = await page.evaluate(() => devicePixelRatio);
  let point = null;
  for (let y = 0; y < box.height * scale && !point; y += 2)
    for (let x = 0; x < box.width * scale && !point; x += 2) {
      const [r, g, b] = read(x, y);
      if (Math.max(r, g, b) - Math.min(r, g, b) > 90) point = { x: box.x + x / scale + 1, y: box.y + y / scale + 1 };
    }
  assert.ok(point, "a point on the canvas");
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(point.x + i * 5, point.y);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  // The drag's last offsets reach Python before its dragend, so a callback reads them: the
  // offsets sent before dragend carry its final change (float32 in the browser).
  await page.waitForFunction(() => window.notebookMessages.some((m) => m.type === "event" && m.event === "dragend"));
  const sent = await page.evaluate(() => {
    const messages = window.notebookMessages, end = messages.findIndex((m) => m.type === "event" && m.event === "dragend");
    return { offsets: messages.slice(0, end).filter((m) => m.type === "offsets").at(-1), dragend: messages[end] };
  });
  const [column, change] = Object.entries(sent.dragend.payload.changes)[0];
  assert.ok(Math.abs(sent.offsets.columns[column].deltas[0] - change) <= 1e-5 * Math.max(1, Math.abs(change)));
  assert.equal(sent.offsets.columns[column].rows.length, 1);
  assert.ok(Number.isInteger(sent.offsets.table_version));
  // Python names the rows' keys from its table.
  assert.deepEqual([sent.dragend.payload.rows.length, typeof sent.dragend.payload.table], [1, "string"]);
  assert.equal(sent.dragend.payload.cancelled, false);
  // Exported HTML carries the browser's offsets.
  const embedded = await page.evaluate(async () => {
    const runtime = window.notebookRuntime, buffers = window.notebookBuffers;
    runtime.setSerializable(window.notebookState, (id) => ({ payload: Uint8Array.from(atob(buffers[id]), (c) => c.charCodeAt(0)) }), async () => "// (the standalone runtime)");
    const { blob } = await runtime.command({ command: "export_html", target: window.notebookState.root.id, args: {} });
    const html = await blob.text();
    return JSON.parse(html.match(/<script id="hmplot-state" type="application\/json">([\s\S]*?)<\/script>/)[1]).state;
  });
  const [table] = Object.values(embedded.tables);
  assert.deepEqual(table.offsets.columns[column].rows, sent.offsets.columns[column].rows);
  assert.ok(table.offsets.version > 0);
  console.log("Dragging: offsets and dragend sent to Python, and exported");
  }
} finally {
  await browser.close();
}
