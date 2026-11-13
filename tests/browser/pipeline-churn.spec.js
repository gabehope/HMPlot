import { test, expect } from "./fixtures.js";
import { installGpuCounters, countMarkBuilds, gpuCounters, countersDelta } from "./gpu-counters.js";
import { nodeOnScreen } from "./force-drag.js";

// Stage 17 (T5): interaction gestures must not compile GPU pipelines, rebuild marks, or read
// back more than they need once the page is warm. Every gesture runs once to warm up; then a
// DIFFERENT gesture of the same kind (another path, other extents, other values) is measured.
// Replaying the same gesture would hit every cache, including kernels that bake values in.
// Hover gestures pick, so picking pipelines are counted too. Each Stage 17 item adds the
// assertions it makes true (see TODO Stage 17).
let problems;
test.beforeEach(async ({ page }) => {
  problems = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") problems.push(`console: ${message.text()}`); });
  await page.addInitScript(installGpuCounters);
});
test.afterEach(() => expect(problems).toEqual([]));

const settle = (page) => page.evaluate(async () => {
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await window.__examples?.settle?.();
  await window.filterChain?.settle?.();
  await Promise.all(Object.values(window.__brushedFilterChain ?? {}).map((plot) => plot?.whenSettled?.()));
  await window.labelHover?.plot?.whenSettled?.();
  await new Promise((resolve) => setTimeout(resolve, 100));
});
async function open(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => window.__examples?.plot || window.filterChain?.plots?.a || window.labelHover?.label);
  await settle(page);
  await page.waitForTimeout(1000);
  await countMarkBuilds(page);
  return page.locator('[aria-label="Plot canvas"]').first().boundingBox();
}
/** Run `gesture` and return the GPU work it caused once the page settles. */
async function measure(page, gesture) {
  const before = await gpuCounters(page);
  await gesture();
  await settle(page);
  await page.waitForTimeout(200);
  return countersDelta(page, before, await gpuCounters(page));
}
const sweep = async (page, b, y) => { for (let i = 0; i <= 30; i++) await page.mouse.move(b.x + b.width * (0.1 + 0.8 * i / 30), b.y + b.height * y); };
const wheel = async (page, b, at, delta) => {
  await page.mouse.move(b.x + b.width * at[0], b.y + b.height * at[1]);
  for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, delta); await page.waitForTimeout(40); }
};
async function drag(page, b, from, to, shift = false) {
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.move(b.x + b.width * from[0], b.y + b.height * from[1]);
  await page.mouse.down();
  for (let i = 1; i <= 16; i++) await page.mouse.move(b.x + b.width * (from[0] + (to[0] - from[0]) * i / 16), b.y + b.height * (from[1] + (to[1] - from[1]) * i / 16));
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
}

test("hovering points compiles nothing and rebuilds no mark once warm; hover picks", async ({ page }) => {
  const b = await open(page, "/examples/categories");
  await sweep(page, b, 0.5); await settle(page);
  const work = await measure(page, () => sweep(page, b, 0.42));
  expect(work.readbackKinds.picking, JSON.stringify(work)).toBeGreaterThan(0);
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.render, JSON.stringify(work)).toBe(0);
  expect(work.builds, JSON.stringify(work)).toBe(0);
});

test("zooming and panning a time series compiles nothing once warm", async ({ page }) => {
  const b = await open(page, "/examples/timeseries");
  await wheel(page, b, [0.5, 0.5], -120); await drag(page, b, [0.6, 0.5], [0.3, 0.5]); await settle(page);
  const zoom = await measure(page, () => wheel(page, b, [0.4, 0.6], -90));
  expect(zoom.compute, JSON.stringify(zoom)).toBe(0);
  expect(zoom.render, JSON.stringify(zoom)).toBe(0);
  const pan = await measure(page, () => drag(page, b, [0.55, 0.45], [0.35, 0.6]));
  expect(pan.compute, JSON.stringify(pan)).toBe(0);
  expect(pan.render, JSON.stringify(pan)).toBe(0);
});

