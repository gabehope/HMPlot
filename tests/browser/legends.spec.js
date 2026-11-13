import { test, expect } from "./fixtures.js";

test("a later-mounted opacity legend reads its range and updates vector exports", async ({ page }) => {
  await open(page);
  const area = fixture(page, "opacity-ramp"), ramp = area.locator('svg[data-ramp="opacity"]');
  await expect(ramp).toHaveCount(0);
  await page.evaluate(() => window.legendFixture.showOpacityLegend());
  await expect(ramp.locator("text").first()).toHaveText("0.2");
  await expect(ramp.locator("text").last()).toHaveText("0.8");
  await page.evaluate(() => window.legendFixture.changeOpacity());
  await expect(ramp.locator("text").first()).toHaveText("0.3");
  await expect(ramp.locator("text").last()).toHaveText("0.9");
  const svg = await page.evaluate(async () => {
    const plot = window.legendFixture.opacityPlot;
    await plot.whenSettled(); return (await plot.exportSVG({ mode: "vector" })).blob.text();
  });
  expect(svg).toContain(">0.3</text>"); expect(svg).toContain(">0.9</text>");
});

const fixture = (page, name) => page.locator(`[data-fixture="${name}"]`);
// The legend fixtures must load and run without a single console warning or error.
let console_ = [];
test.beforeEach(({ page }) => {
  console_ = [];
  page.on("console", (message) => { if (["warning", "error"].includes(message.type())) console_.push(message.text()); });
  page.on("pageerror", (error) => console_.push(`pageerror: ${error.message}`));
});
test.afterEach(() => { expect(console_).toEqual([]); });
async function open(page) {
  await page.goto("/test/legends");
  await page.waitForFunction(() => ((m) => m?.view.marks.of(m))(window.legendFixture?.numericPoints?.getMark?.())?.legend?.categories?.size);
}
// Pixels in the grid part of a Facet PNG export (the legend strips are left out: a hidden
// entry's swatch is still drawn there, dimmed): the blue "Points" fill, the red "Mirror"
// fill, and every saturated pixel.
const gridPixels = (page, key, name) => page.evaluate(async ({ key, name }) => {
  const target = window.legendFixture[key];
  await target.whenSettled();
  const png = await target.exportPNG(), bitmap = await createImageBitmap(png);
  const { width, height } = bitmap;
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
  const root = document.querySelector(`[data-fixture="${name}"]`);
  const shell = root.querySelector(".facet-shell").getBoundingClientRect(), grid = root.querySelector(".facets").getBoundingClientRect();
  const scale = width / shell.width;
  const top = Math.max(0, Math.floor((grid.top - shell.top) * scale)),
    bottom = Math.min(height, Math.floor((grid.bottom - shell.top) * scale));
  const { data } = context.getImageData(0, top, width, bottom - top);
  let blue = 0, red = 0, saturated = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    if (b > 130 && r < 120 && b - r > 50) blue++;
    if (r > 150 && g < 110 && b < 110) red++;
    if (Math.max(r, g, b) - Math.min(r, g, b) > 60) saturated++;
  }
  return { blue, red, saturated, rows: bottom - top, height };
}, { key, name });
// Fixtures further down the page mount their Facet cells only once scrolled into view.
async function reveal(page, name) {
  await fixture(page, name).scrollIntoViewIfNeeded();
  await page.waitForFunction((name) => document.querySelectorAll(`[data-fixture="${name}"] canvas`).length > 0, name);
}
// Every mount of the definition behind a legend entry, read through the registry.
const mounts = (page, key, index) => page.evaluate(async ({ key, index }) => {
  const guides = await import("/src/lib/plot/utils/guides.js");
  const handle = window.legendFixture[key].getLegendSource().entries()[index];
  const mark = guides.guideObject(handle);
  return guides.registryFor(mark.options).definitionMarks(guides.definitionKey(mark.options))
    .map((m) => ({ visible: m.options.get("visible") !== false, hidden: [...(m.view.marks.of(m)?.legend?.categories?.fill?.hidden ?? [])] }));
}, { key, index });

