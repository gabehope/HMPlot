import test from "node:test";
import assert from "node:assert/strict";
import { get } from "svelte/store";
import { OptionsNode, isSettingValue } from "../../src/lib/options/options.js";
import { ensureHeatmapOptions } from "../../src/lib/plot/objects/defaultOptions.js";
import {
  optionRows,
  groupedRows,
  rowState,
  treeStore,
  scopes,
  survivingTarget,
  validateNumber,
  registerPlot,
} from "../../src/lib/options/inspector.js";

function fixture() {
  const root = new OptionsNode();
  const plot = root.splitUnique("Plot");
  ensureHeatmapOptions(plot);
  const group = plot.splitUnique("Group");
  const a = group.splitUnique("A"),
    b = group.splitUnique("B");
  return { root, plot, group, a, b };
}
test("plugin parameter settings isolate schemas and preserve user edits until authored values change", async () => {
  const { pluginSettings } = await import("../../src/lib/plot/plugins/settings.js");
  const { settingsProps } = await import("../../src/lib/scene/settings.js");
  const root = new OptionsNode();
  const changes = [];
  const a = pluginSettings(root, "A", "demo.scale", (value) => changes.push(value));
  const b = pluginSettings(root, "B", "demo.layout", () => {});
  try {
    const schema = { factor: { type: "number", default: 2 } };
    a.configure("demo.scale", schema, false, { factor: 3 });
    b.configure("demo.layout", { gap: { type: "number", default: 4 } }, false, {});
    assert.deepEqual(optionRows(a.node)[0].spec.schema, schema);
    assert.deepEqual(Object.keys(optionRows(b.node)[0].spec.schema), ["gap"]);
    a.node.set("pluginParameters", { factor: 5 }, { layer: "user" });
    assert.deepEqual(a.configure("demo.scale", schema, false, { factor: 3 }), { factor: 5 });
    assert.deepEqual(settingsProps("Transform", { params: changes.at(-1) }), { params: { factor: 5 } });
    assert.deepEqual(a.configure("demo.scale", schema, false, { factor: 6 }), { factor: 6 });
    a.node.clear("pluginParameters", { layer: "user" });
    assert.deepEqual(b.node.get("pluginParameters"), {});
    a.configure("demo.other", {}, false, {});
    assert.deepEqual(optionRows(a.node), []);
  } finally { a.dispose(); b.dispose(); }
  assert.equal(root.dependents.size, 0);
  root.dispose();
});
test("first edits and resets preserve row order and do not emit structure changes", async () => {
  const { root, plot } = fixture();
  const before = optionRows(plot).map((r) => r.id);
  let changes = 0;
  const stop = treeStore(root).subscribe(() => changes++);
  plot.set("opacity", 0.2);
  plot.set("quantize", true);
  plot.clear("opacity");
  await Promise.resolve();
  assert.deepEqual(
    optionRows(plot).map((r) => r.id),
    before,
  );
  assert.equal(changes, 1);
  stop();
  root.dispose();
});
test("nested namespaces inherit independently of materialization order and preserve overrides", () => {
  for (const order of [
    ["a", "group", "plot"],
    ["plot", "group", "a"],
    ["group", "a", "plot"],
  ]) {
    const f = fixture();
    for (const key of order) f[key].get("grid-enabled");
    const observed = [];
    const stop = f.a.on((value) => observed.push(value), "grid-enabled");
    f.plot.set("grid-enabled", true);
    assert.equal(f.a.get("grid-enabled"), true);
    f.group.set("grid-enabled", false);
    assert.equal(f.a.get("grid-enabled"), false);
    f.a.set("grid-enabled", true);
    assert.equal(f.b.get("grid-enabled"), false);
    f.group.clear("grid-enabled");
    assert.equal(f.b.get("grid-enabled"), true);
    f.a.clear("grid-enabled");
    assert.equal(f.a.owner("grid-enabled"), f.plot.child("grid"));
    assert.ok(observed.includes(false) && observed.includes(true));
    stop();
    f.root.dispose();
  }
});
test("explicit display lists preserve nested visibility and order", () => {
  const { root, a } = fixture();
  a.setDisplayList(["opacity", "grid-cellColor", "levels", "quantize"]);
  const rows = optionRows(a);
  assert.deepEqual(
    rows.map((r) => r.path),
    ["opacity", "grid.cellColor", "levels", "quantize"],
  );
  const group = groupedRows(rows).find((g) => g.label === "Color mapping");
  assert.deepEqual(
    group.rows.map((r) => r.key),
    ["levels", "quantize"],
  );
  root.dispose();
});
test("disabled dependencies consider descendants inheriting the edited default", () => {
  const { root, plot, a, b } = fixture();
  const row = optionRows(plot).find((r) => r.key === "levels");
  assert.equal(get(rowState(row)).disabled, true);
  a.set("quantize", true);
  assert.equal(get(rowState(row)).disabled, false);
  a.set("levels", 20);
  assert.equal(get(rowState(row)).disabled, true);
  b.set("contour-enabled", true);
  assert.equal(get(rowState(row)).disabled, false);
  assert.ok(optionRows(plot).some((r) => r.path === "grid.cells"));
  root.dispose();
});
test("Levels accepts integers beyond the slider and rejects blanks, fractions and invalid bounds", () => {
  const { root, plot } = fixture();
  const spec = plot.getType("levels");
  assert.equal(spec.sliderMax, 100);
  for (const raw of ["1", "10", "256"])
    assert.equal(validateNumber(raw, spec).value, Number(raw));
  for (const raw of [
    "",
    " ",
    "0",
    "-1",
    "1.5",
    "NaN",
    "Infinity",
    "2147483648",
  ])
    assert.ok(validateNumber(raw, spec).error, raw);
  root.dispose();
});
test("a margin takes a number of pixels, or auto when left empty (TODO 136.10)", () => {
  const spec = { auto: true, min: 0, max: 300 };
  for (const raw of ["", " ", "auto", "AUTO"])
    assert.equal(validateNumber(raw, spec).value, "auto", raw);
  assert.equal(validateNumber("48", spec).value, 48);
  assert.ok(validateNumber("-1", spec).error);
  assert.ok(validateNumber("wide", spec).error);
});
test("removed targets return to the nearest surviving scope without changing sibling identities", () => {
  const { root, plot, group, a, b } = fixture();
  const before = scopes(plot);
  const id = b.uid;
  a.dispose();
  assert.equal(survivingTarget(a.uid, before, scopes(plot)), group.uid);
  assert.equal(b.uid, id);
  group.dispose();
  // Groups sit under the Plot row (TODO 60), so a removed group's target returns to it.
  assert.equal(survivingTarget(a.uid, before, scopes(plot)), `${plot.uid}:view`);
  root.dispose();
});
test("plot labels are distinct, update independently from identity, and retain numbered fallbacks", () => {
  const root = new OptionsNode();
  const a = registerPlot(root.splitUnique(), "Example"),
    b = registerPlot(root.splitUnique(), "Example"),
    c = registerPlot(root.splitUnique());
  assert.equal(a.label, "Example");
  assert.equal(b.label, "Example (2)");
  const id = c.node.uid,
    fallback = c.label;
  c.update("Renamed");
  c.update("");
  assert.equal(c.node.uid, id);
  assert.equal(c.label, fallback);
  for (const entry of [a, b, c]) entry.dispose();
  root.dispose();
});
test("uniform namespace changes request a new rendered frame", async () => {
  const { BasePlotObject } = await import("../../src/lib/plot/objects/base.js");
  const { createViewServices } = await import("../../src/lib/plot/utils/viewServices.ts");
  const { root, a } = fixture();
  let frames = 0;
  const view = createViewServices();
  view.attachRenderer({});
  const object = new BasePlotObject(a, view, () => frames++);
  object.option("grid-cellsWidth", true);
  a.set("grid-cellsWidth", 3);
  assert.ok(frames > 0);
  object.dispose();
  root.dispose();
});
test("shared view defaults expose rendering and navigation without sharing view mode", () => {
  const { root, plot } = fixture();
  root.ensure("plot-antialias", "msaa", { ui: "select", options: ["msaa", "smaa", "off"] });
  root.ensure("scene2d-clamp", true, { ui: "checkbox" });
  const view = new OptionsNode();
  view.define("type", "2d", { ui: "select", options: ["2d", "3d", "3d-y-up"] });
  plot.viewOptions = view;
  const rows = optionRows(root, "", { shared: true });
  assert.ok(rows.some((row) => row.path === "plot.antialias"));
  assert.ok(rows.some((row) => row.path === "scene2d.clamp"));
  assert.ok(!rows.some((row) => row.key === "type"));
  const clamp = rows.find((row) => row.path === "scene2d.clamp");
  assert.equal(get(rowState(clamp)).disabled, false);
  for (const type of ["3d", "3d-y-up"]) {
    view.set("type", type);
    assert.equal(get(rowState(clamp)).disabled, true);
  }
  view.dispose();
  root.dispose();
});