test("zooming a large graph compiles nothing once warm", async ({ page }) => {
  const b = await open(page, "/examples/large-graph");
  await wheel(page, b, [0.5, 0.5], -120); await settle(page);
  const work = await measure(page, () => wheel(page, b, [0.4, 0.6], -90));
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.render, JSON.stringify(work)).toBe(0);
});

test("scrolling the interaction matrix compiles nothing once every cell has mounted", async ({ page }) => {
  // The gallery component it had, at its legacy fixture (TODO 69.10).
  await open(page, "/test/gallery-example?id=interaction-matrix");
  const scroll = async (step) => {
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, step); await page.waitForTimeout(250); }
    await page.mouse.wheel(0, -4000); await page.waitForTimeout(500);
  };
  await scroll(500); await settle(page);
  const work = await measure(page, () => scroll(430));
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.render, JSON.stringify(work)).toBe(0);
});

test("the dashboard's hover label compiles nothing and rebuilds no mark once warm", async ({ page }) => {
  const b = await open(page, "/test/label-hover");
  await sweep(page, b, 0.5); await settle(page);
  const work = await measure(page, () => sweep(page, b, 0.42));
  expect(work.readbackKinds.picking, JSON.stringify(work)).toBeGreaterThan(0);
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.render, JSON.stringify(work)).toBe(0);
  expect(work.builds, JSON.stringify(work)).toBe(0);
});

// 17.1: a Filter value is a buffer, not a kernel literal. Values between two integers of the
// "bucket" column keep the match count, so only the value changes.
test("a Filter slider at a constant match count compiles nothing once warm (17.1)", async ({ page }) => {
  await open(page, "/test/filter-chain");
  const slide = async (values) => {
    for (const value of values) { await page.evaluate((v) => window.filterChain.setThreshold(v), value); await settle(page); }
  };
  await slide([7.2, 7.4]);
  const work = await measure(page, () => slide([7.15, 7.55, 7.85]));
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.render, JSON.stringify(work)).toBe(0);
});

// 17.2a/b: a mark reads back extents only for axes that infer their domain, all in one readback.
// Each Mona Lisa histogram's x axis is explicit; before, every brush move read ~26 values back.
test("a Mona Lisa brush move reads back about one extent per histogram (17.2a, b)", async ({ page }) => {
  const b = await open(page, "/examples/mona-lisa-histogram");
  await drag(page, b, [0.2, 0.2], [0.6, 0.6], true); await settle(page);
  await page.mouse.click(5, 5); await settle(page);
  const work = await measure(page, () => drag(page, b, [0.25, 0.3], [0.7, 0.55], true));
  // 16 moves, three histograms: at most one readback per histogram per move, plus the release.
  expect(work.readbackKinds.jax, JSON.stringify(work)).toBeLessThanOrEqual(3 * 16 + 6);
  expect(work.compute, JSON.stringify(work)).toBe(0);
});

// 17.2d: releasing a brush commits the preview's own mask, so no transform runs again.
test("releasing a brush reruns no transform (17.2d)", async ({ page }) => {
  const b = await open(page, "/test/filter-chain");
  const runs = () => page.evaluate(async () => (await import("/src/lib/plot/utils/transforms.js")).transformRuns.count);
  await page.keyboard.down("Shift");
  await page.mouse.move(b.x + b.width * 0.2, b.y + b.height * 0.2); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(b.x + b.width * (0.2 + 0.04 * i), b.y + b.height * (0.2 + 0.05 * i));
  await settle(page); await page.waitForTimeout(300);
  const before = await runs();
  await page.mouse.up(); await page.keyboard.up("Shift");
  await settle(page); await page.waitForTimeout(300);
  expect(await runs() - before).toBe(0);
});

/**
 * Field uploads per field name while `run` executes, for the fields of the marks at `marks`
 * (window paths); every field when `marks` is empty. `probe` is any mark, to find the field class.
 */
