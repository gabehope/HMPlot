import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compile } from "svelte/compiler";
import { defineTemplate, node, option, param, refine, rest, slot, where, coalesce, isMissing, equal, notEqual, and, or, not, add } from "../../src/lib/templates/define.js";
import { templateEntries } from "../../scripts/charts.mjs";
import { TEMPLATES } from "../../src/lib/templates/builtins.js";
import { componentOptions } from "../../src/lib/scene/options.js";
import { evaluate, nodeProps, parameterValues, mainPath, definitionKinds, textSetting, mounted, pathOf } from "../../src/lib/templates/instantiate.js";
import ecdf from "../../src/lib/compound/ecdf.js";
import crosshair from "../../src/lib/compound/crosshair.js";
import errorBars from "../../src/lib/compound/errorBars.js";
import lollipop from "../../src/lib/compound/lollipop.js";
import arrows from "../../src/lib/compound/arrows.js";
import { dataExpression } from "../../src/lib/templates/define.js";
import { evaluateExpression } from "../../src/lib/plot/utils/expressions.js";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { numpy as np } from "@hmplot/jax";


test("computed(...) evaluates over parameters; strings in it are literals", () => {
  const params = { a: 1, b: null, s: "x" };
  assert.equal(evaluate(where(isMissing(param("b")), "none", param("b")), params, "T"), "none");
  assert.equal(evaluate(coalesce(param("b"), param("a")), params, "T"), 1);
  assert.equal(evaluate(equal(param("s"), "x"), params, "T"), true);
  assert.equal(evaluate(notEqual(param("s"), "x"), params, "T"), false);
  assert.equal(evaluate(and(true, param("a")), params, "T"), true);
  assert.equal(evaluate(or(false, param("b")), params, "T"), false);
  assert.equal(evaluate(not(param("b")), params, "T"), true);
  assert.equal(evaluate(add(param("s"), " y"), params, "T"), "x y");
  // Parameters inside plain objects and lists are substituted too.
  assert.deepEqual(evaluate({ domain: [0, param("a")] }, params, "T"), { domain: [0, 1] });
  // Data expressions and literals reach the parts as written.
  const expression = { $expression: { op: "greater", args: ["density", { $param: "a" }] } };
  assert.equal(evaluate(expression, params, "T"), expression);
  const literal = { value: "x", [Symbol("literal")]: true };
  assert.equal(evaluate(literal, params, "T"), literal);
  assert.throws(() => evaluate({ $computed: { op: "nope", args: [] } }, params, "T"), /T: computed\(\.\.\.\) has no operation "nope"/);
});

test("a node's props leave out what evaluates to null and spread rest() minus params and omit", () => {
  const definition = defineTemplate({
    kind: "T", params: { x: undefined, color: undefined },
    root: node("Points", { x: param("x"), fill: param("color"), ...rest({ omit: ["name"] }) }),
  });
  const props = { x: "a", name: "mine", opacity: 0.5, size: undefined };
  assert.deepEqual(nodeProps(definition, definition.root, props, parameterValues(definition, props)), { x: "a", opacity: 0.5, size: undefined });
});

test("parameters default to the definition's values", () => {
  assert.deepEqual(parameterValues(ecdf, { x: "v" }), { x: "v", by: undefined, complementary: false, normalize: "fraction", color: undefined });
});

test("Arrows keeps its pixel widths and forwards connections and head settings to Segments", () => {
  const connections = { endpoints: ["before", "after"] };
  const props = { connections, width: "stroke", headLength: 14, headWidth: 9, name: "Changes", cap: "bar" };
  assert.deepEqual([...definitionKinds(arrows)], ["Segments"]);
  assert.deepEqual(nodeProps(arrows, arrows.root, props, parameterValues(arrows, props)), {
    ...props, curve: "linear", cap: "arrow", _widthPixels: true,
  });
});

test("the main part is the node marked main, else the one holding rest()", () => {
  const leaf = (main) => node("Line", {}, [], main ? { main: true } : {});
  assert.equal(mainPath(defineTemplate({ kind: "T", params: {}, root: node("Filter", {}, [leaf(), node("Points", { ...rest() })]) })), "0.1");
  assert.equal(mainPath(defineTemplate({ kind: "T", params: {}, root: node("Filter", {}, [leaf(true), node("Points", { ...rest() })]) })), "0.0");
  assert.equal(mainPath(defineTemplate({ kind: "T", params: {}, root: node("Filter", {}, [leaf()]) })), undefined);
});

