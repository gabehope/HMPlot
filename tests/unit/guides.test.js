import test from "node:test";
import assert from "node:assert/strict";
import {
  toggleSeries,
  seriesEntries,
} from "../../src/lib/plot/utils/guides.js";
import { validateUncertainty } from "../../src/lib/plot/utils/uncertainty.js";
import { SWATCH_BY_KIND } from "../../src/lib/plot/utils/guides.js";
import { readFileSync, readdirSync } from "node:fs";
test("legend toggling and repeat isolation restore the previous visibility", () => {
  const state = [true, false, true],
    make = () =>
      state.map((visible, i) => ({
        id: String(i),
        visible,
        handle: { setVisible: (v) => (state[i] = v) },
      }));
  const saved = toggleSeries(make(), "1", true, null);
  assert.deepEqual(state, [false, true, false]);
  toggleSeries(make(), "1", true, saved);
  assert.deepEqual(state, [true, false, true]);
  toggleSeries(make(), "0", false, null);
  assert.deepEqual(state, [false, false, true]);
});
test("automatic legends require labels and allow opt out; explicit handles retain entries", () => {
  const mark = (id, labeled, participates) => ({
    kind: "mark",
    entry: () => ({ id, labeled, participates }),
  });
  const entries = [
    mark("a", true, true),
    mark("b", false, true),
    mark("c", true, false),
  ];
  assert.deepEqual(
    seriesEntries({ kind: "plot", entries: () => entries }, true).map(
      (e) => e.id,
    ),
    ["a"],
  );
  assert.equal(seriesEntries(entries).length, 3);
  assert.deepEqual(seriesEntries(undefined), []);
});
test("uncertainty shape validation is complete before replacing data", () => {
  assert.equal(validateUncertainty("band", [0, 1, 2], 0, [1, 2, 3]), 3);
  assert.equal(
    validateUncertainty(
      "errors",
      [
        [0, 1],
        [2, 3],
      ],
      [0, 1],
      [2, 4],
      "x",
    ),
    2,
  );
  assert.throws(
    () => validateUncertainty("band", [0, 1], [0], [2, 3]),
    /length 2/,
  );
  assert.throws(
    () => validateUncertainty("errors", [[0, 1]], 0, 1, "z"),
    /axis/,
  );
  assert.throws(() => validateUncertainty("errors", [0, 1], 0, 1), /N×2/);
});

// 2026-10-22: the legend swatch follows the kind every mark object declares (exportKind), so no
// mark falls back to a circle because its material is not a line material.
test("every declared mark kind has a legend swatch", () => {
  const dir = new URL("../../src/lib/plot/objects/", import.meta.url);
  const kinds = new Set();
  for (const file of readdirSync(dir))
    for (const match of readFileSync(new URL(file, dir), "utf8").matchAll(/exportKind\s*=\s*(?:[^"?]*\?\s*)?"([a-z-]+)"(?:\s*:\s*"([a-z-]+)")?/g))
      for (const kind of [match[1], match[2]]) if (kind) kinds.add(kind);
  kinds.delete("anchor"); // draws nothing, has no legend entry
  assert.ok(kinds.size >= 12, [...kinds].join(", "));
  for (const kind of kinds) assert.ok(SWATCH_BY_KIND[kind], `${kind} has a swatch`);
  assert.equal(SWATCH_BY_KIND.segments, "line");
  assert.equal(SWATCH_BY_KIND.prism, "area");
});
