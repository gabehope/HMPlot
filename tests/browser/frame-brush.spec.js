import { test, expect } from "./fixtures.js";

const PLOTS = ["inset", "shared", "columns", "twin", "logzero", "dated"];
const FRAMES = { inset: 2, shared: 3, columns: 5, twin: 2, logzero: 1, dated: 1 };
// Page-space geometry for a plot: its canvas host and each frame's layout rect. Scrolls the plot
// into view first when it is not fully visible.
async function geometry(page, key) {
  return page.evaluate(async ({ key, index, count }) => {
    const plot = window.frameBrush[key];
    for (let i = 0; i < 100 && !(plot.getAxes().length >= count && plot.getAxes().every((a) => a.getAxisLayout())); i++)
      await new Promise((r) => setTimeout(r, 50));
    await plot.whenSettled();
    const element = document.querySelectorAll('[aria-label="Plot canvas"]')[index];
    let host = element.getBoundingClientRect();
    if (host.top < 0 || host.bottom > innerHeight) {
      element.scrollIntoView({ block: "center" });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      host = element.getBoundingClientRect();
    }
    return { host: { left: host.left, top: host.top }, frames: plot.getAxes().map((a) => a.getAxisLayout()) };
  }, { key, index: PLOTS.indexOf(key), count: FRAMES[key] });
}
// Band rects inside one plot's canvas host, in host pixels.
const bands = (page, key, selector = ".brush-region.strip:not([data-dragging])") => page.evaluate(({ index, selector }) => {
  const host = document.querySelectorAll('[aria-label="Plot canvas"]')[index], origin = host.getBoundingClientRect();
  return [...host.querySelectorAll(selector)].map((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left - origin.left, right: r.right - origin.left, top: r.top - origin.top, bottom: r.bottom - origin.top, column: el.dataset.column };
  });
}, { index: PLOTS.indexOf(key), selector });
const constraints = (page, marks) => page.evaluate((marks) => {
  const binding = ((m) => m?.view.marks.of(m))(window.frameBrush[marks].getMark())?.interaction;
  return binding.brush.getConstraints(binding.owner);
}, marks);
async function shiftDrag(page, [x0, y0], [x1, y1]) {
  await page.keyboard.down("Shift");
  await page.mouse.move(x0, y0); await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 8 }); await page.mouse.up();
  await page.keyboard.up("Shift");
}
async function open(page) {
  await page.goto("/test/frame-brush");
  await page.waitForFunction(() => ["childPoints", "rightPoints", "agePoints", "twinPoints", "logPoints", "morningPoints"]
    .every((key) => ((m) => m?.view.marks.of(m))(window.frameBrush?.[key]?.getMark())?.interaction));
}
// Commit constraints the way Python or another view would: {axis: [low, high]} on a mark's columns.
const setConstraints = (page, marks, bounds) => page.evaluate(({ marks, bounds }) => {
  const binding = ((m) => m?.view.marks.of(m))(window.frameBrush[marks].getMark())?.interaction;
  binding.brush.setConstraints(binding.owner, Object.entries(bounds).map(([axis, value]) => {
    const column = binding.brushColumns[axis];
    return { identity: column.identity, name: column.name, type: column.type, bounds: value,
      evaluate: () => column.evaluateConstraint({ bounds: value }), release: () => {} };
  }));
}, { marks, bounds });
const renderError = (page, key) => page.evaluate((key) => window.frameBrush[key].getRenderError(), key);
const brushCount = (page, key) => page.evaluate((key) => window.frameBrush[key].getBrush().status().committedCount, key);
// Page coordinates of a band's middle, given band rects in host pixels.
const middle = (host, band) => [host.left + (band.left + band.right) / 2, host.top + (band.top + band.bottom) / 2];

