import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { numpy as np } from "@hmplot/jax";
import { optionsRoot } from "../../src/lib/options/options.js";
import { prepareNamed, isRgbSpec, checkRgbRange } from "../../src/lib/plot/utils/namedData.js";
import {
  COLORMAP_NAMES, normalizeColormap, colormapKey, colormapInterpolator, sampleColormap, colormapColor, colormapPreview,
} from "../../src/lib/plot/utils/colormap.js";
import { COLOR_SCALE_NAMES, COLORMAP_ROWS, registerColormap, colormapAt, onColormapOverflow, setColormapClock } from "../../src/lib/threeExtensions/materials/colormaps.js";
import { continuous } from "../../src/lib/plot/utils/scaleResources.js";
import { ordinal, categorical, createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { validateTheme, themeOptionValues } from "../../src/lib/plot/utils/theme.js";
import { vertexBufferIssue, DEFAULT_MAX_VERTEX_BUFFERS } from "../../src/lib/plot/utils/vertexBuffers.js";
import { shapeOf as shapeOfValue } from "../../src/lib/plot/utils/data.js";

const options = optionsRoot.splitUnique("Color unit tests");
const prepare = (props, kind = "Points") =>
  prepareNamed({ position: [[0, 0], [1, 1]], ...props }, undefined, options, kind, { hidden: {}, auto: {} });
const values = async (array) => Array.from(await array.ref.data()).map((v) => +v.toFixed(4));
test("Text virtual-column reads retain the ordinary caller ownership path", () => {
  const scope = createDataScope(); scope.update({ x: [1, 2], y: [3, 4] });
  const get = scope.get.bind(scope), captured = [];
  scope.get = field => { const value = get(field); if (field === "@selected") captured.push(value); return value; };
  const result = prepareNamed({ x: "x", y: "y", text: "@selected" }, scope, options, "Text", { hidden: {}, auto: {} });
  result.dispose();
  assert.equal(captured.length, 1);
  assert.equal(captured[0].refCount, 1, "only the interaction resource retains its mask");
  scope.dispose(); assert.equal(captured[0].refCount, 0);
});
test("numeric host opacity columns retain reusable owned device rows for feedback and fades", async () => {
  const scope = createDataScope();
  scope.update({ x: [0, 1], y: [0, 1], alpha: [0, 0.5] });
  const state = { hidden: {}, auto: {} };
  const first = prepareNamed({ x: "x", y: "y", opacity: "alpha" }, scope, options, "Rect", state);
  const second = prepareNamed({ x: "x", y: "y", opacity: "alpha" }, scope, options, "Rect", state);
  const opacity = first.props.opacity;
  assert.deepEqual(opacity.shape, [2]);
  assert.equal(second.props.opacity, opacity, "unchanged host columns reuse the existing device copy");
  scope.dispose();
  assert.deepEqual(await values(opacity), [0, 0.5], "accepted preparations retain their opacity after the source retires");
  first.dispose(); second.dispose();
  assert.equal(opacity.refCount, 0);
});
test("filled marks share RGB outline channels instead of accepting unused outline settings", async () => {
  for (const kind of ["Rect", "Area", "Flow", "Polygon", "GeoJSON"]) {
    const result = prepareNamed({ x:[0,1], y:[1,1], lower:0, upper:1,
      outlineColor:[[1,0,0],[0,0,1]], outlineOpacity:[1,0.5] }, undefined, options, kind, { hidden:{}, auto:{} });
    assert.deepEqual(await values(result.props.categoryOutline),[1,0,0,0,0,1],kind);
    result.dispose();
  }
});
const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

test("float Nx3 rows are 0-1 sRGB and upload as linear per-instance colors", async () => {
  const out = prepare({ fill: [[1, 0, 0], [0.5, 0.25, 0]] });
  assert.equal(out.props.fill, "#92989f", "the fill field keeps a constant; colors are per instance");
  assert.deepEqual(await values(out.props.categoryColor), [1, 0, 0, linear(0.5), linear(0.25), 0].map((v) => +v.toFixed(4)));
  assert.deepEqual(out.metadata, {}, "RGB has no legend metadata");
  out.dispose();
});

test("integer data is 0-255: typed arrays, columns objects, and GPU arrays", async () => {
  const typed = prepare({ fill: { r: Uint8Array.from([255, 0]), g: Uint8Array.from([0, 255]), b: Uint8Array.from([0, 0]) } });
  assert.deepEqual(await values(typed.props.categoryColor), [1, 0, 0, 0, 1, 0]);
  const source = np.array([[255, 0, 0], [0, 0, 255]], { dtype: np.int32 });
  const gpu = prepare({ fill: source });
  assert.deepEqual(await values(gpu.props.categoryColor), [1, 0, 0, 0, 0, 1]);
  assert.equal(gpu.rgbChecks.length, 1, "GPU arrays are range-checked asynchronously");
  assert.equal(gpu.rgbChecks[0].integer, true);
  typed.dispose(); gpu.dispose(); source.dispose();
});

test("an alpha channel becomes per-row opacity on marks that support it", async () => {
  const out = prepare({ fill: [[1, 0, 0, 1], [1, 0, 0, 0.25]], opacity: 0.5 });
  assert.equal(out.props.opacity, 0.5, "the mark-wide factor stays separate");
  assert.deepEqual(await values(out.rowOpacity), [1, 0.25]);
  assert.throws(() => prepare({ fill: [[1, 0, 0, 1], [1, 0, 0, 0.5]] }, "Segments"),
    /Segments\.fill RGBA alpha is supported on Points, Points3D, and Text/);
  out.dispose();
});

test("RGB range and consistency errors name the channel", () => {
  assert.throws(() => prepare({ fill: [[1.5, 0, 0], [0, 0, 0]] }),
    /Points\.fill RGB values must be between 0 and 1 for float data; found 0 to 1\.5\. Use integer data/);
  assert.throws(() => prepare({ color: { r: Int32Array.from([300, 0]), g: Int32Array.from([0, 0]), b: Int32Array.from([0, 0]) } }),
    /Points\.color RGB values must be between 0 and 255 for integer data; found 0 to 300\./);
  assert.throws(() => prepare({ fill: { r: Uint8Array.from([255, 0]), g: [0, 1], b: [0, 0] } }),
    /mix integer \(0-255\) and float \(0-1\) data/);
  assert.throws(() => prepare({ outlineColor: [[1, 0, 0], [0, 0, 1]] }, "Line"), /Line\.outlineColor RGB outlines require a filled mark/);
  assert.throws(() => prepare({ fill: [[1, 0, 0], [0, 0, 1]] }, "Text3D"), /Text3D\.fill does not accept RGB rows/);
  assert.throws(() => checkRgbRange([-0.1, 0.5], false, "X.fill"), /found -0.1 to 0.5/);
});

test("RGB outlines use the per-point outline attribute", async () => {
  const out = prepare({ outlineColor: [[0, 0, 1], [0, 1, 0]] });
  assert.equal(out.props.outlineColor, undefined);
  assert.deepEqual(await values(out.props.categoryOutline), [0, 0, 1, 0, 1, 0]);
  out.dispose();
});

test("RGB specs are {r, g, b, a?} objects, not expressions or literals", () => {
  assert.equal(isRgbSpec({ r: "red", g: "green", b: "blue" }), true);
  assert.equal(isRgbSpec({ r: "red", g: "green", b: "blue", a: "alpha" }), true);
  assert.equal(isRgbSpec({ r: "red", g: "green" }), false);
  assert.equal(isRgbSpec({ r: "a", g: "b", b: "c", x: 1 }), false);
  assert.equal(isRgbSpec([1, 2, 3]), false);
});

test("colormap specs normalize and validate", () => {
  assert.equal(normalizeColormap("magma"), "Magma");
  assert.deepEqual(normalizeColormap(["red", "#00f"]), { colors: ["#ff0000", "#0000ff"], space: "lab", positions: null });
  // Evenly spaced positions are the default, so they normalize to null (one texture row, one key).
  assert.deepEqual(normalizeColormap({ colors: ["red", "blue"], space: "hsl", positions: [0, 1] }),
    { colors: ["#ff0000", "#0000ff"], space: "hsl", positions: null });
  assert.deepEqual(normalizeColormap({ colors: ["red", "lime", "blue"], positions: [0, 0.5, 1] }).positions, null);
  assert.deepEqual(normalizeColormap({ colors: ["red", "lime", "blue"], positions: [0, 0.6, 1] }).positions, [0, 0.6, 1]);
  assert.equal(colormapKey({ colors: ["red", "blue"], positions: [0, 1] }), colormapKey(["red", "blue"]));
  // Alpha would be dropped by the opaque texture, legend, and export: reject it.
  assert.throws(() => normalizeColormap(["rgba(255, 0, 0, 0.2)", "blue"]),
    { message: 'Colormap colors must be opaque: "rgba(255, 0, 0, 0.2)" has alpha 0.2. Use the mark\'s opacity for translucency.' });
  assert.throws(() => normalizeColormap(["red", "transparent"]),
    { message: 'Colormap colors must be opaque: "transparent" has alpha 0. Use the mark\'s opacity for translucency.' });
  assert.throws(() => normalizeColormap(["#ff000080", "blue"]), /"#ff000080" has alpha 0.502/);
  assert.deepEqual(normalizeColormap(["rgba(255, 0, 0, 1)", "#0000ffff"]).colors, ["#ff0000", "#0000ff"]);
  assert.deepEqual(normalizeColormap(normalizeColormap(["red", "blue"])), normalizeColormap(["red", "blue"]), "idempotent");
  assert.throws(() => normalizeColormap("Nope"), /Unknown colormap: Nope/);
  assert.throws(() => normalizeColormap(["red"]), /at least two colors/);
  assert.throws(() => normalizeColormap(["red", "notacolor"]), /Invalid colormap color: "notacolor"/);
  assert.throws(() => normalizeColormap({ colors: ["red", "blue"], space: "cmyk" }), /space must be "lab", "hsl", or "srgb"/);
  assert.throws(() => normalizeColormap({ colors: ["red", "blue"], positions: [0.5] }), /one number per color/);
  assert.throws(() => normalizeColormap({ colors: ["red", "blue"], positions: [1, 0] }), /ascending numbers between 0 and 1/);
  assert.throws(() => normalizeColormap({ colors: ["red", "blue"], stops: [] }), /Unknown colormap property: stops/);
  assert.equal(colormapKey(["red", "blue"]), colormapKey({ colors: ["#f00", "#00f"] }));
});

test("custom colormaps sample their colors and honor positions", () => {
  const redBlue = colormapInterpolator(["#ff0000", "#0000ff"]);
  assert.equal(colormapColor(["#ff0000", "#0000ff"], 0), "#ff0000");
  assert.notEqual(colormapColor(["#ff0000", "#0000ff"], 0.5), "#800080", "Lab, not sRGB, midpoint");
  assert.equal(colormapColor({ colors: ["#ff0000", "#0000ff"], space: "srgb" }, 0.5), "#800080");
  // Green placed at 0.9: t = 0.45 is halfway from red to green.
  assert.equal(colormapColor({ colors: ["#ff0000", "#00ff00", "#0000ff"], space: "srgb", positions: [0, 0.9, 1] }, 0.45), "#808000");
  const samples = sampleColormap(["#ff0000", "#0000ff"], 4);
  assert.deepEqual(Array.from(samples.slice(0, 4)), [1, 0, 0, 1]);
  assert.deepEqual(Array.from(samples.slice(12)), [0, 0, 1, 1]);
  assert.equal(typeof redBlue, "function");
});

test("the colormap texture registry reuses rows by key and reports its capacity", () => {
  assert.deepEqual(COLOR_SCALE_NAMES, [...COLORMAP_NAMES]);
  assert.equal(registerColormap("Magma"), COLORMAP_NAMES.indexOf("Magma"));
  const row = registerColormap(["#123456", "#abcdef"]);
  assert.ok(row >= COLORMAP_NAMES.length);
  assert.equal(registerColormap({ colors: ["#123456", "#ABCDEF"] }), row, "same spec, same row");
  assert.deepEqual(colormapAt(row), { colors: ["#123456", "#abcdef"], space: "lab", positions: null });
  assert.equal(colormapAt(0), "Viridis");
});

test("custom colormap rows are recycled least-recently-used; only maps drawn together overflow", () => {
  let now = 1e9;
  const previous = setColormapClock(() => now);
  try {
    const spec = (i) => ["#000000", `#${(0x100000 + i).toString(16)}`];
    // 300 maps, each used and then abandoned (an interactive colormap edit): no overflow.
    const seen = new Map();
    for (let i = 0; i < 300; i++) { now += 50; seen.set(i, registerColormap(spec(i))); }
    assert.ok([...seen.values()].every((row) => row >= COLOR_SCALE_NAMES.length && row < COLORMAP_ROWS));
    // The latest map keeps its row and its colors; a recycled map re-registers on its next use.
    now += 50;
    assert.equal(registerColormap(spec(299)), seen.get(299));
    assert.deepEqual(colormapAt(seen.get(299)), normalizeColormap(spec(299)));
    const again = registerColormap(spec(0));
    assert.deepEqual(colormapAt(again), normalizeColormap(spec(0)));
    assert.notEqual(again, seen.get(299), "a map used within the last second keeps its row");
    // Built-in rows are never recycled.
    assert.equal(registerColormap("Magma"), COLORMAP_NAMES.indexOf("Magma"));
    // More custom maps in use within one second than there are rows is the overflow error.
    now += 2000;
    const events = [];
    const stop = onColormapOverflow((key, message) => events.push([key, message]));
    let error;
    try { for (let i = 0; i < COLORMAP_ROWS; i++) registerColormap(spec(1000 + i)); }
    catch (e) { error = e; }
    assert.equal(error.code, "limit.colormaps");
    assert.equal(error.message, "Plot: custom colormaps on screen together needs 225 colormaps; the limit is 224 colormaps. Reuse colormaps across marks.");
    assert.equal(events.length, 1);
    assert.equal(events[0][0], colormapKey(spec(1000 + 224)), "the listener names the map that found no row");
    now += 2000;
    registerColormap(spec(1000 + 224));
    assert.deepEqual(events[1], [colormapKey(spec(1000 + 224)), ""], "the overflow clears once it registers");
    stop();
  } finally {
    setColormapClock(previous);
  }
});

test("scale resources accept specs and track explicit colormaps", () => {
  const scale = continuous({ domain: [0, 1], colormap: ["red", "blue"] });
  assert.deepEqual(scale.colormap, { colors: ["#ff0000", "#0000ff"], space: "lab", positions: null });
  assert.equal(scale.colormapExplicit, true);
  const automatic = continuous({ domain: [0, 1] });
  assert.equal(automatic.colormap, "Viridis");
  assert.equal(automatic.colormapExplicit, false);
  automatic.update({ colormap: "Magma" });
  assert.equal(automatic.colormapExplicit, true);
  automatic.update({ colormap: null });
  assert.equal(automatic.colormapExplicit, false);
  assert.throws(() => continuous({ colormap: "Nope" }), /Unknown colormap: Nope/);
  const ranks = ordinal({ domain: ["a", "b"], colormap: ["#000000", "#ffffff"] });
  assert.deepEqual(ranks.range.map((c) => c.replace(/\s/g, "")), ["rgb(0,0,0)", "rgb(255,255,255)"]);
});

test("themes accept a default colormap and apply it as the inherited cmapIndex", () => {
  assert.equal(validateTheme({ colormap: "Magma" }).colormap, "Magma");
  assert.throws(() => validateTheme({ colormap: "Nope" }), /theme\.colormap: Unknown colormap: Nope/);
  assert.deepEqual(themeOptionValues({ colormap: ["red", "blue"] }).root.cmapIndex, ["red", "blue"]);
});

test("axis text takes the theme's text color, lines its axes.color, and grids blend into the background", async () => {
  const { gridColors } = await import("../../src/lib/plot/utils/axisColors.js");
  const dark = themeOptionValues({ view: { background: "#111827" }, typography: { color: "#e5e7eb" }, axes: { color: "#94a3b8" } }).plot;
  assert.equal(dark.axisTextColor, "#e5e7eb");
  assert.equal(dark.axisLineColor, "#94a3b8");
  assert.equal(themeOptionValues({ typography: { color: "#111" }, axes: { color: "#999", textColor: "#555" } }).plot.axisTextColor, "#555");
  assert.equal(themeOptionValues({ axes: { color: "#999" } }).plot.axisTextColor, "#999", "no text color: the axes color");
  assert.equal(validateTheme({ axes: { textColor: "#555" } }).axes.textColor, "#555");
  // On white with the default text color, the grays the library always drew (#dce1e8, #eceef2).
  const light = gridColors("#ffffff", "#394458"), near = (a, b) => a.slice(1).match(/../g).every((h, i) => Math.abs(parseInt(h, 16) - parseInt(b.slice(1 + 2 * i, 3 + 2 * i), 16)) <= 6);
  assert.ok(near(light.major, "#dce1e8") && near(light.minor, "#eceef2"), JSON.stringify(light));
  // On a dark background the rules are dark, between the background and the text.
  const rules = gridColors("#111827", "#e5e7eb"), level = (c) => parseInt(c.slice(1, 3), 16);
  assert.ok(level(rules.minor) > 0x11 && level(rules.minor) < level(rules.major) && level(rules.major) < 0x80, JSON.stringify(rules));
  assert.deepEqual(gridColors("transparent", "rgb(57, 68, 88)"), light);
});

// TODO 134.29: a halo is the background made opaque, and none on a transparent one however spelled.
test("a halo's color is the plot background's, none at alpha 0", async () => {
  const { haloColor } = await import("../../src/lib/plot/utils/axisColors.js");
  assert.deepEqual(["#fff", "rgb(17, 24, 39)", "#11182780", "rgba(0, 0, 0, 0)", "rgba(0 0 0 / 0%)", "#ffffff00", "transparent", "", undefined].map(haloColor),
    ["#ffffff", "#111827", "#111827", null, null, null, null, null, null]);
});

test("a theme extends a preset or another theme: the base deep-merged with its own keys (TODO 36)", async () => {
  const { resolveTheme, createTheme } = await import("../../src/lib/plot/utils/theme.js");
  const { themes } = await import("../../src/lib/plot/utils/themePresets.js");
  const custom = validateTheme({ extends: "finance-terminal", name: "Desk", palette: ["#00ff88"], axes: { grid: "major" } });
  assert.equal(custom.name, "Desk");
  assert.deepEqual(custom.palette, ["#00ff88"], "arrays replace");
  assert.equal(custom.axes.grid, "major");
  assert.equal(custom.axes.color, themes.financeTerminal.axes.color, "objects merge");
  assert.equal(custom.extends, undefined, "extends is resolved away");
  for (const name of ["financeTerminal", "finance_terminal", "FINANCE TERMINAL"]) assert.equal(resolveTheme({ extends: name }).name, "Finance terminal", name);
  assert.equal(resolveTheme({ extends: { extends: "dark", palette: ["#123456"] }, name: "Two" }).view.background, themes.dark.view.background, "chains");
  const resource = createTheme({ extends: "sea" });
  assert.equal(validateTheme({ extends: resource }).name, "Sea", "a resource is a base");
  assert.throws(() => validateTheme({ extends: "nope" }), /theme\.extends: unknown preset "nope"; choose from/);
  const a = { name: "a" }, b = { extends: a, name: "b" };
  a.extends = b;
  assert.throws(() => validateTheme(b), /cycle of extends/);
  assert.throws(() => resource.update({ extends: "dark" }), /cannot change extends/);
  assert.equal(resource.replace({ extends: "dark", name: "Night" }).snapshot().view.background, themes.dark.view.background);
  assert.throws(() => validateTheme({ vectorTile: { lakes: {} } }), /theme\.vectorTile has no part "lakes"/);
  // A Svelte $state theme is a proxy, which structuredClone rejects.
  assert.deepEqual(validateTheme(new Proxy({ name: "p", palette: ["#fff"] }, {})), { name: "p", palette: ["#fff"] });
});

test("JavaScript and Python agree on colormap names and the theme schema", () => {
  const registry = JSON.parse(readFileSync(new URL("../../python/hmplot/registry.json", import.meta.url), "utf8"));
  assert.deepEqual(registry.colormaps, [...COLORMAP_NAMES]);
  const js = readFileSync(new URL("../../src/lib/plot/themes/theme.schema.json", import.meta.url), "utf8");
  const py = readFileSync(new URL("../../python/hmplot/themes/theme.schema.json", import.meta.url), "utf8");
  assert.equal(py, js, "copy src/lib/plot/themes/theme.schema.json to python/hmplot/themes/");
  // Partial themes (TODO 132.7): the same files on both sides (scripts/sync-themes.py).
  const partials = (side) => Object.fromEntries(readdirSync(new URL(`../../${side}/partials/`, import.meta.url)).sort()
    .map((file) => [file, readFileSync(new URL(`../../${side}/partials/${file}`, import.meta.url), "utf8")]));
  assert.deepEqual(partials("python/hmplot/themes"), partials("src/lib/plot/themes"), "run python scripts/sync-themes.py");
});

// 7C follow-ups (A1, A3, A5, A6, A12, B2).
import { decodeColumn } from "../../src/lib/scene/resources.js";
import { createDataView, snapshotDataScope } from "../../src/lib/plot/utils/dataView.js";
import { rememberHostSource, hostSourceInteger } from "../../src/lib/plot/utils/hostSources.js";
import { bindContinuousScales, needsContinuousScale, scaleOptions } from "../../src/lib/plot/utils/scaleBindings.js";
import { expression as expressionNode } from "../../src/lib/plot/utils/names.js";
import { prepareGeoStyles } from "../../src/lib/plot/utils/geoStyles.js";

test("host categorical values reuse owner encodings and invalidate for palettes, domains and replacement columns", async () => {
  const scope = createDataScope(), state = { hidden: {}, auto: {}, palette: ["#ff0000", "#0000ff"] };
  const groups = ["a", "b"];
  scope.update({ x: [0, 1], y: [0, 1], group: groups });
  const prepare = (scale) => {
    const snapshot = snapshotDataScope(scope);
    try {
      return prepareNamed({ x: "x", y: "y", fill: "group", ...(scale ? { fillScale: scale } : {}) },
        snapshot, options, "Points", state);
    } finally { snapshot.dispose(); }
  };
  try {
    const first = prepare(), identity = first.props.categoryColor;
    assert.deepEqual(await values(identity), [1, 0, 0, 0, 0, 1]);
    first.dispose();
    // The host categorical column is unchanged while numerical columns move.
    scope.update({ x: [2, 3], y: [0, 1], group: groups });
    const same = prepare();
    assert.equal(same.props.categoryColor, identity);
    same.dispose();
    state.palette = ["#00ff00", "#ff0000"];
    const palette = prepare();
    assert.notEqual(palette.props.categoryColor, identity);
    assert.deepEqual(await values(palette.props.categoryColor), [0, 1, 0, 1, 0, 0]);
    palette.dispose();
    const scale = categorical({ domain: ["a", "b"], range: ["#ff0000", "#0000ff"] });
    const explicit = prepare(scale), before = explicit.props.categoryColor;
    explicit.dispose();
    scale.setDomain(["b", "a"]);
    const reordered = prepare(scale);
    assert.notEqual(reordered.props.categoryColor, before);
    assert.deepEqual(await values(reordered.props.categoryColor), [0, 0, 1, 1, 0, 0]);
    reordered.dispose();
    scope.update({ x: [2, 3], y: [0, 1], group: ["b", "a"] });
    const replacement = prepare(scale);
    assert.deepEqual(await values(replacement.props.categoryColor), [1, 0, 0, 0, 0, 1]);
    replacement.dispose();
    state.hidden.fill = new Set(["a"]);
    const hidden = prepare(scale);
    const hiddenPositions = await values(hidden.props.position);
    assert.equal(hiddenPositions[0], 2);
    assert.ok(Number.isNaN(hiddenPositions[hidden.props.position.shape.at(-1)]));
    hidden.dispose();
    state.hidden.fill.clear();
    const restored = prepare(scale);
    const restoredPositions = await values(restored.props.position);
    assert.equal(restoredPositions[0], 2);
    assert.equal(restoredPositions[restored.props.position.shape.at(-1)], 3);
    assert.deepEqual(await values(restored.props.categoryColor), [1, 0, 0, 0, 0, 1]);
    restored.dispose();
  } finally {
    for (const entry of state.categoryValues?.values() ?? []) entry.values.dispose();
    scope.dispose();
  }
});

const int64 = (values) => new BigInt64Array(values.map(BigInt)).buffer;

test("numeric int64 columns keep their values and integer-ness; temporal columns keep the origin shift", () => {
  const numeric = {};
  const { typed } = decodeColumn({ dtype: "int64", shape: [3] }, int64([1000, 1005, 1009]), numeric);
  assert.deepEqual(Array.from(typed), [1000, 1005, 1009], "no shift by the first value");
  assert.ok(typed instanceof Float32Array);
  assert.equal(numeric.integer, true);
  assert.equal(numeric.origin, undefined);
  const wide = {};
  decodeColumn({ dtype: "int64", shape: [2] }, int64([0, 2 ** 40]), wide, "wide");
  assert.equal(wide.inexact, true, "values beyond 2^24 are flagged");
  const temporal = { type: "datetime" };
  const time = decodeColumn({ dtype: "int64", shape: [2], unit: "s" }, int64([1700000000, 1700000060]), temporal);
  assert.deepEqual(Array.from(time.typed), [0, 60000]);
  assert.equal(temporal.origin, 1700000000000);
  assert.equal(temporal.gpuUnit, "ms");
  assert.equal(temporal.integer, undefined);
  const array = np.array(typed);
  rememberHostSource(array, typed, [3], { integer: true });
  assert.equal(hostSourceInteger(array), true);
  const floats = np.array([1, 2]);
  assert.equal(hostSourceInteger(floats), false);
  array.dispose(); floats.dispose();
});

test("integer columns stay 0-255 through filtered views and GPU arrays uploaded from integers", async () => {
  const scope = createDataScope();
  scope.update({ x: [1, 2, 3], r: Uint8Array.from([255, 0, 128]), g: Uint8Array.from([0, 255, 0]), b: Uint8Array.from([0, 0, 255]) });
  assert.equal(scope.metadata("r").integer, true);
  const indices = np.array([0, 2], { dtype: np.int32 });
  const view = createDataView(scope, { indices });
  const out = prepareNamed({ position: [[0, 0], [1, 1]], fill: { r: "r", g: "g", b: "b" } }, view, options, "Points", { hidden: {}, auto: {} });
  assert.equal(out.rgbChecks[0].integer, true, "the GPU copy is float32; metadata keeps the integer rule");
  const colors = await values(out.props.categoryColor);
  assert.deepEqual([colors[0], colors[5]], [1, 1]);
  out.dispose(); view.dispose(); indices.dispose();
  // A Python uint8 N x 3 array arrives as a float32 GPU array uploaded from integer data.
  const python = np.array([[255, 0, 0], [0, 0, 255]]);
  rememberHostSource(python, Float32Array.from([255, 0, 0, 0, 0, 255]), [2, 3], { integer: true });
  const direct = prepare({ fill: python });
  assert.equal(direct.rgbChecks[0].integer, true);
  assert.deepEqual(await values(direct.props.categoryColor), [1, 0, 0, 0, 0, 1]);
  direct.dispose(); python.dispose();
  scope.dispose();
});

test("a continuous fillScale or a named N x 3 column beside RGB rows warns instead of failing", async () => {
  const warnings = [], warn = console.warn;
  console.warn = (message) => warnings.push(message);
  try {
    const scope = createDataScope();
    const source = np.array([[1, 0, 0], [0, 1, 0]]);
    scope.update({ x: [1, 2], rgb: source });
    const out = prepareNamed({ position: [[0, 0], [1, 1]], fill: "rgb", fillScale: continuous({ domain: [0, 1] }), levels: 4, quantize: true },
      scope, options, "Points", { hidden: {}, auto: {} });
    assert.deepEqual(out.rgb, { fill: true });
    assert.deepEqual(await values(out.props.categoryColor), [1, 0, 0, 0, 1, 0]);
    assert.match(warnings.at(-1), /Points\.fill is RGB, so fillScale, levels, quantize are ignored\./);
    const bound = await bindContinuousScales({ props: { fill: "rgb", fillScale: continuous({ domain: [0, 1] }) }, prepared: out, scope, kind: "Points", owners: {} });
    assert.deepEqual(bound.scaleBindings, [], "no continuous binding for an RGB channel");
    out.dispose(); scope.dispose(); source.dispose();
  } finally { console.warn = warn; }
});

test("a size scale without a range draws at the automatic range until it is given one (TODO 137.4)", async () => {
  // The automatic range is a fallback, not a local override: sizeScale.update({ range }) wins.
  const scope = createDataScope();
  scope.update({ v: [0, 10] });
  const owned = [];
  const prepared = { props: { size: np.array([0, 10]) }, valid: null, metadata: {}, rgb: null, own: (release) => owned.push(release) };
  const scale = continuous({ domain: [0, 10] });
  const bound = await bindContinuousScales({ props: { size: "v", sizeScale: scale }, prepared, scope, kind: "Points", owners: {} });
  assert.ok(Array.isArray(prepared.props.scaleRange), "drawn at the automatic range");
  const [{ localEncoding }] = bound.scaleBindings;
  assert.equal(localEncoding.scaleRange, undefined);
  scale.update({ range: [2, 30] });
  assert.deepEqual(scaleOptions(scale, "size", undefined, localEncoding).scaleRange, [2, 30]);
  prepared.props.size.dispose(); owned.forEach((release) => release()); scope.dispose();
});

test("a scale kept beside a constant color or a literal size is not applied (TODO 137.4)", async () => {
  // fill={random ? "random" : "#547ba2"} fillScale={...}: the color draws as is, and the scale
  // applies again once the column returns. It threw "requires a one-dimensional numeric field".
  const scope = createDataScope();
  scope.update({ x: [1, 2] });
  const prepared = { props: { fill: "#547ba2", size: 8 }, valid: null, metadata: {}, rgb: null, own: () => {} };
  const bound = await bindContinuousScales({
    props: { fill: "#547ba2", fillScale: continuous({ domain: [0, 1] }), size: 8, sizeScale: continuous({ domain: [0, 1] }) },
    prepared, scope, kind: "Points", owners: {} });
  assert.deepEqual(bound.scaleBindings, []);
  assert.equal(prepared.props.fill, "#547ba2");
  scope.dispose();
});

test("expressions and transform-only overrides normalize over their own values (eval pilot 2026-10-12)", async () => {
  // size=where(...) of a population with a size range, and a sqrt transform alone, kept the
  // default [0, 1] domain: every point drew huge and filled the plot.
  const population = expressionNode("where", [true, "p1", "p0"]);
  const scope = createDataScope();
  scope.update({ p0: [1e6, 5e7, 1.2e9] });
  const plain = { rgb: null, metadata: null };
  assert.equal(needsContinuousScale({ fill: population }, "fill", scope, plain), true, "a numeric color is always mapped");
  assert.equal(needsContinuousScale({ size: population }, "size", scope, plain), false, "an unscaled size stays pixels");
  assert.equal(needsContinuousScale({ size: population, scaleRange: [5, 24] }, "size", scope, plain), true);
  const bind = async (props, values) => {
    const owned = [];
    const prepared = { props: { size: np.array(values), fill: np.array(values) }, valid: null, metadata: {}, rgb: null,
      own: (release) => owned.push(release) };
    await bindContinuousScales({ props, prepared, scope, kind: "Points", owners: {} });
    const bounds = { size: prepared.props.scaleBounds, fill: prepared.props.valueBounds };
    prepared.props.size.dispose(); prepared.props.fill.dispose(); owned.forEach((release) => release());
    return bounds;
  };
  assert.deepEqual((await bind({ size: population, scaleRange: [5, 24], scaleTransform: "sqrt" }, [1e6, 5e7, 1.2e9])).size, [1e6, 1.2e9]);
  assert.deepEqual((await bind({ fill: population }, [10, 1000, 100000])).fill, [10, 100000]);
  assert.deepEqual((await bind({ size: "p0", scaleTransform: "sqrt" }, [1e6, 5e7, 1.2e9])).size, [1e6, 1.2e9]);
  // An explicit domain still wins: nothing is inferred over it. It is a scale of its own, which
  // a size legend reads (135.10, TODO 136.13).
  assert.deepEqual((await bind({ size: "p0", scaleTransform: "sqrt", scaleBounds: [0, 1] }, [1e6, 5e7, 1.2e9])).size, [0, 1]);
  scope.dispose();
});

test("RGBA alpha multiplies into opacity arrays and columns; outline alpha is rejected", async () => {
  const out = prepare({ fill: [[1, 0, 0, 0.5], [1, 0, 0, 0.5]], opacity: [0.2, 1] });
  assert.deepEqual(await values(out.props.opacity), [0.1, 0.5]);
  out.dispose();
  const scope = createDataScope();
  scope.update({ x: [1, 2], alpha: [0.5, 0.5], col: [0.2, 1] });
  const column = prepareNamed({ position: [[0, 0], [1, 1]], fill: { r: [1, 1], g: [0, 0], b: [0, 0], a: "alpha" }, opacity: "col" },
    scope, options, "Points", { hidden: {}, auto: {} });
  assert.deepEqual(await values(column.props.opacity), [0.1, 0.5]);
  assert.deepEqual(await values(column.opacitySource), [0.2, 1], "the opacity legend keeps the column's extent");
  column.dispose(); scope.dispose();
  assert.throws(() => prepare({ outlineColor: [[0, 0, 1, 0.1], [0, 1, 0, 0.1]] }), /Points\.outlineColor RGBA alpha is not supported on outlines/);
});

test("a missing RGB column is named with the available columns", () => {
  const scope = createDataScope();
  scope.update({ x: [1, 2], red: [1, 0], green: [0, 1], blue: [0, 0] });
  assert.throws(() => prepareNamed({ position: [[0, 0], [1, 1]], fill: { r: "nope", g: "green", b: "blue" } }, scope, options, "Points", { hidden: {}, auto: {} }),
    /Points\.fill\.r references missing field "nope" in Data [^.]+\. Available columns: x, red, green, blue\./);
  scope.dispose();
});

test("GeoJSON forwards GPU-array RGB range checks", () => {
  const scope = createDataScope();
  const source = np.array([[300, 0, 0], [0, 0, 0]], { dtype: np.int32 });
  scope.update({ x: [1, 2], rgb: source });
  const geo = prepareGeoStyles({ position: [[0, 0], [1, 1]], fill: "rgb" }, scope, options, { hidden: {}, auto: {} });
  assert.equal(geo.rgbChecks.length, 1);
  assert.deepEqual(geo.rgb, { fill: true });
  geo.dispose(); scope.dispose(); source.dispose();
});

test("per-row fields beyond the vertex buffer limit produce an error naming the mark", () => {
  assert.equal(DEFAULT_MAX_VERTEX_BUFFERS, 8);
  // A Label quad (position, uv) plus the instance matrix leaves room for five per-row fields.
  assert.equal(vertexBufferIssue("Text", 3, ["position", "categoryColor", "textCode", "textWidth", "interactionOpacity"]), "");
  assert.equal(vertexBufferIssue("Text", 3, []), "");
  assert.equal(
    vertexBufferIssue("Points", 4, ["position", "size", "categoryColor", "categoryOutline", "interactionOpacity"]),
    "Points: drawing 5 per-row channels (position, size, per-row colors, per-row outline colors, " +
      "per-row opacity (RGBA alpha, an opacity array or column, or selection feedback)) needs 9 vertex buffers; " +
      "the limit is 8 vertex buffers on this device. This mark has room for 4: give one of them a single value " +
      "instead of one per row.",
  );
  assert.match(vertexBufferIssue("Points", 4, ["position", "size", "symbolCode", "dx", "dy", "custom"], 8),
    /drawing 6 per-row channels \(position, size, shape, dx, dy, custom\) needs 10 vertex buffers.*room for 4: give 2 of them/);
  // A device with a higher limit fits more.
  assert.equal(vertexBufferIssue("Points", 4, ["position", "size", "symbolCode", "dx", "dy"], 16), "");
});

test("Image colors follow the RGB dtype rule and Heatmap rejects RGB grids", async () => {
  const raster = (props, kind) => prepareNamed(props, undefined, options, kind, { hidden: {}, auto: {} });
  const floats = raster({ data: [[[1, 0, 0], [0, 0.5, 0]], [[0, 0, 1], [1, 1, 0]]] }, "Image");
  assert.deepEqual(floats.props.data.shape, [2, 2, 3]);
  assert.deepEqual(await values(floats.props.data), [1, 0, 0, 0, 0.5, 0, 0, 0, 1, 1, 1, 0]);
  floats.dispose();
  const source = np.array([128, 0, 0, 255], { dtype: np.int32 }).reshape([1, 1, 4]);
  const bytes = raster({ data: source }, "Image");
  assert.deepEqual(await values(bytes.props.data), [0.502, 0, 0, 1]);
  assert.deepEqual(bytes.rgbChecks.map(({ integer, where }) => [integer, where]), [[true, "Image.data"]]);
  bytes.dispose(); source.dispose();
  assert.throws(() => raster({ data: [[[2, 0, 0], [0, 0, 0]]] }, "Image"),
    { message: "Image.data RGB values must be between 0 and 1 for float data; found 0 to 2. Use integer data (for example a Uint8Array) for 0-255 values." });
  assert.throws(() => raster({ fill: [[[1, 0, 0], [0, 1, 0]], [[0, 0, 1], [1, 1, 0]]] }, "Heatmap"),
    { message: "Heatmap.fill has shape [2, 2, 3], an RGB image: Heatmap colors one value per cell through a colormap. Use Image (data=...) for [height, width, 3 or 4] colors." });
  // A scalar grid stays a Heatmap value grid.
  const scalar = raster({ fill: [[0, 1], [2, 3]] }, "Heatmap");
  assert.deepEqual(shapeOfValue(scalar.props.fill), [2, 2]);
  scalar.dispose();
});

test("a plain Heatmap grid's cells sit at their indices and small grids draw sharp (TODO 134.15)", async () => {
  const { sharpCells } = await import("../../src/lib/threeExtensions/array/arraytexture.js");
  const grid = Array.from({ length: 3 }, () => [0, 1, 2, 3]), state = { hidden: {}, auto: {} };
  // Columns along x, rows along y, each cell centered on its index: the automatic domain the
  // Heatmap reports, unpadded so the cells fill the axes.
  const plain = prepareNamed({ fill: grid }, undefined, options, "Heatmap", state);
  const cells = (lo, hi) => Object.assign([lo, hi], { anchored: [true, true] });
  assert.deepEqual(plain.props._cellBounds, { x: cells(-0.5, 3.5), y: cells(-0.5, 2.5) });
  plain.dispose();
  assert.deepEqual([sharpCells(undefined, 64, 12), sharpCells(undefined, 65, 12), sharpCells(true, 512, 512), sharpCells(false, 4, 4)],
    [true, false, true, false]);
});

test("the settings pane previews named and custom colormaps", () => {
  assert.equal(colormapPreview("Magma").label, "Magma");
  assert.match(colormapPreview("Magma").gradient, /^linear-gradient\(to right, #000004,.*#fcfdbf\)$/);
  const custom = colormapPreview({ colors: ["#ff0000", "#0000ff"], space: "srgb" });
  assert.equal(custom.label, "Custom");
  assert.match(custom.gradient, /^linear-gradient\(to right, rgb\(255, 0, 0\),.*rgb\(0, 0, 255\)\)$/);
  assert.equal(colormapPreview(["red", "blue"]).label, "Custom");
  assert.equal(colormapPreview("White").gradient, `linear-gradient(to right, ${Array(12).fill("#ffffff").join(",")})`);
  assert.deepEqual(colormapPreview({ colors: ["red"] }), { label: "Custom", gradient: "" });
});