async function fieldUploads(page, marks, run, probe = marks[0]) {
  await page.evaluate(([names, probePath]) => {
    const at = (path) => path.split(".").reduce((o, k) => o?.[k], window)?.getMark?.();
    const fields = new Set(names.map(at).flatMap((mark) => [...(mark?.fields?.values() ?? [])]));
    const proto = Object.getPrototypeOf(at(probePath).fields.get("position"));
    window.__uploads = {};
    window.__uploadFields = fields;
    window.__uploadOriginal ??= proto.update;
    proto.update = function (...args) {
      if (!window.__uploadFields.size || window.__uploadFields.has(this)) {
        // A field's name is its type's; its key in the mark's fields says which channel it is.
        const key = [...(this.target?.fields ?? [])].find(([, field]) => field === this)?.[0] ?? this.name;
        window.__uploads[key] = (window.__uploads[key] ?? 0) + 1;
      }
      return window.__uploadOriginal.apply(this, args);
    };
  }, [marks, probe]);
  await run();
  await settle(page);
  return page.evaluate(() => window.__uploads);
}

// 17.2c: on the interactionFilter fast path only the row opacity changes per brush move.
test("a brush move uploads only row opacity to a Filter's fast-path point mark (17.2c)", async ({ page }) => {
  const b = await open(page, "/test/filter-chain");
  await drag(page, b, [0.2, 0.2], [0.6, 0.6], true); await settle(page);
  await page.mouse.click(5, 5); await settle(page);
  const uploads = await fieldUploads(page, ["filterChain.marks.g"], () => drag(page, b, [0.25, 0.3], [0.7, 0.55], true));
  expect(Object.keys(uploads), JSON.stringify(uploads)).toEqual(["interactionOpacity"]);
});

// 17.2f + 17.2c: hovering re-prepares no mark: only sizes and row opacities upload.
test("hovering the dashboard uploads only sizes and row opacity (17.2c, f)", async ({ page }) => {
  // The gallery component it had, at its legacy fixture (TODO 69.10): its hooks reach the filtered mark.
  const b = await open(page, "/test/gallery-example?id=interaction-dashboard");
  await sweep(page, b, 0.5); await settle(page);
  const uploads = await fieldUploads(page, [], () => sweep(page, b, 0.42), "__interactionDashboard.filteredMark");
  expect(Object.keys(uploads).filter((name) => !["size", "interactionOpacity"].includes(name)), JSON.stringify(uploads)).toEqual([]);
});

// 17.3c: a brush drives Filter > Bin > Rect and Filter > Group > Rect with no new lengths
// downstream, so a fresh brush compiles no compute pipeline once warm.
test("fresh brushes through Filter > Bin > Rect and Filter > Group > Rect compile nothing (17.3c)", async ({ page }) => {
  const b = await open(page, "/test/filter-chain?plots=abc");
  await drag(page, b, [0.2, 0.2], [0.6, 0.6], true); await settle(page);
  await page.mouse.click(5, 5); await settle(page);
  await drag(page, b, [0.3, 0.1], [0.8, 0.5], true); await settle(page);
  await page.mouse.click(5, 5); await settle(page);
  const work = await measure(page, async () => {
    await drag(page, b, [0.25, 0.3], [0.7, 0.55], true);
    await settle(page);
    await drag(page, b, [0.1, 0.35], [0.45, 0.9]);
  });
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.builds, JSON.stringify(work)).toBe(0);
});

// 17.3d: Filter > Calculate with a reduction (mean) keeps the physical rows, so a fresh brush
// compiles nothing either; its values follow the brush, so the mark prepares again.
test("fresh brushes through Filter > Calculate(mean) > Points compile nothing (17.3d)", async ({ page }) => {
  const b = await open(page, "/test/filter-chain?plots=ae");
  await drag(page, b, [0.2, 0.2], [0.6, 0.6], true); await settle(page);
  await page.mouse.click(5, 5); await settle(page);
  await drag(page, b, [0.3, 0.1], [0.8, 0.5], true); await settle(page);
  await page.mouse.click(5, 5); await settle(page);
  const work = await measure(page, async () => {
    await drag(page, b, [0.25, 0.3], [0.7, 0.55], true);
    await settle(page);
    await drag(page, b, [0.1, 0.35], [0.45, 0.9]);
  });
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.builds, JSON.stringify(work)).toBe(0);
  // The mark draws every physical row and shows the brushed ones.
  const state = await page.evaluate(() => ({ drawn: window.filterChain.marks.e.getMark().count, shown: ((m) => m && (m.view.marks.of(m)?.rows.count ?? m.count))(window.filterChain.marks.e.getMark()) }));
  expect(state.drawn).toBe(50000);
  expect(state.shown).toBeGreaterThan(0);
  expect(state.shown).toBeLessThan(50000);
});

