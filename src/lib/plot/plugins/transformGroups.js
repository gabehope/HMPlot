import { Array as JaxArray, numpy as np } from "@hmplot/jax";
import { asArray, shapeOf } from "../utils/data.js";
import { transformProvenance } from "./transformProvenance.js";

/** Run one padded kernel per visible group, then publish once. Kernels/cache are shared;
 * temporary group buffers and rejected results are released even when an async run aborts.
 */
export async function transformGroups(kind, definition, input, context) {
  const owned = [],
    output = [];
  const own = (value) => (owned.push(value), value);
  const adopt = (value) => {
    const array = value?.codes ?? value;
    if (array instanceof JaxArray) own(array);
  };
  const keep = (value) => (output.push(value), value);
  const check = () => {
    if (input.signal?.aborted) throw new DOMException("Canceled", "AbortError");
  };
  try {
    const [valid, codes] = await Promise.all([
      input.valid.ref.data(),
      input.groups?.codes.ref.data() ?? null,
    ]);
    const rows = new Map();
    for (let row = 0; row < valid.length; row++)
      if (valid[row]) {
        const group = codes?.[row] ?? 0;
        if (!rows.has(group)) rows.set(group, []);
        rows.get(group).push(row);
      }
    // One empty call gives the plugin a chance to declare its correctly shaped empty columns.
    if (!rows.size) rows.set(0, []);
    const batches = [],
      owners = [],
      mapped = [];
    let keys, mapping, geometry;
    for (const [group, indices] of [...rows].sort(([a], [b]) => a - b)) {
      check();
      const n = indices.length,
        length = n ? 2 ** Math.ceil(Math.log2(n)) : 0;
      const selected = own(input.array(indices, { dtype: "int32" }));
      const mask = own(
        input.array(
          Array.from({ length }, (_, i) => +(i < n)),
          { dtype: "int32" },
        ),
      );
      const gather = (column) => {
        const values = np.take(column.ref, selected.ref, 0);
        return own(
          length === n
            ? values
            : np.pad(
                values,
                values.shape.map((_, axis) => [0, axis ? 0 : length - n]),
              ),
        );
      };
      const columns = Object.create(null);
      for (const name of Object.keys(input.columns))
        Object.defineProperty(columns, name, {
          enumerable: true,
          configurable: true,
          get() {
            const padded = gather(input.columns[name]);
            Object.defineProperty(columns, name, {
              value: padded,
              enumerable: true,
            });
            return padded;
          },
        });
      const loaded = new Map();
      const column = (field) => {
        if (!loaded.has(field)) loaded.set(field, gather(input.column(field)));
        return loaded.get(field);
      };
      const result = await definition.run({
        ...input,
        columns,
        column,
        valid: mask,
        length,
        groups: null,
        grid: null,
        hostColumn: async (name) => {
          const values = await input.hostColumn(name);
          return Float64Array.from(indices, (row) => values[row]);
        },
      });
      for (const value of Object.values(result?.columns ?? {})) adopt(value);
      for (const value of Object.values(result?.provenance ?? {})) adopt(value);
      adopt(result?.rows);
      adopt(result?.valid);
      for (const value of Object.values(result?.resources ?? {})) adopt(value);
      for (const relation of ["nodes", "edges"])
        for (const value of Object.values(result?.[relation]?.columns ?? {}))
          adopt(value);
      check();
      if (
        !result?.columns ||
        result.grid ||
        result.nodes ||
        result.edges ||
        result.rows ||
        result.valid != null ||
        result.count !== undefined ||
        result.resources ||
        (result.provenance != null && result.provenance.rows == null)
      )
        throw Error(
          `${kind}: perGroup returns columns and optional provenance.rows; grouping supplies aggregate provenance.`,
        );
      const names = Object.keys(result.columns).sort();
      if (
        !names.length ||
        (keys && JSON.stringify(keys) !== JSON.stringify(names))
      )
        throw Error(
          `${kind}: every group must return the same nonempty set of columns.`,
        );
      keys = names;
      const count = shapeOf(
        result.columns[names[0]]?.codes ?? result.columns[names[0]],
      )[0];
      if (!Number.isInteger(count) || (!n && count !== 0))
        throw Error(`${kind}: an empty group must return empty columns.`);
      for (const name of names) {
        const value = result.columns[name];
        if (value?.codes)
          throw Error(
            `${kind}: perGroup output columns must be numeric; grouping keys may be categorical.`,
          );
        if (shapeOf(value)[0] !== count)
          throw Error(`${kind}: group columns must have equal row counts.`);
      }
      const hasMapping = result.provenance?.rows != null;
      if (mapping !== undefined && mapping !== hasMapping)
        throw Error(`${kind}: every group must use the same provenance form.`);
      mapping = hasMapping;
      if (hasMapping) {
        const links = await transformProvenance(
          kind,
          "newRows",
          result,
          { n, length, valid: mask, count, scope: { has: () => false } },
          { own },
        );
        mapped.push(own(np.take(selected.ref, links.order.ref, 0)));
      }
      if (batches.length && geometry !== result.geometry)
        throw Error(`${kind}: every group must return the same geometry.`);
      geometry = result.geometry;
      batches.push(result.columns);
      for (let row = 0; row < count; row++) owners.push(group);
    }
    const columns = {};
    for (const name of keys) {
      const arrays = batches.map((batch) => own(asArray(batch[name])));
      const shape = arrays[0].shape.slice(1);
      if (
        arrays.some(
          (array) =>
            JSON.stringify(array.shape.slice(1)) !== JSON.stringify(shape),
        )
      )
        throw Error(
          `${kind}: perGroup column "${name}" must have the same trailing shape in every group.`,
        );
      if (owners.length * shape.reduce((a, b) => a * b, 4) > context.maxBytes)
        throw Error(
          `${kind}: grouped output exceeds the GPU storage-buffer limit.`,
        );
      columns[name] = keep(
        np.concatenate(
          arrays.map((array) => array.ref),
          0,
        ),
      );
    }
    const ids = own(input.array(owners, { dtype: "int32" }));
    for (const [name, value] of Object.entries(input.groups?.keys ?? {})) {
      if (Object.hasOwn(columns, name))
        throw Error(
          `${kind}: output must not overwrite grouping column "${name}".`,
        );
      const array = keep(np.take((value.codes ?? value).ref, ids.ref, 0));
      columns[name] = value.codes ? { ...value, codes: array } : array;
    }
    const provenance = mapping
      ? {
          rows: keep(
            np.concatenate(
              mapped.map((array) => array.ref),
              0,
            ),
          ),
        }
      : {
          codes: keep(
            input.groups?.codes.ref ??
              np.zeros([input.length], { dtype: np.int32 }),
          ),
          ids: keep(ids.ref),
        };
    check();
    output.length = 0; // transfer all output references to the caller
    return { columns, provenance, geometry };
  } finally {
    for (const array of [...output, ...owned]) array.dispose();
  }
}
