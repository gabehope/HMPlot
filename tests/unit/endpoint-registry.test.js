import test from "node:test";
import assert from "node:assert/strict";
import { optionsRoot } from "../../src/lib/options/options.js";
import { createEndpointRegistry, endpointRegistry, endpointDefinition } from "../../src/lib/plot/utils/endpointRegistry.js";
import { duplicateEndpointNameError } from "../../src/lib/plot/utils/connections.js";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// A mount of an authored mark: its options node under `parent`, and a cell with an ordinal.
function mount(parent, { name, kind = "Anchor", ordinal = null, key = null, scopes = [] } = {}) {
  const options = parent.splitUnique(name, "mark", kind);
  const mark = { options };
  const entry = {
    kind, name, label: options.presentation.label, mark, options, scopes,
    cell: ordinal ? { key: key ?? ordinal.join(","), ordinal } : null,
    refreshes: 0,
  };
  entry.refresh = () => { entry.refreshes++; };
  return entry;
}
// Embedded Facet cells: one Frame per cell, each aliased "*" so mounts share a definition.
function cells(parent, count) {
  return Array.from({ length: count }, (_, i) => {
    const frame = parent.splitUnique(`Cell ${i}`, "axis", "Frame");
    frame.definitionAlias = "*";
    return frame;
  });
}

test("mounts of one definition come back in cell order", () => {
  const root = optionsRoot.splitUnique("Endpoint registry order test");
  const registry = createEndpointRegistry();
  const frames = cells(root, 4);
  // Row-major ordinals, registered in a scrambled order.
  const entries = [[1, 1], [0, 0], [1, 0], [0, 1]].map((ordinal) =>
    mount(frames[ordinal[0] * 2 + ordinal[1]], { name: "values", ordinal }));
  const stops = entries.map((entry) => registry.register(entry));
  const definition = endpointDefinition(entries[0].options);
  assert.ok(entries.every((entry) => entry.definition === definition), "one definition across cells");
  assert.deepEqual(registry.byDefinition(definition).map((entry) => entry.cell.ordinal), [[0, 0], [0, 1], [1, 0], [1, 1]]);
  // A sibling authored mark in the same cells is a different definition.
  const sibling = mount(frames[0], { name: "other", ordinal: [0, 0] });
  registry.register(sibling);
  assert.notEqual(sibling.definition, definition);
  assert.equal(registry.byDefinition(definition).length, 4);
  // Cells re-sort by their live ordinal (a reordered Facet) without re-registering.
  entries[1].cell.ordinal = [2, 0];
  assert.deepEqual(registry.byDefinition(definition).at(-1), entries[1]);
  stops.forEach((stop) => stop());
  assert.deepEqual(registry.byDefinition(definition), []);
  root.dispose();
});

test("Partition legendGroups aliases still resolve to one repeated definition", () => {
  const root = optionsRoot.splitUnique("Endpoint registry alias test");
  const groups = ["Adelie", "Gentoo"].map((label) => {
    const group = root.splitUnique(label, "group", "Group");
    group.definitionAlias = `partition:["${label}"]`;
    return group;
  });
  const [a, b] = groups.map((group, i) => mount(group, { name: "tip", ordinal: [i] }));
  assert.equal(endpointDefinition(a.options), endpointDefinition(b.options));
  const registry = createEndpointRegistry();
  registry.register(a); registry.register(b);
  assert.deepEqual(registry.byDefinition(a.definition), [a, b]);
  root.dispose();
});

test("byName selects the uniquely named definition inside a scope", () => {
  const root = optionsRoot.splitUnique("Endpoint registry name test");
  const partition = root.splitUnique("Partition", "group", "Partition");
  const registry = createEndpointRegistry();
  const groups = cells(partition, 2);
  const inPartition = groups.map((group, i) => mount(group, { name: "values", ordinal: [i] }));
  inPartition.forEach((entry) => registry.register(entry));
  // Options ancestry (Partition groups hang off the Partition's options).
  const found = registry.byName(partition, "values", { scopeKind: "Partition" });
  assert.equal(found.definition, inPartition[0].definition);
  assert.deepEqual(found.entries, inPartition);
  assert.equal(registry.byName(partition, "missing"), null);
  // Embedded Facet cells do not inherit from the Facet's options: `scopes` carries it.
  const facetScope = optionsRoot.splitUnique("Endpoint registry facet scope");
  const facetCells = cells(root, 2).map((frame, i) => mount(frame, { name: "points", ordinal: [i], scopes: [facetScope] }));
  facetCells.forEach((entry) => registry.register(entry));
  assert.deepEqual(registry.byName(facetScope, "points").entries, facetCells);
  assert.equal(registry.byName(facetScope, "values"), null, "the Partition's mounts are not in the Facet");
  // Two authored marks with one name in the selected scope is an error.
  registry.register(mount(groups[0], { name: "values", ordinal: [0] }));
  assert.throws(() => registry.byName(partition, "values", { scopeKind: "Partition" }),
    (error) => error.message === duplicateEndpointNameError("Partition", "values", 2));
  assert.equal(duplicateEndpointNameError("Facet", "values", 2),
    'Facet.endpoint("values"): 2 endpoint definitions are named "values"; give each a unique name.');
  facetScope.dispose();
  root.dispose();
});