// 17.3e: Filter > Sort keeps the capacity (the kept rows first), and a straight Line draws the
// first `count` of them, so a fresh brush compiles nothing and the line stops at the kept rows.
test("fresh brushes through Filter > Sort > Line compile nothing (17.3e)", async ({ page }) => {
  const b = await open(page, "/test/filter-chain?plots=ad");
  await drag(page, b, [0.2, 0.2], [0.6, 0.6], true); await settle(page);
  await page.mouse.click(5, 5); await settle(page);
  await drag(page, b, [0.3, 0.1], [0.8, 0.5], true); await settle(page);
  await page.mouse.click(5, 5); await settle(page);
  const work = await measure(page, async () => {
    await drag(page, b, [0.25, 0.3], [0.7, 0.55], true);
    await settle(page);
    await drag(page, b, [0.1, 0.35], [0.45, 0.9]);
  });
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.builds, JSON.stringify(work)).toBe(0);
  const drawn = await page.evaluate(() => window.filterChain.marks.d.getMark().count);
  expect(drawn).toBeGreaterThan(0);
  expect(drawn).toBeLessThan(50000);
});

// 17.3h: on the 500k-row fixture a narrow brush buckets the Filter's rows for the transforms
// after it, and a fresh narrow brush in the same bucket compiles nothing. TODO 25.1: the point
// mark straight after a Filter (plot G, maxElements = rows) draws the physical rows and swaps
// their mask; a bucket it drew before refilled every field on every brush move (34 vs 50 ms a
// brush step, the same zoom frame time).
test("a narrow brush on 500k rows compiles nothing; the point mark after the Filter swaps its mask (17.3h, 25.1)", { tag: "@gpu" }, async ({ page }) => {
  test.setTimeout(240000);
  const b = await open(page, "/test/filter-chain?rows=500000&plots=abg");
  for (const [from, to] of [[[0.4, 0.4], [0.47, 0.47]], [[0.52, 0.3], [0.58, 0.38]]]) {
    await drag(page, b, from, to, true); await settle(page);
    await page.mouse.click(5, 5); await settle(page);
  }
  const work = await measure(page, async () => {
    await drag(page, b, [0.3, 0.6], [0.36, 0.65], true);
    await settle(page);
    await drag(page, b, [0.1, 0.12], [0.15, 0.2], true);
  });
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.builds, JSON.stringify(work)).toBe(0);
  const mark = await page.evaluate(() => { const m = window.filterChain.marks.g.getMark(); return { drawn: m.count, shown: m.view.marks.of(m)?.rows.count ?? m.count }; });
  expect(mark.shown).toBeGreaterThan(0);
  expect(mark.shown).toBeLessThan(50000);
  expect(mark.drawn).toBe(500000);
});

// 17.12: the gallery's brushed filter chain (Filter > Bin, Filter > Group) compiles nothing and
// rebuilds no mark on a new brush once warm.
test("the brushed filter chain example compiles nothing on a new brush once warm (17.12)", async ({ page }) => {
  const b = await open(page, "/examples/brushed-filter-chain");
  // Stay inside both axes: x=20% can land in the y-axis gutter on these narrow plots.
  await drag(page, b, [0.35, 0.25], [0.7, 0.65], true); await settle(page);
  expect(await page.evaluate(() => window.__brushedFilterChain.plot.getBrush().getConstraints().map(d => d.name).sort())).toEqual(["x", "y"]);
  await page.evaluate(() => window.__brushedFilterChain.plot.clearBrush()); await settle(page);
  expect(await page.evaluate(() => window.__brushedFilterChain.plot.getBrush().status().active)).toBe(false);
  const work = await measure(page, () => drag(page, b, [0.3, 0.15], [0.75, 0.5], true));
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.render, JSON.stringify(work)).toBe(0);
  expect(work.builds, JSON.stringify(work)).toBe(0);
});

