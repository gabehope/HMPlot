import test from "node:test";
import assert from "node:assert/strict";
import { SceneResources } from "../../src/lib/scene/resources.js";
import { scaleOptions } from "../../src/lib/plot/utils/scaleBindings.js";
import { settingsProps, validateSceneProps } from "../../src/lib/scene/settings.js";
import { groupedAxis } from "../../src/lib/plot/utils/axisFrame.js";

function snapshot({ domain = [0, 100], colormap = "Viridis", missing = undefined } = {}) {
  return {
    columns: {}, tables: {}, themes: {}, selections: {}, identities: {},
    normalizations: {
      normalizer: { version: 1, domain, transform: "linear", domainSource: "data" },
    },
    scales: {
      color: { kind: "continuous", version: 1, normalization: { $normalization: "normalizer" },
        range: null, colormap, quantize: false, levels: 10, ...(missing === undefined ? {} : { missing }) },
      categories: { kind: "ordinal", version: 1,
        domain: ["low", "middle", "high"], range: null, colormap: "Viridis",
        unknown: "#92989f" },
    },
  };
}

test("scene settings become declared props after axis, scale and dash conversion", () => {
  const x = { domain: [1, 20], range: [-30, 30], transform: "log", label: "Time", tickCount: 5,
    invert: true, visible: false, side: "top", origin: 123, titleOffset: 12 };
  const values = Object.fromEntries(Object.entries(groupedAxis({ x }).values).map(([k, v]) => ["plot." + k, v]));
  for (const kind of ["Plot", "Frame"])
    assert.deepEqual(settingsProps(kind, { ...values, mounted: true }, { x: { range: [-30, 30], format: ".1f" } }),
      { x: { ...x, format: ".1f" } }, kind);
  assert.deepEqual(settingsProps("Facet", { ...values, gap: 12 }), { gap: 12 }, "a Facet's axes belong to its child Plot/Frame");
  // Settings are the viewer's edits (the user layer, TODO 136.7): an edited domain and range are
  // props even where the authored domain is automatic.
  assert.deepEqual(settingsProps("Plot", { xbounds: [1, 10], xrange: [-50, 50], axisFontFamily: "serif" },
    { autoBounds: true, x: { domain: "auto" } }), { x: { domain: [1, 10], range: [-50, 50] }, axisFontFamily: "serif" });
  // The marks' group default `legend` (true: each mark has an entry) is not the Plot's legend.
  // A scale resource owns its encoding: quantize and levels are not replayed beside it (134.7).
  assert.deepEqual(settingsProps("Rect", { quantize: false, levels: 10, opacity: 0.5 }, { fill: "v", fillScale: { $scale: "s" } }),
    { opacity: 0.5 });
  assert.deepEqual(settingsProps("Rect", { quantize: true, levels: 5 }, { fill: "v" }), { quantize: true, levels: 5 });
  // A template's uniform color edit is its main part's channel: an Ecdf's line color, a Bar's fill.
  assert.deepEqual(settingsProps("Ecdf", { fillColor: "#ff0000" }, {}), { color: { $literal: "#ff0000" } });
  assert.deepEqual(settingsProps("Bar", { fillColor: "#ff0000" }, {}), { fill: { $literal: "#ff0000" } });
  assert.deepEqual(settingsProps("Swarm", { fillColor: "#ff0000", size: 4 }, { size: "s" }), { fill: { $literal: "#ff0000" } },
    "a Swarm's edits are its Points', a size column kept");
  assert.deepEqual(settingsProps("Smooth", { fillColor: "#ff0000", opacity: 0.5, width: 3 }, {}), { color: { $literal: "#ff0000" }, width: 3 },
    "a Smooth's line edits are its color and width; its opacity styles the band");
  assert.deepEqual(settingsProps("RuleX", { fillColor: "#ff0000", dashed: true, dashSize: 6, gapSize: 2 }, {}), { color: { $literal: "#ff0000" }, dash: [6, 2] },
    "a RuleX's edits are its Segments'");
  assert.deepEqual(settingsProps("Callout", { fillColor: "#ff0000", size: 14 }, {}), { color: { $literal: "#ff0000" }, size: 14 },
    "a Callout's edits are its Text's: its color, not a fill");
  assert.deepEqual(settingsProps("DensityContour", { width: 3, opacity: 0.5 }, {}), { width: 3, opacity: 0.5 }, "a DensityContour's edits are its Segments'");
  assert.deepEqual(settingsProps("DensityBands", { outlineWidth: 2, width: 3 }, {}), { outlineWidth: 2 }, "a DensityBands' edits are its Polygon's, with no width");
  assert.deepEqual(settingsProps("Bar", { fillColor: "#ff0000" }, { color: "g" }), {}, "a Bar's color column is its series");
  assert.deepEqual(settingsProps("Ecdf", { width: 3 }, { width: { $expression: { op: "input", args: ["w"] } } }), {},
    "an Ecdf's width bound to an expression keeps it, as its Line's does");
  assert.deepEqual(settingsProps("Points", { quantize: true }, { color: "v", colorScale: { $scale: "s" } }), {},
    "quantize conflicts with either color scale");
  assert.deepEqual(settingsProps("Plot", { legend: true, "plot.legendEnabled": false, "plot.legendPosition": "bottom" }),
    { legend: false });
  assert.deepEqual(settingsProps("Plot", { legend: true, "plot.legendEnabled": true, "plot.legendPosition": "bottom" }, { legend: false }),
    { legend: true });
  // Switched off and on again where the Plot set no legend: its default legend, no prop (TODO 136.17).
  assert.deepEqual(settingsProps("Plot", { "plot.legendEnabled": true, "plot.legendPosition": "bottom" }), {});
  assert.deepEqual(settingsProps("Plot", { "plot.legendEnabled": true, "plot.legendPosition": "right" }),
    { legend: { position: "right" } });
  const camera = { "plot.cameraFov": 50, "plot.cameraNear": null, "plot.cameraFar": null };
  assert.deepEqual(settingsProps("Plot", { ...camera, type: "2d" }), { type: "2d" }, "a 2D Plot replays no camera");
  assert.deepEqual(settingsProps("Plot", { ...camera, type: "3d" }), { type: "3d", cameraFov: 50, cameraNear: null, cameraFar: null });
  const mapping = { x: "x", y: "y", z: "z" }, axes = { axisXType: "numeric", axisYType: "datetime", axisZType: "numeric" };
  for (const kind of ["Plot", "Frame"])
    for (const settings of [{ ...mapping, ...axes }, { ...axes, ...mapping }])
      assert.deepEqual(settingsProps(kind, settings, { x: { label: "Time" } }),
        { x: { label: "Time", type: "numeric" }, y: { type: "datetime" }, z: { type: "numeric" } },
        `${kind} ignores inherited Mapping channels regardless of settings order`);
  assert.deepEqual(settingsProps("Mapping", mapping), mapping, "Mapping still exports its own coordinates");
  const expressions = { x: { $expression: { op: "add", args: [1, 2] } }, y: { $column: "y" } };
  assert.deepEqual(settingsProps("Plot", expressions), {}, "Plot emits flat axes, never Mapping expression objects");
  assert.deepEqual(settingsProps("Mapping", expressions), expressions);
  const frame = { x: { domain: [0, 100], range: [20, 40], label: "Before" }, y: { visible: true } };
  const edited = settingsProps("Frame", { x: { domain: [0, 200], range: [20, 40], label: "After" }, y: { visible: false } }, frame);
  assert.deepEqual(edited, { x: { domain: [0, 200], range: [20, 40], label: "After" }, y: { visible: false } });
  assert.deepEqual(groupedAxis(edited).values,
    { xbounds: [0, 200], xrange: [20, 40], axisLabelX: "After", frameYShow: false },
    "grouped Frame settings replay through the public axis contract");
  // A domain or range edit has no prop since the flat scale keys went (TODO 137.4): it stays on screen.
  assert.deepEqual(settingsProps("Line", { valueBounds: [0, 9], cmapIndex: "Magma", scaleRange: [1, 8],
    dashed: true, dashSize: 7, gapSize: 3, requestKey: "private", pending: true }),
    { colormap: "Magma", dash: [7, 3] });
  assert.deepEqual(settingsProps("Line", { dashed: false, dashSize: 7 }), { dash: false });
  for (const kind of ["Template", "Slot", "Unknown"])
    assert.deepEqual(settingsProps(kind, { opacity: 0.5, pending: true }), {});
});

