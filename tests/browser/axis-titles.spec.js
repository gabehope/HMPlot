import { test, expect } from "./fixtures.js";
import { gridColors } from "../../src/lib/plot/utils/axisColors.js";
import { themes } from "../../src/lib/plot/utils/themePresets.js";

// Axis titles from the plotted column (TODO 21 Part T): an explicit label, a categorical scale's
// label, or the one column the axis's marks plot; otherwise no title element at all.
async function open(page, scene) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/test/axis-titles?case=${scene}`);
  await page.waitForFunction(() => window.axisTitles);
  await expect.poll(() => page.evaluate(() =>
    [...document.querySelectorAll(".canvas")].every((canvas) => canvas.getAttribute("aria-busy") === "false"))).toBe(true);
  await page.evaluate(async () => { await window.axisTitles.plot?.whenSettled?.(); });
  return errors;
}
const titles = (page) => page.evaluate(() => ({
  x: [...document.querySelectorAll(".x-title")].map((e) => e.textContent),
  y: [...document.querySelectorAll(".y-title")].map((e) => e.textContent),
  box: [...document.querySelectorAll(".box-title")].map((e) => e.textContent),
}));
const expectTitles = async (page, expected) =>
  expect.poll(() => titles(page)).toEqual({ x: [], y: [], box: [], ...expected });

for (const [scene, expected, note] of [
  ["named", { x: ["a"], y: ["b"] }, "points, a line and a Label at a constant x"],
  ["mixed", { x: ["a"] }, "two different y columns: no y title"],
  ["unnamed", { y: ["b"] }, "an array on x vetoes; col(\"b\") is b"],
  ["expression", { x: ["a"] }, "an expression on y is unnamed"],
  ["explicit", { x: ["Alpha"], y: ["b"] }, "a label wins; an empty label is automatic"],
  ["scale", { x: ["Group"], y: ["b"] }, "a categorical scale's label"],
  ["histogram", { x: ["a"], y: ["count"] }, "Histogram: the field and its normalization"],
  ["density", { x: ["a"], y: ["density"] }, "Density's points are the estimated field"],
  ["bin", { x: ["a"], y: ["count"] }, "Bin edges are the binned field"],
  ["ribbon-horizontal", { x: ["c"], y: ["id"] }, "a horizontal Area band: lower and upper on x, its positions on y"],
  ["stack", { x: ["id"], y: ["b"] }, "Stack bounds are its y"],
  ["bar", { x: ["g"], y: ["b"] }, "Bar"],
  ["boxplot", { x: ["g"], y: ["b"] }, "BoxPlot"],
  ["violin", { x: ["g"], y: ["b"] }, "Violin"],
  ["lollipop", { x: ["g"], y: ["b"] }, "Lollipop"],
  ["fields", { x: ["id", "id", "id"], y: ["a", "b", "c"] }, "Facet fields cells: value is the field"],
  ["fields-label", { x: ["id", "id", "id"], y: ["Value", "Value", "Value", "Value"] }, "a Plot label reaches the cells"],
  ["categories", { x: ["a", "a", "a"], y: ["b", "b", "b"] }, "an embedded categorical Facet"],
  ["fold", { x: ["id", "id"], y: ["a", "b"] }, "Fold-key cells"],
  ["pairs", { x: ["a", "b"], y: ["c", "c"] }, "external Facet pairs"],
  ["outer", { x: ["a", "a"], y: ["b", "b"] }, "a shared grid labels its outer axes only"],
  ["twin", { x: ["a"], y: ["Temp", "c"] }, "a twin Frame owns its y: its own title, not the Plot's label"],
  ["inherit", { x: ["a"], y: ["c"] }, "a child Frame's inherited x votes at the root"],
  ["3d", { box: ["a", "b", "c"] }, "3D box titles"],
  ["3d-off", {}, "axisTitles={false} also hides the 3D box titles"],
  ["surface", { box: ["lon", "elev", "lat"] }, "an Interpolate surface: its grid's axes and field"],
]) {
  test(`axis titles: ${scene} (${note})`, async ({ page }) => {
    const errors = await open(page, scene);
    await expectTitles(page, expected);
    expect(await page.evaluate(() => window.axisTitles.plot?.getRenderError?.() ?? "")).toBe("");
    expect(errors).toEqual([]);
  });
}

test("titles follow the data: a renamed column and a removed mark", async ({ page }) => {
  await open(page, "named");
  await page.evaluate(() => window.axisTitles.rename("bee"));
  await expectTitles(page, { x: ["a"], y: ["bee"] });
  await page.goto("/test/axis-titles?case=mixed");
  await page.waitForFunction(() => window.axisTitles?.plot);
  await expectTitles(page, { x: ["a"] });
  await page.evaluate(() => window.axisTitles.setMixed(false));
  await expectTitles(page, { x: ["a"], y: ["b"] });
});

test("SVG export draws the titles the overlay shows", async ({ page }) => {
  await open(page, "named");
  const named = await page.evaluate(async () => (await (await window.axisTitles.plot.exportSVG()).blob.text()));
  expect(named).toMatch(/class="x-title[^"]*"[^>]*>a</);
  expect(named).toMatch(/class="y-title[^"]*"[^>]*>b</);
  await open(page, "mixed");
  const mixed = await page.evaluate(async () => (await (await window.axisTitles.plot.exportSVG()).blob.text()));
  expect(mixed).not.toContain("y-title");
});

test("navigation neither recomputes titles nor re-prepares marks; a rename updates once or twice", async ({ page }) => {
  await open(page, "named");
  const counters = () => page.evaluate(() => {
    const d = window.axisTitles.plot.getDiagnostics();
    return { titles: d.axisTitleUpdates, marks: d.markPreparations };
  });
  const box = await page.locator(".canvas").first().boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, -40);
  await page.evaluate(() => window.axisTitles.plot.whenSettled());
  const before = await counters();
  for (let i = 0; i < 40; i++) await page.mouse.wheel(0, i % 2 ? 60 : -60);
  for (let i = 0; i < 40; i++) {
    await page.mouse.move(cx, cy); await page.mouse.down();
    await page.mouse.move(cx + (i % 2 ? 12 : -12), cy + 6, { steps: 2 }); await page.mouse.up();
  }
  for (let i = 0; i < 20; i++) await page.mouse.move(cx + i * 3, cy - i * 2);
  await page.evaluate(() => window.axisTitles.plot.whenSettled());
  expect(await counters()).toEqual(before);
  await page.evaluate(() => window.axisTitles.rename("bee"));
  await expectTitles(page, { x: ["a"], y: ["bee"] });
  const after = await counters();
  expect(after.titles - before.titles).toBeGreaterThanOrEqual(1);
  expect(after.titles - before.titles).toBeLessThanOrEqual(2);
});

/** The frame's `axis` Label input in the settings pane (target: the tree item of the frame). */
async function labelInput(page, target, axis) {
  await page.evaluate(() => window.axisTitles.plot.openSettings());
  await page.getByRole("treeitem", { name: target }).first().click();
  const group = page.locator("details").filter({ has: page.locator("summary", { hasText: new RegExp(`^${axis.toUpperCase()}Axis`) }) });
  const summary = group.locator("summary").first();
  if ((await summary.getAttribute("aria-expanded")) !== "true") await summary.click();
  return { input: group.getByLabel("Label", { exact: true }), reset: group.getByRole("button", { name: "Reset Label to inherited" }) };
}

test("the settings pane shows the automatic title as the label's placeholder; Reset returns to it", async ({ page }) => {
  await open(page, "named");
  const { input, reset } = await labelInput(page, "Axes", "x");
  await expect(input).toHaveValue("");
  await expect(input).toHaveAttribute("placeholder", "a");
  await input.fill("Alpha");
  await expectTitles(page, { x: ["Alpha"], y: ["b"] });
  await reset.click();
  await expectTitles(page, { x: ["a"], y: ["b"] });
  await expect(input).toHaveValue("");
  await expect(input).toHaveAttribute("placeholder", "a");
});

test("a twin Frame's label row shows its own column, not the Plot's label", async ({ page }) => {
  await open(page, "twin");
  const { input } = await labelInput(page, "Frame", "y");
  await expect(input).toHaveValue("");
  await expect(input).toHaveAttribute("placeholder", "c");
});


test.describe("readable theme axes", () => {
  test.use({ deviceScaleFactor: 2 });
  test("outside titles clear tick labels and explicit axis settings override themes", async ({ page }, testInfo) => {
    await open(page, "theme");
    const geometry = () => page.evaluate(() => {
      const box = selector => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      };
      return { x: box(".x-title"), y: box(".y-title"), canvas: box(".canvas"),
        ticks: [...document.querySelectorAll(".axes text:not(.x-title):not(.y-title)")].map(e => {
          const r=e.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom };
        }) };
    });
    await page.locator(".canvas").screenshot({ path: testInfo.outputPath("readable-theme.png") });
    const g = await geometry();
    expect(g.ticks.length).toBeGreaterThan(0);
    expect(g.x.top).toBeGreaterThan(Math.max(...g.ticks.map(t => t.bottom)));
    expect(g.y.right).toBeLessThan(Math.min(...g.ticks.map(t => t.left)));
    expect(g.y.left).toBeGreaterThanOrEqual(g.canvas.left);
    expect(g.x.bottom).toBeLessThanOrEqual(g.canvas.bottom);
    expect(await page.locator(".y-title").getAttribute("transform")).toContain("rotate(-90");
    await open(page, "theme-override");
    const inside = await geometry();
    expect(inside.x.top).toBeLessThan(g.x.top);
    expect(await page.locator(".x-title").getAttribute("text-anchor")).toBe("end");
  });
});


test.describe("plot defaults", () => {
  test.use({ deviceScaleFactor: 2 });
  test("bounded sizing, visible axes and grids respect explicit choices", async ({ page }, testInfo) => {
    await open(page, "defaults");
    const size = () => page.locator(".canvas").boundingBox();
    expect((await size()).width).toBe(800);
    expect((await size()).height).toBe(450);
    await expectTitles(page, { x: ["a"], y: ["b"] });
    const gridCount = () => page.evaluate(async (color) => {
      const svg = await (await window.axisTitles.plot.exportSVG()).blob.text();
      const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
      return [...doc.querySelectorAll("[stroke]")].filter(e => e.getAttribute("stroke") === color).length;
    }, gridColors(themes.hmplot.view.background, themes.hmplot.typography.color).major);
    expect(await gridCount()).toBeGreaterThan(0);
    await expect(page.locator(".axes .arrowhead")).toHaveCount(2);
    for (const arrow of await page.locator(".axes .arrowhead").all()) {
      await expect(arrow).toHaveCSS("fill", "rgb(114, 114, 114)");
      await expect(arrow).toHaveCSS("stroke", "none");
    }
    const exportedArrows = await page.evaluate(async () => {
      const svg = await (await window.axisTitles.plot.exportSVG()).blob.text();
      return [...new DOMParser().parseFromString(svg, "image/svg+xml").querySelectorAll(".arrowhead")]
        .map(e => ({ fill: e.style.fill, stroke: e.style.stroke }));
    });
    expect(exportedArrows).toEqual(Array(2).fill({ fill: "rgb(114, 114, 114)", stroke: "none" }));
    await expect(page.locator(".x-title")).toHaveCSS("font-weight", "700");
    await page.locator(".canvas").screenshot({ path: testInfo.outputPath("plot-defaults.png") });
    await page.setViewportSize({ width: 500, height: 800 });
    await expect.poll(async () => (await size()).width).toBeLessThanOrEqual(500);
    await page.setViewportSize({ width: 1500, height: 1100 });
    await open(page, "defaults-fixed");
    expect((await size()).width).toBe(620);
    expect((await size()).height).toBe(320);
    await open(page, "defaults-full");
    expect((await size()).width).toBeGreaterThan(800);
    await open(page, "defaults-hidden");
    await expect(page.locator(".x-title")).toHaveCount(0);
    await open(page, "defaults-grid-off");
    expect(await gridCount()).toBe(0);
    await open(page, "defaults-map");
    await expect(page.locator("svg.axes")).toHaveCount(0);
    expect(await gridCount()).toBe(0);
    await open(page, "defaults-polar");
    await expect(page.locator("svg.axes")).toHaveCount(0);
    expect(await gridCount()).toBe(0);
    await open(page, "defaults-3d");
    await expect(page.locator(".box-title")).toHaveCount(0);
    expect(await gridCount()).toBe(0);
    await open(page, "defaults-3d-explicit");
    await expect.poll(() => page.locator(".box-title").count()).toBeGreaterThan(0);
  });
});

test("an auto margin fits long category names and an outside title; a number pins it (TODO 136.10)", async ({ page }) => {
  const errors = await open(page, "margins");
  const plots = () => page.evaluate(() =>
    [...document.querySelectorAll('svg[aria-label="2D coordinate axes"]')].map((svg) => {
      const box = svg.getBoundingClientRect(),
        text = [...svg.querySelectorAll(".y-tick text, .y-title")].map((e) => e.getBoundingClientRect().left - box.left);
      return { reach: Math.min(...text), axis: svg.querySelectorAll(".axis-lines")[1]?.getAttribute("d") };
    }));
  await expect.poll(async () => (await plots()).length).toBe(2);
  const [auto, pinned] = await plots();
  // Every label and the title start inside the canvas, a padding's width and a digit's room
  // (kept for zooms) from its edge.
  expect(auto.reach).toBeGreaterThanOrEqual(0);
  expect(auto.reach).toBeLessThan(14);
  expect(auto.axis).toMatch(/^M(1[3-9]\d|2\d\d)(\.\d+)? /);
  // Pinned: the axis stays 20 px in, and the names run off the canvas as before.
  expect(pinned.axis).toMatch(/^M20 /);
  expect(pinned.reach).toBeLessThan(0);
  expect(errors).toEqual([]);
});

test("a Plot's height is the whole figure: its title and legend take room from the canvas (TODO 136.10)", async ({ page }) => {
  const errors = await open(page, "figure");
  const figures = () => page.evaluate(() =>
    [...document.querySelectorAll("section.plot")].map((section) => {
      const middle = section.querySelector(".plot-middle");
      return {
        figure: section.getBoundingClientRect().height,
        canvas: section.querySelector(".canvas").getBoundingClientRect().height,
        // The slots above and below the canvas's row: the heading and the legend.
        slots: [...section.children].filter((child) => child !== middle && !child.matches(".hm-visually-hidden"))
          .reduce((sum, child) => sum + child.getBoundingClientRect().height, 0),
        legend: !!section.querySelector('[data-guide-position="bottom"]'),
        side: section.querySelector('[data-guide-position="right"]')?.getBoundingClientRect().width ?? 0,
      };
    }));
  await expect.poll(async () => (await figures()).map(({ figure }) => Math.round(figure))).toEqual([260, 260, 260]);
  const [titled, plain, sided] = await figures();
  expect(titled.legend).toBe(true);
  expect(titled.slots).toBeGreaterThan(40);
  expect(Math.abs(titled.canvas + titled.slots - 260)).toBeLessThan(1);
  expect(plain.canvas).toBe(260);
  // A side legend takes width, not height.
  expect(sided.side).toBeGreaterThan(0);
  expect(sided.canvas).toBe(260);
  expect(errors).toEqual([]);
});

// Navigation only grows a side (the maintainer's policy, 2026-10-16): shorter labels after a zoom
// keep the room, and longer ones get more once the gesture ends.
test("the margins hold still through a zoom, and after it grow only (TODO 136.10)", async ({ page }) => {
  const errors = await open(page, "motion");
  const state = () => page.evaluate(() => ({
    left: window.axisTitles.plot.getAxisLayout()?.left,
    ticks: [...document.querySelectorAll(".y-tick")].map((e) => e.textContent).join("|"),
  }));
  const rest = await state();
  expect(rest.ticks).toContain("1,000,000");
  const box = await page.locator('[aria-label="Plot canvas"]').boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height * 0.6;
  // A held drag keeps the gesture going however slow the wheel steps run.
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 4, y, { steps: 2 });
  const during = [];
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, -400);
    during.push(await state());
  }
  // The zoom narrows the labels, but the left side keeps its width until the gesture ends.
  expect(during.at(-1).ticks).not.toContain("1,000,000");
  expect(during.map(({ left }) => left)).toEqual(during.map(() => rest.left));
  await page.mouse.up();
  await page.evaluate(() => window.axisTitles.plot.whenSettled());
  await page.waitForTimeout(300);
  expect((await state()).left).toBe(rest.left);
  expect(errors).toEqual([]);
});

test("a Facet grid's cells label their outer axes only and line up their plot areas (TODO 136.10)", async ({ page }) => {
  const errors = await open(page, "outer");
  // Each cell's area on the page, from its axis lines (x: left to right, y: bottom to top), and
  // whether it draws tick labels on each axis.
  const cells = () => page.evaluate(() =>
    [...document.querySelectorAll('svg[aria-label="2D coordinate axes"]')].map((svg) => {
      const box = svg.getBoundingClientRect(),
        [x, y] = [...svg.querySelectorAll(".axis-lines")].map((p) => (p.getAttribute("d").match(/-?[\d.]+/g) ?? []).map(Number));
      return {
        left: box.left + x[0], right: box.left + x[2], bottom: box.top + y[1], top: box.top + y[3],
        xLabels: svg.querySelectorAll(".x-tick text").length, yLabels: svg.querySelectorAll(".y-tick text").length,
      };
    }));
  await expect.poll(async () => (await cells()).length).toBe(3);
  await expect.poll(async () => {
    const [a, b, c] = await cells();
    const near = (p, q) => Math.abs(p - q) < 1;
    return near(a.left, c.left) && near(a.top, b.top) && near(a.bottom, b.bottom);
  }).toBe(true);
  const [a, b, c] = await cells();
  expect([a.xLabels, b.xLabels > 0, c.xLabels > 0]).toEqual([0, true, true]);
  expect([a.yLabels > 0, b.yLabels, c.yLabels > 0]).toEqual([true, 0, true]);
  expect(errors).toEqual([]);
});

test("a polar plot's auto margins fit the labels around its disk, which takes the rest (TODO 136.10 slice 7)", async ({ page }) => {
  const errors = await open(page, "polar");
  const plots = () => page.evaluate(() =>
    [...document.querySelectorAll('svg[aria-label="Polar coordinate axes"]')].map((svg) => {
      const box = svg.getBoundingClientRect(),
        texts = [...svg.querySelectorAll("text")].map((t) => t.getBoundingClientRect()),
        rings = [...svg.querySelectorAll("ellipse")].map((e) => Number(e.getAttribute("rx")));
      return {
        width: box.width,
        height: box.height,
        texts: texts.length,
        inside: texts.every((t) => t.left >= box.left - 0.5 && t.right <= box.right + 0.5 &&
          t.top >= box.top - 0.5 && t.bottom <= box.bottom + 0.5),
        radius: Math.max(...rings),
      };
    }));
  await expect.poll(async () => (await plots()).map((p) => p.inside && p.texts === 7)).toEqual([true, true]);
  const [wide, narrow] = await plots();
  // Four angle labels and three radius ones. The themes' old 80/24/24/64 margins left a 116 px
  // disk at 420 x 320; the labels need far less.
  expect(wide.radius).toBeGreaterThan(130);
  expect(wide.radius).toBeLessThan(wide.height / 2);
  expect(narrow.radius).toBeGreaterThan(80);
  expect(narrow.radius).toBeLessThan(narrow.width / 2);
  // A globe's equator label, at the limb, fits too.
  await expect.poll(() => page.evaluate(() => {
    const svg = document.querySelector('svg[aria-label="Orthographic geographic guides"]'),
      box = svg?.getBoundingClientRect(),
      label = [...(svg?.querySelectorAll("text") ?? [])].find((t) => t.textContent === "Equator")
        ?.getBoundingClientRect();
    return !!label && label.right <= box.right + 0.5;
  })).toBe(true);
  expect(errors).toEqual([]);
});

// An axis setting is not navigation: a format that shortens the labels gives the room back.
test("a shorter tick format gives back the room its labels took (TODO 136.10)", async ({ page }) => {
  const left = () => page.evaluate(async () => {
    await window.axisTitles.plot.whenSettled();
    return window.axisTitles.plot.getAxisLayout().left;
  });
  await page.goto("/test/axis-titles?case=domains&domain=0,10");
  await page.waitForFunction(() => window.axisTitles?.plot);
  const plain = await left();
  await page.goto("/test/axis-titles?case=domains&domain=0,10&format=.4f");
  await page.waitForFunction(() => window.axisTitles?.plot);
  expect(await left()).toBeGreaterThan(plain + 10);
  await page.evaluate(() => window.axisTitles.setFormat(undefined));
  await expect.poll(async () => Math.abs((await left()) - plain)).toBeLessThan(0.1);
});

// Labels a zoom lengthens past the side's room widen it (TODO 136.10's policy: grow when they
// no longer fit), and the room stays when the zoom is undone.
test("a zoom whose labels no longer fit widens the side, which keeps the room after", async ({ page }) => {
  const state = () => page.evaluate(async () => {
    await window.axisTitles.plot.whenSettled();
    return {
      left: window.axisTitles.plot.getAxisLayout().left,
      ticks: [...document.querySelectorAll(".y-tick")].map((e) => e.textContent).join("|"),
    };
  });
  await page.goto("/test/axis-titles?case=domains&domain=0,10");
  await page.waitForFunction(() => window.axisTitles?.plot);
  const rest = await state();
  await page.evaluate(() => window.axisTitles.plot.setViewport({ y: 0.5, zoomY: 1000 }, "y"));
  await expect.poll(async () => (await state()).ticks).toMatch(/\d\.\d{3}/);
  const zoomed = await state();
  expect(zoomed.left).toBeGreaterThan(rest.left + 4);
  await page.evaluate(() => window.axisTitles.plot.setViewport({ y: 0.5, zoomY: 1 }, "y"));
  await expect.poll(async () => (await state()).ticks).not.toMatch(/\./);
  expect((await state()).left).toBe(zoomed.left);
});

// Deep in a zoom near a large value the labels share their leading digits (TODO 136.10's
// follow-up): they read as the digits that change beside an offset above the axis, where each
// used to round to the same "932,000".
test("deep zoom labels read compactly beside an offset instead of repeating", async ({ page }) => {
  const state = () => page.evaluate(async () => {
    await window.axisTitles.plot.whenSettled();
    return {
      ticks: [...document.querySelectorAll(".y-tick")].map((e) => e.textContent.trim()).filter(Boolean),
      values: [...document.querySelectorAll(".y-tick")].filter((e) => e.textContent.trim())
        .map((e) => [Number(e.getAttribute("data-value")), e.textContent.trim()]),
      offset: document.querySelector(".y-offset")?.textContent ?? null,
      top: window.axisTitles.plot.getAxisLayout().top,
    };
  });
  await page.goto("/test/axis-titles?case=domains&domain=0,1000000");
  await page.waitForFunction(() => window.axisTitles?.plot);
  expect((await state()).offset).toBeNull();
  await page.evaluate(() => window.axisTitles.plot.setViewport({ y: 0.932, zoomY: 2e7 }, "y"));
  await expect.poll(async () => (await state()).offset).toBe("+932,000");
  const zoomed = await state();
  expect(new Set(zoomed.ticks).size).toBe(zoomed.ticks.length);
  // Offset plus label is the tick's value.
  for (const [value, label] of zoomed.values) expect(932000 + Number(label.replace("\u2212", "-"))).toBeCloseTo(value, 6);
  // The offset has its room above the axis, inside the plot.
  const box = await page.locator(".y-offset").boundingBox(), plot = await page.locator(".plot").first().boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(plot.y - 0.5);
  await page.evaluate(() => window.axisTitles.plot.setViewport({ y: 0.5, zoomY: 1 }, "y"));
  await expect.poll(async () => (await state()).offset).toBeNull();
});

// The layout's motion rules damp only the loop through the camera (TODO 136.10): a plot whose
// domain changes lands on the gutters it opens with at the new domain, not on the old, wider
// ones held from before.
test("gutters after a domain change are the ones the plot opens with there (TODO 136.10)", async ({ page }) => {
  const left = () => page.evaluate(async () => {
    await window.axisTitles.plot.whenSettled();
    return window.axisTitles.plot.getAxisLayout().left;
  });
  await page.goto("/test/axis-titles?case=domains&domain=0,10");
  await page.waitForFunction(() => window.axisTitles?.plot);
  const fresh = await left();
  await page.goto("/test/axis-titles?case=domains&domain=0,1.5");
  await page.waitForFunction(() => window.axisTitles?.plot);
  const wider = await left();
  // "1.5" needs a few pixels more than "10".
  expect(wider - fresh).toBeGreaterThan(0.5);
  expect(wider - fresh).toBeLessThanOrEqual(4);
  await page.evaluate(() => window.axisTitles.setDomain([0, 10]));
  await expect.poll(async () => Math.abs((await left()) - fresh)).toBeLessThan(0.1);
});

test("twin axes stacked on one side fit their labels, each outside the one before (TODO 136.10)", async ({ page }) => {
  const errors = await open(page, "stacked");
  const axes = () => page.evaluate(() => {
    const svgs = [...document.querySelectorAll('svg[aria-label="2D coordinate axes"]')],
      canvas = svgs[0].getBoundingClientRect();
    return svgs.map((svg) => {
      const lines = [...svg.querySelectorAll(".axis-lines")].map((p) => p.getAttribute("d")),
        y = lines.find((d) => /^M([\d.]+) [\d.]+ L\1 /.test(d ?? "")),
        texts = [...svg.querySelectorAll(".y-tick text, .y-title")].map((t) => t.getBoundingClientRect());
      const x = lines.find((d) => /^M[\d.]+ ([\d.]+) L[\d.]+ \1$/.test(d ?? ""));
      return {
        end: x ? Number(x.split("L")[1].split(" ")[0]) : null,
        line: y ? Number(y.slice(1).split(" ")[0]) : null,
        left: texts.length ? Math.min(...texts.map((t) => t.left - canvas.left)) : null,
        right: texts.length ? Math.max(...texts.map((t) => t.right - canvas.left)) : null,
      };
    }).concat([{ width: canvas.width }]);
  });
  await expect.poll(async () => (await axes()).slice(1, 3).every((a) => a.line !== null && a.right !== null)).toBe(true);
  const all = await axes(), width = all.at(-1).width, [root, inner, outer] = all;
  // The first right axis is the area's edge; the second sits a stacking gap past the first one's
  // wide labels and title, and its own end inside the canvas (they were 48 px apart, whatever
  // their labels, and overlapped).
  expect(Math.abs(inner.line - root.end)).toBeLessThan(1);
  expect(outer.line - inner.right).toBeGreaterThan(4);
  expect(outer.line - inner.right).toBeLessThan(12);
  expect(outer.right).toBeLessThanOrEqual(width);
  expect(errors).toEqual([]);
});


test("dynamicMargins=false fits initially, holds through navigation and refits changed axis content", async ({ page }) => {
  await page.goto("/test/axis-titles?case=domains&domain=0,10&fixedMargins");
  await page.waitForFunction(() => window.axisTitles?.plot && [...document.querySelectorAll(".canvas")].every(c => c.getAttribute("aria-busy") === "false"));
  const state = () => page.evaluate(async () => {
    const plot = window.axisTitles.plot;
    await plot.whenSettled();
    const l = plot.getAxisLayout();
    const labels = [...document.querySelectorAll(".y-tick")].map(e => ({ text: e.textContent, width: e.getBoundingClientRect().width }));
    return { area: [l.left, l.right, l.top, l.bottom], labels };
  });
  const initial = await state();
  expect(initial.labels.length).toBeGreaterThan(2);
  expect(initial.labels.every(label => label.width > 0)).toBe(true);
  await page.locator(".canvas").hover();
  await page.mouse.wheel(0, -600);
  await page.evaluate(() => window.axisTitles.plot.whenAnimationsFinished());
  expect((await state()).area).toEqual(initial.area);
  await page.evaluate(() => window.axisTitles.plot.setViewport({ y: 0.5, zoomY: 1000 }, "y"));
  await expect.poll(async () => (await state()).labels.map(l => l.text).join("|")).toMatch(/\d\.\d{3}/);
  expect((await state()).area).toEqual(initial.area);
  await page.evaluate(() => window.axisTitles.plot.setViewport({ y: 0.7, zoomY: 1 }, "y"));
  expect((await state()).area).toEqual(initial.area);
  await page.evaluate(() => window.axisTitles.setFormat(".8f"));
  // Tick text publishes before the browser measures its gutter on the next rendered frame.
  await expect.poll(async () => (await state()).area[0]).toBeGreaterThan(initial.area[0] + 10);
  const formatted = await state();
  expect(formatted.labels.some(label => /\.\d{8}$/.test(label.text))).toBe(true);
  await page.evaluate(() => window.axisTitles.setWidth(600));
  await expect.poll(async () => (await state()).area[1]).toBeGreaterThan(formatted.area[1] + 100);
  await page.evaluate(() => { window.axisTitles.setFormat(undefined); window.axisTitles.setDomain([0, 1000000]); });
  await expect.poll(async () => (await state()).labels.some(label => /1,?000,?000/.test(label.text))).toBe(true);
  await expect.poll(async () => (await state()).area[0]).toBeGreaterThan(initial.area[0]);
  const changed = await state();
  expect(changed.labels.some(label => /1,?000,?000/.test(label.text))).toBe(true);
  expect(changed.area[0]).toBeGreaterThan(initial.area[0]);
  await page.evaluate(() => window.axisTitles.plot.openSettings());
  const zoom = page.locator("details").filter({ has: page.locator("summary", { hasText: /^Zoom/ }) });
  await zoom.locator("summary").first().click();
  const toggle = zoom.getByRole("checkbox", { name: "Fit margins during navigation" });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(toggle).toBeChecked();
});
