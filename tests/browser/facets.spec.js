import { test, expect } from "./fixtures.js";
import { nodeOnScreen } from "./force-drag.js";

async function open(page) {
  const issues = [];
  page.on("pageerror", (e) => issues.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /GPU|WGSL|shader|validation/i.test(m.text()))
      issues.push(m.text());
  });
  // The multi-mode facets component these library tests drive (its dev hooks replace the data and
  // reach the Facet, the plot and the swarm's points) is a fixture now: the public gallery's
  // /examples/facets is the paired program (TODO 69.16), checked in examples.spec.js.
  await page.goto("/test/gallery-example?id=facets");
  await page.waitForFunction(
    () => window.__facetExample?.facet?.getPlots().length > 0,
  );
  await page.evaluate(() => window.__facetExample.facet.whenSettled());
  return issues;
}
async function mode(page, value) {
  // The fixture's own select (the docs Example around it is a region labeled "Example" too).
  await page.getByRole("combobox", { name: "Example", exact: true }).selectOption(value);
}
// A Force example's iteration and selected node, read once from its handle's status.
function forceStatus(page) {
  return page.evaluate(() => {
    let status;
    window.__transformExample.force.subscribe((s) => (status = s))();
    return { iteration: status.iteration, selected: status.selected };
  });
}
async function settle(page) {
  await page.waitForTimeout(100);
  await page.evaluate(() => window.__facetExample.plot?.whenSettled());
}
async function swarm(page) {
  return page.evaluate(async () => {
    const { guideObject } = await import("/src/lib/plot/utils/guides.js");
    const m = guideObject(window.__facetExample.points.getLegendSource());
    await m.manager.chain;
    const a = m.fields.get("dy").data;
    return a?.ref ? Array.from(await a.ref.data()) : [];
  });
}

test("facets virtualize plots but share offscreen domains, preserve state, and export the grid", async ({
  page,
}) => {
  const issues = await open(page);
  await expect(page.locator(".facet-cell")).toHaveCount(3);
  await page.evaluate(() =>
    window.__facetExample.replace({
      x: Array.from({ length: 48 }, (_, i) => Math.floor(i / 4) * 10 + (i % 4)),
      y: Array.from({ length: 48 }, (_, i) => i % 4),
      group: Array.from({ length: 48 }, (_, i) => "G" + Math.floor(i / 4)),
    }),
  );
  // The stable inferred domain retains the previous three categories as empty cells.
  await expect(page.locator(".facet-cell")).toHaveCount(15);
  await page.evaluate(() => window.__facetExample.facet.whenSettled());
  const start = await page.evaluate(() => ({
    mounted: window.__facetExample.facet.getPlots().length,
    ticks: window.__facetExample.facet
      .getPlots()[0]
      .plot.getAxisLayout()
      .x.major.map((t) => t.value),
  }));
  expect(start.mounted).toBeLessThan(15);
  expect(Math.max(...start.ticks)).toBeGreaterThan(80);
  await page.locator(".facet-cell").last().scrollIntoViewIfNeeded();
  await page.evaluate(() => window.__facetExample.facet.whenSettled());
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__facetExample.facet.getPlots().some((p) => p.column === "G11"),
      ),
    )
    .toBe(true);
  const png = await page.evaluate(async () => {
    const b = await window.__facetExample.facet.exportPNG();
    const image = await createImageBitmap(b);
    const c = document.createElement("canvas");
    c.width = image.width;
    c.height = image.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
    let colored = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (
        Math.max(...pixels.slice(i, i + 3)) -
          Math.min(...pixels.slice(i, i + 3)) >
        30
      )
        colored++;
    image.close();
    return { width: c.width, height: c.height, colored };
  });
  expect(png.height).toBeGreaterThan(1000);
  expect(png.colored).toBeGreaterThan(300);
  await page.setViewportSize({ width: 520, height: 900 });
  await page.locator(".facet-cell").first().scrollIntoViewIfNeeded();
  await page.evaluate(() => window.__facetExample.facet.whenSettled());
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
  ).toBe(true);
  expect(issues).toEqual([]);
});

