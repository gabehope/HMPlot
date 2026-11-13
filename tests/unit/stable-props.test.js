import test from "node:test";
import assert from "node:assert/strict";
import { stable } from "../../src/lib/scene/stableProps.js";

test("resolved props keep equal values as the same objects and replace changed ones whole", () => {
  const expression = { $expression: { op: "add", args: [1, 2] } };
  const previous = {
    domain: [0, 1],
    when: new Date(5),
    placement: { x: 1, y: 2 },
    expression,
    size: 3,
  };
  const same = {
    domain: [0, 1],
    when: new Date(5),
    placement: { x: 1, y: 2 },
    expression: { $expression: { op: "add", args: [1, 2] } },
    size: 3,
  };
  assert.equal(
    stable(same, previous),
    previous,
    "all equal: the previous props themselves",
  );
  const next = stable(
    { ...same, placement: { x: 1, y: 3 }, size: 4 },
    previous,
  );
  assert.notEqual(next, previous);
  assert.equal(next.domain, previous.domain);
  assert.equal(next.when, previous.when);
  assert.equal(next.expression, previous.expression);
  assert.deepEqual(next.placement, { x: 1, y: 3 });
  assert.equal(next.size, 4);
  // Enabling exports adds a callback; unchanged settings must retain their identities.
  const added = stable({ ...same, exportHTML() {} }, previous);
  assert.equal(added.domain, previous.domain);
  assert.equal(added.placement, previous.placement);
  const removed = stable({ placement: { x: 1, y: 2 } }, added);
  assert.deepEqual(Object.keys(removed), ["placement"]);
  assert.equal(removed.placement, previous.placement);
  const renamed = stable({ replacement: undefined }, { original: undefined });
  assert.deepEqual(Object.keys(renamed), ["replacement"]);
  const nested = { placement: { x: { a: 1 }, y: 2 } },
    changed = { placement: { x: { a: 1 }, y: 3 } };
  assert.equal(
    stable(changed, nested).placement,
    changed.placement,
    "a changed nested value is new as a whole",
  );
  class Resource {}
  const resource = new Resource();
  assert.equal(
    stable({ table: resource }, { table: new Resource() }).table,
    resource,
    "class instances are not compared",
  );
  const long = Array.from({ length: 300 }, (_, i) => i);
  assert.equal(
    stable({ values: long }, { values: [...long] }).values,
    long,
    "lists over 256 are not compared",
  );
});
