// TODO 130.4: each chart (src/lib/charts/*.js) draws its reference example from Svelte
// (/test/example-svelte) and from Python (the example run by scripts/generate-chart-fixtures.py),
// and both exports hold the marks it should.
import { test, expect } from "./fixtures.js";
import { readFileSync } from "node:fs";
import charts from "../../src/lib/scene/options.charts.json" with { type: "json" };

// What each chart's example draws, read from its SVG export: circles, and the mark paths.
test.use({ deviceScaleFactor: 2 });
const EXPECTED = { BandX: { circles: 0, paths: 2 }, BandY: { circles: 0, paths: 2 },
  EndLabels: { circles: 0, paths: 3 },
  ForestPlot: { circles: 3, paths: 10 }, BulletChart: { circles: 0, paths: 10 },
  IntervalTimeline: { circles: 0, paths: 5 }, Sparkline: { circles: 0, paths: 3 }, Dumbbell: { circles: 10, paths: 5 }, Waterfall: { circles: 0, paths: 6 }, Candlestick: { circles: 0, paths: 16 } };

async function exportedSVG(page) {
  const plot = page.locator("section.plot").first();
  await plot.locator(".canvas").first().hover();
  const button = plot.getByRole("button", { name: /^Export / }).first();
  if (await button.count()) await button.click();
  else {
    // Compact plots with axes hidden deliberately omit their built-in toolbar.
    await plot.locator("canvas").first().click({ button: "right" });
    await page.getByRole("menuitem", { name: "Export…", exact: true }).click();
  }
  const panel = page.getByRole("dialog", { name: /^Export · / });
  await panel.getByLabel("Format").selectOption("svg");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    panel.getByRole("button", { name: "Download" }).click(),
  ]);
  const text = readFileSync(await download.path(), "utf8");
  await page.keyboard.press("Escape");
  return page.evaluate((text) => {
    // Each mark draws in a group clipped to the plot area.
    const doc = new DOMParser().parseFromString(text, "image/svg+xml");
    const marks = [
      ...doc.querySelectorAll(
        'g[clip-path^="url(#axis-mask"] :is(path, circle)',
      ),
    ];
    return {
      circles: marks.filter((e) => e.tagName === "circle").length,
      paths: marks.filter((e) => e.tagName === "path").length,
      geometry: marks.filter(e => e.tagName === "path").map(e => {
        const numbers = (e.getAttribute("d").match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) ?? []).map(Number);
        const xs = numbers.filter((_, i) => i % 2 === 0), ys = numbers.filter((_, i) => i % 2 === 1);
        return { d: e.getAttribute("d"), x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys),
          fill: e.getAttribute("fill"), stroke: e.getAttribute("stroke") };
      }),
      points: marks.filter(e => e.tagName === "circle").map(e => [Number(e.getAttribute("cx")), Number(e.getAttribute("cy"))]),
      text: [...doc.querySelectorAll("text")].map(e => e.textContent),
      xTicks: [...doc.querySelectorAll(".x-tick")].map(e => ({ value: Number.isFinite(Number(e.getAttribute("data-value"))) ? Number(e.getAttribute("data-value")) : Date.parse(e.getAttribute("data-value")),
        position: (e.getAttribute("transform").match(/[-+]?[\d.]+/g) ?? []).map(Number) })),
    };
  }, text);
}
// Numeric geometry checks catch correct mark counts drawn with wrong values or date origins.
function checkGeometry(kind, drawing) {
  const ticks = drawing.xTicks, a = ticks[0], b = ticks.at(-1);
  const px = value => a.position[0] + (value - a.value) / (b.value - a.value) * (b.position[0] - a.position[0]);
  const near = (actual, expected) => expect(Math.abs(actual - expected)).toBeLessThan(1);
  if (kind === "ForestPlot") {
    [0.8, 1.1, 1.3].forEach((value, i) => near(drawing.points[i][0], px(value)));
    const intervals = drawing.geometry.filter(p => p.x1 - p.x0 > 1 && p.y1 - p.y0 < 1);
    expect(intervals).toHaveLength(3);
    const caps = drawing.geometry.filter(p => p.x1 - p.x0 < 1 && p.y1 - p.y0 > 2 && p.y1 - p.y0 < 20);
    expect(caps).toHaveLength(6);
    caps.forEach(p => near(p.y1 - p.y0, 8)); // cap_size in Python, capSize in Svelte
    [[0.6, 1], [0.9, 1.4], [1, 1.6]].forEach(([lo, hi], i) => {
      near(intervals[i].x0, px(lo)); near(intervals[i].x1, px(hi));
    });
  } else if (kind === "BulletChart") {
    const actual = drawing.geometry.filter(p => p.fill === "#3478c7");
    expect(actual).toHaveLength(2);
    [65, 82].forEach((value, i) => { near(actual[i].x0, px(0)); near(actual[i].x1, px(value)); });
    const targets = drawing.geometry.filter(p => p.fill === "#20252b");
    expect(targets).toHaveLength(2);
    [80, 90].forEach((value, i) => near((targets[i].x0 + targets[i].x1) / 2, px(value)));
    expect(drawing.geometry.filter(p => p.fill === "#788391")).toHaveLength(6);
  } else if (kind === "IntervalTimeline") {
    const spans = drawing.geometry.filter(p => p.fill === "#3478c7");
    expect(spans).toHaveLength(3);
    const day = 86400000; // axis tick positions count from the host's explicit Oct 1 origin
    [[0, 3], [2, 7], [6, 9]].forEach(([start, end], i) => {
      near(spans[i].x0, px(start * day)); near(spans[i].x1, px(end * day));
    });
    const milestones = drawing.geometry.filter(p => p.fill === "#20252b");
    expect(milestones).toHaveLength(2);
    [2, 8].forEach((offset, i) => near((milestones[i].x0 + milestones[i].x1) / 2, px(offset * day)));
  } else if (kind === "EndLabels") {
    expect(drawing.text.filter(text => ["Growth", "Value", "Bonds"].includes(text)).sort())
      .toEqual(["Bonds", "Growth", "Value"]);
  } else if (kind === "Sparkline") {
    expect(drawing.text).toEqual(["5"]);
    const lines = drawing.geometry.filter(p => p.stroke);
    expect(lines.flatMap(line => line.d.match(/M/g) ?? [])).toHaveLength(2); // missing rows leave a gap
  }
}