test("a child y-strip brush draws only on the strip and constrains the child's column", async ({ page }) => {
  await open(page);
  const { host, frames: [root, child] } = await geometry(page, "inset");
  const h = child.bottom - child.top, x = host.left + child.left - 8;
  await shiftDrag(page, [x, host.top + child.top + 0.3 * h], [x, host.top + child.top + 0.6 * h]);
  await expect.poll(async () => (await bands(page, "inset")).length).toBe(1);
  const [band] = await bands(page, "inset");
  expect(band.right).toBeLessThanOrEqual(child.left + 1); // never over the child's interior
  expect(band.top).toBeGreaterThanOrEqual(child.top + 0.3 * h - 2);
  expect(band.bottom).toBeLessThanOrEqual(child.top + 0.6 * h + 2);
  const [constraint] = await constraints(page, "childPoints");
  expect(constraint.name).toBe("b");
  expect(constraint.origin).toBe("strip");
  expect(constraint.axis).toBe("y");
  expect(constraint.frame).toBeTruthy(); // published to Python with the frame that made it
  expect(await bands(page, "inset", ".brush-region:not(.strip)")).toHaveLength(0); // root band unchanged
});

test("an interior drag inside the child does not brush the child column", async ({ page }) => {
  await open(page);
  const { host, frames: [, child] } = await geometry(page, "inset");
  const cx = host.left + (child.left + child.right) / 2, cy = host.top + (child.top + child.bottom) / 2;
  await shiftDrag(page, [cx - 20, cy - 20], [cx + 20, cy + 20]);
  await page.waitForTimeout(300);
  expect((await constraints(page, "childPoints")).filter((c) => c.name === "b")).toHaveLength(0);
  expect(await bands(page, "inset")).toHaveLength(0);
});

test("one constraint on a shared column shows on every strip, edits from any strip, reprojects, and Escape clears it", async ({ page }) => {
  await open(page);
  const { host, frames: [, left, right] } = await geometry(page, "shared");
  const h = left.bottom - left.top;
  await shiftDrag(page, [host.left + left.left - 8, host.top + left.top + 0.25 * h], [host.left + left.left - 8, host.top + left.top + 0.5 * h]);
  await expect.poll(async () => (await bands(page, "shared")).length).toBe(2);
  const before = await bands(page, "shared");
  expect(before[0].bottom - before[0].top).toBeCloseTo(before[1].bottom - before[1].top, 0);
  // Wheel over the right strip's band resizes the one constraint, so both bands change.
  const rb = before.find((b) => b.left > right.left - 50);
  await page.mouse.move(host.left + (rb.left + rb.right) / 2, host.top + (rb.top + rb.bottom) / 2);
  await page.mouse.wheel(0, -200);
  // After the wheel commits, both strips show the resized constraint.
  const heights = async () => { const now = await bands(page, "shared"); return now.length === 2 ? now.map((b) => Math.round(b.bottom - b.top)) : null; };
  await expect.poll(async () => { const now = await heights(); return now && now[0] > Math.round(before[0].bottom - before[0].top) + 2; }).toBe(true);
  const wheeled = await bands(page, "shared");
  expect(wheeled[0].bottom - wheeled[0].top).toBeCloseTo(wheeled[1].bottom - wheeled[1].top, 0);
  // Bands follow the root camera.
  await page.evaluate(() => window.frameBrush.shared.setViewport({ zoomX: 1, zoomY: 1.6, x: 0.5, y: 0.5 }));
  await expect.poll(async () => Math.round((await bands(page, "shared"))[0]?.top ?? -1)).not.toBe(Math.round(wheeled[0].top));
  // Escape clears the most recently edited band.
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await bands(page, "shared")).length).toBe(0);
  expect(await constraints(page, "leftPoints")).toHaveLength(0);
});