test("scene validation rejects internal names and props belonging to another component", () => {
  for (const [kind, props] of [["Points", { pending: true }], ["Points", { billboard: true }],
      ["Template", { opacity: 0.5 }], ["Slot", { name: "private" }]])
    assert.throws(() => validateSceneProps(kind, props), new RegExp(`${kind}: unknown property`));
  validateSceneProps("Points", { fill: { $literal: "red" }, fillScale: { $scale: "shared" } });
  assert.throws(() => validateSceneProps("Points", { fillDomain: [0, 1] }), /Points: unknown property 'fillDomain'/);
  validateSceneProps("Plot", { x: { domain: [0, 1] }, axisFontFamily: "serif" });
  validateSceneProps("LinkViews", { plots: [{ $ref: "plot" }], axes: "xy" });
  validateSceneProps("Template", {});
});

test("a scene color edit preserves mapped colors and makes a literal unambiguous", () => {
  const literalMark = { fields: new Map([["fill", { isBufferNode: false }]]) };
  assert.deepEqual(settingsProps("Points", { fillColor: "red" }, { fill: "blue" }, literalMark),
    { fill: { $literal: "red" } });
  assert.deepEqual(settingsProps("Points", { fillColor: "red" }, { fill: { $literal: "blue" } }),
    { fill: { $literal: "red" } });
  for (const [source, mark] of [
    ["red", { fields: new Map([["fill", { isBufferNode: true }]]) }],
    [{ $column: "ages" }, { fields: new Map([["fill", { isBufferNode: true }]]) }],
    [{ $expression: { op: "mean", args: [] } }, { fields: new Map([["fill", { isBufferNode: true, isChannelScalar: true }]]) }],
    ["species", { categoryColorActive: true, fields: new Map() }],
  ]) {
    assert.deepEqual(settingsProps("Points", { fillColor: "red", cmapIndex: "Magma" }, { fill: source }, mark),
      { colormap: "Magma" });
  }
});