test("an external facet shows one legend with one entry per authored mark; toggling hides every cell", async ({ page }) => {
  await open(page);
  const facet = fixture(page, "facet");
  await expect(facet.locator("[data-guide-position]")).toHaveCount(1);
  await expect(facet.locator(".facet-cell [data-guide-position]")).toHaveCount(0);
  const buttons = facet.locator("[data-guide-position] button");
  await expect(buttons).toHaveCount(2);
  await expect(buttons).toHaveText(["Points", "Mirror"]);
  expect((await mounts(page, "facet", 0)).length).toBe(4);
  const before = await gridPixels(page, "facet", "facet");
  expect(before.rows).toBeLessThan(before.height); // the bottom legend strip is excluded
  expect(before.blue).toBeGreaterThan(50);
  expect(before.red).toBeGreaterThan(50);
  await facet.getByRole("button", { name: "Toggle Points" }).click();
  await expect.poll(async () => (await mounts(page, "facet", 0)).every((m) => !m.visible)).toBe(true);
  expect((await mounts(page, "facet", 1)).every((m) => m.visible)).toBe(true);
  // A hidden series leaves no pixels in any cell; the other series still draws.
  const after = await gridPixels(page, "facet", "facet");
  expect(after.blue).toBe(0);
  expect(after.red).toBeGreaterThan(50);
});

test("a Legend for an Axes inside a Facet cell lists the cell marks", async ({ page }) => {
  await open(page);
  await reveal(page, "axes-facet");
  const facet = fixture(page, "axes-facet");
  await expect(facet.locator("[data-guide-position] button")).toHaveText(["Cell axes points"]);
  expect(await page.evaluate(() => window.legendFixture.cellAxes.getLegendSource().entries().length)).toBe(1);
});

test("a Legend for one mount of a mark, or for a cell Plot, toggles every cell", async ({ page }) => {
  await open(page);
  for (const [name, key, label] of [["mark-facet", "markFacet", "Cell points"], ["plot-facet", "plotFacet", "Plot points"]]) {
    await reveal(page, name);
    const facet = fixture(page, name);
    await expect(facet.locator("[data-guide-position] button")).toHaveText([label]);
    expect((await mounts(page, key, 0)).length).toBe(4);
    await facet.getByRole("button", { name: `Toggle ${label}` }).click();
    await expect.poll(async () => (await mounts(page, key, 0)).map((m) => m.visible)).toEqual([false, false, false, false]);
    await facet.getByRole("button", { name: `Toggle ${label}` }).click();
    await expect.poll(async () => (await mounts(page, key, 0)).map((m) => m.visible)).toEqual([true, true, true, true]);
  }
});

test("hidden series and categories reach cells mounted later, and exports of them", async ({ page }) => {
  await open(page);
  await reveal(page, "tall-facet");
  const facet = fixture(page, "tall-facet");
  // The Facet's automatic legend explains the species, then lists the labeled points (TODO 73.5).
  await expect(facet.locator("[data-guide-position] button")).toHaveText(["Adelie", "Gentoo", "Chinstrap", "Tall points"]);
  const mounted = () => page.evaluate(() => window.legendFixture.tallFacet.getPlots().length);
  const initial = await mounted();
  expect(initial).toBeLessThan(12);
  expect((await gridPixels(page, "tallFacet", "tall-facet")).saturated).toBeGreaterThan(100);
  await facet.getByRole("button", { name: "Toggle Tall points" }).click();
  await facet.getByRole("button", { name: "Toggle Gentoo" }).click();
  const state = () => page.evaluate(async () => {
    const guides = await import("/src/lib/plot/utils/guides.js");
    const handle = window.legendFixture.tallFacet.getLegendSource().entries()[0];
    const mark = guides.guideObject(handle);
    return guides.registryFor(mark.options).definitionMarks(guides.definitionKey(mark.options))
      .map((m) => ({ visible: m.options.get("visible") !== false, gentoo: [...(m.view.marks.of(m)?.legend?.categories?.fill?.hidden ?? [])].includes("Gentoo") }));
  });
  await expect.poll(async () => (await state()).every((m) => !m.visible && m.gentoo)).toBe(true);
  // Scrolling mounts the lower cells: they start hidden too.
  await facet.locator(".facet-cell").last().scrollIntoViewIfNeeded();
  await expect.poll(mounted).toBeGreaterThan(initial);
  await expect.poll(async () => { const s = await state(); return s.length > initial && s.every((m) => !m.visible && m.gentoo); }).toBe(true);
  // A second click shows the category again everywhere (set, not flipped, per mount).
  await facet.getByRole("button", { name: "Toggle Gentoo" }).click();
  await expect.poll(async () => (await state()).every((m) => !m.gentoo)).toBe(true);
  await facet.getByRole("button", { name: "Toggle Gentoo" }).click();
  await expect.poll(async () => (await state()).every((m) => m.gentoo)).toBe(true);
  // An export force-mounts every offscreen cell; those mounts honor the hidden series too,
  // so the grid part of the export has no colored pixels.
  expect((await gridPixels(page, "tallFacet", "tall-facet")).saturated).toBe(0);
});

