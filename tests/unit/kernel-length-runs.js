// The runs kernel-lengths.test.js and tests/slow/kernel-lengths-large.test.js measure: a
// transform (alone, or after a Filter) over a table of n rows, every output read.
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";
import { runTransform } from "../../src/lib/plot/utils/transforms.js";

const LEVELS = [0.1, 0.2, 0.3, 0.7, 0.8, 0.9];
export const table = (n) => ({
  x: Float32Array.from({ length: n }, (_, i) => LEVELS[i % 6]),
  y: Float32Array.from({ length: n }, (_, i) => ((i * 37) % 101) / 100),
  group: Array.from({ length: n }, (_, i) => `g${i % 6}`),
  id: Array.from({ length: n }, (_, i) => `s${i % 4}`),
  t: Float32Array.from({ length: n }, (_, i) => Math.floor(i / 4)),
});
const read = async (value) => {
  const array = value?.codes ?? value;
  // `.ref` takes a reference: test for the method on the array itself.
  if (typeof array?.data === "function") await array.ref.data();
};
async function readAll(view) {
  const physical = view.padded?.();
  for (const key of view.keys()) if (!key.startsWith("@")) await read((physical ?? view).get(key));
}
export const run = (kind, config, n, filter) => async () => {
  const scope = createDataScope();
  scope.update(table(n));
  const filtered = filter ? await runTransform("Filter", scope, { where: { field: "y", op: "gt", value: 0.3 } }) : scope;
  const view = await runTransform(kind, filtered, config);
  try { await readAll(view); } finally { view.dispose(); if (filter) filtered.dispose(); scope.dispose(); }
};

