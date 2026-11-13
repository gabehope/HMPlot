import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { instantiateTemplate, validateTemplate } from "../../src/lib/templates/definition.js";

const fixture = JSON.parse(readFileSync(new URL("../../src/routes/test/portable-template/trend.hmplot.json", import.meta.url)));
const copy = () => structuredClone(fixture);

test("Python's exported tree binds values, remaps every instance and wires only host callbacks", () => {
  let clicks = 0;
  const handler = () => clicks++;
  const a = instantiateTemplate(fixture, { x: "day", y: "value" }, "a", { series: { click: handler } });
  const b = instantiateTemplate(fixture, { x: "day", y: "other" }, "b");
  assert.notEqual(a.root.id, b.root.id);
  assert.equal(a.root.children[0].props.x.$host, "day");
  assert.equal(b.root.children[0].props.y.$host, "other");
  assert.equal(a.root.children[0].props.color.$host, "#2468a0");
  assert.equal(a.slotId, a.root.children[1].id);
  assert.deepEqual(a.root.children[0].events, ["click"]);
  assert.deepEqual(b.root.children[0].events, []);
  a.handlers.get(`${a.root.children[0].id}:click`)();
  assert.equal(clicks, 1);
});

test("portable files reject callbacks, embedded resources, external sources and bad references", () => {
  const edits = [
    [(f) => f.root.children[0].events.push("click"), /empty events/],
    [(f) => f.root.children[0].props.x = { $table: "a" }, /embedded resource/],
    [(f) => f.root.children[0].props.x = "https://example.org/data", /external URLs/],
    [(f) => f.root.children[0].props.x = { $ref: "missing" }, /unresolved node reference/],
    [(f) => f.root.children[0].kind = "Provider", /not allowed/],
    [(f) => f.root.children[0].kind = "Markdown", /not allowed/],
  ];
  for (const [edit, expected] of edits) {
    const file = copy();
    edit(file);
    assert.throws(() => validateTemplate(file), expected);
  }
  assert.throws(() => instantiateTemplate(fixture, { x: "day" }), /missing parameters y/);
});