test("the Facet legend prop is reactive, and an explicit false silences the cells", async ({ page }) => {
  await open(page);
  await reveal(page, "flip-facet");
  const facet = fixture(page, "flip-facet");
  const strips = () => page.evaluate(() => {
    const root = document.querySelector('[data-fixture="flip-facet"]');
    return { grid: root.querySelectorAll(":scope > .facet-shell > [data-guide-position], :scope > .facet-shell > .facet-body > [data-guide-position]").length,
      cells: root.querySelectorAll(".facet-cell [data-guide-position]").length };
  });
  await expect.poll(strips).toEqual({ grid: 1, cells: 0 });
  await page.evaluate(() => window.legendFixture.setFacetLegend("cell"));
  await expect.poll(strips).toEqual({ grid: 0, cells: 4 });
  await expect(facet.locator(".facet-cell [data-guide-position] button")).toHaveText(["Flip points", "Flip points", "Flip points", "Flip points"]);
  await page.evaluate(() => window.legendFixture.setFacetLegend(true));
  await expect.poll(strips).toEqual({ grid: 1, cells: 0 });
  await expect(facet.locator("[data-guide-position] button")).toHaveText(["Flip points"]);
  // The cell plots ask for a legend; legend={false} on the Facet wins.
  await page.evaluate(() => window.legendFixture.setFacetLegend(false));
  await expect.poll(strips).toEqual({ grid: 0, cells: 0 });
  await page.evaluate(() => window.legendFixture.setFacetLegend(undefined));
  await expect.poll(strips).toEqual({ grid: 1, cells: 0 });
});

test("datetime columns label colorbar and ramp ticks as dates", async ({ page }) => {
  await open(page);
  await reveal(page, "dates");
  const block = fixture(page, "dates");
  const ticks = block.locator("[aria-label=When] svg text");
  await expect(ticks).toHaveCount(5);
  // 2024-01-01 12:00 UTC plus 39 steps of ten days: the colorbar ends on 2025-01-25.
  const date = /^[A-Z][a-z]{2} \d{2}$/;
  await expect(ticks).toHaveText(["Jan 01", date, date, date, "Jan 25"]);
  const ramp = block.locator("svg[data-ramp=size] text");
  await expect(ramp).toHaveText(["Jan 01", date, date, "Jan 25"]);
});

test("a size ramp in data units draws glyphs proportional to the sample values", async ({ page }) => {
  await open(page);
  await reveal(page, "data-units");
  const block = fixture(page, "data-units");
  await expect(block.locator(".ramp .guide-title")).toHaveText("Width (data units)");
  const ramp = block.locator("svg[data-ramp=size]");
  await expect(ramp.locator("text")).toHaveText(["1", "4", "7", "10"]);
  const radii = await ramp.locator("circle").evaluateAll((circles) => circles.map((c) => Number(c.getAttribute("r"))));
  expect(radii).toEqual([1, 4, 7, 10].map((r) => expect.closeTo(r, 3)));
});

test("a Legend written in every cell renders once, and a category click hides it in all cells", async ({ page }) => {
  await open(page);
  const facet = fixture(page, "category-facet");
  await expect(facet.locator("[data-guide-position] [aria-label=Species]")).toHaveCount(1);
  await expect(facet.getByRole("button", { name: "Toggle Gentoo" })).toHaveCount(1);
  await facet.getByRole("button", { name: "Toggle Gentoo" }).click();
  await expect.poll(async () => (await mounts(page, "categoryFacet", 0)).every((m) => m.hidden.includes("Gentoo"))).toBe(true);
  await expect(facet.getByRole("button", { name: "Toggle Gentoo" })).toHaveAttribute("aria-pressed", "false");
});

// TODO 62.3: with no channel and no labeled marks, a Legend still explains the encodings: here
// the Line's colors, one line swatch per city, titled by the column.
test("a bare Legend over a Line colored by city shows the cities in their colors", async ({ page }) => {
  await open(page);
  const legend = fixture(page, "bare").locator("[data-guide-position] [aria-label=city]");
  await expect(legend.locator(".guide-title")).toHaveText("city");
  await expect(legend.locator("button")).toHaveText(["Oslo", "Lima", "Pune"]);
  const strokes = await legend.locator("button svg line").evaluateAll((lines) => lines.map((line) => line.getAttribute("stroke")));
  expect(new Set(strokes).size).toBe(3);
});

