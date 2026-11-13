import test from "node:test";
import assert from "node:assert/strict";
import { optionsRoot } from "../../src/lib/options/options.js";
import { BooleanType, FieldType } from "../../src/lib/plot/objects/types.js";
import {
  definitionKey, createGuideRegistry, categoryEntries, rampSamples, seriesEntries, LEGEND_CHANNELS,
  applyCategoryToggle, guideGroups, temporalFormat, guideObject, explainedGuides,
} from "../../src/lib/plot/utils/guides.js";
import { numericCategoryValue, prepareNamed } from "../../src/lib/plot/utils/namedData.js";
import { colormapStops, colormapColor } from "../../src/lib/plot/utils/colormap.js";
import { categorical, ordinal, createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { continuous } from "../../src/lib/plot/utils/scaleResources.js";
import { numpy as np } from "@hmplot/jax";
import { createViewMarks, emptyBinding } from "../../src/lib/plot/utils/markBinding.js";
import { unexplainedColors, hiddenCategoryLabels, marksOutsideAxes, coveringMarkers } from "../../src/lib/plot/utils/plotLints.js";
import { claimLegend, legendExplains } from "../../src/lib/plot/utils/legendClaims.js";
import { setLintExtents } from "../../src/lib/plot/utils/lintMode.js";

// A minimal registered mark: an options node with the options markEntry reads.
function mark(parent, name) {
  const options = parent.splitUnique(name, "mark", "Sprites");
  options.ensure("visible", new BooleanType({ defaultValue: true }));
  for (const key of ["label", "legend", "fillColor", "shape", "opacity", "outlineColor", "outlineWidth"])
    options.ensure(key, new FieldType({ defaultValue: undefined }));
  options.set("fillColor", "#547ba2");
  return { options, fields: new Map(), view: { marks } };
}
// The marks' view's accepted bindings (Stage 117.2): legends read a mark's categories, column
// titles and resolved scales there.
const marks = createViewMarks();
function bind(m, { legend = null, scales = null } = {}) {
  marks.publish(m, emptyBinding({
    legend: legend && { temporal: {}, channelTitles: {}, refresh() {}, toggle() {}, ...legend },
    scales,
  }));
}

test("definition keys: sibling marks differ, facet cells share, names and ordinals are stable", () => {
  const facet = optionsRoot.splitUnique("Legend test facet");
  const cells = [0, 1, 2].map(() => {
    const plot = facet.splitUnique("Plot");
    plot.definitionAlias = "*";
    return plot;
  });
  const first = cells.map((cell) => mark(cell));
  const second = cells.map((cell) => mark(cell));
  assert.equal(new Set(first.map((m) => definitionKey(m.options))).size, 1, "one key across three cells");
  assert.notEqual(definitionKey(first[0].options), definitionKey(second[0].options), "siblings keep distinct keys");
  const named = mark(cells[0], "Trend"), renamed = mark(cells[0], "Trend line");
  assert.match(definitionKey(named.options), /\/Trend$/);
  assert.notEqual(definitionKey(named.options), definitionKey(renamed.options));
  // Unnamed marks use per-parent ordinals, so a remount in the same position keeps its key.
  const key = definitionKey(second[1].options);
  second[1].options.dispose();
  assert.equal(definitionKey(mark(cells[1]).options), key);
  facet.dispose();
});

test("the registry lists one entry per definition and fans visibility out to every mount", async () => {
  const facet = optionsRoot.splitUnique("Registry test facet"), registry = createGuideRegistry();
  const marks = [0, 1, 2].map(() => {
    const plot = facet.splitUnique("Plot");
    plot.definitionAlias = "*";
    const m = mark(plot);
    m.options.set("label", "Points");
    registry.register(m);
    return m;
  });
  const entries = seriesEntries(registry.handle);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].label, "Points");
  entries[0].handle.setVisible(false);
  assert.deepEqual(marks.map((m) => m.options.get("visible")), [false, false, false]);
  assert.equal(registry.definitionMarks(entries[0].id).length, 3);
  registry.dispose();
  facet.dispose();
});