test("arrow keys nudge a focused strip band", async ({ page }) => {
  await open(page);
  const { host, frames: [, child] } = await geometry(page, "inset");
  const h = child.bottom - child.top, x = host.left + child.left - 8;
  await shiftDrag(page, [x, host.top + child.top + 0.3 * h], [x, host.top + child.top + 0.6 * h]);
  await expect.poll(async () => (await bands(page, "inset")).length).toBe(1);
  const [before] = await constraints(page, "childPoints");
  await page.locator('[aria-label="Plot canvas"] .brush-region.strip').first().focus();
  await page.keyboard.press("Shift+ArrowUp");
  await expect.poll(async () => (await constraints(page, "childPoints"))[0]?.bounds[1]).toBeGreaterThan(before.bounds[1]);
  const [after] = await constraints(page, "childPoints");
  expect(after.bounds[1] - after.bounds[0]).toBeCloseTo(before.bounds[1] - before.bounds[0], 3); // moved, not resized
});

test("root brush edges grab from outside, show a resize cursor, and resize one side", async ({ page }) => {
  await open(page);
  const { host, frames: [root] } = await geometry(page, "inset");
  const x0 = host.left + root.left + 20, y0 = host.top + root.top + 30;
  await shiftDrag(page, [x0, y0], [x0 + 120, y0 + 120]);
  await expect.poll(async () => (await bands(page, "inset", ".brush-region:not(.strip)")).length).toBe(1);
  const [rect] = await bands(page, "inset", ".brush-region:not(.strip)");
  const xBefore = (await constraints(page, "rootPoints")).find((c) => c.name === "x");
  // Membership on the GPU matches the rows inside the constraints, before and after the resize.
  const expected = (bounds) => page.evaluate((bounds) => { const { data } = window.frameBrush;
    return data.x.filter((x, i) => bounds.every((c) => data[c.name][i] >= c.bounds[0] && data[c.name][i] <= c.bounds[1])).length; }, bounds);
  const countBefore = await expected(await constraints(page, "rootPoints"));
  await expect.poll(() => brushCount(page, "inset")).toBe(countBefore);
  await page.mouse.move(host.left + rect.right + 4, host.top + (rect.top + rect.bottom) / 2); // 4 px outside the edge
  await expect.poll(() => page.evaluate(() => document.querySelector('[aria-label="Plot canvas"]').style.cursor)).toBe("ew-resize");
  await page.mouse.down();
  await page.mouse.move(host.left + rect.right + 44, host.top + (rect.top + rect.bottom) / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await constraints(page, "rootPoints")).find((c) => c.name === "x")?.bounds[1]).toBeGreaterThan(xBefore.bounds[1]);
  const xAfter = (await constraints(page, "rootPoints")).find((c) => c.name === "x");
  expect(xAfter.bounds[0]).toBeCloseTo(xBefore.bounds[0], 3);
  const countAfter = await expected(await constraints(page, "rootPoints"));
  expect(countAfter).not.toBe(countBefore);
  await expect.poll(() => brushCount(page, "inset")).toBe(countAfter);
});

test("dragging a strip band issues at most one preview per animation frame", async ({ page }) => {
  await open(page);
  const { host, frames: [, child] } = await geometry(page, "inset");
  const h = child.bottom - child.top, x = host.left + child.left - 8;
  await page.evaluate(() => {
    const binding = ((m) => m?.view.marks.of(m))(window.frameBrush.childPoints.getMark())?.interaction, set = binding.brush.setConstraints.bind(binding.brush);
    window.__stripPreviews = 0; window.__frames = 0;
    binding.brush.setConstraints = (...args) => { if (args[2]?.phase === "preview") window.__stripPreviews++; return set(...args); };
    const tick = () => { window.__frames++; if (window.__counting) requestAnimationFrame(tick); };
    window.__counting = true; requestAnimationFrame(tick);
  });
  await page.keyboard.down("Shift");
  await page.mouse.move(x, host.top + child.top + 0.2 * h); await page.mouse.down();
  for (let i = 0; i < 120; i++) await page.mouse.move(x, host.top + child.top + (0.2 + 0.6 * i / 120) * h);
  await page.mouse.up(); await page.keyboard.up("Shift");
  const counts = await page.evaluate(() => { window.__counting = false; return { previews: window.__stripPreviews, frames: window.__frames }; });
  expect(counts.previews).toBeGreaterThan(0);
  expect(counts.previews).toBeLessThanOrEqual(counts.frames + 2);
});