// TODO 136.17: a Plot shows a legend for a categorical color by default, and only for that (not a
// continuous fill nor the labeled marks); legend={false} hides it. TODO 134.9: legend plus an
// explicit Legend for fill draws the categories once.
test("a categorical fill has a legend by default; legend={false} hides it; an explicit Legend is not repeated", async ({ page }) => {
  await open(page);
  const strips = (index) => fixture(page, "default-legend").locator(":scope > *").nth(index).locator("[data-guide-position]");
  await expect(strips(0)).toHaveCount(1);
  await expect(strips(0)).toHaveAttribute("data-guide-position", "bottom");
  await expect(strips(0).locator("button")).toHaveText(["Adelie", "Gentoo", "Chinstrap"]);
  await expect(strips(0).locator(".colorbar")).toHaveCount(0);
  await expect(strips(1)).toHaveCount(0);
  await expect(strips(2)).toHaveCount(1);
  await expect(strips(2)).toHaveAttribute("data-guide-position", "right");
  await expect(strips(2).getByRole("button", { name: "Toggle Gentoo" })).toHaveCount(1);
});

test("an embedded facet lists each authored mark once", async ({ page }) => {
  await open(page);
  await expect(fixture(page, "embedded").locator("[data-guide-position] button")).toHaveText(["Points"]);
});

test("fill and shape driven by one column draw colored symbols", async ({ page }) => {
  await open(page);
  const legend = fixture(page, "merged").locator("[aria-label=Species]");
  await expect(legend.locator("button")).toHaveCount(3);
  const swatches = await legend.locator("button svg").evaluateAll((svgs) => svgs.map((svg) => {
    const shape = svg.querySelector("path, circle, rect");
    return { tag: shape.tagName, fill: shape.getAttribute("fill") };
  }));
  // Each category has its own color, and symbols other than circles are paths.
  expect(new Set(swatches.map((s) => s.fill)).size).toBe(3);
  expect(swatches.some((s) => s.tag === "path")).toBe(true);
  expect(swatches.every((s) => s.fill !== "#547ba2" || s.tag === "circle")).toBe(true);
});

test("a midpoint colorbar has its midpoint tick at the center, and the midpoint value draws the middle color", async ({ page }) => {
  await open(page);
  await reveal(page, "diverging");
  const block = fixture(page, "diverging");
  // Domain [-2, 10] around 0: the halves are [-2, 0] and [0, 10].
  await expect(block.locator("[aria-label=Change] svg text")).toHaveText(["-2", "-1", "0", "5", "10"].map((v) => v.replace("-", "−")));
  const colors = await page.evaluate(async () => {
    const plot = window.legendFixture.diverging;
    await plot.whenSettled();
    const png = await plot.exportPNG(), bitmap = await createImageBitmap(png);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
    const { data, width } = context.getImageData(0, 0, canvas.width, canvas.height);
    const layout = plot.getAxes()[0].getAxisLayout(), scale = window.devicePixelRatio;
    const y = Math.round((layout.top + layout.bottom) / 2 * scale);
    return [-1, 0, 1].map((x) => {
      const px = Math.round((layout.left + (x + 1.5) / 3 * (layout.right - layout.left)) * scale), i = (y * width + px) * 4;
      return [...data.slice(i, i + 3)];
    });
  });
  // Each point's nearest Viridis sample (points are shaded, so not an exact match): the
  // midpoint takes the middle color, not the color 2/12 of the way a linear map gives 0.
  const viridis = { 0: [68, 1, 84], "1/6": [62, 74, 137], "1/2": [33, 145, 140], 1: [253, 231, 37] };
  const nearest = (c) => Object.entries(viridis).sort(([, a], [, b]) =>
    Math.hypot(...a.map((v, i) => v - c[i])) - Math.hypot(...b.map((v, i) => v - c[i])))[0][0];
  expect(colors.map(nearest), JSON.stringify(colors)).toEqual(["0", "1/2", "1"]);
});

test("a continuous size scale draws a ramp at log-spaced values", async ({ page }) => {
  await open(page);
  const ramp = fixture(page, "ramp").locator("svg[data-ramp=size]");
  // Grouped only once a value reaches 10,000 (TODO 133.6), as axis ticks are.
  await expect(ramp.locator("text")).toHaveText(["1", "10", "100", "1000"]);
  const radii = await ramp.locator("circle").evaluateAll((circles) => circles.map((c) => Number(c.getAttribute("r"))));
  expect(radii).toEqual([2, 14 / 3, 22 / 3, 10].map((r) => expect.closeTo(r, 3)));
  expect(await ramp.locator("circle").first().getAttribute("fill")).toBe("#547ba2");
});