test("a cell plot's legend source reaches its own mount and toggles every cell", () => {
  const facet = optionsRoot.splitUnique("Scoped handle facet"), registry = createGuideRegistry();
  const cells = [0, 1].map(() => {
    const plot = facet.splitUnique("Plot");
    plot.definitionAlias = "*";
    const points = mark(plot), line = mark(plot);
    registry.register(points); registry.register(line);
    return { plot, points, line };
  });
  for (const [i, cell] of cells.entries()) {
    const entries = registry.scopedHandle(cell.plot).entries();
    // One entry per definition, each resolving to this cell's mark (per-cell scales and bounds).
    assert.deepEqual(entries.map(guideObject), [cell.points, cell.line], `cell ${i}`);
  }
  // Acting on a cell's entry still acts on the definition, in every cell.
  registry.scopedHandle(cells[1].plot).entries()[0].setVisible(false);
  assert.deepEqual(cells.map((cell) => cell.points.options.get("visible")), [false, false]);
  assert.deepEqual(cells.map((cell) => cell.line.options.get("visible")), [true, true]);
  registry.dispose();
  facet.dispose();
});

test("nested plots forward their automatic legend request to the root registry", () => {
  const registry = createGuideRegistry(), a = {}, b = {};
  assert.equal(registry.automatic, false);
  const stop = registry.requestAutomatic(a, { position: "right" });
  registry.requestAutomatic(b, false);
  assert.deepEqual(registry.automatic, { position: "right" });
  stop();
  assert.equal(registry.automatic, false);
  registry.dispose();
});

test("category swatches merge channels that share a column", () => {
  const plot = optionsRoot.splitUnique("Swatch test plot"), m = mark(plot);
  const entries = (pairs) => pairs.map(([value, extra]) => ({ value, label: value, visible: true, ...extra }));
  bind(m, { legend: { categories: {
    fill: { field: "species", entries: entries([["A", { color: "#ff0000" }], ["B", { color: "#00ff00" }]]) },
    shape: { field: "species", entries: entries([["A", { shape: "triangle" }], ["B", { shape: "star" }]]) },
    size: { field: "group", entries: entries([["x", { size: 6 }]]) },
  } } });
  const fill = categoryEntries(m, "fill");
  assert.deepEqual(fill.map((e) => [e.color, e.shape]), [["#ff0000", "triangle"], ["#00ff00", "star"]]);
  const size = categoryEntries(m, "size");
  assert.equal(size[0].size, 6);
  assert.equal(size[0].color, "#547ba2", "unrelated channels keep the mark's constant fill");
  assert.equal(categoryEntries(m, "opacity"), null);
  plot.dispose();
});

test("numeric category values: explicit numeric ranges, defaults, and unknowns", () => {
  const explicit = ordinal({ domain: ["a", "b", "c"], range: [6, 12, 18] });
  assert.deepEqual([0, 1, 2].map((i) => numericCategoryValue(explicit, i, "size")), [6, 12, 18]);
  assert.equal(numericCategoryValue(explicit, -1, "size"), 6);
  const automatic = categorical({ domain: ["a", "b", "c"] });
  assert.deepEqual([0, 1, 2].map((i) => +numericCategoryValue(automatic, i, "opacity").toFixed(6)), [1, 0.65, 0.3]);
  assert.deepEqual([0, 1].map((i) => numericCategoryValue(categorical({ domain: ["a", "b"] }), i, "width")), [1, 6]);
  assert.equal(numericCategoryValue(categorical({ domain: ["solo"] }), 0, "size"), 10.5);
  // A color range (shared with a fill) falls back to the numeric defaults.
  assert.equal(numericCategoryValue(categorical({ domain: ["a", "b"], range: ["#f00", "#0f0"] }), 1, "size"), 16);
});

test("ramp samples are evenly spaced in the transformed domain", () => {
  assert.deepEqual(rampSamples({ domain: [1, 1000], range: [4, 20], transform: "log" }).map((s) => s.value), [1, 10, 100, 1000]);
  assert.deepEqual(rampSamples({ domain: [1, 1000], range: [4, 20], transform: "log" }).map((s) => s.output), [4, 4 + 16 / 3, 4 + 32 / 3, 20]);
  assert.deepEqual(rampSamples({ domain: [0, 9], range: [0, 1], transform: "sqrt" }).map((s) => s.value), [0, 1, 4, 9]);
  assert.deepEqual(rampSamples({ domain: [5, 5], range: [2, 8] }), [{ t: 0.5, value: 5, output: 5 }]);
  assert.deepEqual(rampSamples({ domain: [NaN, 1], range: [0, 1] }), []);
  assert.deepEqual(rampSamples({ domain: [-1, 10], range: [0, 1], transform: "log" }), []);
});