test("settings preserve explicit scale resources and authored scalar appearance expressions", async () => {
  const { scaleProps } = await import("../../src/lib/plot/utils/scaleProps.js");
  for (const [kind, channel] of [["Points", "fill"], ["Line", "color"]]) {
    const key = `${channel}Scale`, props = { [key]: { $scale: "shared" } };
    const edited = settingsProps(kind, { cmapIndex: "Magma", valueBounds: [0, 9], opacity: 0.5 }, props);
    assert.deepEqual(edited, { opacity: 0.5 }, `${kind}.${key} stays authoritative`);
    assert.equal(scaleProps({ ...props, ...edited }, kind)[key], props[key]);
    assert.deepEqual(settingsProps(kind, { cmapIndex: "Magma" }), { colormap: "Magma" }, "an unbound colormap stays editable");
  }
  for (const [kind, name] of [["Points", "size"], ["Line", "width"], ["Points", "opacity"]]) {
    for (const source of [{ $expression: { op: "add", args: [1, 2] } }, "$input", { $column: "data" }])
      assert.deepEqual(settingsProps(kind, { [name]: 7 }, { [name]: source },
        { fields: new Map([[name, { isBufferNode: false }]]) }), {}, `${kind}.${name} keeps its source`);
    for (const source of [3, { $literal: 3 }, undefined])
      assert.deepEqual(settingsProps(kind, { [name]: 7 }, { [name]: source }), { [name]: 7 });
  }
});

