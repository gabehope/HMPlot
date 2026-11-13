import { numpy as np, Array as JaxArray } from "@hmplot/jax";
import { asArray, shapeOf } from "./data.js";
import {
  createDataView,
  categoryColumn,
  dataBufferLimit,
  snapshotDataScope,
} from "./dataView.js";
import { isCategory } from "./categorical.js";
import { normalizeFacetSpec, pairCells, facetError } from "./facetSpec.js";
import { limitError } from "./limits.js";

/**
 * A Facet's cells: {cells, columns, fieldIdentities, inputIdentities, dispose}. Each cell is
 * {key, row, column, label, view} (+ gridRow/gridColumn for pairs; `field` for fields and Fold
 * cells, `axisFields` for pairs: the facet's field a cell shows, for scales="field").
 * `fieldIdentities` maps the column identity of each of the facet's fields to its name;
 * `inputIdentities` holds the identities of the input's columns.
 */
export async function partitionFacets(
  scope,
  config,
  { signal = undefined } = {},
) {
  const fold = scope.fold?.output === scope ? scope.fold : null;
  const spec = normalizeFacetSpec(config, { fold });
  if (spec.kind === "pairs") return partitionPairCells(scope, spec);
  if (spec.kind === "fold") return partitionFold(scope, spec);
  if (spec.kind === "fields") return partitionFields(scope, spec, { signal });
  return partitionCategories(scope, spec, { signal });
}

/** The scales="field" lookups of a partition over `scope` whose fields are `fields`. */
export function facetMetadata(scope, fields = []) {
  const identity = (key) => scope.columnIdentity?.(key);
  return {
    fieldIdentities: new Map(
      fields
        .map((field) => [identity(field), field])
        .filter(([id]) => id !== undefined),
    ),
    inputIdentities: new Set(
      scope
        .keys()
        .map(identity)
        .filter((id) => id !== undefined),
    ),
  };
}

/**
 * A scope's `scale` with aliases: `aliases[name]` stands for `name`, also with a scale suffix
 * (`value:shape` -> `bill_length:shape`), so an alias shares its field's category scales.
 */
export function aliasScale(parent, aliases) {
  return (key, palette) => {
    for (const [name, target] of Object.entries(aliases))
      if (key === name || key.startsWith(name + ":"))
        return parent.scale(target + key.slice(name.length), palette);
    return parent.scale(key, palette);
  };
}

/**
 * Each pairs cell aliases its two fields as x/y without changing rows. The input is borrowed;
 * each view retains the snapshot it needs, and the returned partition owns all cell views.
 * Metadata and scale aliases use the same policy as the other Facet partition modes here.
 */
function partitionPairCells(scope, spec) {
  const { pairs, names } = spec;
  const { cells: places, columns } = pairCells(pairs, {
    rowOrder: spec.rowOrder,
    columnOrder: spec.columnOrder,
  });
  const fields = [...new Set([...pairs.x, ...pairs.y])];
  for (const field of fields) {
    if (!scope.has(field))
      throw Error(facetError("missingField", { prop: "pairs", field }));
    const value = scope.get(field);
    if (categoryColumn(value) || shapeOf(value).length !== 1)
      throw Error(facetError("pairsNumeric", { field }));
  }
  const base = snapshotDataScope(scope);
  const metadata = facetMetadata(base, fields);
  const cells = [];
  try {
    for (const place of places) {
      const view = createDataView(base, {
        columns: {
          [names.x]: base.get(place.x),
          [names.y]: base.get(place.y),
        },
        columnMetadata: {
          [names.x]: base.metadata?.(place.x),
          [names.y]: base.metadata?.(place.y),
        },
      });
      view.fieldIdentity = { [names.x]: place.x, [names.y]: place.y };
      view.pipeline = [];
      view.scale = aliasScale(base, { [names.x]: place.x, [names.y]: place.y });
      cells.push({
        key: JSON.stringify([place.y, place.x]),
        row: place.y,
        column: place.x,
        gridRow: place.gridRow,
        gridColumn: place.gridColumn,
        label: place.y + " · " + place.x,
        axisFields: { x: place.x, y: place.y },
        view,
      });
    }
  } catch (error) {
    cells.forEach((cell) => cell.view.dispose());
    throw error;
  } finally {
    base.dispose();
  }
  return {
    cells,
    columns: columns.length,
    ...metadata,
    dispose() {
      cells.forEach((cell) => cell.view.dispose());
    },
  };
}