test("categorical size, opacity and outline legends show their encodings", async ({ page }) => {
  await open(page);
  const block = fixture(page, "numeric");
  const scales = await block.locator("[aria-label=Size] button svg g").evaluateAll((groups) =>
    groups.map((g) => Number(/scale\(([\d.]+)\)/.exec(g.getAttribute("transform"))[1])));
  expect(scales).toEqual([0.5, 1, 1.5]); // 6, 12, 18 px against the 12 px swatch
  const opacity = await block.locator("[aria-label=Opacity] button svg").evaluateAll((svgs) => svgs.map((svg) => Number(svg.style.opacity)));
  expect(opacity).toHaveLength(4);
  expect(opacity[0]).toBeCloseTo(1, 5);
  expect(opacity.at(-1)).toBeCloseTo(0.3, 5);
  const outlines = await block.locator("[aria-label=Outline] button circle").evaluateAll((circles) => circles.map((c) => c.getAttribute("stroke")));
  expect(new Set(outlines).size).toBe(3);
});

test("marks sharing a scale resource share one colorbar; an automatic scale keeps its own", async ({ page }) => {
  await open(page);
  await expect.poll(() => fixture(page, "shared").locator("[data-guide-position] canvas").count()).toBe(2);
  // Each colorbar is titled by its scale resource's label, else its first mark's label.
  await expect(fixture(page, "shared").locator("[data-guide-position] .guide-title")).toHaveText(["Shared value", "Mass points"]);
});

test("colorbars export as vector gradients; PNG export includes the legend strip", async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const plot = window.legendFixture.colorbar;
    await plot.whenSettled();
    const exported = await plot.exportSVG({ mode: "auto" }), auto = await exported.blob.text();
    const png = await createImageBitmap(await plot.exportPNG());
    const canvas = document.querySelectorAll('[data-fixture="colorbar"] [aria-label="Plot canvas"]')[0].getBoundingClientRect();
    // Strictly vector: the legend strip and, colored on the host, the color-mapped points (TODO 70.1).
    let strict = "";
    try { await plot.exportSVG({ mode: "vector" }); } catch (error) { strict = error.message; }
    return { strict, gradients: (auto.match(/<linearGradient/g) ?? []).length,
      colorbarRasters: exported.report.rasterLayers.filter((layer) => layer.kind === "colorbar").length,
      stops: (auto.match(/<stop /g) ?? []).length,
      pngWidth: png.width, pngHeight: png.height, canvasWidth: canvas.width, canvasHeight: canvas.height,
      dpr: window.devicePixelRatio };
  });
  expect(result.gradients).toBe(1);
  expect(result.strict).toBe("");
  expect(result.colorbarRasters).toBe(0);
  expect(result.stops).toBe(24);
  expect(result.pngWidth).toBeGreaterThan(result.canvasWidth); // the right-hand strip is included
  // A right-hand strip adds width only: the export keeps the canvas height.
  expect(result.pngHeight).toBe(Math.round(result.canvasHeight * result.dpr));
});

// TODO 73.3: a missing (null) value draws in its scale's missing color, on screen and in exports, and
// the colorbar of a mark holding one shows a "Missing" swatch in that color (one without none).
test("a missing value draws in the scale's missing color, and its colorbar shows a Missing swatch", async ({ page }) => {
  await open(page);
  const swatch = fixture(page, "missing").locator(".missing");
  await expect(swatch).toHaveText("Missing");
  await expect(swatch.locator("rect")).toHaveAttribute("fill", "#e4572e");
  await expect(fixture(page, "diverging").locator(".missing")).toHaveCount(0);
  const result = await page.evaluate(async () => {
    const plot = window.legendFixture.missing;
    await plot.whenSettled();
    const png = await createImageBitmap(await plot.exportPNG()), canvas = document.createElement("canvas");
    canvas.width = png.width; canvas.height = png.height;
    const context = canvas.getContext("2d"); context.drawImage(png, 0, 0);
    const box = document.querySelector('[data-fixture="missing"] [aria-label="Plot canvas"]').getBoundingClientRect(),
      root = document.querySelector('[data-fixture="missing"] section.plot').getBoundingClientRect(), scale = png.width / root.width;
    // The middle point (0, 0) lies at the current drawable area's center.
    const layout = plot.getAxisLayout();
    const at = [box.left - root.left + (layout.left + layout.right) / 2,
      box.top - root.top + (layout.top + layout.bottom) / 2];
    const middle = [...context.getImageData(Math.round(at[0] * scale), Math.round(at[1] * scale), 1, 1).data];
    const svg = await (await plot.exportSVG({ mode: "auto" })).blob.text();
    return { middle, svg };
  });
  expect(Math.max(...[228, 87, 46].map((v, c) => Math.abs(v - result.middle[c]))), String(result.middle)).toBeLessThanOrEqual(3);
  expect(result.svg).toContain(">Missing</text>");
  expect(result.svg.match(/fill="#e4572e"/g)?.length).toBeGreaterThanOrEqual(1);
});

