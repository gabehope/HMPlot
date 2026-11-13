import { numpy as np } from "@hmplot/jax";
import { asArray as inputArray } from "./data.js";
export function geoArray(value) {
  const clean = (v) => (Array.isArray(v) ? v.map(clean) : v == null ? NaN : v);
  return inputArray(Array.isArray(value) ? clean(value) : value);
}
const asArray = geoArray;
import { createDataScope } from "./categorical.js";
import { geoTable } from "./geoData.js";
import { keyValues, joinRows } from "./tableJoin.js";

// Bounded feature-to-row matching. Only duplicate-key diagnostics leave the GPU.
export async function geoRows(
  features,
  scope,
  column,
  featureKey,
  dataKey,
  signal,
) {
  const check = () => {
    if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
  };
  check();
  if ((featureKey === undefined) !== (dataKey === undefined))
    throw Error(
      "featureKey and dataKey go together: featureKey names the feature property and dataKey the data column that matches it; pass both, or neither.",
    );
  if (featureKey !== undefined) {
    if (!scope?.has(dataKey)) throw Error(`Missing join column: ${dataKey}`);
    // Features to measurement rows through the join plan (TODO 43.5): the measurements' keys on
    // the host (their host values, or one readback) and a Map over them, O(features + rows).
    // Keys match exactly: a feature key "12" does not match the number 12.
    const keys = features.map((f) =>
      featureKey === "$id" ? f.id : f.properties?.[featureKey],
    );
    const { values } = await keyValues(scope, dataKey, { atRows: true });
    check();
    return np.array(
      joinRows([keys], [values], {
        owner: "GeoJSON",
        mismatch: false,
        duplicate: (value) => `Duplicate measurement key: ${String(value)}`,
      }),
      { dtype: np.int32 },
    );
  }
  if (column?.indices) {
    const ids = column.indices,
      out = [],
      block = Math.max(
        1,
        Math.min(
          128,
          Math.floor((16 * 1024 * 1024) / Math.max(1, ids.shape[0])),
        ),
      );
    if (!ids.shape[0])
      return np.full([features.length], -1, { dtype: np.int32 });
    try {
      for (let i = 0; i < features.length; i += block) {
        check();
        const match = np
          .arange(i, Math.min(features.length, i + block))
          .astype(np.int32)
          .reshape([-1, 1])
          .equal(ids.ref.reshape([1, -1]));
        out.push(
          np.where(
            np.any(match.ref, 1),
            np.argmax(match, 1).astype(np.int32),
            -1,
          ),
        );
        await out.at(-1).blockUntilReady();
        check();
      }
      const result = np.concatenate(
        out.map((a) => a.ref),
        0,
      );
      return result;
    } finally {
      out.forEach((a) => a.dispose());
    }
  }
  return np.arange(features.length).astype(np.int32);
}
export function geoScope(
  features,
  parent,
  rows,
  joined,
  indexed,
  identity = undefined,
) {
  const base = createDataScope({ identity });
  base.update(geoTable({ type: "FeatureCollection", features }));
  const releaseParent = parent?.retain?.();
  rows = rows.ref;
  let references = 1;
  const owned = [],
    cache = new Map(),
    own = (a) => (owned.push(a), a);
  const get = (key) => {
    if (cache.has(key)) return cache.get(key);
    if (!((joined || indexed) && parent?.has(key))) return base.get(key);
    const input = parent.get(key);
    if (input?.isGeometryColumn) return input;
    const dictionary = input?.categories;
    let data;
    if (dictionary)
      data = { codes: gather(input.codes, -1), categories: dictionary };
    else if (
      Array.isArray(input) &&
      input.some((v) => typeof v === "string" || typeof v === "boolean")
    ) {
      const categories = [...new Set(input.filter((v) => v != null))];
      data = {
        codes: gather(
          input.map((v) => categories.indexOf(v)),
          -1,
        ),
        categories,
      };
    } else data = gather(input, np.nan);
    cache.set(key, data);
    return data;
  };
  function gather(input, missing) {
    const a = own(asArray(input));
    if (!a.shape[0])
      return own(np.full([features.length, ...a.shape.slice(1)], missing));
    const take = own(
      np.take(a.ref, np.maximum(rows.ref, 0).astype(np.int32), 0),
    );
    return own(
      np.where(
        a.shape.length > 1
          ? rows.ref.greaterEqual(0).reshape([-1, 1])
          : rows.ref.greaterEqual(0),
        take.ref,
        missing,
      ),
    );
  }
  const linked = Boolean((joined || indexed) && parent?.identity);
  const aggregate = linked && Boolean(parent.aggregate);
  let provenance;
  if (aggregate && parent.provenance?.codes) {
    const ids =
      parent.provenance.ids?.ref ?? np.arange(parent.length).astype(np.int32);
    const mapped = own(
      parent.length
        ? np
            .where(
              rows.ref.greaterEqual(0),
              np.take(ids.ref, np.maximum(rows.ref, 0), 0),
              -1,
            )
            .astype(np.int32)
        : np.full([features.length], -1, { dtype: np.int32 }),
    );
    ids.dispose();
    provenance = { ...parent.provenance, ids: mapped };
  }
  const dispose = () => {
    if (--references) return;
    owned.forEach((a) => a.dispose());
    rows.dispose();
    base.dispose();
    releaseParent?.();
  };
  return {
    length: features.length,
    identity: linked ? parent.identity : base.identity,
    identityRows: !linked,
    aggregate,
    provenance,
    parent,
    async contributors(index) {
      const row = Number((await rows.ref.slice([index, index + 1]).data())[0]);
      return row >= 0
        ? parent.contributors(row)
        : np.zeros([0], { dtype: np.int32 });
    },
    metadata: (key) =>
      linked && parent.has(key) ? parent.metadata?.(key) : base.metadata?.(key),
    columnName: (key) =>
      linked && parent.has(key) ? (parent.columnName?.(key) ?? key) : key,
    sourceIndices() {
      if (!linked) return null;
      const source = parent.sourceIndices?.();
      if (!source) return rows.ref;
      try {
        return source.shape[0]
          ? np
              .where(
                rows.ref.greaterEqual(0),
                np.take(source.ref, np.maximum(rows.ref, 0), 0),
                -1,
              )
              .astype(np.int32)
          : np.full([features.length], -1, { dtype: np.int32 });
      } finally {
        source.dispose();
      }
    },
    retain() {
      references++;
      let held = true;
      return () => {
        if (held) {
          held = false;
          dispose();
        }
      };
    },
    has: (key) => ((joined || indexed) && parent?.has(key)) || base.has(key),
    get,
    resolve(v) {
      return typeof v === "string" && this.has(v) ? get(v) : v;
    },
    scale: (k) => parent?.scale(k) ?? base.scale(k),
    encode: (...args) => base.encode(...args),
    dispose,
  };
}
export function featureAttribute(value, ids, count, owned) {
  if (
    value === undefined ||
    typeof value === "number" ||
    typeof value === "string"
  )
    return value;
  const a = asArray(value);
  owned.push(a);
  if (a.shape[0] !== count)
    throw Error(
      `GeoJSON attributes require ${count} feature values; received ${a.shape[0]}.`,
    );
  const result = np.take(a.ref, ids.ref, 0);
  owned.push(result);
  return result;
}
