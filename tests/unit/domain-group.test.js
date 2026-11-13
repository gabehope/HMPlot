import test from "node:test";
import assert from "node:assert/strict";
import { createDomainGroup } from "../../src/lib/plot/utils/domainGroup.js";

// TODO 136.14: LinkViews' plots share one union domain on their linked axes.
test("a domain group gives every member the union of their reports, in each one's time origin", () => {
  const group = createDomainGroup(["x"]);
  const given = { a: [], b: [] };
  const a = group.join({ apply: (axis, bounds) => given.a.push([axis, bounds && [...bounds]]) });
  const b = group.join({ apply: (axis, bounds) => given.b.push([axis, bounds && [...bounds]]) });
  a.report("x", [0, 10]);
  b.report("x", [5, 20]);
  assert.deepEqual(given.a.at(-1), ["x", [0, 20]]);
  assert.deepEqual(given.b.at(-1), ["x", [0, 20]]);
  // An axis the group does not share is not reported; an unchanged report gives nothing new.
  const count = given.a.length;
  a.report("y", [100, 200]);
  a.report("x", [0, 10]);
  assert.equal(given.a.length, count);
  // The union shrinks when a report does: it never holds what the group gave.
  b.report("x", [5, 8]);
  assert.deepEqual(given.a.at(-1), ["x", [0, 10]]);
  // Datetime axes count from their own origins: b's 0 is a's 1000.
  b.report("x", [0, 50], 1000);
  assert.deepEqual(given.a.at(-1), ["x", [0, 1050]]);
  assert.deepEqual(given.b.at(-1), ["x", [-1000, 50]]);
  // A member that leaves is given nothing, and the others lose its report.
  b.leave();
  assert.deepEqual(given.b.at(-1), ["x", null]);
  assert.deepEqual(given.a.at(-1), ["x", [0, 10]]);
});
