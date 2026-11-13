import { test, expect } from "./fixtures.js";

const fixture = (page, name) => page.locator(`[data-fixture="${name}"]`);
async function open(page) {
  await page.goto("/test/partition");
  await page.waitForFunction(() => window.partitionFixture?.overlay?.getGroups?.().length === 3);
  await page.evaluate(() => window.partitionFixture.overlayPlot.whenSettled());
}
const groups = (page, key) => page.evaluate((key) => window.partitionFixture[key].getGroups()
  .map((g) => ({ key: g.key, values: g.values, label: g.label, marks: g.marks.length })), key);

test("groups repeat the children once per key in one frame, with one renderer", async ({ page }) => {
  await open(page);
  const overlay = fixture(page, "overlay");
  await expect(overlay.locator("canvas")).toHaveCount(1);
  expect(await groups(page, "overlay")).toEqual([
    { key: '["Adelie"]', values: { species: "Adelie" }, label: "Adelie", marks: 1 },
    { key: '["Gentoo"]', values: { species: "Gentoo" }, label: "Gentoo", marks: 1 },
    { key: '["Chinstrap"]', values: { species: "Chinstrap" }, label: "Chinstrap", marks: 1 },
  ]);
});

test("every group contributes to the shared domain, matching the unpartitioned marks", async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.partitionFixture.plain.whenSettled());
  const read = (key) => page.evaluate((key) => {
    const options = window.partitionFixture[key].getFrames()[0].getFrameOptions();
    return { x: options.get("xbounds"), y: options.get("ybounds") };
  }, key);
  const plain = await read("plain");
  await expect.poll(() => read("overlayPlot")).toEqual(plain);
});

test("a constant-appearance mark makes one legend entry; legendGroups makes one per group", async ({ page }) => {
  await open(page);
  await expect(fixture(page, "overlay").locator("[data-guide-position] button")).toHaveText(["Trend"]);
  const grouped = fixture(page, "grouped").locator("[data-guide-position] button");
  await expect(grouped).toHaveText(["Points · Adelie", "Points · Gentoo", "Points · Chinstrap"]);
});

test("a list of keys makes one group per combination", async ({ page }) => {
  await open(page);
  expect((await groups(page, "nested")).map((g) => g.label)).toEqual([
    "Adelie · Male", "Adelie · Female",
    "Gentoo · Male", "Gentoo · Female",
    "Chinstrap · Male", "Chinstrap · Female",
  ]);
});

test("each facet cell partitions its own rows", async ({ page }) => {
  await open(page);
  // Facet cells mount when they scroll into view.
  await fixture(page, "in-facet").scrollIntoViewIfNeeded();
  await expect(fixture(page, "in-facet").locator("canvas")).toHaveCount(2);
  await expect.poll(async () => (await groups(page, "inFacet")).length).toBe(3);
});

test("removing a category exits its group", async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.partitionDrop());
  await expect.poll(async () => (await groups(page, "overlay")).map((g) => g.label)).toEqual(["Adelie", "Gentoo"]);
});

test("a transform runs once per group, drawing one area each in a single frame", async ({ page }) => {
  await open(page);
  const density = fixture(page, "density");
  await density.scrollIntoViewIfNeeded();
  await expect(density.locator("canvas")).toHaveCount(1);
  await expect.poll(async () => (await groups(page, "density")).map((g) => [g.label, g.marks])).toEqual([
    ["Adelie", 1], ["Gentoo", 1], ["Chinstrap", 1],
  ]);
  // The key column survives the transform, so fill="species" still resolves inside it.
  expect(await page.evaluate(async () => {
    const plot = window.partitionFixture.densityPlot;
    await plot.whenSettled();
    return plot.getRenderError();
  })).toBeFalsy();
});

