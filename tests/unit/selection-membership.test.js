import test from "node:test";
import assert from "node:assert/strict";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { interactionRows, interactionScope, selectionMask } from "../../src/lib/plot/utils/interaction.js";
import { runTransform } from "../../src/lib/plot/utils/transforms.js";
import { col, evaluateExpression, expressionDescriptor, expressionFields, expressionFromDescriptor, greater, logical_and, logical_not, where } from "../../src/lib/plot/utils/expressions.js";
import { selection, selectionField } from "../../src/lib/plot/utils/interaction.js";
import { analyzeDependencies, interactionResources } from "../../src/lib/plot/utils/transforms/dependencies.js";

// TODO 139.1: one membership through every transform. Selecting an aggregate's row selects its
// contributors (original rows); an aggregate's row is a member while any contributor is. A direct
// resource (Filter(where=resource), respond), the data-owned field ("@selected") and an Interaction
// column ("@focus") read the same membership.

function values(array) {
  try { return Array.from(array.ref.js()).flat(Infinity).map(Number); }
  finally { array.dispose(); }
}
const borrowed = (array) => Array.from(array.ref.js()).flat(Infinity).map(Number);

/** Every route to one scope's membership of `resource`, which must agree. */
function memberships(scope, resource, aliased) {
  const direct = values(selectionMask(scope, resource));
  const field = borrowed(scope.get("@selected"));
  const alias = borrowed(aliased.get("@focus"));
  return { direct, field, alias };
}

async function pipeline() {
  const scope = createDataScope();
  // Rows 0..7: two keys and a value.
  scope.update({ a: ["x", "x", "y", "y", "z", "z", "z", "w"], b: ["p", "p", "p", "q", "q", "q", "r", "r"], v: [1, 2, 3, 4, 5, 6, 7, 8] });
  return scope;
}

test("membership agrees on rows, row transforms, an aggregate and nested aggregates", async () => {
  const scope = await pipeline(), resource = scope.identity.selection;
  resource.replace([2, 5]);
  const views = [], at = (view) => views.push(view) && view;
  const check = (view, expected, label) => {
    const aliased = interactionScope(view, { "@focus": resource });
    const found = memberships(view, resource, aliased);
    assert.deepEqual(found, { direct: expected, field: expected, alias: expected }, label);
  };
  try {
    check(scope, [0, 0, 1, 0, 0, 1, 0, 0], "rows");
    const filtered = at(await runTransform("Filter", scope, { where: { field: "v", op: "gt", value: 2 } }));
    check(filtered, [1, 0, 0, 1, 0, 0], "Filter");
    const sorted = at(await runTransform("Sort", filtered, { by: "v", order: "desc" }));
    check(sorted, [0, 0, 1, 0, 0, 1], "Sort");
    const calculated = at(await runTransform("Calculate", sorted, { columns: { w: col.v } }));
    check(calculated, [0, 0, 1, 0, 0, 1], "Calculate");
    // Group by a: groups x, y, z, w (in first appearance order).
    const grouped = at(await runTransform("Group", scope, { by: "a" }));
    check(grouped, [0, 1, 1, 0], "Group");
    // A row-preserving transform over an aggregate keeps its rows' membership.
    const bars = at(await runTransform("BarGeometry", grouped, { x: "a", y: "count" }));
    check(bars, [0, 1, 1, 0], "BarGeometry over Group");
    // Filtering aggregate results (count > 1) differs from filtering rows before aggregating.
    const big = at(await runTransform("Filter", grouped, { where: { field: "count", op: "gt", value: 1 } }));
    check(big, [0, 1, 1], "Filter of an aggregate");
    const before = at(await runTransform("Group", filtered, { by: "a" }));
    check(before, [1, 1, 0], "Group of a Filter");
    // Two successive aggregates: group by (a, b) (x p, y p, y q, z q, z r, w r), then by b. A second-level group is a member
    // while any original row under it is.
    const fine = at(await runTransform("Group", scope, { by: ["a", "b"] }));
    check(fine, [0, 1, 0, 1, 0, 0], "Group by a, b");
    const coarse = at(await runTransform("Group", fine, { by: "b" }));
    check(coarse, [1, 1, 0], "Group of a Group");
    // ... and through a filtered intermediate aggregate: (a, b) groups with count > 1.
    const kept = at(await runTransform("Filter", fine, { where: { field: "count", op: "gt", value: 1 } }));
    check(kept, [0, 1], "Filter of Group by a, b");
    const regrouped = at(await runTransform("Group", kept, { by: "b" }));
    check(regrouped, [0, 1], "Group of a filtered Group");
  } finally {
    for (const view of views.reverse()) view.dispose();
    scope.dispose();
  }
});