test("all transform examples render, and bin preparation reads only compact metadata", async ({
  page,
}) => {
  const issues = await open(page);
  for (const value of ["matrix", "global", "histogram", "stack"]) {
    await mode(page, value);
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__facetExample.facet.whenSettled());
    expect(await page.locator(".facet-cell canvas").count()).toBeGreaterThan(0);
  }
  await mode(page, "histogram");
  await page.evaluate(() => window.__facetExample.facet.whenSettled());
  await page.evaluate(async () => {
    const a = await import("/tests/browser/guide-audit.js");
    a.beginGuideAudit();
  });
  await page.getByLabel("Bins", { exact: true }).fill("12");
  await page.evaluate(() => window.__facetExample.facet.whenSettled());
  const reads = await page.evaluate(async () => {
    const a = await import("/tests/browser/guide-audit.js");
    return a.finishGuideAudit();
  });
  // Scalars, and each mark's extents in one read ([min, max] per position field: 8 values for
  // x0/x1/y0/y1, 17.2b); never a 12-bin column.
  expect(reads.every((n) => n <= 8), JSON.stringify(reads)).toBe(true);
  for (const value of ["hex", "bins", "voxel", "signal"]) {
    await mode(page, value);
    await settle(page);
    await expect
      .poll(() =>
        page.evaluate(
          () => window.__facetExample.plot?.getDiagnostics().marks.length ?? 0,
        ),
      )
      .toBeGreaterThan(0);
    if (value !== "signal") {
      await page.getByLabel("View", { exact: true }).selectOption("2d");
      await settle(page);
      await page.getByLabel("View", { exact: true }).selectOption("3d");
      await settle(page);
    }
  }
  expect(issues).toEqual([]);
});