/** One cell per category (or pair of categories) of row and column. */
async function partitionCategories(
  scope,
  { row, column, rowOrder, columnOrder, wrap },
  { signal },
) {
  const metadata = facetMetadata(scope);
  scope = snapshotDataScope(scope);
  const owned = [],
    cells = [],
    own = (a) => (owned.push(a), a);
  function field(key, order) {
    if (!key)
      return {
        domain: [null],
        codes: own(np.zeros([scope.length], { dtype: np.int32 })),
      };
    // A precomputed dictionary column (Partition's composite group code) stands in for a
    // column name; it has no scale of its own to extend.
    const source = typeof key === "string" ? scope.get(key) : key;
    if (!categoryColumn(source) && !order)
      throw Error(
        `Facet ${key} needs categorical values or an explicit order.`,
      );
    const categories =
        source.categories ??
        (source instanceof JaxArray
          ? order
          : [...new Set(source)].filter(isCategory)),
      domain =
        order ??
        source.categories ??
        (scope.scale(key).include(categories), scope.scale(key).domain);
    if (
      new Set(domain).size !== domain.length ||
      domain.some((v) => !isCategory(v))
    )
      throw Error("Facet order must contain unique category values.");
    const map = new Map(domain.map((v, i) => [v, i]));
    let codes;
    if (source.categories) {
      const lookup = own(
        np.array([-1, ...categories.map((v) => map.get(v) ?? -1)], {
          dtype: np.int32,
        }),
      );
      const input = own(asArray(source.codes).astype(np.float32));
      const valid = own(
        np.logicalAnd(
          np.logicalAnd(
            input.ref.greaterEqual(0),
            input.ref.less(categories.length),
          ),
          input.ref.equal(np.floor(input.ref)),
        ),
      );
      codes = own(
        np.take(
          lookup.ref,
          np.where(valid.ref, input.ref.add(1), 0).astype(np.int32),
          0,
        ),
      );
    } else if (source instanceof JaxArray) {
      codes = own(np.full([scope.length], -1, { dtype: np.int32 }));
      domain.forEach((v, i) => {
        codes = own(np.where(source.ref.equal(Number(v)), i, codes.ref));
      });
    } else
      codes = own(
        np.array(
          source.map((v) => map.get(v) ?? -1),
          { dtype: np.int32 },
        ),
      );
    if (typeof key === "string") scope.scale(key).include(categories);
    return { domain, codes };
  }
  try {
    const rows = field(row, rowOrder),
      cols = field(column, columnOrder),
      count = rows.domain.length * cols.domain.length,
      n = scope.length;
    if (Math.max(count * 8, n * 16) > dataBufferLimit())
      throw limitError("storage", {
        component: "Facet",
        what: "its cell index",
        count: Math.max(count * 8, n * 16),
        limit: dataBufferLimit(),
      });
    const valid = own(
      np.logicalAnd(
        rows.codes.ref.greaterEqual(0),
        cols.codes.ref.greaterEqual(0),
      ),
    );
    const code = own(
      np
        .where(
          valid.ref,
          rows.codes.ref.mul(cols.domain.length).add(cols.codes.ref),
          count,
        )
        .astype(np.int32),
    );
    const order = own(np.argsort(code.ref)),
      sorted = own(np.take(code.ref, order.ref, 0)),
      targets = own(np.arange(count).astype(np.int32));
    async function search(after) {
      let lo = np.zeros([count], { dtype: np.int32 }),
        hi = np.full([count], n, { dtype: np.int32 });
      for (let step = 0; n && step < Math.ceil(Math.log2(n + 1)); step++) {
        if (signal?.aborted) {
          lo.dispose();
          hi.dispose();
          throw new DOMException("Canceled", "AbortError");
        }
        const mid = np
            .floor(lo.ref.add(hi.ref).astype(np.float32).mul(0.5))
            .astype(np.int32),
          value = np.take(sorted.ref, np.minimum(mid.ref, n - 1), 0),
          active = lo.ref.less(hi.ref);
        const go = after
          ? value.ref.lessEqual(targets.ref)
          : value.ref.less(targets.ref);
        const nextLo = np.where(
            np.logicalAnd(active.ref, go.ref),
            mid.ref.add(1),
            lo,
          ),
          nextHi = np.where(np.logicalAnd(active, np.logicalNot(go)), mid, hi);
        value.dispose();
        lo = nextLo;
        hi = nextHi;
      }
      hi.dispose();
      return lo;
    }
    const lo = own(await search(false)),
      hi = own(await search(true));
    // These are compact partition offsets, not observations or plotting attributes.
    const ranges = await np.stack([lo.ref, hi.ref], 1).data();
    for (let r = 0; r < rows.domain.length; r++)
      for (let c = 0; c < cols.domain.length; c++) {
        if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
        const i = r * cols.domain.length + c,
          indices = order.ref.slice([ranges[2 * i], ranges[2 * i + 1]]);
        const view = createDataView(scope, { indices });
        view.pipeline = [];
        view.onDispose = () => indices.dispose();
        const rv = rows.domain[r],
          cv = cols.domain[c];
        cells.push({
          key: JSON.stringify([rv, cv]),
          row: rv,
          column: cv,
          label: [rv, cv]
            .filter((v) => v !== null)
            .map(String)
            .join(" · "),
          view,
        });
      }
    return {
      cells,
      columns: Math.max(1, wrap ?? (column ? cols.domain.length : 1)),
      ...metadata,
      dispose() {
        cells.forEach((c) => c.view.dispose());
      },
    };
  } catch (e) {
    cells.forEach((c) => c.view.dispose());
    throw e;
  } finally {
    owned.forEach((a) => a.dispose());
    scope.dispose();
  }
}

