import * as jax from "@hmplot/jax";
import { asArray, shapeOf } from "../utils/data.js";
import { runDefinition } from "../utils/transforms/runner.js";
import { categoryPositions } from "../utils/grouping.js";
import { limitError } from "../utils/limits.js";
import { inputGroups, cachedArray } from "../utils/transforms/common.js";
import { categoryColumn, numericColumn } from "../utils/dataView.js";
import { isCoordinate, normalizeGrid } from "../utils/gridModel.js";
import { coordinateColumn } from "../utils/gridTable.js";
import {
  transformParameters,
  parameterProblem,
  parameterDependencies,
  parameterFields,
} from "./parameters.js";
import { transformJit } from "./transformJit.js";
import { transformGrid } from "./transformGrid.js";
import { pluginGraph, protectGraphIdentity } from "./transformGraph.js";

import { transformMask } from "./transformMask.js";
import { transformGroups } from "./transformGroups.js";
import { transformProvenance } from "./transformProvenance.js";
import {
  transformArray,
  transformHostColumn,
  transformGeometry,
} from "./transformGeometry.js";
import { pluginInspection } from "./inspection.js";
import { outputMetadata } from "./outputs.js";

const { numpy: np, Array: JaxArray } = jax;
const INTERNAL = new Set([
  "name",
  "label",
  "as",
  "by",
  "__viewState",
  "__categoryOrder",
]);

/** Fields and expressions use the same schema as validation and Python metadata. */
export function pluginTransformDependencies(definition, config, scope) {
  const { fields, expressions } = parameterDependencies(
    definition.parameters ?? {},
    config,
    scope ? Boolean(transformGrid(scope)) : undefined,
  );
  fields.push(
    ...(Array.isArray(config.by) ? config.by : config.by ? [config.by] : []),
  );
  return { fields, expressions };
}

/** Adapt a plugin's borrowed inputs/owned results to the existing publication owner.
 * Keep this numerical module independent of the rendering library entry point.
 */
