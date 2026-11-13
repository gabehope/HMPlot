import test from "node:test";
import assert from "node:assert/strict";
import { numpy as np, Array as JaxArray } from "@hmplot/jax";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { createDataView, snapshotDataScope } from "../../src/lib/plot/utils/dataView.js";
import { interactionScope, interactionRows, interactionVersion, responseResources, selection, table, brushColumn, isVirtualField } from "../../src/lib/plot/utils/interaction.js";
import { installMarkInteractionEvents } from "../../src/lib/plot/binding/markInteractionEvents.ts";
import { brushConstraint } from "../../src/lib/plot/utils/brushStrips.js";
import { createViewMarks, emptyBinding } from "../../src/lib/plot/utils/markBinding.js";
import { col, expressionFields, subtract, sum } from "../../src/lib/plot/utils/expressions.js";
import { placeName, settingNames } from "../../src/lib/plot/utils/names.js";

test("mark binding subscribers see current, replaced and withdrawn bindings", () => {
  const marks = createViewMarks(), object = {}, first = emptyBinding(), second = emptyBinding();
  const releaseFirst = marks.publish(object, first), events = [];
  const stop = marks.subscribe((mark, binding) => events.push([mark, binding]));
  const releaseSecond = marks.publish(object, second);
  releaseFirst(); // an obsolete publisher cannot withdraw its replacement
  releaseSecond();
  assert.deepEqual(events, [[object, first], [object, second], [object, undefined]]);
  stop();
  marks.publish(object, first)();
  assert.equal(events.length, 3);
});

test("response modes separate capture from feedback and include preview versions", () => {
  const owner = { id: "owner", length: 2, selection: selection(), brush: selection(), hover: selection() };
  for (const resource of [owner.selection, owner.brush, owner.hover]) resource.owner = owner;
  const binding = { owner, selection: owner.selection, hover: owner.hover };
  // Hover marks @hovered without fading (TODO 62.2): only an explicit respond fades by it.
  assert.deepEqual(responseResources(binding), [owner.selection]);
  assert.deepEqual(responseResources({ ...binding, respond: "hovered" }), [owner.hover]);
  // The state was @highlighted before TODO 72.5; the old spelling is not an alias.
  assert.deepEqual(responseResources({ ...binding, respond: "highlighted" }), []);
  assert.deepEqual(responseResources({ ...binding, respond: false }), []);
  assert.deepEqual(responseResources({ ...binding, respond: "brushed" }), [owner.brush]);
  assert.deepEqual(responseResources({ ...binding, respond: true }), [owner.selection, owner.hover, owner.brush]);
  owner.hover.replace(owner, [0], { phase: "preview" });
  assert.equal(interactionVersion(owner.hover), 1);
  // nearest (TODO 72) is a pointer state too: it fades only when asked.
  owner.nearest = selection(); owner.nearest.owner = owner;
  const near = { ...binding, nearest: owner.nearest };
  assert.deepEqual(responseResources(near), [owner.selection]);
  assert.deepEqual(responseResources({ ...near, respond: "nearest" }), [owner.nearest]);
  assert.deepEqual(responseResources({ ...near, respond: ["@nearest", "selected"] }), [owner.nearest, owner.selection]);
  assert.ok(responseResources({ ...near, respond: true }).includes(owner.nearest));
});

test("column constraints replace by identity and combine with AND on the GPU", async () => {
  const owner = { id: "brush-owner", length: 4 }, resource = selection(); resource.owner = owner;
  const x = np.array([0, 1, 2, 3]), y = np.array([3, 2, 1, 0]);
  const descriptor = (identity, source, bounds) => ({ identity, name: identity, type: "numeric", bounds,
    evaluate: () => np.logicalAnd(source.ref.greaterEqual(bounds[0]), source.ref.lessEqual(bounds[1])).astype(np.int32), release() {} });
  resource.setConstraints(owner, [descriptor("x", x, [1, 3]), descriptor("y", y, [1, 2])], { phase: "preview" });
  assert.deepEqual(Array.from(resource.mask(owner, 4, "preview").js()).map(Number), [0, 1, 1, 0]);
  assert.equal(resource.borrowMask(owner, 4, "preview").dtype, np.int32);
  resource.commitConstraintPreview(owner);
  assert.deepEqual(resource.getConstraints(owner).map(value => value.identity), ["x", "y"]);
  resource.setConstraints(owner, [descriptor("x", x, [2, 2])]);
  assert.deepEqual(Array.from(resource.mask(owner, 4).js()).map(Number), [0, 0, 1, 0]);
  resource.clearColumns(owner, "y");
  assert.equal(resource.borrowMask(owner, 4).dtype, np.int32);
  assert.deepEqual(resource.getConstraints(owner).map(value => value.identity), ["x"]);
  resource.dispose(); x.dispose(); y.dispose();
});
test("table-owned previews use their owner implicitly without accepting null as a default", () => {
  const scope = createDataScope();
  scope.update({ x: [1, 2, 3] });
  const owner = scope.identity, resource = owner.brush;
  const column = brushColumn(scope, "x", "x", "mark");
  resource.setConstraints(owner, [brushConstraint(column, { axis: "x" }, 1, 2)], { phase: "preview" });
  assert.deepEqual(resource.getConstraints(), resource.getConstraints(owner));
  resource.refreshConstraints();
  assert.deepEqual(values(resource.mask(owner, 3, "preview")), [1, 1, 0]);
  resource.commitConstraintPreview();
  resource.setConstraints(owner, [brushConstraint(column, { axis: "x" }, 3, 3)], { phase: "preview" });
  resource.cancelConstraintPreview();
  assert.deepEqual(resource.getConstraints()[0].bounds, [1, 2]);
  // Row previews have the same default owner, and cancellation preserves committed rows.
  resource.replace(owner, [2], { phase: "preview" });
  resource.commitPreview();
  resource.replace(owner, [0], { phase: "preview" });
  resource.cancelPreview();
  assert.deepEqual([...resource.rows()], [2]);
  assert.throws(() => resource.getConstraints(null), /no data of its own/);
  assert.throws(() => resource.commitPreview(null), /no data of its own/);
  column.release(); scope.dispose();
});

