import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import registry from "../../src/lib/scene/registry.json" with { type: "json" };
import { componentOptions, componentTier, optionsTable } from "../../src/lib/scene/options.js";

// TODO 137.7: the public surface can only shrink. A change that lowers a count lowers its recorded
// value in the same change; a rise needs a written reason in the change and in AGENTS.md's terms
// (a new public component or keyword is justified; a pattern is a template). Counted from the
// options table, which generates the Python signatures, the TypeScript props and the docs.
const RECORDED = {
  // 113: TODO 138.3 made Sky and Bloom entries of a Plot's effects (decided in 137.6).
  // 109: TODO 137.3 removed JoinAggregate, ECDF, Quantile and Shuffle (decided in 137.0).
  // 108: TODO 137.3 folded FromEdges into GraphData (its keywords moved, none added).
  // 109: TODO 130.3 split DensityBands from DensityContour (decided 2026-10-11): its mode= is
  // deprecated, then removed.
  // 108: TODO 137.6 folds MultiSelect into Select(multiple=true).
  // 109: TODO 130.4 adds Dumbbell in charts, a template over public components
  // (decided in 130.0); its keywords are existing names.
  // 108: TODO 137.6 folds RangeSlider into Slider(value=[lower, upper]).
  // 107: TODO 137.6 replaces Controls with Row.
  // 108: TODO 130.4 adds Waterfall in charts, using existing keywords.
  // 110: Candlestick (130.4) and Marginals (136.16), authorized chart/figure templates.
  // 109: Data(rows) replaces ConstantData (137.6).
  // 108: GeoJSON(fill=null) replaces GeoJSONLine (137.6).
  // 104: Plot(lights) replaces the four Python light components (137.6).
  // 103: Area(lower, upper) replaces Ribbon (137.6).
  // 104: TODO 138.7 authorizes one generic Transform for plugin computations and layouts.
  // 106: user-requested BandX/BandY reference intervals are Rect templates (2026-10-17).
  // They reuse existing keywords and frame-edge channels; no core rendering component.
  // User-authorized first pattern batch (2026-10-17): ForestPlot, BulletChart,
  // IntervalTimeline and Sparkline are defineChart templates over existing public marks.
  // No core components or numerical plugins are added; named part objects avoid flat style APIs.
  // 111: user-requested EndLabels (136.16 slice 7, 2026-10-19), a chart template over Filter and
  // Text with existing keywords (x, y, series, text, format, at, dx), for the evals' end-of-line
  // labels (lines-labeled; rebased-returns' Filter > Text widened a linked panel's domain).
  // 112: FocusContext (136.16 slice 2, decided 2026-10-17 as a public name): a figure template
  // over Plots and Lines; its keywords are existing names.
  // 113: Panels (136.16 slice 3, decided 2026-10-17 as a public name), a core layout: stacked
  // Plots over one shared x (134.31, matplotbench-76, rebased-returns); x and gap exist already.
  // 114: user-authorized Html provides DOM placement, focus and lifecycle, not a mark pattern.
  // 115: TableView (TODO 145.4, authorized by the maintainer 2026-10-22): rows of text in the DOM,
  // which cannot be composed from GPU marks (Html's reason); its keywords are existing names
  // (columns, limit, title, select, hover, name).
  components: 115,
  // 403 and 92: TODO 130.1 made a mark's `domains` public (it was the internal _domains), so
  // templates can leave a part out of the automatic domains, and gave marks rows="auto" (one
  // item when no channel reads a column; `rows` was already ConstantData's): decided 2026-10-11.
  // 404: Segments' cap="bar" (TODO 130.1, decided 2026-10-11), so ErrorBars can become a
  // template over Segments; capSize was already ErrorBars'.
  // 399: TODO 138.3 replaced Plot's fog, Sky's image, zenith, horizon, ground and rotation and
  // Bloom's strength and radius with Plot's effects.
  // 400 and 93: TODO 138.3's shade on every mark, a plugin's fragment hook (decided 2026-10-14,
  // 138's "Surface": shade +1).
  // 387 and 88 (now Plot's): TODO 137.4 removed the 14 flat scale keys (fillDomain, sizeRange,
  // widthTransform, GeoJSON's heightDomain, ...) for the scale object per channel, and gave
  // GeoJSON heightScale (+1, decided 2026-10-13: the scale object per channel).
  // 385: TODO 137.3 removed Quantile's probabilities and steps; Sample's order (+0: Sort's).
  // 386: Crosshair's readoutPosition (TODO 130.3, decided 2026-10-11): where its readouts sit, set
  // by the user, as the template does not detect the frame.
  // 387: Lollipop's stem (TODO 130.3, decided 2026-10-13: a named part takes its props as one
  // object), which replaces stemColor and stemWidth in 137.6.
  // 388: multiple replaces the separate MultiSelect component (TODO 137.6).
  // 393: Candlestick open, high, low, close and wick (130.4).
  // 390: ConstantData removal retires zeros, ones and random switches (137.6).
  // 387: lights replaces intensity, distance, decay and groundColor as component keywords.
  // 385: Lollipop's stem object replaces stemColor and stemWidth (137.6).
  // 386: Transform.kind selects a registered computation (TODO 138.7); params already exists.
  // 387: user-requested Plot.dynamicMargins opts out of camera-only margin growth (2026-10-17).
  // 388: user-requested animationGroup separates snapshot motion from observation identity.
  // The same batch adds seven concepts: reference/referenceLine, last, ranges/tick,
  // milestone/milestones. Other parameters and part names reuse existing vocabulary.
  // Existing supported mark callbacks now have explicit JS types and reference entries.
  // 407: user-requested Button.set (TODO 145.7, 2026-10-22): a press writes other inputs (back
  // to a drill-down's top), with the writes input("root").set()/.reset() a mark's select makes.
  distinctKeywords: 407,
  // 87 (Plot's): TODO 137.5 removed the marks' and the Plot's displayScale (the Minimap keeps its own).
  // 88: the decided Plot.lights prop replaces four scene components (137.6).
  // 89: the same Plot navigation policy; numeric side margins remain independent.
  // 90: Plot inherits the same scoped animationGroup used by Data and Frame.
  largestSignature: 90,
};