test("demand makes mounts that published without key tokens prepare once more", async () => {
  const root = optionsRoot.splitUnique("Endpoint registry demand test");
  const registry = createEndpointRegistry();
  const [cellA, cellB] = cells(root, 2);
  const plain = mount(cellA, { name: "before", ordinal: [0] });
  const keyed = mount(cellB, { name: "before", ordinal: [1] });
  registry.register(plain); registry.register(keyed);
  registry.update(plain, { shown: { keyTokens: null, tokensRequested: false } });
  registry.update(keyed, { shown: { keyTokens: ["row:0"], tokensRequested: false } });
  await settle();
  assert.equal(plain.refreshes, 0, "nothing is demanded yet");
  assert.equal(registry.demanded(plain), false);
  const release = registry.demand(plain.definition);
  const again = registry.demand(plain.definition);
  assert.ok(registry.demanded(plain) && registry.demanded(plain.definition));
  await settle();
  assert.equal(plain.refreshes, 1, "refreshed once, however many consumers demand it");
  assert.equal(keyed.refreshes, 0, "tokens already on screen");
  // The re-prepared frame asked for tokens (an owner-less mark may still have none): no loop.
  registry.update(plain, { shown: { keyTokens: null, tokensRequested: true } });
  await settle();
  assert.equal(plain.refreshes, 1);
  // A mount registered while its definition is demanded prepares with tokens after its first publish.
  const late = mount(cellA, { name: "late", ordinal: [0] });
  const lateDemand = registry.demand(endpointDefinition(late.options));
  registry.register(late);
  registry.update(late, { shown: { keyTokens: null, tokensRequested: false } });
  await settle();
  assert.equal(late.refreshes, 1);
  release(); again(); again();
  assert.equal(registry.demanded(plain.definition), false, "released by both consumers; extra releases are no-ops");
  lateDemand();
  // Demand by name inside a scope.
  const named = mount(cellB, { name: "after", ordinal: [1] });
  registry.register(named);
  registry.update(named, { shown: { keyTokens: null } });
  const byName = registry.demand({ scope: root, name: "after" });
  assert.ok(registry.demanded(named));
  await settle();
  assert.equal(named.refreshes, 1);
  byName();
  assert.equal(registry.demanded(named), false);
  // Demand of one mount (a mark outside any cell): its definition's other mounts are not asked.
  const [one, two] = [cellA, cellB].map((frame) => mount(frame, { name: "solo" }));
  registry.register(one); registry.register(two);
  assert.equal(one.definition, two.definition);
  registry.update(one, { shown: { keyTokens: null } }); registry.update(two, { shown: { keyTokens: null } });
  const single = registry.demand({ entry: one });
  assert.ok(registry.demanded(one) && !registry.demanded(two) && !registry.demanded(one.definition));
  await settle();
  assert.deepEqual([one.refreshes, two.refreshes], [1, 0]);
  single();
  assert.equal(registry.demanded(one), false);
  root.dispose();
});

test("data and frame revisions move independently", async () => {
  const root = optionsRoot.splitUnique("Endpoint registry revision test");
  const registry = createEndpointRegistry();
  const entry = mount(root, { name: "a" });
  const changes = [];
  const stop = registry.subscribe((batch) => changes.push(...batch.map(({ change }) => change)));
  registry.register(entry);
  assert.deepEqual(entry.revision, { data: 0, frame: "" });
  registry.update(entry, { shown: { keyTokens: ["row:0"] } });
  assert.deepEqual(entry.revision, { data: 1, frame: "" });
  registry.update(entry, { frame: "[[x]]" });
  assert.deepEqual(entry.revision, { data: 1, frame: "[[x]]" });
  registry.update(entry, { frame: "[[x]]" });
  registry.update(entry, { shown: { keyTokens: ["row:1"] }, frame: "[[y]]" });
  assert.deepEqual(entry.revision, { data: 2, frame: "[[y]]" });
  await settle();
  // One batch per microtask; an unchanged frame string is no change.
  assert.deepEqual(changes, ["register", "data", "frame", "data", "frame"]);
  stop();
  root.dispose();
});

test("entries are found by mark and removed on unregister", async () => {
  const root = optionsRoot.splitUnique("Endpoint registry dispose test");
  const registry = createEndpointRegistry();
  const entry = mount(root, { name: "a" });
  const off = registry.register(entry);
  assert.equal(registry.entryOf(entry.mark), entry);
  assert.deepEqual(registry.entries(), [entry]);
  off(); off();
  assert.equal(registry.entryOf(entry.mark), undefined);
  assert.deepEqual(registry.entries(), []);
  // Updates after unregistering are ignored.
  registry.update(entry, { shown: { keyTokens: [] } });
  assert.equal(entry.revision.data, 0);
  registry.dispose();
  root.dispose();
});

test("one registry per View", () => {
  const a = {}, b = {};
  assert.equal(endpointRegistry(a), endpointRegistry(a));
  assert.notEqual(endpointRegistry(a), endpointRegistry(b));
});