test("brushes constrain the data values under the dragged pixels, on the root and on strips", async ({ page }) => {
  await open(page);
  const { host, frames: [root, child] } = await geometry(page, "inset");
  const W = root.right - root.left, H = root.bottom - root.top;
  // Root interior: x 10..30, a 20..60. Margins must not rescale the visible world range.
  await shiftDrag(page, [host.left + root.left + 0.1 * W, host.top + root.bottom - 0.6 * H],
    [host.left + root.left + 0.3 * W, host.top + root.bottom - 0.2 * H]);
  await expect.poll(async () => (await constraints(page, "rootPoints")).length).toBe(2);
  const bounds = Object.fromEntries((await constraints(page, "rootPoints")).map((c) => [c.name, c.bounds]));
  expect(bounds.x[0]).toBeCloseTo(10, 0); expect(bounds.x[1]).toBeCloseTo(30, 0);
  expect(bounds.a[0]).toBeCloseTo(20, 0); expect(bounds.a[1]).toBeCloseTo(60, 0);
  // Child strip: the child spans its whole y domain, so 30%..60% down is b 70..40.
  const h = child.bottom - child.top, x = host.left + child.left - 8;
  await shiftDrag(page, [x, host.top + child.top + 0.3 * h], [x, host.top + child.top + 0.6 * h]);
  await expect.poll(async () => (await constraints(page, "childPoints")).some((c) => c.name === "b")).toBe(true);
  const b = (await constraints(page, "childPoints")).find((c) => c.name === "b").bounds;
  expect(b[0]).toBeCloseTo(40, 0); expect(b[1]).toBeCloseTo(70, 0);
});

test("Escape belongs to the plot under the pointer or with focus, never to a text field", async ({ page }) => {
  await open(page);
  let { host, frames: [, child] } = await geometry(page, "inset");
  const h = child.bottom - child.top, x = host.left + child.left - 8;
  await shiftDrag(page, [x, host.top + child.top + 0.3 * h], [x, host.top + child.top + 0.6 * h]);
  const { host: shost, frames: [, left] } = await geometry(page, "shared");
  const lh = left.bottom - left.top;
  await shiftDrag(page, [shost.left + left.left - 8, shost.top + left.top + 0.25 * lh], [shost.left + left.left - 8, shost.top + left.top + 0.5 * lh]);
  await expect.poll(async () => (await bands(page, "shared")).length).toBe(2);
  const names = async (marks) => (await constraints(page, marks)).map((c) => c.name).sort();
  expect(await names("childPoints")).toContain("b");
  // The pointer is still over the shared plot, but Escape in a text field is the field's.
  await page.getByLabel("Notes").focus();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  expect(await names("childPoints")).toContain("b");
  expect(await names("leftPoints")).toContain("a");
  // With nothing focused, Escape clears only the plot under the pointer.
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press("Escape");
  await expect.poll(() => names("leftPoints")).not.toContain("a");
  expect(await names("childPoints")).toContain("b");
});

test("a click on a band leaves a constraint that reaches past the strip whole", async ({ page }) => {
  await open(page);
  const { host, frames: [, child] } = await geometry(page, "inset");
  await setConstraints(page, "childPoints", { y: [-50, 60] });
  await expect.poll(async () => (await bands(page, "inset")).length).toBe(1);
  const [band] = await bands(page, "inset");
  expect(band.bottom).toBeCloseTo(child.bottom, 0); // clipped to the strip
  await page.mouse.click(...middle(host, band));
  await page.waitForTimeout(200);
  expect((await constraints(page, "childPoints"))[0].bounds).toEqual([-50, 60]);
  // Resizing the top edge keeps the part below the strip.
  const top = host.top + band.top + 1, cx = host.left + (band.left + band.right) / 2;
  await page.mouse.move(cx, top); await page.mouse.down();
  await page.mouse.move(cx, top - 20, { steps: 5 }); await page.mouse.up();
  await expect.poll(async () => (await constraints(page, "childPoints"))[0].bounds[1]).toBeGreaterThan(62);
  expect((await constraints(page, "childPoints"))[0].bounds[0]).toBeCloseTo(-50, 6);
  expect(await renderError(page, "inset")).toBe("");
});