test("axis appearance remains editable independently of frame visibility", () => {
  const root = new OptionsNode();
  const plot = root.splitUnique("Plot");
  plot.viewOptions = new OptionsNode();
  plot.viewOptions.define("type", "2d", { ui: "select" });
  const style = plot.ensureChild("plot");
  style.define("axes2d", false, { ui: "checkbox" });
  style.define("axisFontSize", 11, { ui: "slider", min: 8, max: 32 });
  const row = optionRows(plot, "", { axis: true }).find(
    (r) => r.key === "axisFontSize",
  );
  let state;
  const stop = rowState(row).subscribe((value) => (state = value));
  assert.equal(state.disabled, false);
  style.set("axes2d", true);
  assert.equal(state.disabled, false);
  plot.viewOptions.set("type", "3d");
  assert.equal(state.disabled, false);
  plot.viewOptions.set("type", "2d");
  assert.equal(state.disabled, false);
  style.set("axisFontSize", 18);
  assert.equal(state.overridden, true);
  style.clear("axisFontSize");
  assert.equal(style.get("axisFontSize"), 11);
  stop();
  plot.viewOptions.dispose();
  root.dispose();
});

test("axis inspector presents one frame, dimension, and appearance hierarchy", () => {
  const root = new OptionsNode();
  // A Plot's options are its root frame's: its Axes scope shows the 2D and 3D axis switches.
  const registration = registerPlot(root, "Plot");
  for (const axis of "xyz") {
    root.define(axis + "Transform", "linear", { ui: "select" });
    root.define(axis + "bounds", [-1, 1], { ui: "bounds" });
    root.define(axis + "range", [-1, 1], { ui: "bounds" });
  }
  root.define("coordinates", "spherical", { ui: "select" });
  root.define("projection", "orthographic", { ui: "select" });
  const style = root.ensureChild("plot");
  for (const key of ["axes2d", "axes3d", "frameXShow", "frameYShow", "frameZShow", "axisFontSize"])
    style.define(key, key === "axisFontSize" ? 11 : true, { ui: key === "axisFontSize" ? "slider" : "checkbox" });
  const rows = optionRows(root, "", { axis: true });
  const labels = new Set(rows.map((row) => row.group));
  assert.ok(labels.has("Frame"));
  assert.ok(labels.has("Angle"));
  assert.ok(labels.has("Latitude"));
  assert.ok(labels.has("Radius"));
  assert.ok(labels.has("Appearance"));
  assert.equal(rows.filter((row) => row.path === "xbounds").length, 1);
  assert.ok(rows.some((row) => row.path === "plot.axes2d"));
  registration.dispose();
  root.dispose();
});