// 17.12 showcase: the running totals example (Filter > Sort > Window > Line) compiles nothing and
// rebuilds no mark on a new brush once warm.
test("the running totals example compiles nothing on a fresh brush once warm", async ({ page }) => {
  const b = await open(page, "/examples/running-totals");
  await drag(page, b, [0.2, 0.1], [0.6, 0.9], true); await settle(page);
  await page.mouse.click(b.x + 5, b.y + 5); await settle(page);
  const work = await measure(page, () => drag(page, b, [0.3, 0.12], [0.75, 0.8], true));
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.render, JSON.stringify(work)).toBe(0);
  expect(work.builds, JSON.stringify(work)).toBe(0);
});

// 17.14: the showcase examples the gaps held back. A fresh brush over the distributions (Filter >
// Violin, Filter > BoxPlot), new times for the moving particles (Filter > Slice every frame) and
// fresh values for the half-million slider (Filter > Hexbin with an extent, Filter > Bin, at
// bucket lengths the warm-up visited) compile nothing and rebuild no mark once warm.
test("the distributions, particles and half-million examples compile nothing once warm (17.14)", { tag: "@gpu" }, async ({ page }) => {
  const results = {};
  let b = await open(page, "/examples/brushed-distributions");
  await drag(page, b, [0.2, 0.2], [0.6, 0.6], true); await settle(page);
  await page.mouse.click(b.x + 5, b.y + 5); await settle(page);
  results.distributions = await measure(page, () => drag(page, b, [0.35, 0.15], [0.8, 0.55], true));
  await page.goto("/examples/moving-particles");
  await page.waitForFunction(() => Boolean(window.__movingParticles && window.__examples?.plot));
  const times = async (values) => { for (const t of values) { await page.evaluate((v) => window.__movingParticles.setTime(v), t); await settle(page); } };
  await times([3.25, 17.5]); await countMarkBuilds(page);
  results.particles = await measure(page, () => times([5.1, 9.37, 33.3, 41.05, 57.9]));
  await page.goto("/examples/half-million-threshold");
  await page.waitForFunction(() => Boolean(window.__halfMillion && window.__examples?.plot));
  const slide = async (values) => { for (const v of values) { await page.evaluate((x) => window.__halfMillion.setMinimum(x), v); await settle(page); } };
  await slide([2.5, 3, 3.5, 4, 4.5, 5, 4, 3, 2]); await countMarkBuilds(page);
  results.halfMillion = await measure(page, () => slide([2.23, 2.71, 3.33, 3.87, 4.41, 4.93, 4.12, 3.21, 2.17]));
  for (const [name, work] of Object.entries(results)) {
    expect(work.compute, `${name} ${JSON.stringify(work)}`).toBe(0);
    expect(work.render, `${name} ${JSON.stringify(work)}`).toBe(0);
    expect(work.builds, `${name} ${JSON.stringify(work)}`).toBe(0);
  }
});

