import test from "node:test";
import assert from "node:assert/strict";
import { numpy as np, init, defaultDevice } from "@hmplot/jax";
import {
  scanCompact,
  sortCompact,
  scanBucket,
  sortBucket,
  scanBrackets,
  visibleNeighbors,
  searchBrackets,
} from "./candidates.js";
import { selected, bracketOracle, assertBrackets } from "./oracles.js";
import {
  deviceArray,
  deviceScalar,
} from "../../../../src/lib/plot/utils/deviceParams.js";
import { bucketSize } from "../../../../src/lib/plot/utils/transforms/filter.js";
import { experimentalBrackets, resetSearchCache } from "./runtime.js";

if (process.env.PRIMITIVE_DEVICE) {
  const devices = await init(process.env.PRIMITIVE_DEVICE);
  assert.ok(devices.includes(process.env.PRIMITIVE_DEVICE));
  defaultDevice(process.env.PRIMITIVE_DEVICE);
}

test("stable scan/scatter preserves order, retained ownership, chained provenance and bucket padding", async () => {
  for (const n of [0, 1, 2, 31, 32, 33, 127, 128, 129, 255, 256, 257, 513]) {
    const source = deviceArray(
      Int32Array.from({ length: n }, (_, i) => 1000 + i * 3),
      { dtype: "int32" },
    );
    try {
      for (const mode of ["none", "all", "sparse", "dense", "changed"]) {
        const host = Int32Array.from({ length: n }, (_, i) =>
          mode === "none"
            ? 0
            : mode === "all"
              ? 1
              : mode === "sparse"
                ? +(i % 19 === 0)
                : mode === "dense"
                  ? +(i % 19 !== 0)
                  : +((i + 5) % 7 < 3),
        );
        const expected = selected(host),
          mask = deviceArray(host, { dtype: "int32" });
        const retained = scanCompact(mask.ref, expected.length);
        const baseline = sortCompact(mask.ref, expected.length);
        assert.equal(
          mask.refCount,
          1,
          "candidate borrows retained caller reference",
        );
        mask.dispose();
        assert.deepEqual(Array.from(await baseline.data()), expected);
        assert.deepEqual(Array.from(await retained.ref.data()), expected);
        const mapping = np.take(source.ref, retained.ref, 0);
        assert.deepEqual(
          Array.from(await mapping.data()),
          expected.map((i) => 1000 + i * 3),
        );
        const childMask = deviceArray(
          Int32Array.from(
            { length: expected.length },
            (_, i) => +(i % 2 === 0),
          ),
          { dtype: "int32" },
        );
        const child = scanCompact(childMask, Math.ceil(expected.length / 2));
        assert.deepEqual(
          Array.from(await np.take(retained.ref, child, 0).data()),
          expected.filter((_, i) => i % 2 === 0),
        );
        retained.dispose();
        if (!n) continue;
        const size = Math.min(
          n,
          Math.max(1, 2 ** Math.ceil(Math.log2(Math.max(1, expected.length)))),
        );
        for (const method of [scanBucket, sortBucket]) {
          const [ids, shown] = method(
            deviceArray(host, { dtype: "int32" }),
            deviceScalar(expected.length, { dtype: "int32" }),
            size,
          );
          assert.deepEqual(
            Array.from(await ids.data()),
            Array.from(
              { length: size },
              (_, i) => expected[i] ?? expected[0] ?? 0,
            ),
          );
          assert.deepEqual(
            Array.from(await shown.data()),
            Array.from({ length: size }, (_, i) => +(i < expected.length)),
          );
        }
      }
    } finally {
      source.dispose();
    }
  }
  const cache = {};
  assert.deepEqual(
    [16383, 16384, 16385, 32767, 32768, 32769, 4095, 4095, 4095].map((count) =>
      bucketSize(cache, 500000, count),
    ),
    [16384, 16384, 32768, 32768, 32768, 65536, 65536, 65536, 16384],
  );
});

test("segmented search finds visible endpoints across holes, duplicates, empty segments and nonfinite times", async () => {
  const times = new Float32Array([
    0,
    1,
    1,
    3,
    NaN,
    0,
    2,
    4,
    -Infinity,
    2,
    Infinity,
  ]);
  const starts = new Int32Array([0, 5, 8, 11]),
    ends = new Int32Array([4, 7, 10, 10]);
  for (const host of [
    [1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1],
    Array(11).fill(0),
    [0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 1],
  ]) {
    for (const at of [-1, 0, 1, 1.5, 2, 3, 4, 5]) {
      const time = deviceArray(times),
        shown = deviceArray(host),
        position = np.arange(times.length).astype(np.float32);
      const start = deviceArray(starts, { dtype: "int32" }),
        end = deviceArray(ends, { dtype: "int32" });
      try {
        const neighbors = visibleNeighbors(time.ref, shown.ref, position.ref);
        const candidate = searchBrackets(
          time.ref,
          neighbors[0],
          neighbors[1],
          start.ref,
          end.ref,
          deviceScalar(at),
          5,
        );
        const baseline = scanBrackets(
          time.ref,
          shown.ref,
          position.ref,
          start.ref,
          end.ref,
          deviceScalar(at),
        );
        const expected = bracketOracle(times, host, starts, ends, at);
        assertBrackets(
          await Promise.all(candidate.map((a) => a.data())),
          expected,
          starts,
          ends,
        );
        assertBrackets(
          await Promise.all(baseline.map((a) => a.data())),
          expected,
          starts,
          ends,
        );
        globalThis.__primitiveMode = "search";
        globalThis.__historySteps = 5;
        globalThis.__maskEpoch = (globalThis.__maskEpoch ?? 0) + 1;
        for (let replay = 0; replay < 2; replay++) {
          const cached = experimentalBrackets(
            scanBrackets,
            time.ref,
            shown.ref,
            position.ref,
            start.ref,
            end.ref,
            deviceScalar(at),
          );
          assertBrackets(
            await Promise.all(cached.map((a) => a.data())),
            expected,
            starts,
            ends,
          );
        }
      } finally {
        resetSearchCache();
        [time, shown, position, start, end].forEach((a) => a.dispose());
      }
    }
  }
});