test("a brush across the shared frame constrains every group at once", async ({ page }) => {
  await open(page);
  const brush = async (key) => {
    await fixture(page, key).scrollIntoViewIfNeeded();
    const box = await fixture(page, key).locator("canvas").boundingBox();
    await page.keyboard.down("Shift");
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.8, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up("Shift");
  };
  const brushed = (handle) => page.evaluate(async (handle) => {
    const plot = window.partitionFixture[handle];
    await plot.whenSettled();
    return plot.getBrush()?.status().count ?? 0;
  }, handle);
  await brush("brushed-plain");
  await brush("brushed");
  // Every group sees the same constraint, so the partitioned plot brushes the same rows.
  await expect.poll(() => brushed("brushedPlain")).toBeGreaterThan(0);
  expect(await brushed("brushed")).toBe(await brushed("brushedPlain"));
});

// Colored (saturated) pixels of a plot's PNG export, counted per horizontal third and per
// vertical third, so a group's area or band can be told apart from the rest.
const census = (page, key) => page.evaluate(async (key) => {
  const plot = window.partitionFixture[key];
  await plot.whenSettled();
  const png = await plot.exportPNG(), bitmap = await createImageBitmap(png);
  const canvas = document.createElement("canvas");
  // Axis layout and the authored 260px crop use CSS pixels. Decode the native DPR2 export
  // into those units, retaining any legend strip at its corresponding CSS height.
  const live = document.querySelector(`[data-fixture="${key.replace(/Plot$/, "")}"] .canvas canvas`);
  canvas.width = live.clientWidth;
  canvas.height = Math.round(bitmap.height * canvas.width / bitmap.width);
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
  const columns = [0, 0, 0], layout = plot.getAxisLayout();
  let total = 0;
  // Only the plot's own 260px: a bottom legend adds a strip of colored swatches below it.
  for (let y = 0; y < Math.min(height, 260); y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    if (Math.max(r, g, b) - Math.min(r, g, b) < 40) continue;
    columns[Math.max(0,Math.min(2, Math.floor(3*(x-layout.left)/(layout.right-layout.left))))]++;
    total++;
  }
  return { columns, total };
}, key);
// The visibility of every group's mark, through the Partition handle.
const visibility = (page, key) => page.evaluate((key) => window.partitionFixture[key].getGroups()
  .map((g) => g.marks.map((mark) => mark.entry().visible)), key);

// 11.11 A1
test("with legendGroups, a legend click hides one group and shift-click isolates it", async ({ page }) => {
  await open(page);
  const grouped = fixture(page, "grouped");
  await grouped.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.partitionFixture.groupedPlot.whenSettled());
  // Three groups of 30 points each, none overlapping: hiding one removes a third of the
  // colored pixels, isolating one leaves a third.
  const before = (await census(page, "groupedPlot")).total;
  expect(before).toBeGreaterThan(300);
  await grouped.getByRole("button", { name: "Toggle Points · Adelie" }).click();
  await expect.poll(() => visibility(page, "grouped")).toEqual([[false], [true], [true]]);
  // Hidden points fade out, so the count is polled until the transition ends.
  const total = () => census(page, "groupedPlot").then((c) => c.total);
  await expect.poll(total).toBeLessThan(before * 0.8);
  expect(await total()).toBeGreaterThan(before * 0.5);
  await grouped.getByRole("button", { name: "Toggle Points · Gentoo" }).click({ modifiers: ["Shift"] });
  await expect.poll(() => visibility(page, "grouped")).toEqual([[false], [true], [false]]);
  await expect.poll(total).toBeLessThan(before * 0.45);
  expect(await total()).toBeGreaterThan(before * 0.15);
});

// 11.11 A4
test("rows with a missing key are drawn in a trailing (missing) group; domain and brush match the plain plot", async ({ page }) => {
  await open(page);
  await expect.poll(async () => (await groups(page, "missing")).map((g) => g.label)).toEqual(["Female", "Male", "(missing)"]);
  expect((await groups(page, "missing"))[2].values).toEqual({ sexMissing: null });
  const read = (key) => page.evaluate(async (key) => {
    const plot = window.partitionFixture[key];
    await plot.whenSettled();
    const options = plot.getFrames()[0].getFrameOptions();
    return { x: options.get("xbounds"), y: options.get("ybounds") };
  }, key);
  await expect.poll(() => read("missingPlot")).toEqual(await read("missingPlain"));
  const brush = async (key) => {
    await fixture(page, key).scrollIntoViewIfNeeded();
    const box = await fixture(page, key).locator("canvas").boundingBox();
    await page.keyboard.down("Shift");
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.8, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up("Shift");
  };
  const brushed = (handle) => page.evaluate(async (handle) => {
    const plot = window.partitionFixture[handle];
    await plot.whenSettled();
    return plot.getBrush()?.status().count ?? 0;
  }, handle);
  await brush("missing-plain");
  await brush("missing");
  await expect.poll(() => brushed("missingPlain")).toBeGreaterThan(0);
  expect(await brushed("missingPlot")).toBe(await brushed("missingPlain"));
});