import { runTransform } from "../../src/lib/plot/utils/transforms.js";
import { evaluateExpression, where } from "../../src/lib/plot/utils/expressions.js";

function values(array, release = true) {
  try { return Array.from(array.ref.js()).flat(Infinity); }
  finally { if (release) array.dispose(); }
}

test("brush extents track gesture bounds through preview, empty brushes, cancellation, commit and clear", () => {
  const scope = createDataScope();
  scope.update({ x: [1, 2, 3], y: [4, 5, 6], category: ["a", "b", "a"] });
  const owner = scope.identity, resource = owner.brush, column = brushColumn(scope, "x", "x", "mark");
  const apply = (a, b, phase = "preview") => resource.setConstraints(owner, [brushConstraint(column, { axis: "x" }, a, b)], { phase });
  assert.equal(scope.has("@brush_min:x"), true);
  assert.equal(scope.interactionResource("@brush_max:x"), resource);
  assert.equal(isVirtualField("@brush_min:x"), true);
  assert.equal(isVirtualField("constructor"), false);
  assert.deepEqual(values(scope.get("@brush_min:x"), false), [NaN, NaN, NaN]);
  apply(12, 10); // Ordered, even with no selected observation.
  assert.deepEqual(values(scope.get("@brushed"), false), [0, 0, 0]);
  assert.deepEqual(values(scope.get("@brush_min:x"), false), [10, 10, 10]);
  assert.deepEqual(values(scope.get("@brush_max:x"), false), [12, 12, 12]);
  assert.deepEqual(values(scope.get("@brush_min:y"), false), [NaN, NaN, NaN]);
  resource.commitConstraintPreview(owner);
  apply(2, 3);
  assert.deepEqual(values(scope.get("@brush_min:x"), false), [2, 2, 2]);
  resource.cancelConstraintPreview(owner);
  assert.deepEqual(values(scope.get("@brush_min:x"), false), [10, 10, 10]);
  resource.replace([0]);
  assert.deepEqual(values(scope.get("@brush_min:x"), false), [NaN, NaN, NaN]);
  apply(1, 2, "committed"); resource.clear();
  assert.deepEqual(values(scope.get("@brush_max:x"), false), [NaN, NaN, NaN]);
  const category = brushColumn(scope, "category", "y", "mark");
  resource.setConstraints(owner, [brushConstraint(category, { axis: "y" }, 0, 1)]);
  assert.deepEqual(values(scope.get("@brush_min:category"), false), [NaN, NaN, NaN]);
  assert.equal(scope.has("@brush_min:missing"), false);
  assert.throws(() => scope.get("@brush_min:missing"), /Missing data column: missing/);
  assert.throws(() => evaluateExpression(col("@brush_min:missing"), scope), /missing field "@brush_min:missing"/);
  assert.throws(() => col("@brush_min:"), /cannot start with @/);
  assert.deepEqual(placeName("@brush_min:x", "Points.x"), col("@brush_min:x"));
  assert.deepEqual(settingNames({ by: [col("@brush_min:x")] }), { by: ["@brush_min:x"] });
  const span = subtract("@brush_max:x", col("@brush_min:x"));
  assert.deepEqual([...expressionFields(span)], ["@brush_max:x", "@brush_min:x"]);
  column.release(); category.release(); scope.dispose();
});

test("brush extents follow aliases and linked identities and cache each view's live revision", async () => {
  const data = table({ x: [1, 2, 3, 4], "a:b": [4, 3, 2, 1] });
  const scope = createDataScope(), linked = createDataScope(); scope.update(data); linked.update(data);
  const aliases = await runTransform("Calculate", scope, { columns: { weight: col.x } });
  const column = brushColumn(aliases, "weight", "y", "mark"), owner = scope.identity;
  const update = (low, high) => owner.brush.setConstraints(owner, [brushConstraint(column, { axis: "y" }, low, high)], { phase: "preview" });
  const mask = np.array([1, 0, 1, 0], { dtype: np.int32 });
  const filtered = createDataView(aliases, { mask, count: 2 });
  const old = [];
  for (const bounds of [[1, 2], [2, 3], [3, 4]]) {
    update(...bounds);
    assert.deepEqual(values(linked.get("@brush_min:x"), false), Array(4).fill(bounds[0]));
    assert.deepEqual(values(aliases.get("@brush_max:weight"), false), Array(4).fill(bounds[1]));
    const current = filtered.get("@brush_min:weight");
    assert.equal(current, filtered.get("@brush_min:weight"));
    assert.deepEqual(values(current, false), Array(2).fill(bounds[0]));
    assert.deepEqual(values(filtered.padded().get("@brush_min:weight"), false), Array(4).fill(bounds[0]));
    assert.deepEqual(values(filtered.prefixed().get("@brush_min:weight"), false), Array(4).fill(bounds[0]));
    old.push(current);
  }
  assert.deepEqual(old.map((a) => a.refCount), [0, 0, 1]);
  // Column names with colons cannot evict another virtual field's cached value.
  const other = filtered.get("@brush_min:a:b");
  assert.deepEqual(values(other, false), [NaN, NaN]);
  const calculated = await runTransform("Calculate", aliases, { columns: { width: subtract("@brush_max:weight", "@brush_min:weight") } });
  assert.deepEqual(values(calculated.get("width"), false), [1, 1, 1, 1]);
  calculated.dispose(); filtered.dispose(); aliases.dispose(); column.release();
  assert.equal(old.at(-1).refCount, 0);
  assert.equal(other.refCount, 0);
  scope.dispose(); linked.dispose(); owner.dispose();
});

test("brush extent identities distinguish derived and aggregate columns from their sources", async () => {
  const scope = createDataScope(); scope.update({ x: [1, 2, 3], group: ["a", "a", "b"] });
  const calculated = await runTransform("Calculate", scope, { columns: { doubled: { __hmplotExpression: true, op: "multiply", args: ["x", 2] } } });
  const column = brushColumn(calculated, "doubled", "x", "mark"), owner = scope.identity;
  owner.brush.setConstraints(owner, [brushConstraint(column, { axis: "x" }, 2.5, 5)]);
  assert.deepEqual(values(calculated.get("@brush_min:doubled"), false), [2.5, 2.5, 2.5]);
  assert.deepEqual(values(scope.get("@brush_min:x"), false), [NaN, NaN, NaN]);
  const grouped = await runTransform("Group", scope, { by: "group", columns: { total: sum("x") } });
  assert.equal(grouped.has("@brush_min:total"), true);
  assert.deepEqual(values(grouped.get("@brush_min:total"), false), [NaN, NaN]);
  assert.throws(() => grouped.get("@brush_min:x"), /Missing data column: x/);
  grouped.dispose(); column.release(); calculated.dispose(); scope.dispose();
});