/**
 * Facet by a Fold's key, built like pairs cells: one cell per folded field (in the Fold's order, or
 * the facet order), each a view over the Fold's SOURCE rows whose value column is that field
 * and whose key column names it on every row. `fieldIdentity` forwards the value column to the
 * field, so a strip brush in a cell constrains the real field, and every cell shows the
 * original observations, so selection, hover, and connections line up by row across cells.
 */
function partitionFold(
  scope,
  { fold, row, column, rowOrder, columnOrder, wrap },
) {
  const order = (row ? rowOrder : columnOrder) ?? fold.fields;
  if (new Set(order).size !== order.length || order.some((v) => !isCategory(v)))
    throw Error("Facet order must contain unique category values.");
  const cells = [],
    source = snapshotDataScope(fold.source),
    n = source.length;
  try {
    scope.scale(fold.key).include(fold.fields);
    for (const value of order) {
      const index = fold.fields.indexOf(value);
      let view;
      if (index < 0) {
        // An ordered value that is not a field is an empty cell, as for any Facet.
        const indices = np.zeros([0], { dtype: np.int32 });
        view = createDataView(scope, { indices });
        view.onDispose = () => indices.dispose();
      } else {
        const field = fold.fields[index],
          codes = np.full([n], index, { dtype: np.int32 });
        view = createDataView(source, {
          columns: {
            [fold.value]: source.get(field),
            [fold.key]: { codes, categories: fold.fields },
          },
          columnMetadata: { [fold.value]: source.metadata?.(field) },
        });
        view.fieldIdentity = { [fold.value]: field };
        // The key keeps the Fold's identity, so color="key" is one scale across the cells.
        const identity = view.columnIdentity,
          name = view.columnName;
        view.columnIdentity = (key) =>
          key === fold.key ? scope.columnIdentity?.(key) : identity(key);
        view.columnName = (key) =>
          key === fold.key
            ? scope.columnName
              ? scope.columnName(key)
              : key
            : name(key);
        view.onDispose = () => codes.dispose();
      }
      view.pipeline = [];
      cells.push({
        key: JSON.stringify(row ? [value, null] : [null, value]),
        row: row ? value : null,
        column: row ? null : value,
        label: String(value),
        field: index < 0 ? null : value,
        view,
      });
    }
  } catch (e) {
    cells.forEach((c) => c.view.dispose());
    throw e;
  } finally {
    source.dispose();
  }
  return {
    cells,
    columns: Math.max(1, wrap ?? (column ? cells.length : 1)),
    ...facetMetadata(fold.source, fold.fields),
    dispose() {
      cells.forEach((c) => c.view.dispose());
    },
  };
}