test("defineTemplate refuses undeclared params, two rest() and two mains", () => {
  assert.throws(() => defineTemplate({ kind: "T", params: {}, root: node("Points", { x: param("x") }) }), /T: param\("x"\) is not one of its params/);
  assert.throws(() => defineTemplate({ kind: "T", params: {}, root: node("Filter", { ...rest() }, [node("Points", { ...rest() })]) }), /only one node takes rest/);
  assert.throws(() => defineTemplate({ kind: "T", params: {}, root: node("Filter", {}, [node("Points", {}, [], { main: true }), node("Line", {}, [], { main: true })]) }), /only one node is main/);
});

test("a template of views has one slot, and its links name its Plots (TODO 136.16)", () => {
  const plot = (id) => node("Plot", {}, [], { id });
  assert.throws(() => defineTemplate({ kind: "T", params: {}, root: node("ViewGrid", {}, [slot(), slot()]) }), /only one node is the slot/);
  assert.throws(() => defineTemplate({ kind: "T", params: {}, links: [{ parts: ["a", "b"], axes: "x" }],
    root: node("ViewGrid", {}, [plot("a"), node("Points", {}, [], { id: "b" })]) }), /a link names at least two Plots/);
  assert.throws(() => defineTemplate({ kind: "T", params: {}, links: [{ parts: ["a", "b"], axes: "z" }],
    root: node("ViewGrid", {}, [plot("a"), plot("b")]) }), /axes "x", "y" or "xy"/);
  const kinds = definitionKinds(defineTemplate({ kind: "T", params: {}, links: [{ parts: ["a", "b"], axes: "xy" }],
    root: node("ViewGrid", {}, [plot("a"), node("Plot", {}, [slot()], { id: "b" })]) }));
  assert.deepEqual([...kinds].sort(), ["Plot", "ViewGrid"]);
});

test("Ecdf's definition: its params are its declared options, with their defaults", () => {
  const declared = Object.entries(ecdf.signature.options).filter(([, option]) => option.type && option.languages !== "python");
  assert.deepEqual(Object.keys(ecdf.params).sort(), [...declared.map(([name]) => name), "color"].sort());
  for (const [name, option] of declared) assert.equal(ecdf.params[name], option.default, name);
  assert.deepEqual([...definitionKinds(ecdf)].sort(), ["Line", "Transform"]);
  // Color defaults to by, and only with by.
  const line = (props) => nodeProps(ecdf, ecdf.root.children[0], props, parameterValues(ecdf, props));
  assert.equal(line({ x: "v" }).color, undefined);
  assert.equal(line({ x: "v", by: "g" }).color, "g");
  assert.equal(line({ x: "v", by: "g", color: "red" }).color, "red");
  assert.equal(line({ x: "v", name: "e" }).name, undefined);
});

test("a built-in template's signature is its options-table entry, checked (TODO 130.5)", () => {
  const signature = { summary: "A demo.", options: { x: option("column", "The x.", { required: true, ts: "string" }), color: refine({ default: "red" }) } };
  const demo = defineTemplate({ kind: "Demo", signature, params: { x: undefined }, root: node("Points", { x: param("x"), ...rest() }) });
  assert.deepEqual(demo.signature, { group: "Marks", summary: "A demo.", options: { x: { type: "column", doc: "The x." }, color: { default: "red" } },
    required: ["x"], types: { x: "string" } });
  assert.deepEqual(templateEntries([demo], { components: {} }).Demo, { mark: true, group: "Marks", summary: "A demo.", options: demo.signature.options });
  assert.throws(() => templateEntries([demo], { components: { Demo: {} } }), /Demo declares its signature, so src\/lib\/scene\/options\.json has no entry for it/);
  const failing = (change) => () => defineTemplate({ ...demo, signature: { ...signature, ...change } });
  assert.throws(failing({ summary: "" }), /Demo: a signature needs a summary/);
  assert.throws(failing({ theme: {} }), /Demo: a signature takes .*, not theme/);
  assert.throws(failing({ options: { y: "a" } }), /Demo: signature\.options\.y needs option\(type, doc\) or refine/);
  assert.throws(failing({ options: { color: refine({ defualt: "red" }) } }), /Demo: signature\.options\.color refines a shared option with default, .*; it has defualt/);
  assert.equal(defineTemplate(demo).signature, demo.signature);
  // A built-in template's signature lists every public parameter it takes.
  for (const template of TEMPLATES.filter(({ signature }) => signature)) {
    const options = new Set(componentOptions(template.kind).map((entry) => entry.name));
    assert.deepEqual(Object.keys(template.params).filter((name) => !name.startsWith("_") && !options.has(name)), [], template.kind);
  }
});