test("swarm responds to effective glyph size and zoom with one readback per layout, without reallocating marks", async ({
  page,
}) => {
  const issues = await open(page);
  await mode(page, "swarm");
  await expect
    .poll(async () => {
      try {
        return (await swarm(page)).length;
      } catch {
        return 0;
      }
    })
    .toBe(120);
  const first = await swarm(page);
  await settle(page);
  const before = await page.evaluate(() =>
    window.__facetExample.plot.getDiagnostics(),
  );
  await page.evaluate(async () => {
    const a = await import("/tests/browser/guide-audit.js");
    a.beginGuideAudit();
    const { guideObject } = await import("/src/lib/plot/utils/guides.js");
    const m = guideObject(window.__facetExample.points.getLegendSource());
    m.options.set("displayScale", 1.7);
  });
  // Completion is checked via prepared field identity, not per-frame data reads.
  await page.waitForTimeout(2500);
  await settle(page);
  const reads = await page.evaluate(async () => {
    const a = await import("/tests/browser/guide-audit.js");
    return a.finishGuideAudit();
  });
  // Dodge reads its placement inputs back once per layout (TODO 30.10: x, radius, group and
  // the seeded order, 4 values per glyph, placed on the host) and never the other plotting
  // columns; anything else it reads is a compact scalar.
  const layouts = reads.filter((size) => size > 1);
  expect(layouts.length).toBeGreaterThanOrEqual(1);
  expect(layouts.every((size) => size === 4 * 120)).toBe(true);
  const bigger = await swarm(page);
  expect(Math.max(...bigger) - Math.min(...bigger)).toBeGreaterThan(
    Math.max(...first) - Math.min(...first),
  );
  const canvas = page.locator(".canvas").first(),
    box = await canvas.boundingBox();
  // A zoom gesture lays out once, when the pixel scale is still (TODO 30.9; it was once per
  // zoom frame), and whenSettled() includes that layout. The steps are sent from the page:
  // a round trip per step can pause the gesture past the 150 ms wait on a loaded machine.
  await page.evaluate(async ({ clientX, clientY }) => {
    const a = await import("/tests/browser/guide-audit.js");
    a.beginGuideAudit();
    for (let step = 0; step < 6; step++) {
      document.elementFromPoint(clientX, clientY).dispatchEvent(new WheelEvent("wheel", { clientX, clientY, deltaY: -50, bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }, { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 });
  await settle(page);
  expect(await swarm(page)).not.toEqual(bigger);
  const zoomReads = await page.evaluate(async () => {
    const a = await import("/tests/browser/guide-audit.js");
    return a.finishGuideAudit();
  });
  expect(zoomReads.filter((size) => size === 4 * 120)).toHaveLength(1);
  const after = await page.evaluate(() =>
    window.__facetExample.plot.getDiagnostics(),
  );
  expect(after.managers).toBe(before.managers);
  expect(issues).toEqual([]);
});

test("prism faces pick aggregates and failed data replacement retains the completed view", async ({
  page,
}) => {
  const issues = await open(page);
  await mode(page, "hex");
  await page.getByLabel("View", { exact: true }).selectOption("2d");
  await page.getByLabel("Bins", { exact: true }).fill("3");
  await page.evaluate(() =>
    window.__facetExample.replace({
      x: [0, 0, 2, 2],
      y: [0, 0, 2, 2],
      group: ["A", "A", "B", "B"],
    }),
  );
  await settle(page);
  await page.waitForTimeout(500);
  const canvas = page.locator(".canvas").first(),
    box = await canvas.boundingBox();
  const at = await page.evaluate(() => {
    const layout = window.__facetExample.plot.getAxisLayout();
    return [layout.x.major.find(t => t.value === 0).fraction,
      1 - layout.y.major.find(t => t.value === 0).fraction];
  });
  await page.mouse.click(box.x + box.width * at[0], box.y + box.height * at[1]);
  await expect(page.getByLabel("Selected bin")).toHaveText("2 observations");
  const before = await page.evaluate(() =>
    window.__facetExample.plot
      .getDiagnostics()
      .marks.map((m) => m.fields.position?.count),
  );
  await page.evaluate(() =>
    window.__facetExample.replace({ x: [0, 1], y: [0] }),
  );
  await expect(page.getByRole("alert")).toBeVisible();
  expect(
    await page.evaluate(() =>
      window.__facetExample.plot
        .getDiagnostics()
        .marks.map((m) => m.fields.position?.count),
    ),
  ).toEqual(before);
  expect(issues).toEqual([]);
});

test("matrix linked zoom preserves complete source gestures", async ({
  page,
}) => {
  const issues = await open(page);
  await mode(page, "matrix");
  await page.evaluate(() => window.__facetExample.facet.whenSettled());
  const canvas = page.locator(".facet-cell canvas").first();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.45);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(150);
  const zoomed = await page.evaluate(
    () =>
      window.__facetExample.facet.getPlots()[0].plot.getDiagnostics().viewport,
  );
  expect(zoomed.zoomY).toBeGreaterThan(1);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(150);
  const restored = await page.evaluate(
    () =>
      window.__facetExample.facet.getPlots()[0].plot.getDiagnostics().viewport,
  );
  expect(restored.zoomX).toBeCloseTo(1, 4);
  expect(restored.zoomY).toBeCloseTo(1, 4);
  expect(issues).toEqual([]);
});
test("filter and bin inputs set their readers, and a failed update keeps a working result", async ({
  page,
}) => {
  await page.goto("/examples");
  await page.getByRole("link", { name: /Filter and bin inputs/ }).click();
  await page.waitForFunction(() => window.__transformExample?.binning);
  await page.evaluate(() => window.__transformExample.binning.whenSettled());
  await page.getByRole("slider", { name: "Bins", exact: true }).fill("8");
  await expect
    .poll(() => page.evaluate(() => window.__transformExample.bins))
    .toBe(8);
  await page.evaluate(() => window.__transformExample.binning.whenSettled());
  const failed = await page.evaluate(async () => {
    try {
      await window.__transformExample.binning.update({ bins: -1 });
      return false;
    } catch {
      return true;
    }
  });
  expect(failed).toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.__transformExample.bins))
    .toBe(8);
  await page
    .getByRole("listbox", { name: "Species", exact: true })
    .selectOption({ label: "B" });
  await page.evaluate(() => window.__transformExample.filter.whenSettled());
  // The Bin runs again on the new rows: it is not stuck on the failed update.
  await page.evaluate(() => window.__transformExample.binning.whenSettled());
  await expect(page.locator("canvas").first()).toBeVisible();
});

test("Interpolate, categorical Interpolate, Slice, and Force examples prepare and step", async ({
  page,
}) => {
  const issues = [];
  page.on("pageerror", (e) => issues.push(e.message));
  await page.goto("/examples");
  await page.getByRole("link", { name: /Filter and bin inputs/ }).click();
  for (const mode of [
    "grid",
    "scattered",
    "line",
    "field",
    "categories",
    "slice",
    "force",
    "force3d",
  ]) {
    // The force layout's gallery component, with its dev hooks (TODO 69.10).
    await page.goto(mode === "force" ? "/test/gallery-example?id=transform-force"
      : `/examples/${mode === "filter" ? "transform-controls" : "transform-" + mode}`);
    await page.waitForTimeout(150);
    await page.waitForFunction(() => window.__transformExample?.plot);
    await page.evaluate(async () => {
      const h = window.__transformExample;
      await (h.grid ?? h.slice ?? h.force)?.whenSettled();
      await h.plot.whenSettled();
    });
    await expect(page.getByRole("alert")).toHaveCount(0);
    if (mode.startsWith("force")) {
      const before = (await forceStatus(page)).iteration;
      await page.getByRole("button", { name: "Step", exact: true }).click();
      await expect.poll(async () => (await forceStatus(page)).iteration).toBe(before + 1);
    }
  }
  expect(issues).toEqual([]);
});

test("force node dragging, cancellation, pinning, and positions set through the handle", async ({
  page,
}) => {
  const issues = [];
  page.on("pageerror", (e) => issues.push(e.message));
  await page.goto("/examples");
  await page.getByRole("link", { name: /Filter and bin inputs/ }).click();
  await page.goto("/test/gallery-example?id=transform-force");
  await page.waitForFunction(() => window.__transformExample?.graphPoints);
  await page.evaluate(() => window.__transformExample.plot.whenSettled());
  async function point(index = 3) {
    return page.evaluate(async (index) => {
      const { guideObject } = await import("/src/lib/plot/utils/guides.js");
      const h = window.__transformExample,
        m = guideObject(h.graphPoints.getLegendSource());
      await m.manager.chain;
      const a = m.fields.get("position").data;
      const p = Array.from(await a.ref.slice([index, index + 1]).data());
      const layout = h.plot.getAxisLayout(),
        box = m.renderer.domElement.getBoundingClientRect();
      const fraction = (axis, value) => {
        const ticks = layout[axis].major,
          [a, b] = [ticks[0], ticks.at(-1)];
        return (
          a.fraction +
          ((value - a.value) / (b.value - a.value)) * (b.fraction - a.fraction)
        );
      };
      return {
        x: box.x + box.width * fraction("x", p[0]),
        y: box.y + box.height * (1 - fraction("y", p[1])),
        data: p,
      };
    }, index);
  }
  const unselectedStart = await point(0);
  const start = await point();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.move(start.x + 35, start.y - 15, { steps: 5 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  // The dragged node is selected; pinning it has no input, so it goes through the handle.
  await expect.poll(async () => (await forceStatus(page)).selected).not.toBeNull();
  const moved = await point();
  expect((await point(0)).data).toEqual(unselectedStart.data);
  expect(Math.abs(moved.data[0] - start.data[0])).toBeGreaterThan(1);
  await page.evaluate(() => window.__transformExample.force.action("pin"));
  const before = (await forceStatus(page)).iteration;
  await page.getByRole("button", { name: "Step", exact: true }).click();
  await expect.poll(async () => (await forceStatus(page)).iteration).toBe(before + 1);
  const pinned = await point();
  expect(pinned.data[0]).toBeCloseTo(moved.data[0], 4);
  await page.mouse.move(pinned.x, pinned.y);
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.move(pinned.x + 25, pinned.y + 20);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.waitForTimeout(100);
  const restored = await point();
  expect(restored.data[0]).toBeCloseTo(pinned.data[0], 4);
  await page.evaluate(
    (y) => window.__transformExample.force.update({ selectedPosition: [10, y] }),
    restored.data[1],
  );
  await expect.poll(async () => (await point()).data[0]).toBeCloseTo(10, 4);
  expect(issues).toEqual([]);
});

// TODO 65.1: a drag's moves wait for a display frame. Moves sent in one task (no frame between)
// and a release or Escape in the same task: the release ends at the last move, Escape at the
// start; whenSettled waits for the queued move; a Reset drops it and the release after it;
// leaving the page mid-drag throws nothing.
test("a release, Escape, Reset or leaving the page with a move still waiting for its frame", async ({ page }) => {
  const issues = [];
  page.on("pageerror", (e) => issues.push(e.message));
  await page.goto("/test/gallery-example?id=transform-force");
  await page.waitForFunction(() => window.__transformExample?.graphPoints && window.__transformExample?.plot);
  await page.evaluate(() => window.__transformExample.plot.whenSettled());
  const node = (index = 3) => nodeOnScreen(page, index);
  // Press node 3 and wait until the layout selected it; returns where the drag starts.
  async function press(at) {
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await expect.poll(async () => (await forceStatus(page)).selected).toBe(3);
    await page.waitForTimeout(100);
    return page.evaluate(() => { let s; window.__transformExample.force.subscribe((v) => (s = v))(); return s.selectedPosition; });
  }
  // Moves (and then `end`: "up", "escape", "reset", "settle" or nothing) dispatched in one task.
  const send = (at, xs, end = null) => page.evaluate(({ at, xs, end }) => {
    const h = window.__transformExample, canvas = h.graphPoints.getLegendSource().guideMark().renderer.domElement;
    const event = (x) => ({ pointerId: 1, isPrimary: true, pointerType: "mouse", clientX: x, clientY: at.y, button: 0, buttons: 1, bubbles: true });
    for (const x of xs) canvas.dispatchEvent(new PointerEvent("pointermove", event(x)));
    if (end === "up") window.dispatchEvent(new PointerEvent("pointerup", { ...event(xs.at(-1)), buttons: 0 }));
    if (end === "escape") window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    if (end === "reset") void h.force.action("reset");
    if (end === "settle") return h.force.whenSettled().then(() => null);
  }, { at, xs, end });
  const settled = () => page.evaluate(() => window.__transformExample.force.whenSettled());
  const initial = await node();
  // Released before the moves' frame: the node ends at the last move, not at an earlier one.
  let origin = await press(initial);
  await send(initial, [initial.x + 10, initial.x + 20, initial.x + 30], "up");
  await settled();
  await page.mouse.up();
  const released = await node();
  expect(released.data[0]).toBeCloseTo(origin[0] + 30 * initial.perPixel[0], 3);
  expect(released.data[1]).toBeCloseTo(origin[1], 3);
  // whenSettled waits for a move waiting for its frame.
  origin = await press(released);
  await send(released, [released.x + 15, released.x + 25], "settle");
  expect((await node()).data[0]).toBeCloseTo(origin[0] + 25 * initial.perPixel[0], 3);
  // Escape before the next move's frame: back to the start.
  await send(released, [released.x + 35], "escape");
  await settled();
  await page.mouse.up();
  expect((await node()).data[0]).toBeCloseTo(origin[0], 3);
  // A Reset with a move waiting: the new layout starts where Reset puts it, and the old drag's
  // move and release do not move its node.
  await press(released);
  await send(released, [released.x + 20], "reset");
  await settled();
  await send(released, [released.x + 40]);
  await page.mouse.up();
  await settled();
  expect((await node()).data).toEqual(initial.data);
  expect(await page.evaluate(() => window.__transformExample.graphPoints.getLegendSource().guideMark().view.navigation.controls.current.enabled)).toBe(true);
  // Leaving the page with a move waiting.
  const now = await node();
  await press(now);
  await send(now, [now.x + 20]);
  await page.goto("/examples/transform-force3d");
  await page.waitForFunction(() => window.__transformExample?.plot);
  expect(issues).toEqual([]);
});

// TODO 65.1: in 3D a dragged node moves on the plane facing the camera through it, by the
// pointer's change from the press: it stays under the pointer.
test("a 3D Force node follows the pointer", async ({ page }) => {
  const issues = [];
  page.on("pageerror", (e) => issues.push(e.message));
  await page.goto("/examples/transform-force3d");
  await page.waitForFunction(() => window.__transformExample?.graphPoints && window.__transformExample?.plot);
  await page.evaluate(() => window.__transformExample.plot.whenSettled());
  // Node 3's center on screen, projected with the plot's camera.
  const screen = () => page.evaluate(async () => {
    const { axisWorld } = await import("/src/lib/plot/utils/axes.js");
    const mark = window.__transformExample.graphPoints.getLegendSource().guideMark();
    await mark.manager.chain;
    const p = Array.from(await mark.fields.get("position").data.ref.slice([3, 4]).data());
    const V = mark.position.constructor, box = mark.renderer.domElement.getBoundingClientRect();
    const ndc = new V(...["x", "y", "z"].map((axis, i) => axisWorld(mark.options, axis, p[i])))
      .applyMatrix4(mark.matrixWorld).project(mark.view.picking.camera.current());
    return { x: box.left + ((ndc.x + 1) / 2) * box.width, y: box.top + ((1 - ndc.y) / 2) * box.height };
  });
  const start = await screen();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await expect.poll(async () => (await forceStatus(page)).selected).toBe(3);
  await page.mouse.move(start.x + 40, start.y + 25, { steps: 8 });
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__transformExample.force.whenSettled());
  const moved = await screen();
  expect(Math.hypot(moved.x - start.x - 40, moved.y - start.y - 25)).toBeLessThan(2);
  await page.mouse.up();
  await page.evaluate(() => window.__transformExample.force.whenSettled());
  expect(await page.evaluate(() => window.__transformExample.graphPoints.getLegendSource().guideMark().view.navigation.controls.current.enabled)).toBe(true);
  expect(issues).toEqual([]);
});

test("one Bins input bins every facet's histogram, remounted cells included", async ({
  page,
}) => {
  await open(page);
  await mode(page, "histogram");
  await page.evaluate(() => window.__facetExample.facet.whenSettled());
  const input = page.getByRole("slider", { name: "Bins", exact: true });
  await input.fill("5");
  // Every mounted cell draws five bars.
  const fiveBars = () =>
    page.evaluate(async () => {
      await window.__facetExample.facet.getTransform("histogram").whenSettled();
      const counts = window.__facetExample.facet
        .getPlots()
        .map(
          (p) =>
            p.plot.getDiagnostics().marks.find((m) => m.fields.position)?.fields
              .position?.count,
        );
      return counts.length > 0 && counts.every((n) => n === 5);
    });
  await expect.poll(fiveBars).toBe(true);
  await page.setViewportSize({ width: 520, height: 500 });
  await page.locator(".facet-cell").last().scrollIntoViewIfNeeded();
  await page.evaluate(() => window.__facetExample.facet.whenSettled());
  await page.locator(".facet-cell").first().scrollIntoViewIfNeeded();
  await page.evaluate(() => window.__facetExample.facet.whenSettled());
  await expect(input).toHaveValue("5");
  await expect.poll(fiveBars).toBe(true);
});

test("interpolation and force updates keep plot arrays on GPU and reuse mark buffers", async ({
  page,
}) => {
  await page.goto("/examples");
  await page.getByRole("link", { name: /Filter and bin inputs/ }).click();
  for (const mode of ["field", "force"]) {
    // The force layout's gallery component, with its dev hooks: /examples/transform-force draws
    // the paired program (TODO 69.10).
    await page.goto(mode === "force" ? "/test/gallery-example?id=transform-force" : `/examples/transform-${mode}`);
    await page.waitForTimeout(150);
    await page.waitForFunction(() => window.__transformExample?.plot);
    // The field's Slice waits for its Time input's range from the data: wait for its first frame.
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".canvas")].every((e) => e.getAttribute("aria-busy") === "false"),
    );
    await page.evaluate(() => window.__transformExample.plot.whenSettled());
    const baseline = await page.evaluate(() =>
      window.__transformExample.plot.getDiagnostics(),
    );
    await page.evaluate(async () => {
      const audit = await import("/tests/browser/guide-audit.js");
      audit.beginGuideAudit();
    });
    for (let i = 0; i < 4; i++)
      await page.evaluate(
        async ({ mode, i }) => {
          const h = window.__transformExample;
          if (mode === "field") {
            await h.slice.update({ at: (i + 1) / 5 });
            await h.grid.whenSettled();
          } else await h.force.action("step");
          await h.plot.whenSettled();
        },
        { mode, i },
      );
    const readings = await page.evaluate(async () => {
      const audit = await import("/tests/browser/guide-audit.js");
      return audit.finishGuideAudit();
    });
    const settled = await page.evaluate(() =>
      window.__transformExample.plot.getDiagnostics(),
    );
    expect(settled.managers).toBe(baseline.managers);
    expect(settled.marks.map((m) => m.fields.position?.bufferId)).toEqual(
      baseline.marks.map((m) => m.fields.position?.bufferId),
    );
    expect(readings.every((r) => (r.size ?? r) <= 8)).toBe(true);
  }
});