test("polar axis inspector names X angle, Y radius and Z height", () => {
  const root = new OptionsNode();
  for (const axis of "xyz") {
    root.define(axis + "Transform", "linear", { ui: "select" });
    root.define(axis + "bounds", [-1, 1], { ui: "bounds" });
  }
  root.define("coordinates", "polar", { ui: "select" });
  const rows = optionRows(root, "", { axis: true });
  const groups = new Set(rows.map((row) => row.group));
  for (const group of ["Angle", "Radius", "Height"]) assert.ok(groups.has(group));
  assert.ok(!groups.has("Latitude"));
  root.dispose();
});

test("option equality compares keys beyond vector and color components", () => {
  const root = new OptionsNode();
  root.define("anchor", { x: 1, y: 2, label: "a" }, { ui: "text" });
  const node = root.split("child");
  const events = [];
  node.on(() => events.push(node.get("anchor")), "anchor");
  node.set("anchor", { x: 1, y: 2, label: "a" });
  node.set("anchor", { x: 1, y: 2, label: "b" });
  node.set("anchor", { x: 1, y: 2, label: "b" });
  assert.deepEqual(events.map((value) => value.label), ["a", "b"]);
  root.define("tint", { r: 1, g: 0, b: 0 }, { ui: "text" });
  const tints = [];
  node.on(() => tints.push(node.get("tint")), "tint");
  node.set("tint", { r: 1, g: 0, b: 0 });
  node.set("tint", { r: 1, g: 0, b: 0 });
  assert.equal(tints.length, 1, "equal colors emit once, for the first override only");
});