test("colormap stops match the GPU lookup: endpoints, value range, and quantized bands", () => {
  const stops = colormapStops("Viridis");
  assert.equal(stops.length, 24);
  assert.equal(stops[0].color, colormapColor("Viridis", 0));
  assert.equal(stops.at(-1).offset, 1);
  assert.equal(colormapColor("Viridis", 0.5, { range: [0, 0] }), colormapColor("Viridis", 0));
  const quantized = colormapStops("Viridis", { quantize: true, levels: 4 });
  assert.equal(quantized.length, 8, "two hard stops per level");
  assert.equal(quantized[0].color, quantized[1].color);
  assert.notEqual(quantized[1].color, quantized[2].color);
  assert.equal(quantized[1].offset, quantized[2].offset);
  assert.equal(colormapColor("White", 0.3), "#ffffff");
  assert.throws(() => colormapColor("Nope", 0.3), /Unknown colormap: Nope/);
});

test("legend channels cover every encoding a Legend accepts", () => {
  assert.deepEqual(LEGEND_CHANNELS, ["fill", "color", "shape", "outlineColor", "size", "width", "opacity"]);
});

// 6.11 follow-up (A1, A3, A6/B1, A10, B2, C1).

// A Facet with `cells` cell plots; each cell holds one mount of the same authored mark.
function facetMounts(name, cells = 2, label = "Points") {
  const facet = optionsRoot.splitUnique(name);
  const mounts = Array.from({ length: cells }, () => {
    const plot = facet.splitUnique("Plot");
    plot.definitionAlias = "*";
    const m = mark(plot);
    m.options.set("label", label);
    return m;
  });
  return { facet, mounts };
}

test("category toggles set shared state: toggle, isolate, and repeat-isolate restore", () => {
  const state = { hidden: {}, isolation: {} }, domain = ["a", "b", "c"];
  applyCategoryToggle(state, "fill", "b", false, domain);
  assert.deepEqual([...state.hidden.fill], ["b"]);
  applyCategoryToggle(state, "fill", "b", false, domain);
  assert.deepEqual([...state.hidden.fill], [], "a second click shows it again");
  applyCategoryToggle(state, "fill", "c", false, domain);
  applyCategoryToggle(state, "fill", "a", true, domain);
  assert.deepEqual([...state.hidden.fill].sort(), ["b", "c"], "isolate hides every other value");
  assert.equal(state.isolation.fill.value, "a");
  applyCategoryToggle(state, "fill", "a", true, domain);
  assert.deepEqual([...state.hidden.fill], ["c"], "repeating the isolation restores the hidden set");
  assert.equal(state.isolation.fill, undefined);
  applyCategoryToggle(state, "fill", "a", true, domain);
  applyCategoryToggle(state, "fill", "b", false, domain);
  assert.equal(state.isolation.fill, undefined, "a plain toggle ends the isolation");
  applyCategoryToggle(state, "shape", "x", false, []);
  assert.deepEqual([...state.hidden.shape], ["x"], "channels are independent");
});

test("a category toggle applies once through the registry and refreshes every mount", async () => {
  const { facet, mounts } = facetMounts("Category fan-out facet");
  const registry = createGuideRegistry();
  const refreshed = [0, 0];
  mounts.forEach((m, i) => {
    bind(m, { legend: { categories: { fill: { scale: categorical({ domain: ["Adelie", "Gentoo", "Chinstrap"] }) } },
      refresh: () => refreshed[i]++ } });
    registry.register(m);
  });
  const key = registry.keyOf(mounts[0]);
  assert.equal(registry.keyOf(mounts[1]), key, "cells share one definition");
  registry.toggleCategory(key, "fill", "Gentoo", false);
  assert.deepEqual(refreshed, [1, 1]);
  const state = registry.categoryState(key);
  assert.deepEqual([...state.hidden.fill], ["Gentoo"]);
  // Isolation reads the domain from a live mount.
  registry.toggleCategory(key, "fill", "Adelie", true);
  assert.deepEqual([...state.hidden.fill].sort(), ["Chinstrap", "Gentoo"]);
  // A mount created later (a cell scrolled into view) reads the same state object.
  const late = mark(facet.splitUnique("Plot"));
  late.options.defaults.definitionAlias = "*";
  late.options.set("label", "Points");
  registry.register(late);
  assert.equal(registry.categoryState(registry.keyOf(late)), state);
  registry.dispose();
  facet.dispose();
});

