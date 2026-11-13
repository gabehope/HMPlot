// TODO 29.1: pointer handlers map an instance to its source row without needless readbacks.
import test from "node:test";
import assert from "node:assert/strict";
import { Array as JaxArray } from "@hmplot/jax";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { prepareNamed } from "../../src/lib/plot/utils/namedData.js";
import { runTransform } from "../../src/lib/plot/utils/transforms.js";
import { optionsRoot } from "../../src/lib/options/options.js";

const scopeOf = (table) => {
  const scope = createDataScope();
  scope.update(table);
  return scope;
};
/** Array.data calls during `run`. */
async function readbacks(run) {
  const data = JaxArray.prototype.data;
  let reads = 0;
  JaxArray.prototype.data = function (...args) {
    reads++;
    return data.apply(this, args);
  };
  try {
    await run();
  } finally {
    JaxArray.prototype.data = data;
  }
  return reads;
}
const prepare = (scope, handlers) =>
  prepareNamed(
    { x: "x", y: "x", ...handlers },
    scope,
    optionsRoot.splitUnique("Pointer rows test"),
    "Points",
    { auto: {}, hidden: {} },
  );

test("on the root scope a pointer event is its source row, with no readback", async () => {
  const scope = scopeOf({ x: Float32Array.from([5, 6, 7, 8]) });
  let seen;
  const prepared = prepare(scope, { onclick: (event) => (seen = event) });
  const reads = await readbacks(() =>
    prepared.props.onclick({ instanceId: 2 }),
  );
  assert.equal(reads, 0);
  assert.deepEqual([seen.instanceId, seen.rowIndex, seen.sourceRow], [2, 2, 2]);
  prepared.dispose();
  scope.dispose();
});

test("on a Filter's rows, preparing reads nothing and an event reads its source row once", async () => {
  const scope = scopeOf({ x: Float32Array.from([5, 6, 7, 8]) });
  const filtered = await runTransform("Filter", scope, {
    where: { field: "x", op: "gt", value: 5.5 },
  });
  let seen, prepared;
  assert.equal(
    await readbacks(
      () =>
        (prepared = prepare(filtered, { onclick: (event) => (seen = event) })),
    ),
    0,
  );
  // The Filter keeps rows 1, 2 and 3: its row 1 is source row 2.
  assert.equal(
    await readbacks(() => prepared.props.onclick({ instanceId: 1 })),
    1,
  );
  assert.deepEqual([seen.instanceId, seen.rowIndex, seen.sourceRow], [2, 1, 2]);
  prepared.dispose();
  filtered.dispose();
  scope.dispose();
});