test("option equality is symmetric and compares nested extras by value", async () => {
  const { Color } = await import("three/webgpu");
  const emits = (first, second) => {
    const root = new OptionsNode();
    root.define("value", { x: 9 }, { ui: "text" });
    const node = root.split("child");
    let count = 0;
    node.on(() => count++, "value");
    node.set("value", first);
    node.set("value", second);
    return count;
  };
  assert.equal(emits(new Color(1, 0, 0), { r: 1, g: 0, b: 0 }), 1, "Color then plain");
  assert.equal(emits({ r: 1, g: 0, b: 0 }, new Color(1, 0, 0)), 1, "plain then Color");
  assert.equal(emits({ x: 1, meta: { foo: 1 } }, { x: 1, meta: { foo: 1 } }), 1, "nested plain extra");
  assert.equal(emits({ x: 1, meta: { foo: 1 } }, { x: 1, meta: { foo: 2 } }), 2, "a changed nested extra emits");
  assert.equal(emits(new Color(1, 0, 0), { r: 1, g: 0, b: 0, label: "red" }), 2, "Color then plain with a label");
  assert.equal(emits({ r: 1, g: 0, b: 0, label: "red" }, new Color(1, 0, 0)), 2, "plain with a label then Color");
});

test("clearing an override restores the inherited value and type", () => {
  const root = new OptionsNode();
  root.define("count", 3, { ui: "number" }, (value) => Number(value));
  const node = root.split("child");
  node.set("count", "7");
  assert.equal(node.getTransformed("count"), 7);
  node.clear("count");
  assert.equal(node.get("count"), 3);
  node.set("count", "9");
  assert.equal(node.getTransformed("count"), 9, "the inherited transform still applies after clear");
  assert.throws(() => root.clear("count"), /Cannot clear root/);
});

// TODO 32.3: Arrows and Arrows share headLength's definition but not its default. A
// mark's kind default applies unless the mark or the plot above it sets the option.
test("a mark's kind default yields to a value set on the mark or on its plot", async () => {
  const { ScalarType } = await import("../../src/lib/plot/objects/types.js");
  const root = new OptionsNode();
  const plot = root.splitUnique("Plot");
  plot.ensure("headLength", new ScalarType({ defaultValue: 3, min: 0, max: 20 }));
  const arrows = plot.splitUnique("arrows", "mark", "Arrows3D");
  const billboard = plot.splitUnique("billboard", "mark", "Arrows");
  arrows.setKindDefault("headLength", 3);
  billboard.setKindDefault("headLength", 10);
  assert.equal(arrows.get("headLength"), 3);
  assert.equal(billboard.get("headLength"), 10, "each kind keeps its own default whatever mounted first");
  const seen = [];
  billboard.on((value) => seen.push(value), "headLength");
  plot.set("headLength", 3);
  assert.equal(billboard.get("headLength"), 3, "a plot value equal to the definition's default still applies");
  assert.deepEqual(seen, [3], "and dependents hear of it");
  assert.equal(billboard.params.headLength, 3);
  billboard.set("headLength", 12);
  assert.equal(billboard.get("headLength"), 12, "the mark's own value wins");
  billboard.clear("headLength");
  assert.equal(billboard.get("headLength"), 3);
  // Definitions live on the shared root, so every plot sees them; values do not cross plots.
  const other = root.splitUnique("Other plot").splitUnique("billboard", "mark", "Arrows");
  other.setKindDefault("headLength", 10);
  assert.equal(other.get("headLength"), 10, "a value set on one plot does not reach another plot's marks");
});

// TODO 136.7: user > authored > theme > derived on a node, each written and cleared on its own.
test("an option's layers resolve in order and only the user layer is the viewer's", () => {
  const root = new OptionsNode();
  root.define("type", "numeric", { ui: "text" });
  const node = root.split("axis");
  const seen = [];
  node.on((value) => seen.push(value), "type");
  node.set("type", "datetime", { layer: "derived" });
  node.set("type", "log", { layer: "theme" });
  node.set("type", "numeric");
  node.set("type", "datetime", { layer: "derived" });
  assert.equal(node.get("type"), "numeric", "a later derived value stays below the authored one");
  node.set("type", "linear", { layer: "user" });
  assert.equal(node.get("type"), "linear");
  assert.deepEqual([...node.userKeys], ["type"]);
  node.clear("type", { layer: "user" });
  node.clear("type", { layer: "authored" });
  assert.equal(node.get("type"), "log", "clearing a layer shows the next one down");
  assert.ok(node.isExplicit("type"));
  node.clear("type");
  assert.equal(node.get("type"), "numeric", "a full clear inherits the definition");
  assert.equal(node.userKeys.size, 0);
  assert.deepEqual(seen, ["datetime", "log", "numeric", "linear", "numeric", "log", "numeric"]);
  assert.throws(() => node.set("type", "x", { layer: "pane" }), /Unknown options layer pane/);
});