test("a standalone colorbar Legend exports in strict vector mode", async ({ page }) => {
  await open(page);
  await expect(fixture(page, "colorbar").locator(".heatmap-external-guide canvas")).toHaveCount(1);
  const svg = await page.evaluate(async () => (await window.legendFixture.standalone.exportSVG({ mode: "vector" })).blob.text());
  expect(svg).toContain("<linearGradient");
  expect(svg).not.toContain("<image");
});

test("facet exports include the facet-level legend", async ({ page }) => {
  await open(page);
  const svg = await page.evaluate(async () => {
    const facet = window.legendFixture.facet;
    await facet.whenSettled();
    return (await facet.exportSVG()).blob.text();
  });
  expect(svg).toContain(">Points<");
  expect(svg).toContain(">Mirror<");
});

// TODO 69: at a device pixel ratio of 2 a Facet's PNG drew each cell's image (a Plot's export,
// twice the scale there) on a grid at the scale alone, so every cell showed its top left quarter.
test("a Facet exports the same picture at a device pixel ratio of 2: its PNG twice the size", async ({ page, browser, baseURL }) => {
  // The PNG's size; in its grid (not the legend strip), the blue and red pixel counts and their
  // centroids (fractions of the grid's size); the SVG without its plots' generated titles.
  const picture = async (target) => {
    await open(target);
    return target.evaluate(async () => {
      const facet = window.legendFixture.facet;
      await facet.whenSettled();
      const bitmap = await createImageBitmap(await facet.exportPNG()), { width, height } = bitmap;
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d"); context.drawImage(bitmap, 0, 0); bitmap.close();
      const root = document.querySelector('[data-fixture="facet"]');
      const shell = root.querySelector(".facet-shell").getBoundingClientRect(), grid = root.querySelector(".facets").getBoundingClientRect();
      const scale = width / shell.width, top = Math.round((grid.top - shell.top) * scale), rows = Math.round(grid.height * scale);
      const { data } = context.getImageData(0, top, width, rows), sums = { blue: [0, 0, 0], red: [0, 0, 0] };
      for (let i = 0; i < data.length; i += 4) {
        const [r, g, b] = [data[i], data[i + 1], data[i + 2]], at = i / 4;
        const color = b > 130 && r < 120 && b - r > 50 ? "blue" : r > 150 && g < 110 && b < 110 ? "red" : null;
        if (color) { sums[color][0]++; sums[color][1] += (at % width) / width; sums[color][2] += Math.floor(at / width) / rows; }
      }
      const ids = new Map();
      const svg = (await (await facet.exportSVG()).blob.text()).replace(/<title>[^<]*<\/title>/g, "")
        .replace(/axis-mask-[\w-]+/g, id => {
          if (!ids.has(id)) ids.set(id, `axis-mask-${ids.size}`);
          return ids.get(id);
        });
      return { size: [width, height], svg, ...Object.fromEntries(Object.entries(sums).map(([k, [n, x, y]]) => [k, [n, x / n, y / n]])) };
    });
  };
  const first = await browser.newContext({ baseURL, viewport: page.viewportSize(), deviceScaleFactor: 1 });
  const one = await picture(await first.newPage());
  await first.close();
  const context = await browser.newContext({ baseURL, viewport: page.viewportSize(), deviceScaleFactor: 2 });
  const two = await picture(await context.newPage());
  await context.close();
  expect(Math.abs(two.size[0] - 2 * one.size[0])).toBeLessThanOrEqual(2);
  expect(Math.abs(two.size[1] - 2 * one.size[1])).toBeLessThanOrEqual(2);
  for (const color of ["blue", "red"]) {
    expect(one[color][0]).toBeGreaterThan(100);
    // The same points at twice the size (more of each point's pixels pass at 2: about 5x), in the
    // same places (within 0.013 measured; the cropped cells were 0.075 and 0.13 off, 1.7x).
    expect(two[color][0] / one[color][0]).toBeGreaterThan(3);
    expect(Math.abs(two[color][1] - one[color][1])).toBeLessThan(0.03);
    expect(Math.abs(two[color][2] - one[color][2])).toBeLessThan(0.03);
  }
  // SVG (and PDF, made from it) is in CSS pixels at any ratio.
  expect(two.svg).toBe(one.svg);
});