test("bands drag when child frames brush on different axes", async ({ page }) => {
  await open(page);
  const { host, frames: [, , weight] } = await geometry(page, "columns");
  const h = weight.bottom - weight.top, x = host.left + weight.left - 8;
  await shiftDrag(page, [x, host.top + weight.top + 0.3 * h], [x, host.top + weight.top + 0.5 * h]);
  await expect.poll(async () => (await constraints(page, "weightPoints")).some((c) => c.name === "weight")).toBe(true);
  const before = (await constraints(page, "weightPoints")).find((c) => c.name === "weight").bounds;
  const [band] = (await bands(page, "columns")).filter((b) => b.column === "weight");
  const [mx, my] = middle(host, band);
  await page.mouse.move(mx, my); await page.mouse.down();
  await page.mouse.move(mx, my + 30, { steps: 6 }); await page.mouse.up();
  await expect.poll(async () => (await constraints(page, "weightPoints")).find((c) => c.name === "weight").bounds[1]).toBeLessThan(before[1] - 5);
  expect(await renderError(page, "columns")).toBe("");
});

test("Escape during a strip wheel restores the band and the constraint", async ({ page }) => {
  await open(page);
  const { host, frames: [, child] } = await geometry(page, "inset");
  const h = child.bottom - child.top, x = host.left + child.left - 8;
  await shiftDrag(page, [x, host.top + child.top + 0.3 * h], [x, host.top + child.top + 0.6 * h]);
  await expect.poll(async () => (await bands(page, "inset")).length).toBe(1);
  const [band] = await bands(page, "inset"), [before] = await constraints(page, "childPoints");
  const [mx, my] = middle(host, band);
  await page.mouse.move(mx, my);
  // Wheel and Escape inside the 150 ms commit window.
  await page.evaluate(([clientX, clientY]) => {
    document.elementFromPoint(clientX, clientY).dispatchEvent(new WheelEvent("wheel", { clientX, clientY, deltaY: -300, bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  }, [mx, my]);
  await page.waitForTimeout(250);
  expect(await page.locator("[data-dragging]").count()).toBe(0);
  const [after] = await bands(page, "inset");
  expect(after.top).toBeCloseTo(band.top, 0); expect(after.bottom).toBeCloseTo(band.bottom, 0);
  expect((await constraints(page, "childPoints"))[0].bounds).toEqual(before.bounds);
});

test("a twin axis brushes its own column on its own strip", async ({ page }) => {
  await open(page);
  const { host, frames: [root] } = await geometry(page, "twin");
  const h = root.bottom - root.top, x = host.left + root.right + 10;
  await shiftDrag(page, [x, host.top + root.top + 0.3 * h], [x, host.top + root.top + 0.6 * h]);
  await expect.poll(async () => (await bands(page, "twin")).length).toBe(1);
  const [band] = await bands(page, "twin");
  expect(band.left).toBeGreaterThanOrEqual(root.right - 1); // on the right strip only
  expect(await bands(page, "twin", ".brush-region:not(.strip)")).toHaveLength(0); // root band unchanged
  const all = await constraints(page, "twinPoints");
  expect(all.map((c) => c.name)).toEqual(["b"]);
  const frames = await page.evaluate(() => [window.frameBrush.twinPoints, window.frameBrush.twinRootPoints].map((m) => ((m) => m?.view.marks.of(m))(m.getMark())?.interaction.frameKey));
  expect(all[0].frame).toBe(frames[0]);
  expect(all[0].frame).not.toBe(frames[1]);
  // The twin maps b over [0, 200]: 30%..60% down the plot is b 140..80.
  expect(all[0].bounds[0]).toBeCloseTo(80, -1); expect(all[0].bounds[1]).toBeCloseTo(140, -1);
});

test("the root controls do not count a constraint a strip band shows", async ({ page }) => {
  await open(page);
  const { host, frames: [root, child] } = await geometry(page, "inset");
  const h = child.bottom - child.top, x = host.left + child.left - 8;
  await shiftDrag(page, [x, host.top + child.top + 0.3 * h], [x, host.top + child.top + 0.6 * h]);
  await expect.poll(async () => (await bands(page, "inset")).length).toBe(1);
  await page.mouse.move(host.left + root.left + 40, host.top + root.top + 40);
  const controls = page.locator('[aria-label="Plot canvas"]').first().locator(".brush-other:not(.band-controls)");
  await expect(controls).toBeVisible();
  await expect(controls).not.toContainText("other constraint");
});

test("every edit path sets the band Escape clears, and removals forget it", async ({ page }) => {
  await open(page);
  const { host, frames: [root, child] } = await geometry(page, "inset");
  const h = child.bottom - child.top, x = host.left + child.left - 8;
  const names = async () => (await constraints(page, "rootPoints")).map((c) => c.name).sort();
  await shiftDrag(page, [x, host.top + child.top + 0.3 * h], [x, host.top + child.top + 0.6 * h]);
  await expect.poll(names).toEqual(["b"]);
  // A root rectangle set from outside, then scaled with the wheel: Escape clears it, not b.
  await setConstraints(page, "rootPoints", { x: [10, 40], y: [10, 40] });
  await expect.poll(async () => (await bands(page, "inset", ".brush-region:not(.strip)")).length).toBe(1);
  const [rect] = await bands(page, "inset", ".brush-region:not(.strip)");
  await page.mouse.move(...middle(host, rect));
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await expect.poll(names).toEqual(["b"]);
  // The same after an Arrow nudge of the root rectangle.
  await setConstraints(page, "rootPoints", { x: [10, 40], y: [10, 40] });
  await expect.poll(async () => (await bands(page, "inset", ".brush-region:not(.strip)")).length).toBe(1);
  await page.locator('[aria-label="Plot canvas"]').first().locator(".brush-region:not(.strip)").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");
  await expect.poll(names).toEqual(["b"]);
  // Delete removes b and forgets it: the next Escape dismisses the controls instead of doing nothing.
  await setConstraints(page, "rootPoints", { x: [10, 40], y: [10, 40] });
  await page.locator('[aria-label="Plot canvas"]').first().locator(".brush-region.strip").focus();
  await page.keyboard.press("Delete");
  await expect.poll(names).toEqual(["a", "x"]);
  await page.mouse.move(host.left + root.left + 300, host.top + root.top + 250);
  const controls = page.locator('[aria-label="Plot canvas"]').first().locator(".brush-other:not(.band-controls)");
  await expect(controls).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(controls).toBeHidden();
  expect(await names()).toEqual(["a", "x"]);
});

test("bands of one constraint share hover and focus, with a clear control on the band", async ({ page }) => {
  await open(page);
  const { host, frames: [, left] } = await geometry(page, "shared");
  const lh = left.bottom - left.top, create = () => shiftDrag(page,
    [host.left + left.left - 8, host.top + left.top + 0.25 * lh], [host.left + left.left - 8, host.top + left.top + 0.5 * lh]);
  await create();
  await expect.poll(async () => (await bands(page, "shared")).length).toBe(2);
  const plot = page.locator('[aria-label="Plot canvas"]').nth(1);
  const [, right] = await bands(page, "shared");
  await page.mouse.move(...middle(host, right));
  await expect(plot.locator(".brush-region.strip[data-active]")).toHaveCount(2);
  const control = plot.locator(".band-controls");
  await expect(control).toBeVisible();
  // The pointer can reach the control without losing the band.
  const box = await control.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
  await control.getByRole("button", { name: "Clear a" }).click();
  await expect.poll(async () => (await constraints(page, "leftPoints")).length).toBe(0);
  // Keyboard focus activates every band of the constraint too, and "Clear current" clears it.
  await create();
  await expect.poll(async () => (await bands(page, "shared")).length).toBe(2);
  await page.mouse.move(1, 1); // clearing dismissed the controls until the pointer comes back
  await plot.locator(".brush-region.strip").first().focus();
  await expect(plot.locator(".brush-region.strip[data-active]")).toHaveCount(2);
  await page.mouse.move(host.left + 300, host.top + 20);
  await plot.locator(".brush-other:not(.band-controls)").getByRole("button", { name: "Clear current" }).click();
  await expect.poll(async () => (await constraints(page, "leftPoints")).length).toBe(0);
});

test("Shift-drag on a strip whose marks plot different columns reports it", async ({ page }) => {
  await open(page);
  const { host, frames } = await geometry(page, "columns"), ambiguous = frames[4];
  const h = ambiguous.bottom - ambiguous.top, x = host.left + ambiguous.left - 8;
  await shiftDrag(page, [x, host.top + ambiguous.top + 0.3 * h], [x, host.top + ambiguous.top + 0.6 * h]);
  await expect.poll(() => renderError(page, "columns")).toContain("ambiguous");
  expect(await renderError(page, "columns")).toContain("height, weight");
  expect(await constraints(page, "heightPoints")).toHaveLength(0);
  expect(await bands(page, "columns", ".brush-region")).toHaveLength(0);
});

test("brushing an axis with no valid domain reports it instead of storing NaN bounds", async ({ page }) => {
  await open(page);
  const { host, frames: [root] } = await geometry(page, "logzero");
  const w = root.right - root.left, h = root.bottom - root.top;
  await shiftDrag(page, [host.left + root.left + 0.2 * w, host.top + root.top + 0.2 * h], [host.left + root.left + 0.6 * w, host.top + root.top + 0.7 * h]);
  await expect.poll(() => renderError(page, "logzero")).toBe("This axis has no valid domain to brush.");
  expect(await constraints(page, "logPoints")).toHaveLength(0);
});

test("constraints on different columns AND together, counted on the GPU", async ({ page }) => {
  await open(page);
  const { host, frames } = await geometry(page, "columns");
  const spans = [[1, 0.2, 0.7], [2, 0.3, 0.9], [3, 0.1, 0.6]];
  for (const [index, from, to] of spans) {
    const f = frames[index], h = f.bottom - f.top, x = host.left + f.left - 8;
    await shiftDrag(page, [x, host.top + f.top + from * h], [x, host.top + f.top + to * h]);
  }
  await expect.poll(async () => (await constraints(page, "agePoints")).map((c) => c.name).sort()).toEqual(["age", "height", "weight"]);
  expect(await bands(page, "columns")).toHaveLength(3);
  const all = await constraints(page, "agePoints");
  const expected = await page.evaluate((all) => { const { data } = window.frameBrush;
    return data.x.filter((_, i) => all.every((c) => data[c.name][i] >= c.bounds[0] && data[c.name][i] <= c.bounds[1])).length; }, all);
  const single = await page.evaluate((all) => { const { data } = window.frameBrush;
    return data.x.filter((_, i) => data[all[0].name][i] >= all[0].bounds[0] && data[all[0].name][i] <= all[0].bounds[1]).length; }, all);
  expect(expected).toBeGreaterThan(0);
  expect(expected).toBeLessThan(single); // the other two columns remove rows
  await expect.poll(() => brushCount(page, "columns")).toBe(expected);
});

test("dragging a strip band's edge edits the constraint and moves the sibling band; edges show resize cursors", async ({ page }) => {
  await open(page);
  const { host, frames: [, left] } = await geometry(page, "shared");
  const lh = left.bottom - left.top;
  await shiftDrag(page, [host.left + left.left - 8, host.top + left.top + 0.3 * lh], [host.left + left.left - 8, host.top + left.top + 0.6 * lh]);
  await expect.poll(async () => (await bands(page, "shared")).length).toBe(2);
  const [before] = await constraints(page, "leftPoints"), [leftBand, rightBand] = await bands(page, "shared");
  const cx = host.left + (rightBand.left + rightBand.right) / 2, top = host.top + rightBand.top + 1;
  await page.mouse.move(cx, top);
  const cursor = () => page.evaluate(() => {
    const band = document.querySelectorAll('[aria-label="Plot canvas"]')[1].querySelectorAll(".brush-region.strip")[1];
    return getComputedStyle(band).cursor;
  });
  await expect.poll(cursor).toBe("ns-resize");
  await page.mouse.down();
  await page.mouse.move(cx, top - 25, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await constraints(page, "leftPoints"))[0].bounds[1]).toBeGreaterThan(before.bounds[1] + 3);
  expect((await constraints(page, "leftPoints"))[0].bounds[0]).toBeCloseTo(before.bounds[0], 3);
  await expect.poll(async () => (await bands(page, "shared"))[0].top).toBeLessThan(leftBand.top - 15);
});

test("strips follow the axis style: hidden tick labels leave only the ticks brushable", async ({ page }) => {
  await open(page);
  const { host, frames: [, child] } = await geometry(page, "inset");
  const h = child.bottom - child.top, drag = (dx) => shiftDrag(page,
    [host.left + child.left - dx, host.top + child.top + 0.3 * h], [host.left + child.left - dx, host.top + child.top + 0.6 * h]);
  await page.evaluate(() => window.frameBrush.inset.getAxes()[1].getFrameOptions().child("plot").set("axisTickLabels", false));
  await page.waitForTimeout(200);
  // Where the labels were is no longer the child's strip: the gesture brushes the root instead.
  await drag(16);
  await page.waitForTimeout(200);
  expect((await constraints(page, "childPoints")).some((c) => c.name === "b")).toBe(false);
  expect(await bands(page, "inset")).toHaveLength(0);
  // The tick marks themselves still are.
  await drag(2);
  await expect.poll(async () => (await constraints(page, "childPoints")).some((c) => c.name === "b")).toBe(true);
  expect(await bands(page, "inset")).toHaveLength(1);
});

test("datetime tables that start at different times share an axis, and a brush reads epoch milliseconds (TODO 48.1)", async ({ page }) => {
  await open(page);
  const { host, frames: [frame] } = await geometry(page, "dated");
  // The axis spans both tables, second by second: float32 epoch milliseconds step by 131 s.
  const domain = await page.evaluate(() => {
    const options = window.frameBrush.dated.getAxes()[0].getFrameOptions();
    return options.get("xbounds").map((value) => value + options.child("plot").get("axisXTimeOrigin") - window.frameBrush.start);
  });
  expect(domain[0]).toBeLessThanOrEqual(0);
  expect(domain[0]).toBeGreaterThan(-5000);
  expect(domain[1]).toBeGreaterThanOrEqual(39000);
  expect(domain[1]).toBeLessThan(45000);
  const w = frame.right - frame.left, y = host.top + (frame.top + frame.bottom) / 2;
  await shiftDrag(page, [host.left + frame.left + 0.02 * w, y], [host.left + frame.left + 0.15 * w, y]);
  const count = () => page.evaluate(() => ((m) => m?.view.marks.of(m))(window.frameBrush.morningPoints.getMark())?.interaction.brush.status().committedCount);
  await expect.poll(count).toBeGreaterThan(0);
  const [constraint] = await constraints(page, "morningPoints");
  const start = await page.evaluate(() => window.frameBrush.start);
  const [low, high] = constraint.bounds.map((value) => value - start);
  expect(low).toBeGreaterThan(-5000);
  expect(high).toBeLessThan(15000);
  // Rows 0..9 are 0 s..9 s: the brush holds those inside its bounds.
  const inside = Array.from({ length: 10 }, (_, i) => i * 1000).filter((t) => t >= low && t <= high).length;
  expect(inside).toBeGreaterThan(0);
  expect(await count()).toBe(inside);
});