test("datetime brush extents retain source precision and metadata", () => {
  const start = Date.UTC(2026, 0, 1), scope = createDataScope();
  scope.update({ time: [new Date(start), new Date(start + 1000)] });
  const column = brushColumn(scope, "time", "x", "mark");
  scope.identity.brush.setConstraints(scope.identity, [brushConstraint(column, { axis: "x" }, start + 250, start + 750)]);
  assert.deepEqual(values(scope.get("@brush_min:time"), false), [250, 250]);
  assert.deepEqual(values(scope.get("@brush_max:time"), false), [750, 750]);
  assert.deepEqual(scope.metadata("@brush_min:time"), scope.metadata("time"));
  const span = evaluateExpression(subtract("@brush_max:time", "@brush_min:time"), scope);
  assert.deepEqual(values(span.value, false), [500, 500]); span.dispose();
  column.release(); scope.dispose();
});

test("data-owned selection fields preserve compatible row identity", () => {
  const scope = createDataScope();
  scope.update({ x: [1, 2, 3] });
  scope.identity.selection.replace([1]);
  assert.deepEqual(values(scope.get("@selected"), false), [0, 1, 0]);
  scope.update({ x: [4, 5, 6] });
  assert.deepEqual(values(scope.get("@selected"), false), [0, 1, 0]);
  scope.update({ x: [4, 5] });
  assert.deepEqual(values(scope.get("@selected"), false), [0, 0]);
  assert.equal(scope.identity.selection.active, false);
  scope.dispose();
});

test("explicit keys remap selection across replacement and reordering", () => {
  const scope = createDataScope({ key: "id" });
  scope.update({ id: ["a", "b", "c"], x: [1, 2, 3] });
  scope.identity.selection.replace([1]);
  scope.update({ id: ["b", "c", "a"], x: [20, 30, 10] });
  assert.deepEqual([...scope.identity.selection.rows()], [0]);
  assert.deepEqual(values(scope.get("@selected"), false), [1, 0, 0]);
  assert.throws(() => scope.update({ id: ["a", "a"], x: [1, 2] }), /unique/);
  assert.deepEqual(scope.get("id"), ["b", "c", "a"]);
  assert.deepEqual(values(scope.get("@selected"), false), [1, 0, 0]);
  scope.dispose();
});

test("table resources share one interaction identity across data scopes", () => {
  const data = table({ id: ["a", "b"], x: [1, 2] }, { key: "id" });
  const first = createDataScope(), second = createDataScope();
  first.update(data); second.update(data);
  assert.equal(first.identity, second.identity);
  first.identity.selection.replace([1]);
  assert.deepEqual(values(second.get("@selected"), false), [0, 1]);
  first.dispose(); second.dispose();
  assert.equal(first.identity.disposed, false);
  first.identity.dispose();
});

test("unshared data scopes retire their owned interaction resources", () => {
  const scope = createDataScope();
  scope.update({ x: [1, 2] });
  const owner = scope.identity;
  scope.dispose();
  assert.equal(owner.disposed, true);
});