// 6.11 A7: per-row opacity (here a categorical opacity column) reaches the SVG export.
test("vector export carries per-row opacity", async ({ page }) => {
  await open(page);
  const opacities = await page.evaluate(async () => {
    const plot = window.legendFixture.numeric;
    await plot.whenSettled();
    const svg = await (await plot.exportSVG({ mode: "vector" })).blob.text();
    const dom = new DOMParser().parseFromString(svg, "image/svg+xml");
    // Read mark opacity independently of the outline's stroke-opacity attribute.
    return [...dom.querySelectorAll("circle[opacity]")].map(circle => Number(circle.getAttribute("opacity")));
  });
  expect(opacities.length).toBeGreaterThan(4);
  expect(Math.min(...opacities)).toBeCloseTo(0.3, 2);
  expect(Math.max(...opacities)).toBe(1);
});

// TODO 132.5: "inherit" takes the host's font and text color, over a preset's legend text.
test("a theme's \"inherit\" font and text color take the host page's, in axes, legend and title", async ({ page }) => {
  await page.goto("/test/legends");
  const host = page.locator('[data-case="host"]');
  const tick = host.locator("svg.axes text").first();
  await expect(tick).toBeVisible({ timeout: 30000 });
  const text = await host.evaluate((section) => {
    const style = (element) => element && { font: getComputedStyle(element).fontFamily, color: getComputedStyle(element).color };
    return {
      tick: style(section.querySelector("svg.axes text")),
      legend: style(section.querySelector(".guide button")),
      title: style([...section.querySelectorAll("*")].find((element) => element.childElementCount === 0 && element.textContent.trim() === "Host text")),
    };
  });
  for (const part of ["tick", "legend", "title"]) {
    expect(text[part]?.font, part).toMatch(/^Georgia/);
    expect(text[part]?.color, part).toBe("rgb(170, 20, 60)");
  }
});

// TODO 132.2: theme.guides places the Plot's own legend and styles its entries and title.
test("a theme's guides place the Plot's legend and style its swatches and title", async ({ page }) => {
  await page.goto("/test/legends");
  const themed = page.locator('[data-case="themed"]');
  const guide = themed.locator('[data-guide-position="top"] .guide:not(:has(.guide))').filter({ has: page.locator("button") }).first();
  await expect(guide).toBeVisible({ timeout: 30000 });
  await expect(themed.locator('[data-guide-position="bottom"]')).toHaveCount(0);
  const style = await guide.evaluate((element) => {
    const swatch = element.querySelector("button svg"), title = element.querySelector(".guide-title");
    return {
      direction: getComputedStyle(element).flexDirection,
      width: Number(swatch.getAttribute("width")),
      square: !!swatch.querySelector("rect") && !swatch.querySelector("circle"),
      titleSize: title && getComputedStyle(title).fontSize,
      titleWeight: title && getComputedStyle(title).fontWeight,
    };
  });
  expect(style.direction).toBe("column");
  expect(style.width).toBeCloseTo((26 * 16) / 12, 3);
  expect(style.square).toBe(true);
  expect(style).toMatchObject({ titleSize: "15px", titleWeight: "700" });
});

// TODO 132.7: extends=["minimal", "legend/inline-top"] puts the legend at the top in a row, in
// Minimal's 13 px legend text; a nested Theme's swatchShape merges over it.
test("a composed theme's partial places the legend and a nested Theme styles its swatches", async ({ page }) => {
  await page.goto("/test/legends");
  const composed = page.locator('[data-case="composed"]');
  const guide = composed.locator('[data-guide-position="top"] .guide:not(:has(.guide))').filter({ has: page.locator("button") }).first();
  await expect(guide).toBeVisible({ timeout: 30000 });
  await expect(composed.locator('[data-guide-position="bottom"]')).toHaveCount(0);
  const style = await guide.evaluate((element) => {
    const swatch = element.querySelector("button svg");
    return {
      direction: getComputedStyle(element).flexDirection,
      square: !!swatch.querySelector("rect") && !swatch.querySelector("circle"),
      fontSize: getComputedStyle(element.querySelector("button")).fontSize,
    };
  });
  expect(style).toEqual({ direction: "row", square: true, fontSize: "13px" });
});