test("transform pages fit desktop and phone layouts and show focused markup", async ({
  page,
}) => {
  for (const width of [1200, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const id of [
      "transform-controls",
      "transform-grid",
      "transform-scattered",
      "transform-line",
      "transform-field",
      "transform-categories",
      "transform-slice",
      "transform-force",
      "transform-force3d",
      "transform-forces",
    ]) {
      // transform-force's gallery component (its dev hooks) is the fixture: its public page draws
      // the paired program (TODO 69.10).
      await page.goto(id === "transform-force" ? `/test/gallery-example?id=${id}` : `/examples/${id}`);
      await page.waitForFunction(() => window.__transformExample?.plot);
      await page.evaluate(() => window.__transformExample.plot.whenSettled());
      const bounds = await page.locator("canvas").first().boundingBox();
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width + 1);
      // The page shows its own example's component source (the DocsPage "Example source"
      // section), not the shared multi-mode gallery component.
      const code = await page
        .getByRole("region", { name: "Example source" })
        .locator("pre")
        .innerText();
      expect(code).toContain("<Plot");
      expect(code).not.toContain("{:else");
      // The page is this example's: its catalog title is the heading, and a navigation entry
      // for it (curated examples only) is the highlighted one.
      const title = await page.evaluate(
        async (id) => (await import("/src/routes/examples/catalog.js")).examples.find((e) => e.id === id)?.title,
        id,
      );
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      const entry = page.locator(`aside a[href="/examples/${id}"]`);
      if (await entry.count()) await expect(entry).toHaveClass(/active/);
    }
  }
});