const settled = (page) =>
  page.waitForFunction(
    () =>
      document.querySelector(".canvas") &&
      [...document.querySelectorAll(".canvas")].every(
        (canvas) => canvas.getAttribute("aria-busy") === "false",
      ),
    undefined,
    { timeout: 60000 },
  );

test("every chart has its expected drawing here", () => {
  expect(Object.keys(EXPECTED).sort()).toEqual(Object.keys(charts).sort());
});

for (const kind of Object.keys(charts)) {
  const id = kind.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  test(`${kind} draws its example from Svelte and from Python`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(`/test/example-svelte?id=${id}-basic`);
    await expect(page.locator("section.plot")).toHaveCount(1, {
      timeout: 60000,
    });
    await settled(page);
    const drawing = await exportedSVG(page);
    expect({ circles: drawing.circles, paths: drawing.paths }).toEqual(EXPECTED[kind]);
    checkGeometry(kind, drawing);
    await page.goto(`/test/notebook?fixture=chart-${id}`);
    await page.waitForFunction(
      () => window.notebookReady,
      {},
      { timeout: 60000 },
    );
    await settled(page);
    const pythonDrawing = await exportedSVG(page);
    expect({ circles: pythonDrawing.circles, paths: pythonDrawing.paths }).toEqual(EXPECTED[kind]);
    checkGeometry(kind, pythonDrawing);
    expect(errors).toEqual([]);
  });
}

// The Python example's scene with the Dumbbell's props changed.
async function dumbbellWith(page, change) {
  await page.route("**/test/notebook-chart-dumbbell.json", async (route) => {
    const fixture = JSON.parse(readFileSync(new URL("../../static/test/notebook-chart-dumbbell.json", import.meta.url), "utf8"));
    const find = (value) => !value || typeof value !== "object" ? undefined
      : value.kind === "Dumbbell" ? value : Object.values(value).map(find).find(Boolean);
    change(find(fixture.state).props);
    await route.fulfill({ json: fixture });
  });
}

test("a Dumbbell names a missing option, and its stems follow its opacity", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await dumbbellWith(page, (props) => { delete props.x1; });
  await page.goto("/test/notebook?fixture=chart-dumbbell");
  await expect.poll(async () => errors.join("\n") + (await page.locator("body").innerText())).toContain("Dumbbell needs x1: the column of each dumbbell's second value.");
  await page.unrouteAll();
  await dumbbellWith(page, (props) => { props.opacity = 0.3; });
  await page.goto("/test/notebook?fixture=chart-dumbbell");
  await page.waitForFunction(() => window.notebookReady, {}, { timeout: 60000 });
  await settled(page);
  const plot = page.locator("section.plot").first();
  await plot.locator(".canvas").first().hover();
  await plot.getByRole("button", { name: /^Export / }).first().click();
  const panel = page.getByRole("dialog", { name: /^Export · / });
  await panel.getByLabel("Format").selectOption("svg");
  const [download] = await Promise.all([page.waitForEvent("download"), panel.getByRole("button", { name: "Download" }).click()]);
  const text = readFileSync(await download.path(), "utf8");
  const opacities = await page.evaluate((text) => {
    const doc = new DOMParser().parseFromString(text, "image/svg+xml");
    return [...doc.querySelectorAll('g[clip-path^="url(#axis-mask"] path')].map((e) => e.getAttribute("stroke-opacity") ?? e.getAttribute("opacity"));
  }, text);
  expect(opacities).toHaveLength(5);
  for (const value of opacities) expect(Number(value)).toBeCloseTo(0.3, 2);
});

test("supporting parts can be omitted while each pattern's primary mark still exports", async ({ page }) => {
  const cases = [
    ["forest-plot", "ForestPlot", ["reference"], { circles: 3, paths: 9 }],
    ["bullet-chart", "BulletChart", ["target", "fields"], { circles: 0, paths: 2 }],
    ["interval-timeline", "IntervalTimeline", ["milestone"], { circles: 0, paths: 3 }],
    ["sparkline", "Sparkline", ["lower", "upper", "text"], { circles: 0, paths: 2 }],
  ];
  for (const [slug, kind, omitted, expected] of cases) {
    await page.route(`**/test/notebook-chart-${slug}.json`, async route => {
      const fixture = JSON.parse(readFileSync(new URL(`../../static/test/notebook-chart-${slug}.json`, import.meta.url), "utf8"));
      const visit = node => {
        if (node.kind === kind) for (const name of omitted) delete node.props[name];
        (node.children ?? []).forEach(visit);
      };
      visit(fixture.state.root);
      await route.fulfill({ json: fixture });
    });
    await page.goto(`/test/notebook?fixture=chart-${slug}`);
    await page.waitForFunction(() => window.notebookReady, {}, { timeout: 60000 });
    await settled(page);
    const drawing = await exportedSVG(page);
    expect({ circles: drawing.circles, paths: drawing.paths }).toEqual(expected);
    if (kind === "Sparkline") expect(drawing.text).toEqual([]);
    await page.unrouteAll();
  }
});