test("hidden series reach mounts registered later", () => {
  const { facet, mounts } = facetMounts("Late mount facet");
  const registry = createGuideRegistry();
  mounts.forEach((m) => registry.register(m));
  const [entry] = seriesEntries(registry.handle);
  entry.handle.setVisible(false);
  const plot = facet.splitUnique("Plot");
  plot.definitionAlias = "*";
  const late = mark(plot);
  late.options.set("label", "Points");
  registry.register(late);
  assert.equal(late.options.get("visible"), false, "a new mount starts hidden");
  seriesEntries(registry.handle)[0].handle.setVisible(true);
  assert.deepEqual([...mounts, late].map((m) => m.options.get("visible")), [true, true, true]);
  // A per-mount handle acts on the whole definition too (Legend for={mark} in a cell).
  late.guideHandle.setVisible(false);
  assert.deepEqual([...mounts, late].map((m) => m.options.get("visible")), [false, false, false]);
  registry.dispose();
  facet.dispose();
});

test("an ancestor relabel re-files the mark: one live entry, and its state moves along", () => {
  const plot = optionsRoot.splitUnique("Relabel test plot"), group = plot.splitUnique("Group");
  const registry = createGuideRegistry();
  const m = mark(group);
  m.options.set("label", "Points");
  bind(m, { legend: { categories: { fill: { scale: categorical({ domain: ["a", "b"] }) } } } });
  registry.register(m);
  const before = registry.keyOf(m);
  registry.toggleCategory(before, "fill", "a", false);
  group.setPresentation({ label: "Renamed group" });
  const entries = registry.handle.entries();
  assert.equal(entries.length, 1);
  assert.notEqual(registry.keyOf(m), before, "an authored rename is a new identity");
  assert.equal(entries[0].entry().label, "Points");
  assert.deepEqual([...registry.categoryState(registry.keyOf(m)).hidden.fill], ["a"], "hidden categories follow");
  assert.equal(registry.definitionMarks(registry.keyOf(m)).length, 1);
  registry.dispose();
  plot.dispose();
});

test("definition keys ignore Theme scopes and do not change with data or appearance updates", () => {
  const plot = optionsRoot.splitUnique("Key stability plot");
  const theme = plot.splitUnique("Theme");
  theme.setPresentation({ kind: "theme", label: "Theme", type: "Theme" });
  const m = mark(theme), registry = createGuideRegistry();
  registry.register(m);
  const key = definitionKey(m.options);
  assert.doesNotMatch(key, /Theme/);
  theme.setPresentation({ label: "Theme: dark" });
  assert.equal(definitionKey(m.options), key, "a preset switch keeps the key");
  m.options.set("fillColor", "#c0504d");
  m.options.set("label", "Renamed series");
  assert.equal(definitionKey(m.options), key, "option values are not identity");
  assert.equal(registry.handle.entries().length, 1);
  assert.equal(registry.keyOf(m), key);
  // Scopes flagged internal are skipped like Theme scopes.
  const wrapper = plot.splitUnique("Wrapper");
  wrapper.internalScope = true;
  const inner = mark(wrapper);
  assert.equal(definitionKey(inner.options).split("/").length, definitionKey(m.options).split("/").length);
  registry.dispose();
  plot.dispose();
});

test("guide groups: one per shared scale, titled by the scale label, else the mark label", () => {
  const plot = optionsRoot.splitUnique("Guide group test plot");
  const shared = continuous({ domain: [0, 100], label: "Shared value" });
  const make = (label, scale) => {
    const m = mark(plot);
    if (label) m.options.set("label", label);
    bind(m, { scales: { fill: scale } });
    return { handle: { kind: "mark", guideMark: () => m, entry: () => ({}) } };
  };
  const a = make("A", shared), b = make("B", shared), c = make("Mass points", continuous({})), d = make(undefined, continuous({}));
  const groups = guideGroups([a, b, c, d], "fill");
  assert.equal(groups.length, 3, "two marks share one scale; automatic scales keep their own");
  assert.deepEqual(groups.map((g) => g.label), ["Shared value", "Mass points", undefined]);
  assert.equal(groups[0].handle, a.handle);
  assert.deepEqual(guideGroups([a, b, c], "fill", "Value").map((g) => g.label), ["Shared value", "Mass points"],
    "several groups are told apart; the Legend label does not repeat");
  assert.deepEqual(guideGroups([c, d], "fill", "Value").map((g) => g.label), ["Mass points", "Value"]);
  assert.deepEqual(guideGroups([a, b], "fill", "Value").map((g) => g.label), ["Value"], "a lone group takes the Legend label");
  assert.deepEqual(guideGroups([a, b], "fill").map((g) => g.label), ["Shared value"]);
  assert.deepEqual(guideGroups([a], "size"), [], "marks that do not encode the channel are skipped");
  assert.equal(continuous({ label: "Shared value" }).snapshot().label, "Shared value");
  assert.equal("label" in continuous({}).snapshot(), false);
  assert.equal(ordinal({ domain: ["lo", "hi"], label: "Band" }).title, "Band");
  assert.equal(ordinal({ domain: ["lo", "hi"], label: "Band" }).snapshot().label, "Band");
  assert.equal(categorical({ domain: ["a"], label: "Kind" }).snapshot().label, "Kind");
  assert.equal(categorical({ domain: ["a"] }).label("a"), "a", "the value formatter keeps its name");
  plot.dispose();
});