// TODO 132.7: a host page restyles the title block and legend text with CSS custom properties, over
// the theme; exports read the laid-out text, so they follow. The legend's 1.25em applies once,
// though the Plot's legend is a guide holding guides.
test("a host stylesheet's --hm-title-* and --hm-legend-* restyle titles and legends, and their export", async ({ page }) => {
  await page.goto("/test/legends");
  const section = page.locator('[data-case="host-vars"]');
  await expect(section.locator(".guide button").first()).toBeVisible({ timeout: 30000 });
  const shown = await section.evaluate((element) => {
    const style = (selector) => {
      const s = getComputedStyle(element.querySelector(selector));
      return { size: s.fontSize, color: s.color, align: s.textAlign, font: s.fontFamily, weight: s.fontWeight, padding: s.paddingBottom };
    };
    const outer = element.querySelector(".guide");
    return { title: style(".plot-title"), heading: style(".plot-heading"), subtitle: style(".plot-subtitle"), caption: style(".plot-caption"),
      legend: style(".guide button"), legendTitle: style(".guide-title"), nested: !!outer.querySelector(".guide"),
      base: parseFloat(getComputedStyle(outer.parentElement).fontSize) };
  });
  expect(shown.title).toMatchObject({ size: "30px", color: "rgb(200, 0, 0)", align: "center", weight: "300" });
  expect(shown.title.font).toMatch(/^Georgia/);
  expect(shown.heading.padding).toBe("20px");
  expect(shown.subtitle.size).toBe("15px");
  expect(shown.caption).toMatchObject({ size: "9px", color: "rgb(200, 0, 0)" });
  expect(shown.nested).toBe(true);
  expect(shown.legend).toMatchObject({ size: `${shown.base * 1.25}px`, color: "rgb(0, 90, 0)" });
  expect(shown.legend.font).toMatch(/^Georgia/);
  expect(shown.legendTitle).toMatchObject({ size: "13px", weight: "800" });
  const exported = await page.evaluate(async () => {
    const plot = window.legendFixture.hostVars;
    await plot.whenSettled();
    const svg = await (await plot.exportSVG({ mode: "vector" })).blob.text();
    const texts = [...new DOMParser().parseFromString(svg, "image/svg+xml").querySelectorAll("text")];
    const find = (text) => texts.find((element) => element.textContent === text);
    const read = (element) => element && ["font-size", "fill", "font-family", "font-weight"].map((name) => element.getAttribute(name));
    // The PNG: the title's red glyphs span about its 30 px size (the theme's is 19 px).
    const bitmap = await createImageBitmap(await plot.exportPNG()), canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data, rows = [];
    for (let y = 0; y < bitmap.height; y++)
      for (let x = 0; x < bitmap.width; x++) {
        const i = (y * bitmap.width + x) * 4;
        if (pixels[i] > 150 && pixels[i + 1] < 60 && pixels[i + 2] < 60) { rows.push(y); break; }
      }
    const scale = bitmap.width / document.querySelector('[data-case="host-vars"] .plot-title').closest("[data-export-host]").getBoundingClientRect().width;
    return { title: read(find("Styled title")), subtitle: read(find("Styled subtitle")), caption: read(find("Styled caption")), legend: read(find("Adelie")),
      redSpan: rows.length ? (rows.at(-1) - rows[0] + 1) / scale : 0 };
  });
  expect(exported.title?.slice(0, 2)).toEqual(["30", "rgb(200, 0, 0)"]);
  expect(exported.title?.[2]).toMatch(/^Georgia/);
  expect(exported.title?.[3]).toBe("300");
  expect(exported.subtitle?.[0]).toBe("15");
  expect(exported.caption?.[0]).toBe("9");
  expect(Number.parseFloat(exported.legend?.[0])).toBeCloseTo(shown.base * 1.25, 1);
  expect(exported.redSpan, JSON.stringify(exported)).toBeGreaterThan(24);
});

// Large values retain their formatter; actual labels determine the ramp's spacing.
test("size ramp labels fit horizontally and vertically at DPR 2", async ({ page }) => {
  await open(page);
  const area = fixture(page, "ramp");
  await area.scrollIntoViewIfNeeded();
  for (const vertical of [false, true]) {
    await page.evaluate((vertical) => window.legendFixture.longRamp(vertical), vertical);
    await expect.poll(() => area.locator('svg[data-ramp="size"]').evaluate((svg) => {
      const frame = svg.getBoundingClientRect(), labels = [...svg.querySelectorAll("text")].map((text) => text.getBoundingClientRect());
      return labels.every((box, i) => box.left >= frame.left - 0.5 && box.right <= frame.right + 0.5 &&
        (i === 0 || box.left >= labels[i - 1].right + 4 || box.top >= labels[i - 1].bottom + 2));
    })).toBe(true);
  }
});