test("a template's other marks follow its main part's visibility, below their own visible", async () => {
  const { optionsRoot } = await import("../../src/lib/options/options.js");
  const { followVisibility } = await import("../../src/lib/templates/templateScope.svelte.js");
  const root = optionsRoot.splitUnique("Template follow tests");
  root.ensure("visible", true, "boolean");
  const [head, stem, pinned] = ["Head", "Stem", "Pinned"].map((name) => root.splitUnique(name));
  pinned.set("visible", true);
  const stop = followVisibility(head, [stem, pinned]);
  head.set("visible", false, { layer: "user" });
  assert.equal(stem.get("visible"), false);
  assert.equal(stem.inLayer("visible", "user"), false, "a follower's value is derived, not a viewer's edit");
  assert.equal(pinned.get("visible"), true, "a follower's own visible wins");
  head.clear("visible", { layer: "user" });
  assert.equal(stem.get("visible"), true);
  head.set("visible", false);
  stop();
  assert.equal(stem.get("visible"), true, "teardown clears what it derived");
  root.dispose();
});

test("a main part leads every other part; else each legend entry's swatch leads its parts", async () => {
  const { followings } = await import("../../src/lib/templates/templateScope.svelte.js");
  assert.deepEqual(followings({ main: "a" }, ["a", "b", "c"]), [["a", new Set(["b", "c"])]]);
  assert.deepEqual(followings({ legendEntries: [{ swatch: "b", parts: ["a", "b"] }] }, ["a", "b", "c"]), [["b", new Set(["a"])]]);
  assert.deepEqual(followings(undefined, ["a"]), []);
});