test("Prism and Rect read a width column as geometry, not as a width scale (13.8 N5)", async () => {
  const { bindContinuousScales } = await import("../../src/lib/plot/utils/scaleBindings.js");
  const { createDataScope } = await import("../../src/lib/plot/utils/categorical.js");
  const scope = createDataScope();
  scope.update({ w: [1, 2, 3] });
  const run = (kind) => bindContinuousScales({
    props: { width: "w" }, prepared: { props: { width: [1, 2, 3] }, metadata: {}, dispose() {} },
    scope, frame: undefined, kind, owners: {},
  });
  // A stroke-width mark binds a width scale (and needs a frame to own it).
  await assert.rejects(run("Line"), /width needs an Axes frame or an explicit scale/);
  for (const kind of ["Prism", "Rect"]) {
    const prepared = await run(kind);
    assert.deepEqual(prepared.scaleBindings, [], kind);
    assert.equal(prepared.props.widthBounds, undefined, kind);
    assert.deepEqual(prepared.props.width, [1, 2, 3], kind);
  }
  scope.dispose();
});

test("scene scale descriptors retain resource identity across configuration updates", async () => {
  const resources = new SceneResources();
  const first = snapshot();
  resources.commit(await resources.prepare(first, () => { throw Error("unexpected column"); }));
  const scale = resources.resolve({ $scale: "color" });
  const normalizer = resources.resolve({ $normalization: "normalizer" });
  const ordinal = resources.resolve({ $scale: "categories" });
  assert.equal(scale.normalization, normalizer);
  assert.deepEqual(scale.domain, [0, 100]);
  assert.equal(ordinal.value(0), ordinal.range[0]);
  const second = snapshot({ domain: [0, 200], colormap: "Inferno" });
  second.scales.categories.domain = ["high", "middle", "low"];
  resources.commit(await resources.prepare(second, () => { throw Error("unexpected column"); }));
  assert.equal(resources.resolve({ $scale: "color" }), scale);
  assert.deepEqual(normalizer.domain, [0, 200]);
  assert.equal(scale.colormap, "Inferno");
  assert.deepEqual(ordinal.domain, ["high", "middle", "low"]);
  resources.dispose();
});

test("local encodings preserve a shared normalization domain", () => {
  const normalization = { transform: "linear" };
  const scale = {
    domain: [10, 20], normalization, colormap: "Viridis",
    quantize: false, levels: 10, range: [2, 12],
  };
  assert.deepEqual(scaleOptions(scale, "color", undefined, { cmapIndex: "Inferno", levels: 5 }), {
    valueBounds: [10, 20], valueTransform: "linear", cmapIndex: "Inferno",
    quantize: false, levels: 5, valueMissing: undefined, valueTransformConstant: 1, valueMidpoint: null,
  });
  // A scale's missing color (TODO 73.3) reaches its marks; without one they keep the theme's.
  assert.equal(scaleOptions({ ...scale, missing: "#ff00ff" }, "color").valueMissing, "#ff00ff");
  assert.deepEqual(scaleOptions(scale, "size", undefined, { scaleRange: [4, 18] }), {
    scaleBounds: [10, 20], scaleTransform: "linear", scaleRange: [4, 18],
    scaleTransformConstant: 1, scaleMidpoint: null,
  });
  assert.deepEqual(scale.domain, [10, 20]);
  assert.equal(scale.colormap, "Viridis");
});

test("a Python continuous scale without a colormap inherits the theme default; null returns to it", async () => {
  const resources = new SceneResources();
  const fail = () => { throw Error("unexpected column"); };
  resources.commit(await resources.prepare(snapshot({ colormap: null }), fail));
  const scale = resources.resolve({ $scale: "color" });
  assert.equal(scale.colormapExplicit, false, "no colormap is not an explicit Viridis");
  assert.equal(scale.colormap, "Viridis");
  resources.commit(await resources.prepare({ ...snapshot({ colormap: "Magma" }) }, fail));
  assert.equal(resources.resolve({ $scale: "color" }), scale);
  assert.equal(scale.colormapExplicit, true);
  assert.equal(scale.colormap, "Magma");
  resources.commit(await resources.prepare(snapshot({ colormap: null }), fail));
  assert.equal(scale.colormapExplicit, false, "update(colormap=None) returns to the inherited default");
  assert.equal(scale.colormap, "Viridis");
  resources.dispose();
});