// TODO 25: above a 0.61 speed threshold the Filter keeps under a quarter of the 90,000 rows. It
// still hands its children its own rows with a mask (the bucket is built only for a consumer
// that reads it), so the orbit layer swaps its mask (one copy of its row opacity) instead of
// refilling its fields (three); a change reads back the kept count and the Slice's active span
// only (the controls' ranges are cached or set by `extent`); and while the particles play the
// Slice's count is known inside its active span, so a frame reads nothing back.
test("moving particles: a high threshold swaps the orbit layer's mask; playing reads nothing back", { tag: ["@gpu", "@timing"] }, async ({ page }) => {
  await page.addInitScript(() => {
    window.__largeCopies = 0;
    const copy = GPUCommandEncoder.prototype.copyBufferToBuffer;
    GPUCommandEncoder.prototype.copyBufferToBuffer = function (...args) {
      if (args.at(-1) >= 65536) window.__largeCopies++;
      return copy.apply(this, args);
    };
  });
  await page.goto("/examples/moving-particles");
  await page.waitForFunction(() => Boolean(window.__movingParticles && window.__examples?.plot));
  await page.waitForTimeout(1500); // playing
  const thresholds = async (values) => { for (const v of values) { await page.evaluate((x) => window.__movingParticles.setMinimum(x), v); await settle(page); } };
  // Into the band where the Filter buckets (its third run there), warm.
  await thresholds([0.75, 0.76, 0.77, 0.78, 0.79, 0.8]);
  for (const value of [0.81, 0.83, 0.85]) {
    const before = await gpuCounters(page), copies = await page.evaluate(() => window.__largeCopies);
    await page.evaluate((x) => window.__movingParticles.setMinimum(x), value);
    await settle(page);
    const work = await countersDelta(page, before, await gpuCounters(page));
    expect(await page.evaluate(() => window.__largeCopies) - copies, `${value}: the orbit layer swaps its mask`).toBe(1);
    expect(work.compute, JSON.stringify(work)).toBe(0);
    expect(work.readbackKinds.jax, `${value}: ${JSON.stringify(work)}`).toBeLessThanOrEqual(2);
  }
  const before = await gpuCounters(page);
  const frames = await page.evaluate(async () => {
    let frames = 0; const t0 = performance.now();
    await new Promise((resolve) => { const f = (now) => { frames++; if (now - t0 < 1000) requestAnimationFrame(f); else resolve(); }; requestAnimationFrame(f); });
    return frames;
  });
  const playing = await countersDelta(page, before, await gpuCounters(page));
  expect(frames).toBeGreaterThan(20);
  expect(playing.readbacks, `a second of playback: ${JSON.stringify(playing)}`).toBe(0);
});

// TODO 26: a brush move over the brushed distributions reads back its Filters' counts, the grouped
// transforms' output counts, Density's statistics and the marks' axis extents, not a count and
// quartiles per group (51 readbacks a move before).
test("brushed distributions: a brush move reads back little (TODO 26)", async ({ page }) => {
  const b = await open(page, "/examples/brushed-distributions");
  await drag(page, b, [0.2, 0.2], [0.6, 0.6], true); await settle(page);
  const work = await measure(page, () => page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.5));
  expect(work.readbackKinds.jax, JSON.stringify(work)).toBeLessThanOrEqual(14);
  expect(work.compute, JSON.stringify(work)).toBe(0);
});

// TODO 26.6: the earthquakes' depth slider reruns the globe's Calculate only: nothing compiles or is
// read back, and only the globe's positions are copied (each plot re-prepared from re-uploaded
// columns before). The slider is the paired example's Python Slider (TODO 69.16); its 6,397 quakes'
// positions are 102 KB, so every copy of 4 KB or more counts.
test("earthquakes: a depth-exaggeration step updates the globe only (TODO 26.6)", async ({ page }) => {
  await page.addInitScript(() => {
    window.__largeCopies = [];
    const copy = GPUCommandEncoder.prototype.copyBufferToBuffer;
    GPUCommandEncoder.prototype.copyBufferToBuffer = function (...args) {
      if (args.at(-1) >= 4096) window.__largeCopies.push(args.at(-1));
      return copy.apply(this, args);
    };
  });
  await page.goto("/examples/earthquakes");
  await page.waitForFunction(() => window.__examples?.plot, undefined, { timeout: 90000 });
  const slider = page.getByRole("slider", { name: "Depth exaggeration" });
  await slider.waitFor({ timeout: 90000 });
  await settle(page); await page.waitForTimeout(1000);
  const set = (v) => slider.evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event("input", { bubbles: true })); }, v);
  for (const v of [4.1, 4.2]) { await set(v); await settle(page); }
  const before = await gpuCounters(page), copies = await page.evaluate(() => window.__largeCopies.length);
  await set(4.7); await settle(page);
  const work = await countersDelta(page, before, await gpuCounters(page));
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.readbacks, JSON.stringify(work)).toBe(0);
  const copied = await page.evaluate((from) => window.__largeCopies.slice(from), copies);
  expect(copied, "only the globe's positions, 16 bytes a quake").toEqual([6397 * 16]);
});