/**
 * Facet fields: one cell per listed field over the same rows (all of them, or one category's
 * with a split on the other dimension). Inside a cell `value` (names.value) IS the field's
 * column, so its identity, metadata and category scales are the field's and a strip brush
 * constrains the field; `field` (names.field) names the field on every row, one categorical
 * column across the cells. The order of the fields dimension picks and orders fields; a value
 * that is not one of them is an empty cell.
 */
async function partitionFields(scope, spec, { signal }) {
  const { dimension, list } = spec.fields,
    names = spec.names;
  for (const field of list)
    if (!scope.has(field))
      throw Error(facetError("missingField", { prop: "fields", field }));
  const order =
      (dimension === "row" ? spec.rowOrder : spec.columnOrder) ?? list,
    split = dimension === "row" ? spec.column : spec.row;
  const metadata = facetMetadata(scope, list),
    identity = `derived:${scope.identity?.id ?? "unowned"}:facet-fields:${JSON.stringify(list)}:${JSON.stringify(names.field)}`,
    // The field column's category scales, kept on the input under a key no column can have.
    fieldScale = `\u0000facet-fields:${JSON.stringify(list)}`;
  // The row groups the fields repeat over: all rows, or one per category of the split.
  let groups, release;
  if (split) {
    const partition = await partitionCategories(
      scope,
      {
        row: dimension === "column" ? spec.row : null,
        column: dimension === "row" ? spec.column : null,
        rowOrder: dimension === "column" ? spec.rowOrder : undefined,
        columnOrder: dimension === "row" ? spec.columnOrder : undefined,
      },
      { signal },
    );
    groups = partition.cells.map((cell) => ({
      value: dimension === "column" ? cell.row : cell.column,
      view: cell.view,
    }));
    release = () => partition.dispose();
  } else {
    const base = snapshotDataScope(scope);
    groups = [{ value: null, view: base }];
    release = () => base.dispose();
  }
  const cells = [];
  function cell(group, value, row, column) {
    const parent = group.view,
      index = list.indexOf(value),
      owned = [];
    const own = (array) => (owned.push(array), array);
    const n = index < 0 ? 0 : parent.length;
    const view = createDataView(parent, {
      ...(index < 0
        ? { indices: own(np.zeros([0], { dtype: np.int32 })) }
        : {}),
      columns: {
        [names.value]:
          index < 0
            ? own(np.zeros([0], { dtype: np.float32 }))
            : parent.get(value),
        [names.field]: {
          codes: own(np.full([n], Math.max(index, 0), { dtype: np.int32 })),
          categories: list,
        },
      },
      // Listed even when undefined, so a shadowed table column's metadata does not leak.
      columnMetadata: {
        [names.value]: index < 0 ? undefined : parent.metadata?.(value),
        [names.field]: undefined,
      },
    });
    if (index >= 0) view.fieldIdentity = { [names.value]: value };
    const columnIdentity = view.columnIdentity,
      columnName = view.columnName;
    view.columnIdentity = (key) =>
      key === names.field ? identity : columnIdentity(key);
    // The label column is named by its own key (`field`, or its `as` name).
    view.columnName = (key) =>
      key === names.field ? names.field : columnName(key);
    view.scale = aliasScale(
      parent,
      index < 0
        ? { [names.field]: fieldScale }
        : { [names.value]: value, [names.field]: fieldScale },
    );
    view.pipeline = [];
    view.onDispose = () => owned.forEach((array) => array.dispose());
    return {
      key: JSON.stringify([row, column]),
      row,
      column,
      label: [row, column]
        .filter((v) => v !== null)
        .map(String)
        .join(" · "),
      field: index < 0 ? null : value,
      view,
    };
  }
  try {
    scope.scale(fieldScale).include(list);
    if (dimension === "column")
      for (const group of groups) {
        if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
        for (const value of order)
          cells.push(cell(group, value, group.value, value));
      }
    else
      for (const value of order) {
        if (signal?.aborted) throw new DOMException("Canceled", "AbortError");
        for (const group of groups)
          cells.push(cell(group, value, value, group.value));
      }
  } catch (e) {
    cells.forEach((c) => c.view.dispose());
    throw e;
  } finally {
    // The cells retain their row groups.
    release();
  }
  return {
    cells,
    columns: Math.max(
      1,
      dimension === "column"
        ? (spec.wrap ?? order.length)
        : split
          ? groups.length
          : (spec.wrap ?? 1),
    ),
    ...metadata,
    dispose() {
      cells.forEach((c) => c.view.dispose());
    },
  };
}