// TODO 62.3: a Legend without a channel explains every encoding from data, in channel order,
// a column once per mark, and identical swatch sets once.
test("a bare legend explains each mapped channel once", () => {
  const plot = optionsRoot.splitUnique("Explained guides test plot");
  const swatches = (field, labels) => ({ field, entries: labels.map((label) => ({ value: label, label })), scale: {} });
  const make = (setup) => {
    const m = mark(plot);
    setup(m);
    return { handle: { kind: "mark", guideMark: () => m, entry: () => ({}) } };
  };
  // A Line colored by city; Points filled and shaped by city (one set of symbols, shown once
  // as the Line's) and sized by a numeric column; a mark with an unmapped (RGB) fill.
  const line = make((m) => bind(m, { legend: { categories: { color: swatches("city", ["Oslo", "Lima"]) }, channelTitles: { color: "city" } } }));
  const points = make((m) => bind(m, {
    legend: { categories: { fill: swatches("city", ["Oslo", "Lima"]), shape: swatches("city", ["Oslo", "Lima"]) },
      channelTitles: { fill: "city", shape: "city", size: "mass" } },
    scales: { size: continuous({}) },
  }));
  const plain = make((m) => { m.fields.set("fill", { isBufferNode: true }); });
  const explained = explainedGuides([line, points, plain]);
  assert.deepEqual(explained.map((g) => [g.channel, g.label]), [["fill", "city"], ["size", "mass"]],
    "fill before color in channel order; the Line's identical swatches and the shape by the same column are not repeated");
  assert.deepEqual(explainedGuides([line]).map((g) => [g.channel, g.label]), [["color", "city"]]);
  assert.deepEqual(explainedGuides([line], "Cities").map((g) => g.label), ["Cities"], "a lone guide takes the Legend's label");
  assert.deepEqual(explainedGuides([plain]), [], "nothing mapped from data, nothing explained");
  // TODO 134.9: a column an explicit Legend lists is not listed again, for another channel of its
  // mark or another mark with its own scale. TODO 136.17: the default (categorical) legend shows
  // colors only, and none that repeats the mark's axis column.
  const legendFor = (channel, target) => ({ channel, target: () => target.handle });
  assert.deepEqual(explainedGuides([points], undefined, { legends: [legendFor("fill", points)] }).map((g) => g.channel), ["size"]);
  assert.deepEqual(explainedGuides([line, points], undefined, { categorical: true, legends: [legendFor("color", line)] }), []);
  assert.deepEqual(explainedGuides([line, points], undefined, { categorical: true }).map((g) => g.channel), ["fill"]);
  const bars = make((m) => bind(m, { legend: { categories: { fill: swatches("kind", ["a", "b"]) },
    channelTitles: { fill: "kind" }, axisTitles: { x: "kind", y: "sold" } } }));
  assert.deepEqual(explainedGuides([bars], undefined, { categorical: true }), []);
  assert.deepEqual(explainedGuides([bars]).map((g) => g.channel), ["fill"], "legend=true still shows it");
  plot.dispose();
});

