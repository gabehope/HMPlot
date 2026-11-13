import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { exportClosure } from "../../src/lib/scene/exportClosure.js";

const { state, cases } = JSON.parse(
  readFileSync(
    new URL("./fixtures/export-closure.json", import.meta.url),
    "utf8",
  ),
);
const nodeIds = (node) => [node.id, ...node.children.flatMap(nodeIds)];

for (const { name, target, keeps, rejects } of cases)
  test(`HTML export closure: ${name}`, () => {
    if (rejects)
      return assert.throws(
        () => exportClosure(state, target),
        new RegExp(rejects),
      );
    const { state: kept, omitted } = exportClosure(state, target);
    const actual = { nodes: nodeIds(kept.root).sort(), omitted };
    for (const resource of [
      "tables",
      "columns",
      "scales",
      "normalizations",
      "themes",
      "selections",
      "identities",
    ])
      actual[resource] = Object.keys(kept[resource]).sort();
    assert.deepEqual(
      actual,
      Object.fromEntries(Object.keys(actual).map((key) => [key, keeps[key]])),
    );
    assert.ok(
      kept.root.children.every(function clean(node) {
        return node.events.length === 0 && node.children.every(clean);
      }),
    );
  });