test("selecting an aggregate's row selects its original contributors, through nested aggregates", async () => {
  const scope = await pipeline(), views = [], at = (view) => views.push(view) && view;
  try {
    const grouped = at(await runTransform("Group", scope, { by: "a" }));
    assert.deepEqual(await interactionRows(grouped, [2]), [4, 5, 6]);
    const bars = at(await runTransform("BarGeometry", grouped, { x: "a", y: "count" }));
    assert.deepEqual(await interactionRows(bars, [2]), [4, 5, 6]);
    const fine = at(await runTransform("Group", scope, { by: ["a", "b"] }));
    const coarse = at(await runTransform("Group", fine, { by: "b" }));
    // Group b = "q": (y, q) and (z, q): rows 3, 4 and 5, never the intermediate group indices.
    assert.deepEqual((await interactionRows(coarse, [1])).sort(), [3, 4, 5]);
    const kept = at(await runTransform("Filter", fine, { where: { field: "count", op: "gt", value: 1 } }));
    const regrouped = at(await runTransform("Group", kept, { by: "b" }));
    // Kept (a, b) groups: (x, p) rows 0, 1 and (z, q) rows 4, 5; regrouped by b: p then q.
    assert.deepEqual((await interactionRows(regrouped, [1])).sort(), [4, 5]);
  } finally {
    for (const view of views.reverse()) view.dispose();
    scope.dispose();
  }
});

test("an aggregate reads its membership columns in expressions and Filter", async () => {
  const scope = await pipeline(), views = [], at = (view) => views.push(view) && view;
  scope.identity.selection.replace([0]);
  try {
    const grouped = at(await runTransform("Group", scope, { by: "a" }));
    assert.equal(grouped.has("@selected"), true);
    const evaluated = evaluateExpression(where("@selected", 1, 0), grouped);
    assert.deepEqual(borrowed(evaluated.value), [1, 0, 0, 0]);
    evaluated.dispose();
    const kept = at(await runTransform("Filter", grouped, { where: "@selected" }));
    assert.deepEqual(borrowed(kept.get("a").codes ?? kept.get("a")).length, 1);
  } finally {
    for (const view of views.reverse()) view.dispose();
    scope.dispose();
  }
});

test("a selection of another table's rows matches none of this table's", async () => {
  const first = await pipeline(), second = await pipeline();
  first.identity.selection.replace([1, 2]);
  try {
    assert.deepEqual(values(selectionMask(second, first.identity.selection)), [0, 0, 0, 0, 0, 0, 0, 0]);
  } finally { first.dispose(); second.dispose(); }
});