// A speed slider on the moving particles while they play: the Slice after the Filter keeps a row
// per particle (the active ones valid), even when a narrow selection buckets the Filter, and its
// time control reads the unfiltered rows. Fresh thresholds compile nothing once warm; before, the
// Slice's output followed the kept particles and each threshold compiled new kernels.
test("the moving particles' speed threshold compiles nothing while playing once warm", { tag: "@gpu" }, async ({ page }) => {
  await page.goto("/examples/moving-particles");
  await page.waitForFunction(() => Boolean(window.__movingParticles && window.__examples?.plot));
  await page.waitForTimeout(1500); // playing
  const thresholds = async (values) => { for (const v of values) { await page.evaluate((x) => window.__movingParticles.setMinimum(x), v); await settle(page); } };
  await thresholds([0.2, 0.4, 0.6, 0.75, 0.85, 0.9, 0.7, 0.5, 0.3]); await countMarkBuilds(page);
  const work = await measure(page, () => thresholds([0.23, 0.37, 0.52, 0.66, 0.79, 0.88, 0.71, 0.44, 0.27]));
  expect(work.compute, JSON.stringify(work)).toBe(0);
  expect(work.render, JSON.stringify(work)).toBe(0);
  expect(work.builds, JSON.stringify(work)).toBe(0);
});

// TODO 30.4: a Force step re-prepares the marks over its nodes and edges, but only their
// position fields change: the constants and unchanged columns write nothing.
// TODO 30.4: a step writes the marks' position fields only, and `Nodes data=` joins its table
// once per graph, not per step: the steps read nothing back.
// TODO 65.3: and they wait for the GPU once a tick (a zero-byte map, which .data() counts miss;
// it was two), and a drag's moves not at all (three a move before): the publication's settle
// waits for the constraint and the marks' uploads together.
test("a Force step writes only the marks' position fields and reads nothing back", async ({ page }) => {
  await open(page, "/test/gallery-example?id=transform-force");
  const step = page.getByRole("button", { name: /^Step$/ }).first();
  await step.click(); await settle(page);
  await page.evaluate(async () => {
    const { BufferedField } = await import("/src/lib/plot/utils/proputils.js");
    const { Array: JaxArray } = await import("/src/lib/jax.js");
    window.__writes = {};
    window.__reads = 0;
    window.__writeOriginal ??= BufferedField.prototype.write;
    window.__dataOriginal ??= JaxArray.prototype.data;
    BufferedField.prototype.write = function (...args) {
      const key = [...(this.target?.fields ?? [])].find(([, field]) => field === this)?.[0] ?? this.name;
      const name = `${this.target?.componentName ?? this.target?.constructor?.componentName}.${key}`;
      window.__writes[name] = (window.__writes[name] ?? 0) + 1;
      return window.__writeOriginal.apply(this, args);
    };
    JaxArray.prototype.data = function (...args) {
      window.__reads++;
      return window.__dataOriginal.apply(this, args);
    };
  });
  const stepping = await measure(page, async () => { for (let i = 0; i < 3; i++) { await step.click(); await settle(page); } });
  const { writes, reads } = await page.evaluate(() => ({ writes: window.__writes, reads: window.__reads }));
  expect(Object.keys(writes).sort(), JSON.stringify(writes)).toEqual(["Points.position", "Segments.end", "Segments.start"]);
  expect(reads).toBe(0);
  expect(stepping.readbackKinds.jax, JSON.stringify(stepping)).toBe(3);
  // A paused drag of node 3: once pressed (the press reads the node's position and pin), its
  // moves and release map nothing.
  const node = await nodeOnScreen(page, 3);
  await page.mouse.move(node.x, node.y);
  await page.mouse.down();
  await page.waitForFunction(() => {
    let status;
    window.__transformExample.force.subscribe((s) => (status = s))();
    return status.selected === 3;
  });
  await page.waitForTimeout(100);
  const dragging = await measure(page, async () => {
    for (let i = 1; i <= 16; i++) { await page.mouse.move(node.x + 2 * i, node.y); await page.waitForTimeout(20); }
    await page.mouse.up();
  });
  expect((await nodeOnScreen(page, 3)).data[0]).toBeGreaterThan(node.data[0] + 30 * node.perPixel[0] - 0.05);
  expect(dragging.readbackKinds.jax, JSON.stringify(dragging)).toBe(0);
});
