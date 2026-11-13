// TODO 29.7: every group's reduction at once equals reduceValues over each group's mask.
import test from "node:test";
import assert from "node:assert/strict";
import { numpy as np, defaultDevice } from "@hmplot/jax";
import { reduceValues } from "../../src/lib/plot/utils/reduce.js";
import {
  groupReduce,
  REDUCER_OPS,
  inGroup,
} from "../../src/lib/plot/utils/transforms/statistics.js";

const read = async (array) => Array.from(await array.data(), Number);
const close = (actual, expected, label) =>
  actual.forEach((value, i) => {
    const e = expected[i];
    if (Number.isNaN(e))
      assert.ok(Number.isNaN(value), `${label}[${i}]: ${value}, expected NaN`);
    else
      assert.ok(
        Math.abs(value - e) <= 1e-4 * Math.max(1, Math.abs(e)),
        `${label}[${i}]: ${value}, expected ${e}`,
      );
  });

test("groupReduce equals reduceValues per group, for every reducer (NaN values, hidden rows, an empty group)", async () => {
  const n = 57,
    total = 5;
  // Group 3 has no rows; -1 rows (hidden) are in no group; every 7th value is NaN.
  const codes = np.array(
    Int32Array.from({ length: n }, (_, i) =>
      i % 9 === 4 ? -1 : [0, 1, 2, 4][i % 4],
    ),
    { dtype: np.int32 },
  );
  const values = np.array(
    Float32Array.from({ length: n }, (_, i) =>
      i % 7 === 2 ? NaN : Math.sin(i * 1.7) * 10,
    ),
  );
  for (const op of REDUCER_OPS)
    for (const input of op === "count" ? [values, null] : [values]) {
      const expected = [];
      for (let g = 0; g < total; g++) {
        const mask = inGroup(codes, g);
        expected.push(
          ...(await read(reduceValues(mask, input, op).reshape([1]))),
        );
        mask.dispose();
      }
      close(
        await read(groupReduce(codes, input, op, total)),
        expected,
        `${op}${input ? "" : " (rows)"}`,
      );
    }
  assert.deepEqual(await read(groupReduce(codes, values, "mean", 0)), []);
  codes.dispose();
  values.dispose();
});

test("hybrid grouped reductions preserve masked and empty groups across dispatch and batch boundaries", async () => {
  const previous = defaultDevice();
  try {
    for (const device of ["cpu", "wasm"]) {
      defaultDevice(device);
      // The old one-hot CPU interpreter is intentionally slow; its small cases are
      // covered above. Exercise both dispatch boundaries and the batch tail on WASM.
      const shapes =
        device === "cpu"
          ? [[16384, 512]]
          : [
              [16383, 512],
              [16384, 511],
              [16384, 512],
              [262145, 512],
            ];
      for (const [n, total] of shapes) {
        const hostCodes = Int32Array.from({ length: n }, (_, i) =>
          i % 41 === 0
            ? total
            : i % 17 === 0
              ? -1
              : i % 10
                ? 0
                : i % (total - 1),
        );
        const hostValues = Float32Array.from({ length: n }, (_, i) =>
          i % 13 === 0 ? NaN : i % 29 === 0 ? Infinity : ((i % 31) - 15) / 8,
        );
        const rows = Array.from({ length: total }, () => []);
        hostCodes.forEach((code, i) => {
          if (code >= 0 && code < total && Number.isFinite(hostValues[i]))
            rows[code].push(hostValues[i]);
        });
        const codes = np.array(hostCodes, { dtype: np.int32 }),
          values = np.array(hostValues);
        try {
          for (const op of [
            "count",
            "sum",
            "mean",
            "min",
            "max",
            "first",
            "last",
            "variance",
            "std",
            "any",
            "all",
          ]) {
            const expected = rows.map((row) => {
              const sum = row.reduce((a, b) => a + b, 0),
                mean = sum / row.length;
              if (op === "count") return row.length;
              if (op === "sum") return sum;
              if (op === "any") return Number(row.some(Boolean));
              if (op === "all") return Number(row.every(Boolean));
              if (!row.length) return NaN;
              if (op === "mean") return mean;
              if (op === "min")
                return row.reduce((a, b) => Math.min(a, b), Infinity);
              if (op === "max")
                return row.reduce((a, b) => Math.max(a, b), -Infinity);
              if (op === "first") return row[0];
              if (op === "last") return row.at(-1);
              const variance =
                row.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
                row.length;
              return op === "std" ? Math.sqrt(variance) : variance;
            });
            close(
              await read(groupReduce(codes, values, op, total)),
              expected,
              `${n}/${total} ${op}`,
            );
          }
        } finally {
          codes.dispose();
          values.dispose();
        }
      }
    }
  } finally {
    defaultDevice(previous);
  }
});