test("namedData category metadata for size, opacity and outlineColor", () => {
  const options = optionsRoot.splitUnique("Category metadata test plot");
  const scope = createDataScope();
  scope.update({ x: [0, 1, 2, 3], y: [0, 1, 2, 3], kind: ["a", "b", "c", "a"] });
  // The state keeps each categorical channel's last values (categoryValues); its owner releases them.
  const state = { hidden: {}, auto: {} };
  const out = prepareNamed({ x: "x", y: "y", size: "kind", opacity: "kind", outlineColor: "kind" }, scope, options,
    "Points", state);
  assert.deepEqual(Object.keys(out.metadata).sort(), ["opacity", "outlineColor", "size"]);
  for (const channel of ["size", "opacity", "outlineColor"]) {
    assert.equal(out.metadata[channel].field, "kind");
    assert.deepEqual(out.metadata[channel].entries.map((e) => e.value), ["a", "b", "c"]);
  }
  assert.deepEqual(out.metadata.size.entries.map((e) => e.size), [0, 1, 2].map((i) => numericCategoryValue(out.metadata.size.scale, i, "size")));
  assert.deepEqual(out.metadata.opacity.entries.map((e) => +e.opacity.toFixed(4)), [1, 0.65, 0.3]);
  assert.ok(out.metadata.outlineColor.entries.every((e) => /^#[0-9a-f]{6}$/i.test(e.outline ?? e.color)));
  out.dispose();
  for (const entry of state.categoryValues.values()) entry.values.dispose();
  scope.dispose();
  options.dispose();
});

test("plain size and width arrays with one value per row are per-row data (2 and 3 rows)", async () => {
  const options = optionsRoot.splitUnique("Short size array test plot");
  const prepare = (props) => prepareNamed(props, undefined, options, "Points", { hidden: {}, auto: {} });
  const two = prepare({ position: [[0, 0], [1, 1]], size: [4, 40] });
  assert.ok(!Array.isArray(two.props.size), "not a [width, height] literal");
  assert.deepEqual(Array.from(await two.props.size.ref.data()), [4, 40]);
  const three = prepare({ position: [[0, 0], [1, 1], [2, 2]], size: [4, 40, 4], width: [1, 2, 3] });
  assert.deepEqual(Array.from(await three.props.size.ref.data()), [4, 40, 4]);
  assert.deepEqual(Array.from(await three.props.width.ref.data()), [1, 2, 3]);
  // On a different row count a three-number array is still one [x, y, z] size.
  const literal = prepare({ position: [[0, 0], [1, 1]], size: [4, 40, 4] });
  assert.deepEqual(literal.props.size, [4, 40, 4]);
  for (const out of [two, three, literal]) out.dispose();
  options.dispose();
});

test("datetime and duration channels carry temporal metadata for legend ticks", () => {
  const options = optionsRoot.splitUnique("Temporal metadata test plot");
  const scope = createDataScope();
  const noon = Date.UTC(2024, 0, 1, 12);
  // The scope borrows the Python columns' arrays.
  const millis = np.array(new Float32Array([0, 86400000, 172800000])), waits = np.array(new Float32Array([5000, 6000, 7000]));
  scope.update({
    x: [0, 1, 2], y: [0, 1, 2],
    when: [0, 1, 2].map((i) => new Date(noon + i * 86400000)),
    // A Python datetime64 column arrives as milliseconds from its first value.
    python: { __hmplotColumn: true, values: millis,
      metadata: { type: "datetime", origin: noon, timezone: null } },
    // A Python duration column arrives as milliseconds, with no origin (TODO 69.0).
    wait: { __hmplotColumn: true, values: waits,
      metadata: { type: "duration", unit: "s", gpuUnit: "ms" } },
    mass: [1, 2, 3],
  });
  const out = prepareNamed({ x: "x", y: "y", fill: "when", size: "python", width: "wait", opacity: "mass" }, scope, options,
    "Points", { hidden: {}, auto: {} });
  // JS Dates count from their first time too (TODO 48.1).
  assert.deepEqual(out.temporal.fill, { type: "datetime", origin: noon, timezone: "UTC" });
  assert.deepEqual(out.temporal.size, { type: "datetime", origin: noon, timezone: "UTC" });
  assert.deepEqual(out.temporal.width, { type: "duration", origin: 0, timezone: "UTC" });
  assert.equal(out.temporal.opacity, undefined, "numeric columns are not temporal");
  out.dispose();
  scope.dispose(); millis.dispose(); waits.dispose();
  options.dispose();
});

test("temporal legend ticks add the column origin back and format as dates or durations", () => {
  const noon = Date.UTC(2024, 0, 1, 12), day = 86400000;
  const python = temporalFormat({ type: "datetime", origin: noon, timezone: "UTC" }, ".3~g", 360 * day);
  assert.deepEqual([0, 180 * day, 360 * day].map(python), ["Jan 01", "Jun 29", "Dec 26"], "a d3 number format is ignored");
  const raw = temporalFormat({ type: "datetime", origin: 0 }, "", 360 * day);
  assert.equal(raw(noon), "Jan 01", "a column of epoch milliseconds has origin 0");
  assert.equal(temporalFormat({ type: "datetime", origin: noon }, "%Y-%m-%d", day)(0), "2024-01-01");
  assert.equal(temporalFormat({ type: "datetime", origin: noon }, "", 3 * 365 * day)(0), "2024", "long spans show years");
  assert.equal(temporalFormat({ type: "datetime", origin: noon }, "", 6 * 3600000)(0), "12:00", "short spans show times");
  assert.equal(temporalFormat({ type: "datetime", origin: noon, timezone: "America/New_York" }, "%H:%M", day)(0), "07:00");
  assert.equal(temporalFormat({ type: "datetime", origin: noon }, "%J", 360 * day)(0), "Jan 01",
    "an unsupported directive falls back to the automatic format");
  assert.equal(temporalFormat({ type: "datetime", origin: noon }, "", -360 * day)(0), "Jan 01", "reversed spans");
  const wait = temporalFormat({ type: "duration", origin: 5000 }, "", 20000);
  assert.deepEqual([0, 5000].map(wait), ["5 s", "10 s"]);
  assert.equal(temporalFormat({ type: "duration", origin: 0 }, "", 3 * day)(1.5 * day), "1.5 d");
  assert.equal(temporalFormat({ type: "duration" }, "", 0)(250), "250 ms", "an empty span reads milliseconds");
});


// A mark object as markBinding reads it: its view's marks hold its published binding.
const markWith = (binding) => {
  const mark = { view: { marks: { of: (object) => (object === mark ? binding : undefined) } } };
  return mark;
};
const described = (kind, mark, channels, axes = { x: "x", y: "y" }) =>
  ({ kind, owner: {}, node: `${kind.toLowerCase()}-1`, channels, axes, mark: () => mark });

test("legend claims count per mark and channel, and release once", () => {
  const mark = {};
  const first = claimLegend(mark, "fill"), second = claimLegend(mark, "fill");
  first(); first();
  assert.equal(legendExplains(mark, "fill"), true, "the second claim holds");
  second();
  assert.equal(legendExplains(mark, "fill"), false);
  assert.equal(legendExplains(null, "fill"), false);
});

test("a color mapped from data lints until a legend explains it, its scale or its column", () => {
  const scale = { id: "s" };
  const points = markWith({ scales: { fill: scale }, legend: { channelTitles: { fill: "v" } } });
  const entries = [described("Points", points, { fill: "v" })];
  const [lint] = unexplainedColors(entries);
  assert.deepEqual({ ...lint, message: undefined }, { severity: "lint", code: "lint.color-unexplained",
    component: "Points", node: "points-1", property: "fill", message: undefined });
  assert.equal(lint.message, 'Points.fill: colors its marks by "v", but no legend says which color is which. ' +
    'Add a Legend with channel="fill" to the Plot, or set legend=True on the Plot.');
  const release = claimLegend(points, "fill");
  assert.deepEqual(unexplainedColors(entries), []);
  // A Line sharing the scale, or colored by the same column, shares the Points' legend.
  const line = markWith({ scales: { color: scale }, legend: { channelTitles: { color: "v" } } });
  const byColumn = markWith({ legend: { categories: { color: { scale: { id: "other" } } }, channelTitles: { color: "v" } } });
  assert.deepEqual(unexplainedColors([...entries, described("Line", line, { color: "v" }), described("Line", byColumn, { color: "v" })]), []);
  // A Facet's legend claims one cell's mount: the other cells' marks share its scale.
  const cell = markWith({ scales: { fill: scale }, legend: { channelTitles: { fill: "v" } } });
  assert.deepEqual(unexplainedColors([described("Points", cell, { fill: "v" })]), []);
  release();
  // A compound lints once, on its first unexplained part; a legend on any part explains it.
  const owner = {}, part = (mark) => ({ ...described("Lollipop", mark, { fill: "v" }), owner });
  const stem = markWith({ scales: { fill: { id: "stem" } } }), head = markWith({ scales: { fill: { id: "head" } } });
  assert.equal(unexplainedColors([part(stem), part(head)]).length, 1);
  const releaseHead = claimLegend(head, "fill");
  assert.deepEqual(unexplainedColors([part(stem), part(head)]), []);
  releaseHead();
  // A color repeating an axis column reads off that axis; a constant or RGB color maps nothing.
  const bars = markWith({ legend: { categories: { fill: { scale: {} } }, channelTitles: { fill: "c" } } });
  assert.deepEqual(unexplainedColors([described("Bar", bars, { fill: "c" }, { x: "c", y: "y" })]), []);
  assert.deepEqual(unexplainedColors([described("Points", markWith({ legend: {} }), {})]), []);
  assert.deepEqual(unexplainedColors([described("Points", undefined, {})]), []);
});

test("drawn-layout lints: hidden category labels, data outside its domain, points covering the plot", () => {
  const options = (values = {}, categoryAxes = {}, style = {}) =>
    ({ categoryAxes, get: (key) => values[key], child: () => ({ get: (key) => style[key] }) });
  const ticks = (shown) => ({ major: shown.map((showLabel, i) => ({ label: `c${i}`, showLabel })) });
  const crowded = { x: ticks([true, false, true, false]) };
  // hm.check's page only: on a live page the counts follow every resize.
  assert.deepEqual(hiddenCategoryLabels(crowded, options({}, { x: { domain: [] } })), []);
  assert.deepEqual(coveringMarkers([{ kind: "Points", owner: {}, mark: () => ({ maxPointSize: () => 400, fields: new Map() }) }],
    { width: 600, height: 300, mode: "2d" }), []);
  setLintExtents(true);
  const [lint] = hiddenCategoryLabels(crowded, options({}, { x: { domain: [] } }));
  assert.equal(lint.code, "lint.labels-hidden");
  assert.match(lint.message, /^Plot\.x: 2 of 4 category labels are hidden/);
  assert.deepEqual(hiddenCategoryLabels({ x: ticks([true, false]) }, options()), [], "a numeric axis thins ticks by design");
  assert.deepEqual(hiddenCategoryLabels({ x: ticks([true, true]) }, options({}, { x: {} })), []);
  assert.deepEqual(hiddenCategoryLabels(crowded, options({}, { x: {} }, { axisTickLabels: false })), [], "no tick labels drawn");
  assert.deepEqual(hiddenCategoryLabels(crowded, options({ coordinates: "polar" }, { x: {} })), []);
  // 2D clips: only a domain holding none of the data lints. 3D does not clip: 1% past the box does.
  const root = (domain, data) => ({ options: options(), explicitDomain: (a) => (a === "y" ? domain : undefined),
    dataDomain: (a) => (a === "y" ? data : null) });
  assert.deepEqual(marksOutsideAxes(root([0, 10], [5, 20]), "2d"), []);
  assert.match(marksOutsideAxes(root([0, 10], [20, 30]), "2d")[0].message, /^Plot\.y: the y domain 0 to 10 holds none of the data \(20 to 30\)/);
  assert.match(marksOutsideAxes(root([0, 10], [5, 20]), "3d")[0].message, /^Plot\.y: the data runs from 5 to 20, past the y domain 0 to 10/);
  assert.deepEqual(marksOutsideAxes(root([0, 10], [0, 10.05]), "3d"), []);
  // A point at least half the plot's shorter side covers it; data units and 3D are not linted.
  const points = (size) => ({ kind: "Points", owner: {}, node: "points-1", mark: () => ({ maxPointSize: () => size, fields: new Map() }) });
  assert.equal(coveringMarkers([points(150)], { width: 600, height: 300, mode: "2d" })[0].code, "lint.markers-cover");
  assert.deepEqual(coveringMarkers([points(149)], { width: 600, height: 300, mode: "2d" }), []);
  assert.deepEqual(coveringMarkers([points(Infinity)], { width: 600, height: 300, mode: "2d" }), []);
  assert.deepEqual(coveringMarkers([points(400)], { width: 600, height: 300, mode: "3d" }), []);
  setLintExtents(false);
});


test("automatic color swatches follow point glyphs while region swatches remain square", () => {
  const plot=optionsRoot.splitUnique("Point swatch plot"), m=mark(plot);
  const legend={categories:{fill:{field:"group",entries:[{value:"A",label:"A",visible:true,color:"#416788"}]}}};
  bind(m,{legend});
  m.exportKind="points";
  m.options.set("shape","circle");
  assert.equal(categoryEntries(m,"fill")[0].shape,"circle");
  m.options.set("shape","triangle");
  assert.equal(categoryEntries(m,"fill")[0].shape,"triangle");
  m.exportKind="prism";
  assert.equal(categoryEntries(m,"fill")[0].shape,"square");
  plot.dispose();
});