test("interaction aliases and indexed views project virtual masks", async () => {
  const scope = createDataScope();
  scope.update({ x: [10, 20, 30] });
  const focus = selection();
  focus.replace(scope.identity, [0, 2]);
  const aliased = interactionScope(scope, { "@focus": focus });
  assert.deepEqual(values(aliased.get("@focus"), false), [1, 0, 1]);
  const indices = np.array([2, 1], { dtype: np.int32 });
  const view = createDataView(aliased, { indices });
  assert.deepEqual(values(view.get("@focus"), false), [1, 0]);
  // TODO 64: "@focus" is read like "@selected": a view follows the selection's changes, and
  // Filter and expressions read it by its string.
  focus.replace(scope.identity, [1]);
  assert.deepEqual(values(view.get("@focus"), false), [0, 1]);
  const filtered = await runTransform("Filter", aliased, { where: "@focus", inactive: "none" });
  assert.deepEqual(values(filtered.sourceIndices()), [1]);
  filtered.dispose();
  const sized = evaluateExpression(where("@focus", 16, 8), aliased);
  assert.deepEqual(values(sized.value, false), [8, 16, 8]);
  sized.dispose();
  assert.throws(() => evaluateExpression(where("@other", 16, 8), aliased),
    /there is no state or Interaction column named "@other"\. State names are @selected, .*; the Interaction around it names @focus\./);
  assert.throws(() => interactionScope(scope, { focus }), /Interaction: a column's name is "@" and a name that is not a state name, such as "@focus"; received "focus"/);
  // Over a view (an Interaction inside a Filter), reading "@focus" leaves the mask as it was.
  const inner = interactionScope(view, { "@focus": focus }), mask = focus.borrowMask(scope.identity, 3), held = mask.refCount;
  evaluateExpression(where("@focus", 16, 8), inner).dispose();
  assert.equal(mask.refCount, held);
  view.dispose();
  indices.dispose();
  focus.dispose();
  scope.dispose();
});

test("named interaction filters preserve brush membership from preview through commit", async () => {
  const scope = createDataScope();
  scope.update({ x: [1, 2, 3, 4] });
  const focus = selection(), other = selection();
  const aliased = interactionScope(scope, { "@focus": focus, "@other": other });
  const column = brushColumn(scope, "x", "x", "mark");
  focus.setConstraints(scope.identity, [brushConstraint(column, { axis: "x" }, 2, 3)], { phase: "preview" });
  for (const commit of [false, true]) {
    if (commit) focus.commitConstraintPreview(scope.identity);
    assert.deepEqual(values(aliased.get("@focus"), false), [0, 1, 1, 0]);
    const view = await runTransform("Filter", aliased, { where: ["@focus", "@other"], inactive: "all" });
    assert.deepEqual(values(view.sourceIndices()), [1, 2]);
    view.dispose();
  }
  focus.dispose(); other.dispose(); column.release(); scope.dispose();
});

test("selection filters use live preview state and define inactive behavior", async () => {
  const scope = createDataScope();
  scope.update({ x: [1, 2, 3, 4] });
  const resource = scope.identity.selection;
  let view = await runTransform("Filter", scope, { where: resource, inactive: "all" });
  assert.deepEqual(values(view.sourceIndices()), [0, 1, 2, 3]);
  view.dispose();
  resource.replace(scope.identity, [1, 3], { phase: "preview" });
  assert.deepEqual(resource.status(), {
    active: false, previewActive: true, count: 2,
    committedCount: 0, previewCount: 2, revision: resource.revision,
    previewRevision: resource.previewRevision, membership: resource.status().membership,
  });
  view = await runTransform("Filter", scope, { where: resource, inactive: "all" });
  assert.deepEqual(values(view.sourceIndices()), [1, 3]);
  view.dispose();
  assert.deepEqual(values(scope.get("@selected"), false), [0, 0, 0, 0]);
  resource.commitPreview(scope.identity);
  view = await runTransform("Filter", scope, { where: resource });
  assert.deepEqual(values(view.sourceIndices()), [1, 3]);
  view.dispose();
  view = await runTransform("Filter", scope, { where: "@selected" });
  assert.deepEqual(values(view.sourceIndices()), [1, 3]);
  view.dispose();
  scope.dispose();
});

test("asynchronous transform snapshots preserve data-owned interaction fields", async () => {
  const scope = createDataScope();
  scope.update({ x: [1, 2, 3] });
  let snapshot = snapshotDataScope(scope);
  let view = await runTransform("Filter", snapshot, { where: "@selected", inactive: "all" });
  assert.deepEqual(values(view.sourceIndices()), [0, 1, 2]);
  view.dispose(); snapshot.dispose();
  scope.identity.selection.replace([0, 2]);
  snapshot = snapshotDataScope(scope);
  view = await runTransform("Filter", snapshot, { where: "@selected", inactive: "all" });
  assert.deepEqual(values(view.sourceIndices()), [0, 2]);
  view.dispose(); snapshot.dispose(); scope.dispose();
});


test("aggregate interaction maps contributors without host plotting-array reads", async () => {
  const scope = createDataScope();
  scope.update({ group: ["a", "a", "b", "b"], value: [1, 2, 3, 4] });
  scope.identity.selection.replace([1]);
  const grouped = await runTransform("Group", scope, { by: "group" });
  assert.deepEqual(values(grouped.get("@selected"), false), [1, 0]);
  assert.deepEqual(await interactionRows(grouped, [1]), [2, 3]);
  const bars = await runTransform("BarGeometry", grouped, { x: "group", y: "count" });
  assert.equal(bars.aggregate, false, "geometry preserves rows rather than creating groups");
  assert.deepEqual(await interactionRows(bars, [1]), [2, 3]);
  const calculated = await runTransform("Calculate", bars, { columns: { doubled: sum("count") } });
  assert.deepEqual(await interactionRows(calculated, [0]), [0, 1]);
  calculated.dispose(); bars.dispose(); grouped.dispose();
  scope.dispose();
});


test("unchanged membership does not notify and preview remaps advance preview versions", () => {
  const scope = createDataScope({key:"id"}); scope.update({id:["a","b"],x:[1,2]});
  const hover=scope.identity.hover; let updates=0; const stop=hover.subscribe(()=>updates++);
  hover.replace(scope.identity,[0],{phase:"preview"});
  const before=updates, version=hover.previewRevision;
  hover.replace(scope.identity,[0],{phase:"preview"});
  assert.equal(updates,before);
  scope.update({id:["b","a"],x:[2,1]});
  assert.equal(hover.previewRevision,version+1);
  assert.deepEqual([...hover.rows(scope.identity,"preview")],[1]);
  stop();scope.dispose();
});

test("identity-preserving views resolve hit rows without an index readback", async () => {
  const scope=createDataScope();scope.update({x:[1,2,3]});
  const snapshot=snapshotDataScope(scope),view=createDataView(snapshot,{columns:{y:scope.get("x")}});
  view.sourceIndices=()=>{throw Error("unnecessary gather");};
  assert.deepEqual(await interactionRows(view,[2]),[2]);
  view.dispose();snapshot.dispose();scope.dispose();
});

test("@any_* columns are all-1 exactly when their @ column has a member", async () => {
  const scope = createDataScope();
  scope.update({ x: [1, 2, 3, 4] });
  assert.deepEqual(values(scope.get("@any_selected"), false), [0, 0, 0, 0]);
  scope.identity.selection.replace([2]);
  assert.deepEqual(values(scope.get("@any_selected"), false), [1, 1, 1, 1]);
  scope.identity.selection.clear();
  assert.deepEqual(values(scope.get("@any_selected"), false), [0, 0, 0, 0]);
  // Hover lives in the preview phase and is independent of committed selection.
  scope.identity.hover.replace(scope.identity, [0], { phase: "preview" });
  assert.deepEqual(values(scope.get("@any_hovered"), false), [1, 1, 1, 1]);
  assert.deepEqual(values(scope.get("@any_selected"), false), [0, 0, 0, 0]);
  scope.identity.hover.cancelPreview();
  assert.deepEqual(values(scope.get("@any_hovered"), false), [0, 0, 0, 0]);
  // Brush membership stays on the GPU: a constraint matching nothing, then some rows,
  // flips @any_brushed without a CPU count or a commit.
  const x = np.array([1, 2, 3, 4]), owner = scope.identity;
  const brush = (low, high) => ({ identity: "x", name: "x", type: "numeric", bounds: [low, high], release() {},
    evaluate: () => np.logicalAnd(x.ref.greaterEqual(low), x.ref.lessEqual(high)).astype(np.int32) });
  owner.brush.setConstraints(owner, [brush(10, 20)], { phase: "preview" });
  assert.deepEqual(values(scope.get("@any_brushed"), false), [0, 0, 0, 0]);
  owner.brush.setConstraints(owner, [brush(2, 3)], { phase: "preview" });
  assert.deepEqual(values(scope.get("@any_brushed"), false), [1, 1, 1, 1]);
  owner.brush.cancelConstraintPreview(owner);
  assert.throws(() => scope.update({ "@any_selected": [1] }), /names starting with @ are reserved for state/);
  x.dispose(); scope.dispose();
});

test("@any_* evaluates inside Calculate and stays constant across aggregate views", async () => {
  const scope = createDataScope();
  scope.update({ group: ["a", "a", "b"], v: [1, 2, 3] });
  scope.identity.selection.replace([2]);
  const calculated = await runTransform("Calculate", scope, {
    columns: { dim: { __hmplotExpression: true, op: "where", args: [
      { __hmplotExpression: true, op: "column", args: ["@any_selected"] }, 0.2, 1] } },
  });
  assert.deepEqual(values(calculated.get("dim"), false).map((v) => Math.round(v * 10) / 10), [0.2, 0.2, 0.2]);
  const grouped = await runTransform("Group", scope, { by: "group" });
  assert.deepEqual(values(grouped.get("@any_selected"), false), [1, 1]);
  assert.deepEqual(values(grouped.get("@selected"), false), [0, 1]);
  calculated.dispose?.(); grouped.dispose?.(); scope.dispose();
});

test("anyMask keeps one cached array per owner and phase as the data length changes", () => {
  const scope = createDataScope(), arrays = [];
  for (let length = 1; length <= 5; length++) {
    scope.update({ x: Array.from({ length }, (_, index) => index) });
    arrays.push(scope.get("@any_selected"));
  }
  // Only the newest array is still held, by the cache that lends it.
  assert.deepEqual(arrays.map((array) => array.refCount), [0, 0, 0, 0, 1]);
  scope.dispose();
});

test("clearing one owner of a shared resource clears its preview @any_ flag", () => {
  const shared = selection(), a = { id: "a", length: 3 }, b = { id: "b", length: 3 };
  shared.replace(a, [0], { phase: "preview" });
  shared.replace(b, [1], { phase: "preview" });
  assert.deepEqual(values(shared.anyMask(b, 3, "preview")), [1, 1, 1]);
  shared.clear(b);
  assert.equal(shared.previewActive, true); // a still previews, so readers stay in the preview phase
  assert.deepEqual(values(shared.anyMask(b, 3, "preview")), [0, 0, 0]);
  assert.deepEqual(values(shared.anyMask(a, 3, "preview")), [1, 1, 1]);
  shared.hydrate([]);
  assert.deepEqual(values(shared.anyMask(a, 3, "preview")), [0, 0, 0]);
  shared.dispose();
});

test("cancelling an idle constraint preview does not notify", () => {
  const resource = selection(), owner = { id: "idle", length: 2 }, x = np.array([0, 1]);
  let calls = 0;
  resource.subscribe(() => calls++);
  calls = 0;
  const version = interactionVersion(resource);
  for (let i = 0; i < 10; i++) resource.cancelConstraintPreview(owner);
  assert.equal(calls, 0);
  assert.equal(interactionVersion(resource), version);
  resource.setConstraints(owner, [{ identity: "x", name: "x", type: "numeric", bounds: [1, 1], release() {},
    evaluate: () => x.ref.equal(1).astype(np.int32) }], { phase: "preview" });
  calls = 0;
  resource.cancelConstraintPreview(owner);
  resource.cancelConstraintPreview(owner);
  assert.equal(calls, 1);
  assert.equal(resource.previewActive, false);
  resource.dispose(); x.dispose();
});

test("@any_* evaluates inside Filter, and unknown virtual names still error", async () => {
  const scope = createDataScope();
  scope.update({ v: [1, 2, 3] });
  const column = (name) => ({ __hmplotExpression: true, op: "column", args: [name] });
  let view = await runTransform("Filter", scope, { where: column("@any_selected") });
  assert.deepEqual(values(view.sourceIndices()), []);
  view.dispose();
  scope.identity.selection.replace([1]);
  view = await runTransform("Filter", scope, { where: column("@any_selected") });
  assert.deepEqual(values(view.sourceIndices()), [0, 1, 2]);
  view.dispose();
  // An unknown "@" name could be an Interaction's column (TODO 64): the error says both.
  for (const name of ["@any_foo", "@closest", "@any_"]) {
    const message = new RegExp(`there is no state or Interaction column named "${name}"`);
    await assert.rejects(runTransform("Filter", scope, { where: column(name) }), message);
    await assert.rejects(runTransform("Calculate", scope, { columns: { d: column(name) } }), message);
  }
  scope.dispose();
});

// Stage 17.1: a root Data scope keeps untyped string columns as plain arrays.
test("categorical expressions work on a root scope's plain string column", async () => {
  const { evaluateExpression, equal, is_in, is_missing } = await import("../../src/lib/plot/utils/expressions.js");
  const { literal } = await import("../../src/lib/plot/utils/categorical.js");
  const scope = createDataScope();
  scope.update({ g: ["a", "b", null, "c", "a"] });
  const read = (expression) => { const result = evaluateExpression(expression, scope); try { return values(result.value, false).map(Number); } finally { result.dispose(); } };
  assert.deepEqual(read(is_in("g", ["a", "c"])), [1, 0, 0, 1, 1]);
  assert.deepEqual(read(is_in("g", ["zzz"])), [0, 0, 0, 0, 0]);
  assert.deepEqual(read(equal("g", literal("b"))), [0, 1, 0, 0, 0]);
  // A category the column lacks matches nothing, not the missing rows.
  assert.deepEqual(read(equal("g", literal("zzz"))), [0, 0, 0, 0, 0]);
  assert.deepEqual(read(is_missing("g")), [0, 0, 1, 0, 0]);
  // A text constant (an input's value: TODO 145.2) is a value on every row, never missing.
  const { is_finite, where } = await import("../../src/lib/plot/utils/expressions.js");
  const one = (expression) => { const result = evaluateExpression(expression, scope); try { return Number(values(result.value, false)[0]); } finally { result.dispose(); } };
  assert.equal(one(is_missing(literal("OAK"))), 0);
  assert.equal(one(is_finite(literal("OAK"))), 1);
  assert.deepEqual(read(where(is_missing(literal("a")), 0.5, where(equal("g", literal("a")), 1, 0))), [1, 0, 0, 0, 1]);
  // 2026-10-22: a comparison of text constants (an input's value against literal("")) is
  // computed on the host at any depth; it crashed with "Invalid type for full".
  const { not_equal } = await import("../../src/lib/plot/utils/expressions.js");
  assert.deepEqual(read(where(not_equal(literal(""), literal("")), 1, where(equal("g", literal("a")), 2, 0))), [2, 0, 0, 0, 2]);
  assert.equal(one(equal(literal("x"), literal("x"))), 1);
  // A where() over text is a category per row; text against a number is an error naming both.
  const text = evaluateExpression(where(equal("g", literal("a")), literal("#e4572e"), literal("#3677a8")), scope);
  try { assert.deepEqual(text.value.categories, ["#e4572e", "#3677a8"]); assert.deepEqual(values(text.value.codes, false).map(Number), [0, 1, 1, 1, 0]); }
  finally { text.dispose(); }
  assert.throws(() => evaluateExpression(where(equal("g", literal("a")), literal("x"), 1), scope),
    /one branch is text and the other is a number \(1\)/);
  scope.dispose();
});

test("a brush on a plain string column selects by category, in the column's domain order", async () => {
  const { brushColumn } = await import("../../src/lib/plot/utils/interaction.js");
  const scope = createDataScope();
  scope.update({ g: ["b", "a", "b", "c", null] });
  const column = brushColumn(scope, "g", "x", "m");
  assert.equal(column.type, "categorical");
  assert.deepEqual(column.categories, ["b", "a", "c"]);
  assert.deepEqual(values(column.evaluateConstraint({ categories: ["a", "c"] })), [0, 1, 0, 1, 0]);
  assert.deepEqual(values(column.evaluateConstraint({ categories: ["b"] })), [1, 0, 1, 0, 0]);
  assert.deepEqual(values(column.evaluateConstraint({ categories: [] })), [0, 0, 0, 0, 0]);
  assert.deepEqual(values(column.array()), [0, 1, 0, 2, -1]);
  column.release();
  scope.dispose();
});

test("an aggregate's selection mask maps a Filter's rows back to the table", async () => {
  const { selectionMask } = await import("../../src/lib/plot/utils/interaction.js");
  const scope = createDataScope();
  scope.update({ k: [0, 1, 0, 2, 1, 2], v: [1, 2, 3, 4, 5, 6] });
  const filtered = await runTransform("Filter", scope, { where: { field: "v", op: "gt", value: 1 } });
  const grouped = await runTransform("Group", filtered, { by: "k" });
  scope.identity.selection.replace([3]);
  // Row 3 (k = 2) is the Filter's row 2, in the third group.
  assert.deepEqual(values(selectionMask(grouped, scope.identity.selection)), [0, 0, 1]);
  scope.identity.selection.replace([0]);
  // Row 0 is filtered out: no group has it.
  assert.deepEqual(values(selectionMask(grouped, scope.identity.selection)), [0, 0, 0]);
  grouped.dispose(); filtered.dispose(); scope.dispose();
});

// 17.2e: a root Data scope hands out interaction masks the caller owns. A transform that reads
// one must release it, or every rerun keeps a full-length mask alive.
test("Filter and Bin release the interaction masks they read from a root scope", async () => {
  const scope = createDataScope();
  scope.update({ x: [0, 1, 2, 3, 4, 5], v: [1, 2, 3, 4, 5, 6] });
  const owner = scope.identity;
  owner.brush.replace(owner, [1, 3], { phase: "committed" });
  const alive = (array) => { try { array.ref.dispose(); return true; } catch { return false; } };
  for (const [kind, config] of [["Filter", { where: "@brushed" }], ["Bin", { x: "x", bins: 3, weight: "@brushed" }]]) {
    const probe = owner.brush.mask(owner, owner.length);
    const view = await runTransform(kind, scope, config);
    await Promise.all(view.keys().filter((key) => !key.startsWith("@")).map(async (key) => {
      const value = view.get(key); const array = value?.codes ?? value; if (array instanceof JaxArray) await array.ref.data();
    }));
    view.dispose();
    // A new selection releases the cached mask; ours is then the only reference left.
    owner.brush.replace(owner, [2], { phase: "committed" });
    probe.dispose();
    assert.equal(alive(probe), false, `${kind} kept a reference to the @brushed mask`);
    owner.brush.replace(owner, [1, 3], { phase: "committed" });
  }
  scope.dispose();
});

test("onMembershipChange ignores status-only notifications such as a committed count", async () => {
  const { onMembershipChange } = await import("../../src/lib/plot/utils/interaction.js");
  const owner = { id: "o", length: 4 }, resource = selection(); resource.owner = owner;
  const calls = [];
  const stop = onMembershipChange(resource, (status) => calls.push(status.revision));
  const x = np.array([0, 1, 2, 3]);
  const descriptor = { identity: "x", name: "x", type: "numeric", bounds: [1, 2],
    evaluate: () => np.logicalAnd(x.ref.greaterEqual(1), x.ref.lessEqual(2)).astype(np.int32), release() {} };
  resource.setConstraints(owner, [descriptor]);
  assert.equal(calls.length, 1);
  // The committed count arrives asynchronously and re-notifies with the same revision.
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(resource.status().committedCount, 2);
  assert.equal(calls.length, 1);
  resource.clear(owner);
  assert.equal(calls.length, 2);
  stop(); resource.dispose(); x.dispose();
});

test("committing a brush preview keeps its membership: membership subscribers do not rerun", async () => {
  const { onMembershipChange } = await import("../../src/lib/plot/utils/interaction.js");
  const owner = { id: "p", length: 4 }, resource = selection(); resource.owner = owner;
  const x = np.array([0, 1, 2, 3]);
  const descriptor = (low, high) => ({ identity: "x", name: "x", type: "numeric", bounds: [low, high],
    evaluate: () => np.logicalAnd(x.ref.greaterEqual(low), x.ref.lessEqual(high)).astype(np.int32), release() {} });
  let calls = 0;
  const stop = onMembershipChange(resource, () => calls++);
  resource.setConstraints(owner, [descriptor(1, 2)], { phase: "preview" });
  resource.setConstraints(owner, [descriptor(1, 3)], { phase: "preview" });
  assert.equal(calls, 2);
  const before = resource.revision;
  resource.commitConstraintPreview(owner);
  assert.ok(resource.revision > before);
  assert.equal(calls, 2);
  assert.deepEqual(values(resource.mask(owner, 4)), [0, 1, 1, 1]);
  resource.cancelConstraintPreview(owner);
  resource.setConstraints(owner, [descriptor(0, 0)]);
  assert.equal(calls, 3);
  stop(); resource.dispose(); x.dispose();
});

test("a brush preview that selects the same rows notifies no one (a pointer-up repeats the last move)", () => {
  const owner = { id: "p", length: 4 }, resource = selection(); resource.owner = owner;
  const x = np.array([0, 1, 2, 3]);
  let released = 0;
  const descriptor = (low, high) => ({ identity: "x", name: "x", type: "numeric", frame: "root", axis: "x", origin: "plot", bounds: [low, high],
    evaluate: () => np.logicalAnd(x.ref.greaterEqual(low), x.ref.lessEqual(high)).astype(np.int32), release() { released++; } });
  const notified = [];
  const stop = resource.subscribe((status) => notified.push(status.previewRevision));
  resource.setConstraints(owner, [descriptor(1, 2)], { phase: "preview" });
  const [revision, membership] = [resource.previewRevision, resource.status().membership];
  resource.setConstraints(owner, [descriptor(1, 2)], { phase: "preview" });
  assert.deepEqual([resource.previewRevision, resource.status().membership], [revision, membership]);
  assert.equal(released, 1, "the unused repeat is released");
  resource.setConstraints(owner, [descriptor(1, 2)], { phase: "preview", replace: true });
  assert.equal(resource.previewRevision, revision);
  resource.setConstraints(owner, [descriptor(1, 3)], { phase: "preview" });
  assert.ok(resource.previewRevision > revision && resource.status().membership > membership);
  assert.equal(notified.length, 3);
  resource.commitConstraintPreview(owner);
  assert.deepEqual(values(resource.mask(owner, 4)), [0, 1, 1, 1]);
  stop(); resource.dispose(); x.dispose();
});


// The accepted preparation owns these resources; the handler installer only borrows them.
function eventFixture(props = {}) {
  const owner = { id: "events", length: 3 };
  const resources = { selection: selection(), hover: selection(), nearest: selection() };
  const binding = { revisions: { selection: 0, hover: 0, nearest: 0 } };
  const tooltips = [];
  installMarkInteractionEvents(props, {
    owner, scope: { length: owner.length }, ...resources, picksNearest: true,
    binding: () => binding, rows: event => event.rows ?? [event.sourceRow],
    tooltip: { show: event => tooltips.push(["show", event.sourceRow]), leave: () => tooltips.push(["leave"]) },
  });
  return { props, owner, binding, resources, tooltips, dispose: () => Object.values(resources).forEach(resource => resource.dispose()) };
}

test("hover changes preserve pending clicks, while newer clicks reject stale selection reads", async () => {
  const observed = [];
  const f = eventFixture({ onclick: () => observed.push([...f.resources.selection.rows(f.owner)]) });
  try {
    let resolve;
    const pending = f.props.onclick({ rows: new Promise(done => { resolve = done; }) });
    await f.props.onpointerenter({ sourceRow: 2 });
    f.props.onpointerleave({});
    resolve([1]); await pending;
    assert.deepEqual(observed, [[1]], "a hover change cannot discard a click");
    let stale;
    const late = f.props.onclick({ rows: new Promise(done => { stale = done; }) });
    await f.props.onclick({ sourceRow: 0 });
    stale([2]); await late;
    await f.props.onclick({ sourceRow: 1, nativeEvent: { shiftKey: true } });
    assert.deepEqual(observed, [[1], [0], [0, 1]], "only accepted clicks notify after membership changes");
    let missed;
    const cleared = f.props.onclick({ rows: new Promise(done => { missed = done; }) });
    f.props.onpointermissed({});
    missed([2]); await cleared;
    assert.deepEqual([...f.resources.selection.rows(f.owner)], []);
    let hovered;
    const entering = f.props.onpointerenter({ rows: new Promise(done => { hovered = done; }) });
    f.props.onpointerleave({});
    hovered([2]); await entering;
    assert.deepEqual([...f.resources.hover.rows(f.owner, "preview")], [], "leave rejects a pending hover");
  } finally { f.dispose(); }
});

// TODO 139.7: a pick whose rows were read while the table updated moves to the new rows, as the
// table's own selection does: by key, else by position within the new row count.
test("a late pick read across a table update lands on the same rows of the new table", async () => {
  const f = eventFixture();
  try {
    let resolve;
    // Keyed: rows b and c of [a, b, c] are rows 0 and 2 of [c, x, b].
    Object.assign(f.owner, { generation: 0, tokens: ["a", "b", "c"] });
    const clicked = f.props.onclick({ rows: new Promise((done) => { resolve = done; }) });
    Object.assign(f.owner, { generation: 1, tokens: ["c", "x", "b"] });
    resolve([1, 2]); await clicked;
    assert.deepEqual([...f.resources.selection.rows(f.owner)].sort(), [0, 2]);
    // A key no longer there selects nothing of it.
    const hovered = f.props.onpointerenter({ rows: new Promise((done) => { resolve = done; }) });
    Object.assign(f.owner, { generation: 2, tokens: ["x", "y", "z"] });
    resolve([0]); await hovered;
    assert.deepEqual([...f.resources.hover.rows(f.owner, "preview")], []);
    f.props.onpointerleave({});
    // Unkeyed (live rows of one length): by position.
    Object.assign(f.owner, { tokens: null });
    const nearest = f.props.onnearestenter({ sourceRow: 1, rows: new Promise((done) => { resolve = done; }) });
    f.owner.generation = 3;
    resolve([1]); await nearest;
    assert.deepEqual([...f.resources.nearest.rows(f.owner, "preview")], [1]);
  } finally { f.dispose(); }
});

test("plain click clears an exact source-row repeat; other picks replace and modifiers toggle", async () => {
  const f = eventFixture();
  const rows = () => [...f.resources.selection.rows(f.owner)].sort();
  const click = (picked, nativeEvent = {}) => f.props.onclick({ rows: picked, nativeEvent });
  try {
    await click([0, 1]); assert.deepEqual(rows(), [0, 1]);
    await click([1, 0]); assert.deepEqual(rows(), []);
    assert.equal(f.resources.selection.active, false);
    await click([0]); await click([1]); assert.deepEqual(rows(), [1]);
    await click([1]); assert.deepEqual(rows(), []);
    for (const modifier of ["shiftKey", "metaKey", "ctrlKey"]) {
      await click([0]);
      await click([1], { [modifier]: true }); assert.deepEqual(rows(), [0, 1]);
      await click([0]); assert.deepEqual(rows(), [0], "a subset replaces the multi-selection");
      await click([0], { [modifier]: true }); assert.deepEqual(rows(), []);
      f.props.onpointermissed({});
    }
    await click([1, 2]); f.props.onpointermissed({});
    assert.deepEqual(rows(), []); assert.equal(f.resources.selection.active, false);
  } finally { f.dispose(); }
});

test("nearest has an independent preview revision and a leave rejects a pending row read", async () => {
  const f = eventFixture();
  try {
    let resolve;
    const late = f.props.onnearestenter({ sourceRow: 1, rows: new Promise(done => { resolve = done; }) });
    f.props.onnearestleave();
    resolve([1]); await late;
    assert.deepEqual([...f.resources.nearest.rows(f.owner, "preview")], []);
    assert.deepEqual(f.tooltips, [["show", 1], ["leave"]]);
    let next;
    const entered = f.props.onnearestenter({ sourceRow: 2, rows: new Promise(done => { next = done; }) });
    f.props.onpointermissed({});
    next([2]); await entered;
    assert.deepEqual([...f.resources.nearest.rows(f.owner, "preview")], [2]);
    assert.deepEqual([...f.resources.nearest.rows(f.owner)], [], "nearest never commits the pointer preview");
    f.props.onnearestleave();
    assert.deepEqual([...f.resources.nearest.rows(f.owner, "preview")], []);
  } finally { f.dispose(); }
});

test("inactive row interactions preserve user handlers while a grid tooltip follows pointer moves", () => {
  const clicked = () => {};
  const props = { onclick: clicked, onpointerenter: clicked };
  const shown = [];
  installMarkInteractionEvents(props, { owner: undefined, scope: null,
    selection: null, hover: null, nearest: null, picksNearest: true,
    binding: () => null, rows: assert.fail,
    tooltip: { show: event => shown.push(event.sourceRow), move: event => shown.push(event.sourceRow), leave() {} } });
  assert.equal(props.onclick, clicked);
  assert.equal(props.onpointerenter, clicked);
  props.onnearestenter({ sourceRow: 1 });
  props.onnearestmove({ sourceRow: 2 });
  assert.deepEqual(shown, [1, 2]);
});

test("grouped location brushes select source events and event brushes highlight locations", async () => {
  const { count } = await import("../../src/lib/plot/utils/expressions.js");
  const { selectionMask } =
    await import("../../src/lib/plot/utils/interaction.js");
  const source = createDataScope();
  source.update({
    origin: ["A", "B", "A", "C", "B", "A"],
    lon: [-10, 10, -10, 20, 10, -10],
    lat: [40, 50, 40, 60, 50, 40],
    name: ["Alpha", "Beta", "Alpha", "Gamma", "Beta", "Alpha"],
    delay: [1, 20, 3, 40, 5, 6],
  });
  const grouped = await runTransform("Group", source, {
    by: ["origin", "lon", "lat", "name"],
    columns: { departing_flights: count() },
  });
  const column = brushColumn(grouped, "lon", "x", "airports");
  try {
    assert.equal(grouped.length, 3);
    assert.ok(
      column,
      "grouping-key provenance must preserve brushable source coordinates",
    );
    assert.deepEqual(
      values(column.evaluateConstraint({ bounds: [-15, 0] })),
      [1, 0, 1, 0, 0, 1],
    );
    assert.deepEqual(await interactionRows(grouped, [0]), [0, 2, 5]);
    source.identity.brush.replace(source.identity, [1, 3], {
      phase: "preview",
    });
    assert.deepEqual(
      values(selectionMask(grouped, source.identity.brush)),
      [0, 1, 1],
    );
    assert.deepEqual(values(grouped.get("departing_flights").ref), [3, 2, 1]);
  } finally {
    column?.release();
    grouped.dispose();
    source.dispose();
  }
});

test("group keys preserve brush identity through aliases but reductions and bin centers do not", async () => {
  const { bin, first } =
    await import("../../src/lib/plot/utils/expressions.js");
  const source = createDataScope();
  source.update({ x: [1, 1, 3, 3], y: [10, 20, 30, 40] });
  const views = [];
  try {
    const alias = await runTransform("Group", source, {
      by: "x",
      as: { x: "location" },
    });
    views.push(alias);
    assert.equal(alias.columnIdentity("location"), source.columnIdentity("x"));
    assert.equal(
      alias.hostColumn("location"),
      undefined,
      "an aggregate key is not a source-length host array",
    );
    const column = brushColumn(alias, "location", "x", "alias");
    try {
      assert.deepEqual(
        values(column.evaluateConstraint({ bounds: [0, 2] })),
        [1, 1, 0, 0],
      );
    } finally {
      column.release();
    }
    const overwritten = await runTransform("Group", source, {
      by: "x",
      columns: { reduced: first("y") },
    });
    views.push(overwritten);
    assert.notEqual(
      overwritten.columnIdentity("reduced"),
      source.columnIdentity("x"),
    );
    assert.equal(brushColumn(overwritten, "reduced", "x", "reduced"), null);
    const binned = await runTransform("Group", source, { by: bin("x", 2) });
    views.push(binned);
    assert.notEqual(binned.columnIdentity("x"), source.columnIdentity("x"));
    assert.equal(brushColumn(binned, "x", "x", "binned"), null);
  } finally {
    views.reverse().forEach((view) => view.dispose());
    source.dispose();
  }
});