test("a scale's missing color travels from Python, validates, and update(missing=None) clears it", async () => {
  const resources = new SceneResources();
  const fail = () => { throw Error("unexpected column"); };
  resources.commit(await resources.prepare(snapshot({ missing: "#ff00ff" }), fail));
  const scale = resources.resolve({ $scale: "color" });
  assert.equal(scale.missing, "#ff00ff");
  assert.equal(scale.snapshot().missing, "#ff00ff");
  resources.commit(await resources.prepare(snapshot({ missing: null }), fail));
  assert.equal(scale.missing, undefined, "missing: null returns to the theme's");
  resources.dispose();
  const { continuous } = await import("../../src/lib/plot/utils/scaleResources.js");
  assert.throws(() => continuous({ missing: 3 }), /missing must be a CSS color, such as missing: "#92989f"/);
  assert.throws(() => continuous({ range: [1, 4], missing: "red" }), /a scale with a numeric range \(sizes, widths\) has none/);
  assert.equal(continuous({ missing: "red" }).update({ range: [1, 2] }).missing, undefined);
});

test("custom colormap specs travel through scene scale descriptors", async () => {
  const resources = new SceneResources();
  const fail = () => { throw Error("unexpected column"); };
  const spec = { colors: ["#ff0000", "#0000ff"], space: "srgb", positions: [0, 0.25] };
  const first = snapshot({ colormap: spec });
  first.scales.categories.colormap = { colors: ["#000000", "#ffffff"], space: "lab", positions: null };
  resources.commit(await resources.prepare(first, fail));
  const scale = resources.resolve({ $scale: "color" }), categories = resources.resolve({ $scale: "categories" });
  assert.deepEqual(scale.colormap, spec);
  assert.equal(scale.colormapExplicit, true);
  assert.deepEqual(categories.range.map((c) => c.replace(/\s/g, "")), ["rgb(0,0,0)", "rgb(119,119,119)", "rgb(255,255,255)"]);
  const second = snapshot({ colormap: ["red", "blue"] });
  second.scales.categories.colormap = "Magma";
  resources.commit(await resources.prepare(second, fail));
  assert.equal(resources.resolve({ $scale: "color" }), scale);
  assert.deepEqual(scale.colormap, { colors: ["#ff0000", "#0000ff"], space: "lab", positions: null });
  assert.equal(categories.colormap, "Magma");
  resources.dispose();
});

// TODO 137.4: a channel's scale is one object; the flat per-channel keys are errors naming it.
test("removed flat scale props name their scale object; colormap stays a mark prop", async () => {
  const { scaleProps, settingProp, REMOVED_SCALE_PROPS } = await import("../../src/lib/plot/utils/scaleProps.js");
  const { continuous } = await import("../../src/lib/plot/utils/scaleResources.js");
  assert.deepEqual(scaleProps({ fill: "v", colormap: "RdBu" }, "Points"), { fill: "v", cmapIndex: "RdBu" });
  for (const key of REMOVED_SCALE_PROPS)
    assert.throws(() => scaleProps({ [key]: [0, 1] }, "Points"), new RegExp(`^Error: Points: ${key} was removed; .*Python: \\w+_scale=hm\\.continuous\\(`));
  assert.throws(() => scaleProps({ sizeRange: [2, 9] }, "Points"), /sizeScale=\{continuous\(\{ range: \[lo, hi\] \}\)\}/);
  assert.throws(() => scaleProps({ fillRange: ["#fff", "#f00"] }, "Points"), /fillScale=\{continuous\(\{ colormap: \[\.\.\.colors\] \}\)\} \(categorical\(\{ domain, range \}\) for categories\)/);
  assert.throws(() => scaleProps({ colormap: "RdBu", fillScale: continuous() }, "Points"),
    /Points: colormap and fillScale both set the fill colors/);
  assert.deepEqual(continuous({ domain: "symmetric" }).normalization.snapshot().symmetric, true);
  // The settings pane edits the options; a Python scene hears a colormap edit as the prop.
  assert.deepEqual(["valueBounds", "cmapIndex", "scaleRange", "opacity"].map((key) => settingProp("Points", key)), ["valueBounds", "colormap", "scaleRange", "opacity"]);
});