// TODO 136.12: a Theme's values are read when an option is, registered before or after.
test("the theme is a lazy layer: options registered after it read it, and edits stay above it", () => {
  const root = new OptionsNode();
  root.define("color", "black", { ui: "text" });
  const theme = root.split("Theme"), plot = theme.split("plot"), mark = plot.split("mark");
  const seen = [];
  mark.on((value) => seen.push(value), "color");
  theme.setThemeValues({ color: "teal", size: 12, gap: undefined });
  assert.equal(mark.get("color"), "teal");
  assert.ok(mark.isExplicit("color"), "a theme value overrides kind defaults below it");
  mark.setKindDefault("color", "red");
  assert.equal(mark.get("color"), "teal");
  // Registered after the theme applied (a component mounted late): its theme value, not the default.
  root.define("size", 10, { ui: "number" });
  assert.equal(mark.get("size"), 12);
  plot.set("color", "navy");
  assert.equal(mark.get("color"), "navy", "a value set below the theme wins");
  plot.clear("color");
  theme.setThemeValues({ size: 14 });
  assert.deepEqual([mark.get("color"), mark.get("size"), theme.inLayer("color", "theme")], ["red", 14, false]);
  assert.deepEqual(seen, ["teal", "teal", "navy", "teal", "red"], "a kind default notifies as it is set");
});

test("remembered options carry the viewer's edits, not authored or derived values", async () => {
  const { rememberOptions } = await import("../../src/lib/plot/utils/optionMemory.js");
  const root = new OptionsNode();
  for (const key of ["a", "b", "c"]) root.define(key, 0, { ui: "number" });
  const node = root.split("plot");
  node.set("a", 1);
  node.set("b", 2, { layer: "derived" });
  node.set("c", 3, { layer: "user" });
  const memory = rememberOptions(node);
  await Promise.resolve();
  assert.deepEqual(memory.snapshot.values, { c: 3 });
  const next = root.split("again");
  const restored = rememberOptions(next, memory.snapshot);
  await Promise.resolve();
  assert.deepEqual([next.get("a"), next.get("c")], [0, 3]);
  assert.deepEqual([...next.userKeys], ["c"], "restored as the viewer's edit");
  memory.dispose();
  restored.dispose();
});

test("a changed authored value replaces the viewer's edit; the same value again does not", () => {
  const root = new OptionsNode();
  root.define("mode", "2d", { ui: "text" });
  const node = root.split("view");
  node.set("mode", "2d");
  node.set("mode", "3d", { layer: "user" });
  node.set("mode", "2d");
  assert.equal(node.get("mode"), "3d", "an unchanged authored value leaves the edit");
  node.set("mode", "polar");
  assert.equal(node.get("mode"), "polar");
  assert.equal(node.userKeys.size, 0);
  node.store("mode").set("2d", { layer: "user" });
  node.clear("mode", { layer: "authored" });
  node.store("mode").set("2d", { layer: "user" });
  assert.deepEqual([...node.userKeys], ["mode"], "the viewer can pin the inherited value");
});


test("clearing absent option layers does not notify dependents", () => {
  const { root, plot, a } = fixture();
  const changes = [];
  const stop = a.on((_, key) => changes.push(key));
  plot.set("opacity", 0.4, { layer: "theme" });
  changes.length = 0;
  plot.clear("opacity", { layer: "authored" });
  assert.deepEqual(changes, []);
  assert.equal(a.get("opacity"), 0.4);
  plot.clear("opacity");
  assert.deepEqual(changes, ["opacity"]);
  plot.clear("opacity");
  assert.deepEqual(changes, ["opacity"]);
  stop();
  root.dispose();
});


test("settings exports accept nested plain values but exclude runtime objects and cycles", () => {
  const position = [1, 2, 3];
  assert.equal(isSettingValue([{ kind: "point", position, intensity: 2 }, { kind: "directional", position }]), true);
  assert.equal(isSettingValue({ x: { ticks: true, label: undefined }, y: null }), true);
  const cycle = {}; cycle.self = cycle;
  for (const value of [cycle, new Date(), new Float32Array(3), { callback() {} }, [undefined], NaN])
    assert.equal(isSettingValue(value), false);
});
