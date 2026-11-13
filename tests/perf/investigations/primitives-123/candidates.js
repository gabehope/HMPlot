// Isolated experiments. No production caller imports this module. JAX arguments are consumed.
import { numpy as np, lax, jit } from "@hmplot/jax";
import {
  runningMax,
  suffixMin,
} from "../../../../src/lib/plot/utils/numeric/scans.js";

export const scanCompact = jit(
  (mask, size) => {
    const n = mask.shape[0];
    if (!n || !size) {
      mask.dispose();
      return np.zeros([size], { dtype: np.int32 });
    }
    const selected = mask.greater(0).astype(np.int32);
    const exclusive = np.cumsum(selected.ref).sub(selected.ref);
    // -1 is deliberately out of range. Hidden updates must never target a selected row.
    const destinations = np
      .where(selected.greater(0), exclusive, -1)
      .astype(np.int32);
    return lax.scatter(np.arange(n).astype(np.int32), destinations, [size], {
      mode: "update",
    });
  },
  { staticArgnums: [1] },
);

export const sortCompact = jit(
  (mask, size) => {
    if (mask.shape[0] <= 1) {
      mask.dispose();
      return np.zeros([size], { dtype: np.int32 });
    }
    return np
      .argsort(np.logicalNot(mask.greater(0)).astype(np.int32))
      .slice([0, size]);
  },
  { staticArgnums: [1] },
);

export const scanBucket = jit(
  (mask, count, size) => {
    const indices = scanCompact(mask, size);
    const shown = np.arange(size).astype(np.int32).less(count);
    return [
      np.where(shown.ref, indices.ref, indices.slice([0, 1])),
      shown.astype(np.int32),
    ];
  },
  { staticArgnums: [2] },
);

export const sortBucket = jit(
  (mask, count, size) => {
    const order = np.argsort(mask.equal(0).astype(np.int32)).slice([0, size]);
    const shown = np.arange(size).astype(np.int32).less(count);
    return [
      np.where(shown.ref, order.ref, order.slice([0, 1])),
      shown.astype(np.int32),
    ];
  },
  { staticArgnums: [2] },
);

// Exact baseline from Slice's bracket kernel, including its cross-segment sentinels.
export const scanBrackets = jit((time, shown, position, start, end, at) => {
  const kept = shown.greater(0);
  const lo = np.take(
    runningMax(
      np.where(
        np.logicalAnd(time.ref.lessEqual(at.ref), kept.ref),
        position.ref,
        -Infinity,
      ),
    ),
    end,
    0,
  );
  const hi = np.take(
    suffixMin(
      np.where(np.logicalAnd(time.greaterEqual(at), kept), position, Infinity),
    ),
    start,
    0,
  );
  return [lo, hi];
});

// Amortized only while topology AND effective visibility stay fixed. These two full-history
// scans must be rebuilt for changed masks; they are measured separately and in changing runs.
export const visibleNeighbors = jit((time, shown, position) => {
  const kept = np.logicalAnd(shown.greater(0), np.logicalNot(np.isnan(time)));
  return [
    runningMax(np.where(kept.ref, position.ref, -Infinity)),
    suffixMin(np.where(kept, position, Infinity)),
  ];
});

// Segment-restricted left/right bounds, then nearest visible neighbors. Empty/hidden segments
// produce the same validity as scanBrackets, although invalid endpoint sentinels can differ.
export const searchBrackets = jit(
  (time, previous, next, start, end, at, maxHistory) => {
    const n = time.shape[0];
    const bound = (right) => {
      let low = start.ref,
        high = end.ref.add(1);
      for (let span = maxHistory; span > 0; span = Math.floor(span / 2)) {
        const mid = np
          .floor(
            low.ref
              .astype(np.float32)
              .add(high.ref.astype(np.float32))
              .mul(0.5),
          )
          .astype(np.int32);
        const value = np.take(time.ref, np.clip(mid.ref, 0, n - 1), 0);
        const below = right ? value.lessEqual(at.ref) : value.less(at.ref);
        const advance = np.logicalAnd(low.ref.less(high.ref), below);
        low = np.where(advance.ref, mid.ref.add(1), low);
        high = np.where(advance, high, mid);
      }
      high.dispose();
      return low;
    };
    const left = bound(false),
      right = bound(true).sub(1);
    const lo = np.where(
      right.ref.greaterEqual(start.ref),
      np.take(previous, np.clip(right, 0, n - 1).astype(np.int32), 0),
      -Infinity,
    );
    const hi = np.where(
      left.ref.lessEqual(end.ref),
      np.take(next, np.clip(left, 0, n - 1).astype(np.int32), 0),
      Infinity,
    );
    time.dispose();
    at.dispose();
    start.dispose();
    end.dispose();
    return [lo, hi];
  },
  { staticArgnums: [6] },
);