test("the public API's surface does not grow (components, distinct keywords, the largest signature)", () => {
  const kinds = Object.keys(optionsTable.components);
  assert.deepEqual(kinds.sort(), Object.keys(registry.components).sort());
  const names = new Set();
  let largest = 0, largestKind = "";
  for (const kind of kinds) {
    const options = componentOptions(kind);
    for (const option of options) names.add(option.name);
    if (options.length > largest) [largest, largestKind] = [options.length, kind];
  }
  const measured = { components: kinds.length, distinctKeywords: names.size, largestSignature: largest };
  for (const [key, recorded] of Object.entries(RECORDED)) {
    assert.ok(measured[key] <= recorded,
      `${key} is ${measured[key]}; recorded ${recorded}${key === "largestSignature" ? ` (${largestKind})` : ""}. The public surface only shrinks (TODO 137.7): remove the addition, or record the new value with a written reason.`);
  }
  // Lowered counts are recorded in the same change, so the ratchet keeps what was gained.
  for (const [key, recorded] of Object.entries(RECORDED))
    assert.equal(measured[key], recorded, `${key} fell to ${measured[key]}: lower its recorded value to keep the gain.`);
});

// TODO 137.1: the tiers decided in 137.0, marked in the options table. A template moves to its
// module (137.1b, 137.1c) with its tier; a new chart or transform template is marked here too.
test("the options table marks the decided chart and stats templates and the advanced keywords", () => {
  const tiers = { charts: [], stats: [] };
  for (const kind of Object.keys(optionsTable.components)) {
    const tier = componentTier(kind);
    if (tier !== "core") tiers[tier].push(kind);
  }
  assert.deepEqual(tiers.charts.sort(), ["Arrows", "BandX", "BandY", "Bar", "BoxPlot", "BulletChart", "Callout", "Candlestick", "Crosshair", "DensityBands", "DensityContour", "Dumbbell", "Ecdf", "EndLabels",
    "ErrorBars", "FocusContext", "ForestPlot", "Histogram", "IntervalTimeline", "Lollipop", "Marginals", "Pie", "RuleX", "RuleY", "Smooth", "Sparkline", "Swarm", "Violin", "Waterfall"]);
  assert.deepEqual(tiers.stats.sort(), ["Bin", "Hexbin", "Normalize", "Summary", "Window"]);
  const advanced = new Set();
  for (const kind of Object.keys(optionsTable.components))
    for (const option of componentOptions(kind)) if (option.advanced) advanced.add(option.name);
  assert.deepEqual([...advanced].sort(), ["depthWrite", "maxInstances", "sampling", "textureResolution"]);
  // Each one is advanced wherever it is listed, a component's own refinement included.
  for (const kind of Object.keys(optionsTable.components))
    for (const option of componentOptions(kind))
      if (advanced.has(option.name)) assert.ok(option.advanced, `${kind}.${option.name} is not marked advanced`);
});


test("patterns have one public component namespace, separate from the core barrel", () => {
  const exportsOf = (path) => new Set([...readFileSync(new URL(path, import.meta.url), "utf8")
    .matchAll(/export \{ default as (\w+) \}/g)].map(match => match[1]));
  const core = exportsOf("../../src/lib/index.ts");
  for (const tier of ["charts", "stats"]) {
    const patterns = exportsOf(`../../src/lib/${tier}/index.ts`);
    if (tier === "charts") for (const name of exportsOf("../../src/lib/charts/generated/index.ts")) patterns.add(name);
    const expected = Object.keys(optionsTable.components).filter(name => componentTier(name) === tier);
    assert.deepEqual([...patterns].sort(), expected.sort());
    for (const name of patterns) assert.equal(core.has(name), false, `${name} belongs to hmplot/${tier}`);
  }
});