// TODO 139.3: a resource is an operand: per-row membership over the expression's own rows.
test("a selection resource is an expression operand: conditional, combined and negated", async () => {
  const scope = await pipeline(), views = [], at = (view) => views.push(view) && view;
  const focus = selection();
  focus.owner = scope.identity;
  const read = (expression, over) => {
    const evaluated = evaluateExpression(expression, over);
    try { return borrowed(evaluated.value).map((v) => Math.round(v * 100) / 100); }
    finally { evaluated.dispose(); }
  };
  try {
    focus.replace(scope.identity, [2, 5, 6]);
    assert.deepEqual(read(where(focus, 1, 0.15), scope), [0.15, 0.15, 1, 0.15, 0.15, 1, 1, 0.15]);
    assert.deepEqual(read(where(logical_and(focus, greater(col.v, 5)), 1, 0), scope), [0, 0, 0, 0, 0, 1, 1, 0]);
    assert.deepEqual(read(where(logical_not(focus), 1, 0), scope), [1, 1, 0, 1, 1, 0, 0, 1]);
    // Over an aggregate's rows: groups x, y, z, w, a member while any contributor is.
    const grouped = at(await runTransform("Group", scope, { by: "a" }));
    assert.deepEqual(read(where(focus, 1, 0), grouped), [0, 1, 1, 0]);
    // A Filter's expression with a resource; it reruns on the resource (a dependency).
    const kept = at(await runTransform("Filter", scope, { where: logical_and(focus, greater(col.v, 5)) }));
    assert.deepEqual(values(kept.sourceIndices()), [5, 6]);
    const analysis = analyzeDependencies({ expressions: [where(focus, 1, 0)] });
    assert.deepEqual([...interactionResources(analysis, grouped)], [focus]);
    // A preview (hover) reads live; clearing it reads the committed rows again.
    focus.replace(scope.identity, [0], { phase: "preview" });
    assert.deepEqual(read(where(focus, 1, 0), scope), [1, 0, 0, 0, 0, 0, 0, 0]);
    focus.cancelPreview(scope.identity);
    assert.deepEqual(read(where(focus, 1, 0), scope), [0, 0, 1, 0, 0, 1, 1, 0]);
    // A descriptor round trip in this runtime keeps the operand.
    const copy = expressionFromDescriptor(expressionDescriptor(where(focus, 1, 0)));
    assert.deepEqual(read(copy, scope), [0, 0, 1, 0, 0, 1, 1, 0]);
    assert.equal([...expressionFields(copy)].length, 1);
  } finally {
    for (const view of views.reverse()) view.dispose();
    focus.dispose();
    scope.dispose();
  }
});