// 11.11 A5
test("flipping legendGroups on a mounted Partition re-files the legend entries", async ({ page }) => {
  await open(page);
  const buttons = fixture(page, "grouped").locator("[data-guide-position] button");
  await expect(buttons).toHaveText(["Points · Adelie", "Points · Gentoo", "Points · Chinstrap"]);
  await page.evaluate(() => window.partitionLegendGroups(false));
  await expect(buttons).toHaveText(["Points"]);
  await page.evaluate(() => window.partitionLegendGroups(true));
  await expect(buttons).toHaveText(["Points · Adelie", "Points · Gentoo", "Points · Chinstrap"]);
  // The settings tree keeps the plain group labels through the remount.
  expect(await groups(page, "grouped")).toEqual([
    { key: '["Adelie"]', values: { species: "Adelie" }, label: "Adelie", marks: 1 },
    { key: '["Gentoo"]', values: { species: "Gentoo" }, label: "Gentoo", marks: 1 },
    { key: '["Chinstrap"]', values: { species: "Chinstrap" }, label: "Chinstrap", marks: 1 },
  ]);
});

// 11.11 A6, C3
test("a Partition inside a Partition composes keys, and its groups report the outer values", async ({ page }) => {
  await open(page);
  await expect.poll(async () => (await groups(page, "outerPartition")).length).toBe(3);
  // The inner handle is bound by the last mounted group; its values include the species.
  const inner = await groups(page, "innerPartition");
  expect(inner.map((g) => g.label)).toEqual(["Male", "Female"]);
  expect(inner.map((g) => g.values)).toEqual([
    { species: "Chinstrap", sex: "Male" }, { species: "Chinstrap", sex: "Female" },
  ]);
  // Every (species, sex) combination mounted its mark: six marks across the outer groups.
  expect((await groups(page, "outerPartition")).map((g) => g.marks)).toEqual([2, 2, 2]);
});

// 11.11 A8
test("nested legendGroups Partitions label each entry with every enclosing group, outermost first", async ({ page }) => {
  await open(page);
  const legend = fixture(page, "nested-legend");
  await legend.scrollIntoViewIfNeeded();
  const labels = legend.locator("[data-guide-position] button");
  await expect.poll(async () => (await labels.allTextContents()).sort()).toEqual([
    "Points · Adelie · Female", "Points · Adelie · Male",
    "Points · Chinstrap · Female", "Points · Chinstrap · Male",
    "Points · Gentoo · Female", "Points · Gentoo · Male",
  ]);
});

// 11.11 C3
test("a Frame inside a Partition gives each group an inset, all registered with the plot", async ({ page }) => {
  await open(page);
  await fixture(page, "framed").scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(async () => {
    const plot = window.partitionFixture.framedPlot;
    await plot.whenSettled();
    return { frames: plot.getFrames().length, error: plot.getRenderError() || null };
  })).toEqual({ frames: 4, error: null });
  expect((await groups(page, "framed")).map((g) => g.marks)).toEqual([1, 1, 1]);
});