test("settings read text as a count or edges, a node with when mounts on a value, and ids name paths", () => {
  assert.deepEqual([textSetting(" 12 "), textSetting("0, 1.5,3"), textSetting("sturges"), textSetting(7)], [12, [0, 1.5, 3], "sturges", 7]);
  assert.deepEqual([textSetting("sturges", 30), textSetting("1,", 3), textSetting("", 3), textSetting("0, 1, 2", 3)], ["sturges", 3, 3, [0, 1, 2]]);
  const definition = defineTemplate({
    kind: "T", params: { brush: undefined, bins: 30 }, settings: { bins: { option: "tBins", text: true } },
    root: node("DataBoundary", {}, [node("Points", {}, [], { when: param("brush") }), node("Rect", rest(), [], { id: "bars" })]),
  });
  const optional = definition.root.children[0];
  assert.deepEqual([undefined, false, null, true, { axis: "x" }].map((brush) => mounted(optional, { brush }, "T", {})), [false, false, false, true, true]);
  assert.equal(pathOf(definition, "bars"), "0.1");
  assert.throws(() => defineTemplate({ ...definition, settings: { other: { option: "x", text: true } } }), /settings.other needs one of its params/);
  const above = node("DataBoundary", {}, [node("Group", {}, [node("Rect", rest())], { when: param("brush") })]);
  for (const root of [node("Rect", rest(), [], { when: param("brush") }), above, node("DataBoundary", {}, [node("Rect", rest())], { when: param("brush") })])
    assert.throws(() => defineTemplate({ ...definition, root }), /always mounted/);
  assert.throws(() => defineTemplate({ ...definition, theme: { kind: "T", routed: true, defaults: { fill: "red" } } }), /routed theme's defaults/);
  assert.throws(() => defineTemplate({ ...definition, mainSettings: { omit: "opacity" } }), /mainSettings.omit is a list/);
});

test("Crosshair's readouts sit at the edges or beside the pointer (readoutPosition)", () => {
  const readouts = crosshair.root.children[1].children;
  const shown = (props) => readouts.filter((item) => mounted(item, parameterValues(crosshair, props), "Crosshair", props))
    .map((item) => nodeProps(crosshair, item, props, parameterValues(crosshair, props)).text);
  assert.deepEqual(shown({}), ["@pointer_x", "@pointer_y"]);
  assert.deepEqual(shown({ axes: "y" }), ["@pointer_y"]);
  assert.deepEqual(shown({ readoutPosition: "pointer" }), ["@pointer"]);
  assert.deepEqual(shown({ readoutPosition: "pointer", axes: "x" }), ["@pointer_x"]);
  assert.deepEqual(shown({ readout: false }), []);
});

test("ErrorBars' ends: the bounds at the row's position, a reversed or missing interval's missing", () => {
  assert.deepEqual(evaluate(dataExpression("less_equal", param("a"), "hi"), { a: "lo" }, "T"), { __hmplotExpression: true, op: "less_equal", args: ["lo", "hi"] });
  const scope = createDataScope();
  const positions = np.array([[1, 5], [2, 6], [3, 7]]);
  scope.update({ g: [1, 2, 3], lo: [1, 3, 0], hi: [2, 2, NaN], at: positions });
  const segments = errorBars.root.children[0];
  const ends = (props) => {
    const values = nodeProps(errorBars, segments, props, parameterValues(errorBars, props));
    const read = (end) => end.map ? end.map((item) => typeof item === "string" ? item : read1(item)) : read1(end);
    const read1 = (item) => { const result = evaluateExpression(item, scope), out = result.value.ref.js(); result.dispose(); return out; };
    return { start: read(values.start), end: read(values.end), cap: values.cap };
  };
  assert.deepEqual(ends({ x: "g", y: "g", lower: "lo", upper: "hi" }), { start: ["g", [1, NaN, NaN]], end: ["g", [2, NaN, NaN]], cap: "bar" });
  assert.deepEqual(ends({ x: "g", y: "g", lower: "lo", upper: "hi", orientation: "horizontal" }).start, [[1, NaN, NaN], "g"]);
  assert.deepEqual(ends({ x: "g", y: "g", z: "g", lower: "lo", upper: "hi" }).start, ["g", [1, NaN, NaN], "g"]);
  // A column of positions keeps the other component: with_component (internal, expressions.js).
  assert.deepEqual(ends({ position: "at", lower: "lo", upper: "hi", orientation: "horizontal" }).end, [[2, 5], [NaN, 6], [NaN, 7]]);
  scope.dispose();
  positions.dispose();
});

test("a named part takes the caller's object as its props: Lollipop's stem, in 3D", () => {
  const stem = lollipop.root.children[0].children[0];
  const props = { x: "g", y: "v", z: "d", name: "pops", stem: { color: "gray", width: 3, dash: [2, 2] } };
  assert.deepEqual(nodeProps(lollipop, stem, props, parameterValues(lollipop, props)),
    { name: "pops stems", start: ["__barBaseX", "__barBaseY", "d"], end: ["__barTipX", "__barTipY", "d"], color: "gray", width: 3, dash: [2, 2] });
  assert.throws(() => nodeProps(lollipop, stem, { stem: "gray" }, parameterValues(lollipop, { stem: "gray" })),
    /Lollipop\.stem is an object of the stem's props/);
  assert.throws(() => defineTemplate({ kind: "T", params: { a: 1 }, parts: ["a"], root: node("Line") }), /needs to be both one of its params and a node's id/);
});

test("a normalization template expands to Calculate, preserving groups, missing values and output names", async () => {
  const { default: definition } = await import("../../src/lib/stats/normalize.js");
  const { runTransform } = await import("../../src/lib/plot/utils/transforms.js");
  const scope = createDataScope();
  scope.update({ x: [1, 3, NaN, 4, 4, 0, 0], group: ["a", "a", "a", "b", "b", "c", "c"] });
  assert.equal(mainPath(definition), undefined);
  assert.deepEqual([...definitionKinds(definition)], ["Calculate"]);
  for (const method of ["deviation", "extent", "sum", "first", "max"]) {
    for (const by of [undefined, "group"]) {
      const props = { field: "x", method, by, as: "result" };
      const { normalize } = await import("../fixtures/stats/normalize.js");
      const { runDefinition } = await import("../../src/lib/plot/utils/transforms/runner.js");
      const old = await runDefinition("Normalize", normalize, scope, props, { maxBytes: Infinity, runTransform });
      const config = nodeProps(definition, definition.root, props, parameterValues(definition, props));
      const next = await runTransform("Calculate", scope, config);
      try {
        const expected = Array.from(await old.get("result").ref.data());
        const actual = Array.from(await next.get("result").ref.data());
        assert.equal(actual.length, expected.length);
        for (let i = 0; i < actual.length; i++)
          assert.ok(Number.isNaN(expected[i]) ? Number.isNaN(actual[i]) : Math.abs(actual[i] - expected[i]) < 1e-6,
            `${method}/${by} row ${i}: ${actual[i]} != ${expected[i]}`);
      } finally { old.dispose(); next.dispose(); }
    }
  }
  scope.dispose();
});

test("a window template preserves grouped row order, clipped ends and renamed columns", async () => {
  const { default: definition } = await import("../../src/lib/stats/window.js");
  const { runTransform } = await import("../../src/lib/plot/utils/transforms.js");
  const scope = createDataScope();
  scope.update({ x: [1, 3, NaN, 4, 8, 0, 2], group: ["a", "b", "a", "a", "b", "a", "b"] });
  for (const align of ["trailing", "leading", "center"]) {
    const props = { field: "x", size: 3, align, by: "group", as: "result" };
    const { windowTransform } = await import("../fixtures/stats/window.js");
    const { runDefinition } = await import("../../src/lib/plot/utils/transforms/runner.js");
    const old = await runDefinition("Window", windowTransform, scope, props, { maxBytes: Infinity, runTransform });
    const config = nodeProps(definition, definition.root, props, parameterValues(definition, props));
    const next = await runTransform("Calculate", scope, config);
    try {
      const expected = Array.from(await old.get("result").ref.data());
      const actual = Array.from(await next.get("result").ref.data());
      assert.deepEqual(actual, expected);
    } finally { old.dispose(); next.dispose(); }
  }
  scope.dispose();
});


const authoringGuide = readFileSync(new URL("../../docs/PORTABLE-TEMPLATES.md", import.meta.url), "utf8");
async function documentedDefinition(index) {
  const code = [...authoringGuide.matchAll(/```js\n([\s\S]*?)```/g)][index][1];
  const module = code.replace('"./define.js"', JSON.stringify(new URL("../../src/lib/templates/define.js", import.meta.url).href));
  return (await import(`data:text/javascript;base64,${Buffer.from(module).toString("base64")}`)).default;
}

test("the authoring guide's JavaScript mark routes parameters, part overrides and rest separately", async () => {
  const definition = await documentedDefinition(0);
  const [band, head, children] = definition.root.children;
  assert.equal(mainPath(definition), "0.1");
  assert.equal(children.kind, "Slot");
  const props = { x: "day", y: "value", lower: "low", upper: "high", size: 7, band: { opacity: 0.1 } };
  const params = parameterValues(definition, props);
  assert.equal(nodeProps(definition, band, props, params).opacity, 0.1);
  assert.deepEqual(nodeProps(definition, head, props, params), { x: "day", y: "value", fill: "#547ba2", size: 7 });
  assert.equal(nodeProps(definition, band, {}, parameterValues(definition, {})).opacity, 0.2);
  assert.deepEqual([...definitionKinds(definition)], ["Mapping", "Area", "Points"]);
  for (const [, source] of authoringGuide.matchAll(/```svelte\n([\s\S]*?)```/g))
    assert.deepEqual(compile(source, { filename: "TemplateAuthoring.svelte", generate: false }).warnings, []);
});

test("the authoring guide's JavaScript non-mark pattern computes centered rows before its Plot slot", async () => {
  const definition = await documentedDefinition(1);
  assert.equal(mainPath(definition), undefined);
  assert.deepEqual([...definitionKinds(definition)], ["Calculate", "Plot"]);
  const params = parameterValues(definition, { field: "value" });
  const columns = nodeProps(definition, definition.root, {}, params).columns;
  const plot = definition.root.children[0];
  assert.deepEqual(nodeProps(definition, plot, {}, params), { title: "Centered values", height: 260, axes2d: true });
  assert.equal(plot.children[0].kind, "Slot");
  const scope = createDataScope();
  scope.update({ value: [2, 4, 3] });
  let result;
  try {
    result = evaluateExpression(columns.centered, scope);
    assert.deepEqual(result.value.ref.js(), [-1, 1, 0]);
  } finally { result?.dispose(); scope.dispose(); }
});