test("force motion retains visible node fills across consecutive frames", async ({
  page,
}) => {
  for (const mode of ["force", "force3d"]) {
  await page.goto(mode === "force" ? "/test/gallery-example?id=transform-force" : `/examples/transform-${mode}`);
  await page.waitForFunction(() => window.__transformExample?.force);
  await page.evaluate(() => window.__transformExample.force.whenSettled());
  await page.mouse.move(5, 5);
  if (mode === "force3d") {
    const bounds = await page.evaluate(async()=> {const {guideObject}=await import('/src/lib/plot/utils/guides.js');return guideObject(window.__transformExample.graphPoints.getLegendSource()).options.get('zbounds');});
    expect(bounds).toEqual([-90,90]);
  }
  const counts = [];
  await page.getByRole("checkbox", { name: "Run", exact: true }).check();
  for (let i = 0; i < 10; i++) {
    const png = await page.locator("canvas").first().screenshot();
    counts.push(
      await page.evaluate(async (b64) => {
        const blob = await (await fetch("data:image/png;base64," + b64)).blob(),
          bitmap = await createImageBitmap(blob),
          canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let n = 0;
        for (let i = 0; i < pixels.length; i += 4)
          if (
            Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) -
              Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) >
            45
          )
            n++;
        return n;
      }, png.toString("base64")),
    );
  }
  await page.getByRole("checkbox", { name: "Run", exact: true }).uncheck();
  expect(Math.min(...counts)).toBeGreaterThan(800);
  expect(Math.min(...counts) / Math.max(...counts)).toBeGreaterThan(0.85);
  }
});

// A Facet caches each cell's pipeline by its transforms' configs: a Calculate of @brushed in a
// cell re-runs with the brush rather than keeping its first output.
test("a Calculate of @brushed inside a Facet follows the brush in every cell", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/test/facet-calculate");
  const shown = () => page.evaluate(() => ((m) => m && (m.view.marks.of(m)?.rows.count ?? m.count))(window.facetCalculate?.shown?.getMark()));
  // No brush: no row is brushed.
  await expect.poll(shown).toBe(0);
  const brush = (rows) => page.evaluate((rows) =>
    window.facetCalculate.data.getBrush().replace(rows), rows);
  await brush([0, 1, 2, 3]);
  await expect.poll(shown).toBe(2);
  await brush([0, 1, 2, 3, 4, 5]);
  await expect.poll(shown).toBe(3);
  expect(errors).toEqual([]);
});