// 11.11 C4
test("a combination with no rows mounts its children without an error and exits cleanly", async ({ page }) => {
  await open(page);
  await fixture(page, "sparse").scrollIntoViewIfNeeded();
  await expect.poll(async () => (await groups(page, "sparse")).map((g) => [g.label, g.marks])).toEqual([
    ["Adelie · Male", 1], ["Adelie · Female", 1], ["Gentoo · Male", 1], ["Gentoo · Female", 1],
    ["Chinstrap · Male", 1], ["Chinstrap · Female", 1],
  ]);
  const error = () => page.evaluate(async () => {
    const plot = window.partitionFixture.sparsePlot;
    await plot.whenSettled();
    return plot.getRenderError() || null;
  });
  expect(await error()).toBeNull();
  await page.evaluate(() => window.partitionDrop());
  await expect.poll(async () => (await groups(page, "sparse")).map((g) => g.label)).toEqual([
    "Adelie · Male", "Adelie · Female", "Gentoo · Male", "Gentoo · Female",
  ]);
  expect(await error()).toBeNull();
});

// 11.11 A10
test("a categorical position column under a Partition shows the category labels under the points", async ({ page }) => {
  await open(page);
  await fixture(page, "categories").scrollIntoViewIfNeeded();
  const ticks = (key) => page.evaluate(async (key) => {
    await window.partitionFixture[key + "Plot"]?.whenSettled?.();
    await window.partitionFixture[key]?.whenSettled?.();
    return [...document.querySelectorAll(`[data-fixture="${key}"] .x-tick`)]
      .map((tick) => [tick.textContent.trim(), tick.getAttribute("transform")]);
  }, key);
  await expect.poll(() => ticks("categories").then((t) => t.map(([label]) => label))).toEqual(["A", "B", "C", "D", "E", "F"]);
  // Same size, same categories: the ticks sit where the plain plot puts them (under the points).
  const [plain, partitioned] = await Promise.all([
    page.evaluate(async () => {
      await window.partitionFixture.categoriesPlain.whenSettled();
      return [...document.querySelectorAll('[data-fixture="categories-plain"] .x-tick')]
        .map((tick) => [tick.textContent.trim(), tick.getAttribute("transform")]);
    }),
    ticks("categories"),
  ]);
  expect(partitioned).toEqual(plain);
});

// 11.11 C2
test("fill by the key inside a Partition gives the same legend as without it", async ({ page }) => {
  await open(page);
  const entries = (key) => fixture(page, key).locator("[aria-label=Species] button");
  await expect(entries("fill-plain")).toHaveText(["Adelie", "Gentoo", "Chinstrap"]);
  await expect(entries("fill")).toHaveText(["Adelie", "Gentoo", "Chinstrap"]);
  await expect(fixture(page, "fill").locator("[aria-label=Species]")).toHaveCount(1);
  // Hiding a category hides it in every group.
  await fixture(page, "fill").getByRole("button", { name: "Toggle Gentoo" }).click();
  await expect.poll(() => page.evaluate(async () => {
    const guides = await import("/src/lib/plot/utils/guides.js");
    return window.partitionFixture.fill.getGroups()
      .map((g) => g.marks.map((mark) => [...(((m) => m?.view.marks.of(m))(guides.guideObject(mark))?.legend?.categories?.fill?.hidden ?? [])]));
  })).toEqual([
    [["Gentoo"]], [["Gentoo"]], [["Gentoo"]],
  ]);
});

// 11.11 C1
test("a Facet inside a Partition throws the settled message", async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.partitionShowFacet(true));
  await expect(fixture(page, "facet-in-partition").locator(".boundary-error"))
    .toHaveText("Facet cannot be nested inside Partition; partition inside the Facet instead.");
});

// 11.11 C5
test("the density overlay draws one area per species, and a dropped species' area goes away", async ({ page }) => {
  await open(page);
  await fixture(page, "density").scrollIntoViewIfNeeded();
  await expect.poll(async () => (await groups(page, "density")).length).toBe(3);
  const before = await census(page, "densityPlot");
  // Species occupy their own third of the x domain: three areas, one per third.
  expect(before.columns.every((count) => count > 200)).toBe(true);
  await page.evaluate(() => window.partitionDrop());
  await expect.poll(async () => (await groups(page, "density")).length).toBe(2);
  const after = await census(page, "densityPlot");
  expect(after.columns[2]).toBeLessThan(before.columns[2] / 10);
  expect(after.columns[0]).toBeGreaterThan(before.columns[0] / 2);
  expect(after.columns[1]).toBeGreaterThan(before.columns[1] / 2);
});