// TODO 139.6: selection({by}) selects values, so every row with one of them matches, in any table
// that has the column; duplicates are group membership, missing values match nothing.
test("selection by a column links rows and tables by value", async () => {
  const genes = createDataScope(), samples = createDataScope(), other = createDataScope();
  genes.update({ gene: ["BRCA1", "TP53", "EGFR"], length: [10, 20, 30] });
  samples.update({ gene: ["TP53", "BRCA1", "TP53", null, "MYC"], value: [1, 2, 3, 4, 5] });
  other.update({ name: ["a", "b"] });
  const focus = selection({ by: "gene" }), views = [];
  try {
    assert.equal(focus.by, "gene");
    // A pick on the gene table selects its value: every sample with it matches.
    focus.replace(genes.identity, [1]);
    assert.deepEqual(values(selectionMask(genes, focus)), [0, 1, 0]);
    assert.deepEqual(values(selectionMask(samples, focus)), [1, 0, 1, 0, 0]);
    // A pick on a sample selects TP53 back in the genes table, and its duplicates.
    focus.replace(samples.identity, [2], { phase: "preview" });
    assert.deepEqual(values(selectionMask(genes, focus)), [0, 1, 0]);
    assert.deepEqual(values(selectionMask(samples, focus)), [1, 0, 1, 0, 0]);
    focus.cancelPreview(samples.identity);
    // A missing value selects nothing; a value one table lacks matches none of its rows.
    focus.replace(samples.identity, [3, 4]);
    focus.replace(genes.identity, []);
    assert.deepEqual(values(selectionMask(genes, focus)), [0, 0, 0]);
    assert.deepEqual(values(selectionMask(samples, focus)), [0, 0, 0, 0, 1]);
    // Through an aggregate: a group of samples is a member while one of its rows is.
    const grouped = await runTransform("Group", samples, { by: "gene" });
    views.push(grouped);
    focus.replace(genes.identity, [0]);
    focus.replace(samples.identity, []);
    assert.deepEqual(borrowed(grouped.get(selectionField(focus))), [0, 1, 0, 0]);
    // The table's values changing changes its members, the resource unchanged.
    samples.update({ gene: ["BRCA1", "BRCA1", "TP53", null, "MYC"], value: [1, 2, 3, 4, 5] });
    assert.deepEqual(values(selectionMask(samples, focus)), [1, 1, 0, 0, 0]);
    // A table without the column cannot read it.
    assert.throws(() => values(selectionMask(other, focus)), /no column "gene"/);
    assert.throws(() => selection({ by: ["a", "b"] }), /one column's name/);
  } finally {
    views.forEach((view) => view.dispose());
    genes.dispose(); samples.dispose(); other.dispose();
  }
});

test("a selection by value follows the writing table's new values", async () => {
  const genes = createDataScope(), samples = createDataScope();
  genes.update({ gene: ["A", "B"] });
  samples.update({ gene: ["A", "B", "B"] });
  const focus = selection({ by: "gene" });
  try {
    focus.replace(genes.identity, [0]);
    assert.deepEqual(values(selectionMask(samples, focus)), [1, 0, 0]);
    // Row 0 of the gene table is now B: the selected value follows it.
    genes.update({ gene: ["B", "A"] });
    assert.deepEqual(values(selectionMask(samples, focus)), [0, 1, 1]);
  } finally { genes.dispose(); samples.dispose(); }
});

test("a writing table's update notifies a selection by value, refreshing its readers' views", async () => {
  const genes = createDataScope(), samples = createDataScope();
  genes.update({ gene: ["A", "B"] });
  samples.update({ gene: ["A", "B", "B"], v: [1, 2, 3] });
  const focus = selection({ by: "gene" });
  let notified = 0;
  const stop = focus.subscribe(() => notified++);
  const grouped = await runTransform("Group", samples, { by: "gene" });
  try {
    focus.replace(genes.identity, [0]);
    assert.deepEqual(borrowed(grouped.get(selectionField(focus))), [1, 0]);
    const before = notified;
    genes.update({ gene: ["B", "A"] });
    await Promise.resolve();
    assert.ok(notified > before);
    assert.deepEqual(borrowed(grouped.get(selectionField(focus))), [0, 1]);
  } finally { stop(); grouped.dispose(); focus.dispose(); genes.dispose(); samples.dispose(); }
});

// TODO 139.8: a view's membership column follows its own resource's revision, so a hover does not
// recompute "@selected" (or another resource's column) on every view below a Group.
test("a hover recomputes only the hover's membership columns", async () => {
  const scope = await pipeline(), focus = selection();
  focus.owner = scope.identity;
  const grouped = await runTransform("Group", scope, { by: "a" });
  try {
    scope.identity.selection.replace([0]);
    focus.replace(scope.identity, [2]);
    const selected = grouped.get("@selected"), focused = grouped.get(selectionField(focus));
    scope.identity.hover.replace(scope.identity, [4], { phase: "preview" });
    const hovered = borrowed(grouped.get("@hovered"));
    assert.deepEqual(hovered, [0, 0, 1, 0]);
    assert.equal(grouped.get("@selected"), selected, "@selected kept its column");
    assert.equal(grouped.get(selectionField(focus)), focused, "another resource kept its column");
    scope.identity.selection.replace([7]);
    assert.notEqual(grouped.get("@selected"), selected);
    assert.deepEqual(borrowed(grouped.get("@selected")), [0, 0, 0, 1]);
  } finally { grouped.dispose(); focus.dispose(); scope.dispose(); }
});

test("a large aggregate's membership (the scatter path) matches its contributors", async () => {
  const { aggregateMembership } = await import("../../src/lib/plot/utils/interaction.js");
  const { numpy: np } = await import("@hmplot/jax");
  // 5,000 rows in 1,500 groups (more cells than the one-hot product's limit), one code missing.
  const rows = 5000, groups = 1500;
  const codes = Int32Array.from({ length: rows }, (_, i) => (i === 7 ? -1 : (i * 37) % groups));
  const mask = Int32Array.from({ length: rows }, (_, i) => (i % 211 === 0 || i === 7 ? 1 : 0));
  const expected = new Array(groups).fill(0);
  codes.forEach((code, i) => { if (code >= 0 && mask[i]) expected[code] = 1; });
  const info = { codes: np.array(codes, { dtype: np.int32 }) };
  const maskArray = np.array(mask, { dtype: np.int32 });
  try {
    assert.deepEqual(values(aggregateMembership(info, maskArray, groups)), expected);
    // Output rows naming groups by id, one past the rows (a padded aggregate's spare capacity).
    const ids = np.array([3, 0, groups - 1, rows + 5], { dtype: np.int32 });
    assert.deepEqual(values(aggregateMembership({ ...info, ids }, maskArray, 4)), [expected[3], expected[0], expected[groups - 1], 0]);
    ids.dispose();
  } finally { info.codes.dispose(); maskArray.dispose(); }
});