export async function runPluginTransform(
  kind,
  definition,
  scope,
  config,
  options,
) {
  const schema = definition.parameters ?? {};
  const grid = transformGrid(scope);
  const params = transformParameters(
    kind,
    schema,
    Object.fromEntries(
      Object.entries(config).filter(
        ([name]) => !INTERNAL.has(name) && !name.startsWith("__"),
      ),
    ),
    Boolean(grid),
  );
  const problem = parameterProblem(kind, schema, params);
  if (problem) throw Error(problem);
  const gridPath = definition.reads === "grid";
  if (gridPath && !grid)
    throw Error(`${kind}: pass a grid table; this transform reads a grid.`);
  const output =
    typeof definition.output === "function"
      ? definition.output({ params, grid })
      : definition.output;
  if (!["sameRows", "subset", "newRows", "graph"].includes(output))
    throw Error(`${kind}: unsupported output ${JSON.stringify(output)}.`);
  if (
    definition.perGroup &&
    (output !== "newRows" || definition.reads === "grid")
  )
    throw Error(`${kind}: perGroup requires newRows output and row inputs.`);
  return runDefinition(
    kind,
    {
      fields: parameterFields(schema, params),
      reads: grid || definition.reads === "padded" ? "rows" : "compacted",
      buckets: () => !grid,
      output: (_config, result) =>
        output === "newRows"
          ? result.order
            ? "newRows"
            : "aggregate"
          : output === "graph"
            ? "aggregate"
            : output,
      repeatsRows: output === "newRows",
      async run(input, aligned, context) {
        const params = transformParameters(
          kind,
          schema,
          Object.fromEntries(
            Object.entries(aligned).filter(
              ([name]) => !INTERNAL.has(name) && !name.startsWith("__"),
            ),
          ),
          Boolean(grid),
        );
        const n = input.length;
        const length = gridPath ? n : n ? 2 ** Math.ceil(Math.log2(n)) : 0;
        if (length * 4 > context.maxBytes)
          throw Error(
            `${kind}: padded columns exceed the GPU storage-buffer limit; use fewer rows.`,
          );
        const pad = (array) =>
          length === n
            ? array
            : np.pad(
                array,
                array.shape.map((_, axis) => [0, axis ? 0 : length - n]),
              );
        const valid = context.own(
          pad(
            input.valid ? input.valid.ref : np.ones([n], { dtype: np.int32 }),
          ),
        );
        const paddedColumn = (field, mode, build) => {
          const make = () => pad(build());
          // Like Sort's key cache: immutable column identity plus source generation proves
          // that a new visibility mask did not change the underlying values. Never cache
          // interaction columns or externally supplied row arrays on their identity alone.
          if (
            typeof field !== "string" ||
            field.startsWith("@") ||
            input.scope.identity?.generation == null
          )
            return context.own(make());
          return context.own(
            cachedArray(
              context.cache,
              `pluginColumn:${mode}:${field}`,
              [
                n,
                length,
                input.scope.identity.generation,
                input.scope.get(field),
              ],
              make,
            ),
          );
        };
        const columns = Object.create(null);
        for (const name of input.scope.keys())
          Object.defineProperty(columns, name, {
            enumerable: true,
            configurable: true,
            get() {
              const value =
                input.scope.encodedColumn?.(name) ?? input.scope.get(name);
              const array = categoryColumn(value) ? value.codes : value;
              if (!shapeOf(array).length || shapeOf(array)[0] !== n)
                throw Error(
                  `${kind}: column "${name}" must contain one value per row.`,
                );
              const loaded = paddedColumn(name, "encoded", () =>
                asArray(array),
              );
              Object.defineProperty(columns, name, {
                value: loaded,
                enumerable: true,
              });
              return loaded;
            },
          });
        const loadedColumns = new Map();
        const column = (field) => {
          if (!loadedColumns.has(field))
            loadedColumns.set(
              field,
              paddedColumn(field, "numeric", () =>
                numericColumn(input.scope, field),
              ),
            );
          return loadedColumns.get(field);
        };
        const hostColumn = async (field) => {
          if (typeof field === "string")
            return transformHostColumn(kind, input.scope, field);
          const value = field;
          if (value instanceof JaxArray)
            return Array.from(await value.ref.data());
          return Array.from(value);
        };
        const groups =
          config.by == null
            ? null
            : await inputGroups(context.cache, input, config.by);
        if (groups) context.cleanup(() => groups.dispose());
        const inputs = {
          columns,
          array: (values, options) =>
            transformArray(kind, values, options, context.maxBytes),
          column,
          hostColumn,
          length,
          valid,
          masked: Boolean(input.valid),
          params,
          signal: context.signal,
          maxBytes: context.maxBytes,
          checkBytes(
            bytes,
            {
              what = "its output",
              hint = "Use fewer rows or a lower resolution.",
            } = {},
          ) {
            if (
              !Number.isFinite(bytes) ||
              bytes < 0 ||
              bytes > context.maxBytes
            )
              throw limitError("storage", {
                component: kind,
                what,
                count: bytes,
                limit: context.maxBytes,
                hint,
              });
          },
          jit: transformJit(context.cache, context.cleanup),
          cache: context.cache,
          jax,
          relation: scope.graphRelation ?? null,
          grid: transformGrid(input.scope, context.own),
          groups: groups && {
            codes: context.own(pad(groups.codes.ref)),
            count: groups.count,
            keys: groups.keys,
            positions: (field) => {
              if (!Object.hasOwn(groups.keys, field))
                throw Error(`${kind}: positions needs a grouping field.`);
              return context.own(
                categoryPositions(groups.keys[field], config.__categoryOrder),
              );
            },
          },
        };
        const result = definition.perGroup
          ? await transformGroups(kind, definition, inputs, context)
          : await definition.run(inputs);
        // Take every returned device reference before validating or checking cancellation.
        // Invalid output and an aborted async run must release their results too.
        const adopt = (value) => {
          const array = value?.codes ?? value;
          if (array instanceof JaxArray) context.own(array);
        };
        for (const value of Object.values(result?.columns ?? {})) adopt(value);
        for (const relation of ["nodes", "edges"])
          for (const value of Object.values(result?.[relation]?.columns ?? {}))
            adopt(value);
        adopt(result?.rows);
        adopt(result?.valid);
        for (const value of Object.values(result?.provenance ?? {}))
          adopt(value);
        const inspect = pluginInspection(
          kind,
          definition,
          params,
          result?.resources,
          context,
        );
        if (!result || typeof result !== "object")
          throw Error(
            `${kind}: run must return an object containing columns or rows.`,
          );
        if (result.provenance != null && output !== "newRows")
          throw Error(`${kind}: return provenance only with newRows output.`);
        if (output === "graph") return pluginGraph(kind, result, context);
        if (output === "sameRows")
          protectGraphIdentity(kind, scope, result.columns ?? {}, config.as);
        const published = {};
        let count;
        for (const [name, value] of Object.entries(result.columns ?? {})) {
          const shape = shapeOf(value?.codes ?? value);
          if (
            !shape.length ||
            (output === "sameRows" &&
              shape[0] !== length &&
              !(grid && shape[0] === n))
          )
            throw Error(
              `${kind}: output column "${name}" must have ${output === "sameRows" ? length : "one-dimensional"} values.`,
            );
          if (
            output !== "sameRows" &&
            count !== undefined &&
            shape[0] !== count
          )
            throw Error(
              `${kind}: output columns must have the same number of rows.`,
            );
          count = shape[0];
          if (shape.reduce((a, b) => a * b, 4) > context.maxBytes)
            throw Error(
              `${kind}: output column "${name}" exceeds the GPU storage-buffer limit.`,
            );
          if (output === "sameRows" && shape[0] !== n) {
            const array = context.own(
              asArray(value?.codes ?? value).slice([0, n]),
            );
            published[name] = value?.codes ? { ...value, codes: array } : array;
          } else published[name] = value;
        }
        if (output === "newRows" && count === undefined)
          throw Error(`${kind}: newRows must return at least one column.`);
        const links = await transformProvenance(
          kind,
          output,
          result,
          { n, length, valid, count, scope: input.scope },
          context,
        );
        count = links.count;
        const mask = transformMask(kind, output, result, count, context.own);
        if (
          result.topology !== undefined &&
          typeof result.topology !== "string" &&
          !(
            typeof result.topology === "number" &&
            Number.isFinite(result.topology)
          )
        )
          throw Error(
            `${kind}: topology must be a stable string or finite number.`,
          );
        const inputGrid = input.scope.grid;
        const overwritten =
          inputGrid &&
          Object.keys(published).find((name) => isCoordinate(inputGrid, name));
        const alias = (name) =>
          config.as &&
          typeof config.as === "object" &&
          !Array.isArray(config.as)
            ? (config.as[name] ?? name)
            : name;
        const outputGrid =
          result.grid == null
            ? null
            : normalizeGrid(
                {
                  ...result.grid,
                  dims: result.grid.dims.map((dim) => ({
                    ...dim,
                    name: alias(dim.name),
                  })),
                  fields: Object.keys(published)
                    .filter((name) => !isCoordinate(result.grid, name))
                    .map(alias),
                },
                count,
              );
        if (outputGrid && output !== "newRows")
          throw Error(`${kind}: return a new grid only with newRows output.`);
        // Lazy columns already use the published names. Explicitly returned
        // coordinate columns take precedence over generated columns.
        const lazyColumns =
          outputGrid &&
          Object.fromEntries(
            result.grid.dims
              .filter((dim) => !Object.hasOwn(published, dim.name))
              .map((dim) => [
                alias(dim.name),
                () => coordinateColumn(outputGrid, alias(dim.name)),
              ]),
          );
        return {
          columns: published,
          columnMetadata: outputMetadata(
            kind,
            definition.outputs,
            params,
            published,
            input.scope,
          ),
          ...links,
          ...mask,
          grid:
            outputGrid ??
            (output !== "sameRows" || overwritten ? null : undefined),
          lazyColumns,
          view: {
            ...(result.topology === undefined
              ? {}
              : { topology: result.topology }),
            ...transformGeometry(kind, result.geometry, published, count ?? n),
            ...(inspect ? { inspect } : {}),
            ...(overwritten
              ? {
                  gridDropped: `${kind}: output overwrote coordinate "${overwritten}".`,
                }
              : {}),
          },
        };
      },
    },
    scope,
    { ...config, ...params },
    options,
  );
}