test("props go to the main part and events to contract parts", () => {
  const line = fixture.root.children[0];
  const a = instantiateTemplate(fixture, { x: "day", y: "value" }, "a", {}, { opacity: 0.5 });
  assert.equal(a.root.children[0].props.opacity.$host, 0.5);
  assert.throws(() => instantiateTemplate(fixture, { x: "day", y: "value" }, "b", {}, { colour: "red" }), /Line: unknown property 'colour'/);
  const file = copy();
  file.root.children.splice(1, 0, { ...structuredClone(line), id: "dot", kind: "Points", props: {} });
  assert.throws(() => instantiateTemplate(file, { x: "day", y: "value" }, "c", {}, { opacity: 0.5 }), /has 2 marks and no contract main, so it takes only visible/);
  const hidden = instantiateTemplate(file, { x: "day", y: "value" }, "h", {}, { visible: false });
  assert.deepEqual(hidden.root.children.slice(0, 2).map((node) => node.props.visible.$host), [false, false]);
  file.template.contract = { main: "dot", parts: { stem: line.id } };
  const handler = () => {};
  const d = instantiateTemplate(file, { x: "day", y: "value" }, "d", { stem: { click: handler } }, { opacity: 0.5 });
  assert.equal(d.root.children[1].props.opacity.$host, 0.5);
  // The other marks follow the main part: the scene's Template carries it, and they leave the legend.
  assert.deepEqual(d.root.props, { contract: { main: d.root.children[1].id } });
  assert.deepEqual([d.root.children[0].props.legend, d.root.children[1].props.legend], [false, undefined]);
  assert.deepEqual(d.root.children[0].events, ["click"]);
  for (const contract of [{ main: "missing" }, { main: fixture.root.children[1].id }, { parts: { root: fixture.root.id } }, null]) {
    file.template.contract = contract;
    assert.throws(() => validateTemplate(file), /contract must be \{main, parts\}: main the id of one of the template's marks/);
  }
});

test("a file's legend entries leave their other parts out of the legend and tell the scene", () => {
  const file = copy(), line = file.root.children[0];
  file.root.children.splice(1, 0, { ...structuredClone(line), id: "dot", kind: "Points", props: {} });
  file.template.contract = { legendEntries: [{ swatch: "dot", parts: [line.id, "dot"] }] };
  const a = instantiateTemplate(file, { x: "day", y: "value" }, "a");
  assert.deepEqual([a.root.children[0].props.legend, a.root.children[1].props.legend], [false, undefined]);
  assert.deepEqual(a.root.props, { contract: { legendEntries: [{ swatch: a.root.children[1].id, parts: [a.root.children[0].id, a.root.children[1].id] }] } });
  // A group's visible reaches the swatch; the parts that follow it carry none.
  const hidden = instantiateTemplate(file, { x: "day", y: "value" }, "h", {}, { visible: false });
  assert.deepEqual(hidden.root.children.slice(0, 2).map((node) => node.props.visible?.$host), [undefined, false]);
  for (const legendEntries of [[{ swatch: line.id, parts: ["dot"] }], [{ swatch: "dot", parts: ["dot"] }, { swatch: "dot", parts: ["dot"] }],
    [{ swatch: "dot", parts: ["dot"], label: "x" }], { swatch: "dot" }]) {
    file.template.contract = { legendEntries };
    assert.throws(() => validateTemplate(file), /contract.legendEntries must be \[\{swatch, parts\}\] with no main/);
  }
  file.template.contract = { main: "dot", legendEntries: [{ swatch: "dot", parts: ["dot"] }] };
  assert.throws(() => validateTemplate(file), /legendEntries must be/);
});

test("a prop named after a contract part sets that part's props", () => {
  const file = copy(), line = file.root.children[0];
  file.root.children.splice(1, 0, { ...structuredClone(line), id: "dot", kind: "Points", props: {} });
  file.template.contract = { main: "dot", parts: { stem: line.id } };
  const a = instantiateTemplate(file, { x: "day", y: "value" }, "a", {}, { stem: { opacity: 0.3 }, opacity: 0.5 });
  assert.deepEqual([a.root.children[0].props.opacity.$host, a.root.children[1].props.opacity.$host], [0.3, 0.5]);
  assert.throws(() => instantiateTemplate(file, { x: "day", y: "value" }, "b", {}, { stem: "gray" }), /stem is a part of this template, so props.stem is an object/);
  assert.throws(() => instantiateTemplate(file, { x: "day", y: "value" }, "c", {}, { stem: { colour: "red" } }), /props.stem: Line: unknown property 'colour'/);
});

test("a nested template's contract tells the scene its kind and main part, and a part through it reaches its main mark", () => {
  const file = copy(), line = file.root.children[0];
  const inner = { id: "pop", kind: "Template", props: { contract: { kind: "pop", main: "dot", parts: { head: "dot" } } }, events: [],
    children: [line, { ...structuredClone(line), id: "dot", kind: "Points", props: {} }] };
  file.root.children.splice(0, 1, inner);
  file.template.contract = { parts: { lolly: "pop" } };
  const handler = () => {};
  const a = instantiateTemplate(file, { x: "day", y: "value" }, "a", { lolly: { click: handler } }, { lolly: { opacity: 0.4 } });
  const [nested] = a.root.children, dot = nested.children[1];
  assert.deepEqual(nested.props, { contract: { kind: "pop", main: "a:dot", parts: { head: "a:dot" } } });
  assert.equal(dot.props.opacity.$host, 0.4);
  assert.deepEqual([dot.events, a.handlers.has("a:dot:click")], [["click"], true]);
  // A group's visible spares the stem, which follows the head.
  file.root.children.push({ ...structuredClone(line), id: "trend" });
  const hidden = instantiateTemplate(file, { x: "day", y: "value" }, "h", {}, { visible: false });
  assert.deepEqual([...hidden.root.children[0].children, hidden.root.children.at(-1)].map((node) => node.props.visible?.$host), [undefined, false, false]);
  // A group has no one mark to take a part's props.
  delete inner.props.contract.main;
  assert.throws(() => instantiateTemplate(file, { x: "day", y: "value" }, "b", {}, { lolly: { opacity: 0.4 } }), /part "lolly" is a nested template with 2 marks and no main part/);
  for (const contract of [{ kind: "pop", main: "trend" }, { kind: "" }, { color: "red" }]) {
    inner.props = { contract };
    assert.throws(() => validateTemplate(file), /the nested (pop )?template \(?"pop"\)?'s contract must be \{kind, main, parts\}/);
  }
  inner.props = { contract: {}, color: "red" };
  assert.throws(() => validateTemplate(file), /Template takes no properties but its contract/);
});
