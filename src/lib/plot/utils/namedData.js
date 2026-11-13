// @ts-check
/** @typedef {import("./dataViewTypes.js").DictionaryColumn} DictionaryColumn */
/** @typedef {import("./dataViewTypes.js").ColumnMetadata} ColumnMetadata */
/** @typedef {import("./markPlanTypes.js").PreparationCategoryScale} PreparationCategoryScale */
/** @typedef {import("./markPlanTypes.js").NamedScope} NamedScope */
/** @typedef {import("../binding/channelInputs.js").RgbRows} RgbRows */
import { numpy as np, Array as JaxArray } from "@hmplot/jax";
import {
  normalizeRgbMatrix,
  bindDatetimeAxis,
} from "../binding/channelInputs.js";
import { color as parseColor } from "d3";
import { Color } from "three/webgpu";
import {
  categorical,
  isLiteral,
  axisCategory,
  CATEGORY_COLORS,
  CATEGORY_SHAPES,
  categoryBounds,
} from "./categorical.js";
import { shapeOf, asArray, validateFields, channelScalar } from "./data.js";
import { validateUncertainty } from "./uncertainty.js";
import { scaleTransform } from "./scaleTransforms.js";
import { diagnostic, fieldHelp } from "./diagnostics.js";
import { evaluateExpression, isExpression } from "./expressions.js";
import { nameNode, isColumnNode } from "./names.js";
import { literalColorChannels } from "./literalColors.js";
export { legendCategories } from "./literalColors.js";
import { isViewStateField } from "./viewState.js";
import { isShape, shapeCode } from "./shapes.js";
import { hostSourceInteger } from "./hostSources.js";
import { isVirtualField } from "./interaction.js";
import { acquireColumn } from "./columnReads.js";
import { disposeOnce } from "./disposers.js";
import { kindsWith, capability, scalarAppearance } from "./markKinds.js";
import { planProgram } from "./programs.js";
import { deviceArray, deviceScalar } from "./deviceParams.js";
import { breakTable, breakPosition, breakPositions } from "./breaks.js";
import { MODEL_CALENDARS } from "./modelCalendars.js";
import { isCoordinate, dimExtent, remapTable } from "./gridModel.js";
import {
  gridLayout,
  gridRaster,
  axisRemap,
  curvilinearCorners,
  pairValues,
  REMAP_SIZE,
} from "./gridMarks.js";
import { limitError } from "./limits.js";
/**
 * A transform's int32 codes as positions on a categorical axis (TODO 33.4): each code's index in
 * the scale (through a lookup unless the dictionary is in the scale's order) as float32, NaN for
 * a code outside the dictionary. `params` (int32, one buffer) is the dictionary's length, then
 * the lookup. One program per plan; it was ~6 eager operations per axis per preparation.
 * Consumes its inputs.
 */
/** @param {import("./markPlanTypes.js").CodePlan} plan @param {JaxArray} codes @param {JaxArray} params @returns {[JaxArray, JaxArray]} */
function codeIndex(plan, codes, params) {
  const count = params.ref.slice([0, 1]);
  const valid = np.logicalAnd(codes.ref.greaterEqual(0), codes.ref.less(count));
  const index = plan.lookup
    ? np.take(
        params.slice([1, params.shape[0]]),
        // where() with a number promotes int32 codes to float32, which take() refuses.
        np.where(valid.ref, codes, 0).astype(np.int32),
        0,
      )
    : (params.dispose(), codes);
  return [valid, index];
}
/** @param {import("./markPlanTypes.js").CodePlan} plan @param {import("./markPlanTypes.js").CodeInputs} inputs */
function codePositionKernel(plan, { codes, params }) {
  const [valid, index] = codeIndex(plan, codes, params);
  return np.where(valid, index.astype(np.float32), NaN);
}
/** codeIndex's buffer for `input`'s dictionary in `scale`, and the plan it needs. */
/** @param {DictionaryColumn} input @param {PreparationCategoryScale} scale */
function codeParams(input, scale) {
  const indices = input.categories.map((v) => scale.index(v)),
    lookup = !indices.every((index, i) => index === i);
  return {
    plan: { lookup },
    params: deviceArray([input.categories.length, ...(lookup ? indices : [])], {
      dtype: "int32",
    }),
  };
}
const CODE_POSITIONS = new Map();
/**
 * A transform's int32 codes through a categorical channel's `table` (a row per scale index, the
 * unknown value first): each row's value, the first row for a code outside the dictionary (TODO
 * 33.4). One program per plan, as codePositionKernel. Consumes its inputs.
 */
/** @param {import("./markPlanTypes.js").CodePlan} plan @param {import("./markPlanTypes.js").CodeInputs & {table: JaxArray}} inputs */
function codeValueKernel(plan, { codes, params, table }) {
  const [valid, index] = codeIndex(plan, codes, params);
  return np.take(table, np.where(valid, index.add(1), 0).astype(np.int32), 0);
}
const CODE_VALUES = new Map();
/** @param {number[]} shape */
const selectionLimit = (shape) =>
  Math.max(shape.reduce((a, b) => a * b, 1) * 4, shape[0] * 12);
/** Channels prepareNamed resolves as data fields (column names, expressions, arrays). */
export const NAMED_FIELDS = new Set([
  "text",
  "x0",
  "x1",
  "y0",
  "y1",
  "z0",
  "z1",
  "depth",
  "height",
  "outlineWidth",
  "outlineOpacity",
  "dx",
  "dy",
  // Band-unit position offsets, added to x and y before positions are built.
  "xOffset",
  "yOffset",
  "position",
  "x",
  "y",
  "z",
  "start",
  "end",
  "startLower",
  "endLower",
  "startUpper",
  "endUpper",
  "previous",
  "control1",
  "control2",
  "fill",
  "color",
  "size",
  "width",
  "lower",
  "upper",
  "baseline",
  "surfaceHeight",
  "data",
  "shapeField",
  "outlineColor",
  "opacity",
  "rotation",
  // Polygon's triangles (TODO 47.4): which of a triangle's edges are its polygon's own.
  "edges",
]);
/** A vector channel written as its components, at least one of them a column, an expression, view state or a time. */
/** @param {unknown} value @returns {value is unknown[]} */
export function composedVector(value) {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.length <= 3 &&
    value.some(
      (item) =>
        typeof item === "string" ||
        item instanceof Date ||
        isExpression(item) ||
        isLiteral(item),
    )
  );
}
/** Positions (numbers, scalars, or one per row) as one float32 vector of `n` rows per row. */
/** @param {unknown[]} components @param {number} n */
function stackComponents(components, n) {
  const columns = components.map((item) => {
    const value = (
      typeof item === "number"
        ? np.array([item])
        : item instanceof JaxArray
          ? item.ref
          : asArray(item)
    ).astype(np.float32);
    return np.broadcastTo(value.reshape([-1]), [n]);
  });
  return np.stack(columns, 1);
}
/** Default outputs for categories mapped to numbers when a scale has no numeric range. */
/** @type {Record<string, [number, number]>} */
const NUMERIC_CATEGORY_RANGES = {
  size: [5, 16],
  width: [1, 6],
  opacity: [1, 0.3],
};
/** Output of category `index` (-1 = unknown) for size, width, or opacity. */
/** @param {PreparationCategoryScale} scale @param {number} index @param {keyof typeof NUMERIC_CATEGORY_RANGES} channel */
export function numericCategoryValue(scale, index, channel) {
  const range = scale.range,
    count = Math.max(1, scale.domain.length);
  if (
    range?.length &&
    range.every((v) => typeof v === "number" && Number.isFinite(v))
  )
    return index < 0 ? range[0] : range[index % range.length];
  const [low, high] = NUMERIC_CATEGORY_RANGES[channel];
  if (index < 0) return low;
  return count === 1
    ? (low + high) / 2
    : low + (index / (count - 1)) * (high - low);
}
/** `{r, g, b, a?}` naming columns (or arrays) for a color channel. */
/** @param {unknown} v @returns {v is import("./markPlanTypes.js").RgbSpec} */
export function isRgbSpec(v) {
  return (
    !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    !ArrayBuffer.isView(v) &&
    !(v instanceof JaxArray) &&
    !isExpression(v) &&
    !(/** @type {Partial<DictionaryColumn>} */ (v).codes) &&
    !("value" in v) &&
    ["r", "g", "b"].every((k) => k in v) &&
    Object.keys(v).every((k) => ["r", "g", "b", "a"].includes(k))
  );
}
const RGB = Symbol("rgb columns");
/**
 * Integer data holds 0-255 RGB values; float data holds 0-1. Integer-ness comes from the host
 * typed array, the GPU dtype, the column's metadata (a named column keeps it through
 * filtered views, whose GPU copies are float32), or the host source a GPU array was
 * uploaded from (Python integer columns).
 */
/** @param {unknown} v @param {unknown} [name] @param {NamedScope | null} [scope] */
const integerData = (v, name = undefined, scope = undefined) => {
  if (typeof name === "string" && scope?.metadata?.(name)?.integer) return true;
  if (v instanceof JaxArray)
    return /int/.test(String(v.dtype)) || hostSourceInteger(v);
  return (
    ArrayBuffer.isView(v) &&
    !(v instanceof Float32Array || v instanceof Float64Array)
  );
};
/** Throw unless host RGB values lie in the dtype's range. GPU arrays are checked by the caller. */
/** @param {Iterable<number>} values @param {boolean} integer @param {string} where */
export function checkRgbRange(values, integer, where) {
  let low = Infinity,
    high = -Infinity;
  for (const v of values) {
    if (v < low) low = v;
    if (v > high) high = v;
  }
  const max = integer ? 255 : 1;
  if (!(low >= 0 && high <= max))
    throw Error(
      `${where} RGB values must be between 0 and ${max} for ${integer ? "integer" : "float"} data; found ${low} to ${high}.` +
        (integer
          ? ""
          : " Use integer data (for example a Uint8Array) for 0-255 values."),
    );
}
// Raster (Image) source arrays that passed the range check; an unchanged image is not re-read.
const checkedRasters = new WeakSet();
// Images are large: one min and one max reduction, without numericExtent's finite-mask copies.
/** @param {JaxArray} array */
async function rasterExtent(array) {
  const low = np.min(array.ref),
    high = np.max(array.ref);
  try {
    const [lo, hi] = await Promise.all([low.ref.data(), high.ref.data()]);
    return [Number(lo[0]), Number(hi[0])];
  } finally {
    low.dispose();
    high.dispose();
  }
}
/** Range-check GPU-array RGB rows (prepareNamed's `rgbChecks`) before the data is shown. */
/** @param {import("./markPlanTypes.js").RgbRangeCheck[]} rgbChecks */
export async function checkRgbArrays(rgbChecks) {
  if (!rgbChecks?.length) return;
  // Raster reductions start now, while the arrays are certainly alive.
  const rasters = rgbChecks.map(({ array, raster }) =>
    raster ? rasterExtent(array) : null,
  );
  const { numericExtent } = rgbChecks.some(({ raster }) => !raster)
    ? await import("./scaleBindings.js")
    : {};
  await Promise.all(
    rgbChecks.map(async ({ array, integer, where, raster, source }, index) => {
      const extent = raster
        ? await rasters[index]
        : await /** @type {NonNullable<typeof numericExtent>} */ (
            numericExtent
          )(array, "linear");
      if (extent && (extent[0] < 0 || extent[1] > 1)) {
        const max = integer ? 255 : 1;
        throw Error(
          `${where} RGB values must be between 0 and ${max} for ${integer ? "integer" : "float"} data; found ${extent[0] * max} to ${extent[1] * max}.` +
            (integer
              ? ""
              : " Use integer data (for example a Uint8Array) for 0-255 values."),
        );
      }
      if (source) checkedRasters.add(source);
    }),
  );
}
const warnedRgbScales = new Set();
/** @param {unknown} v */
const categoryInput = (v) =>
  Boolean(
    /** @type {Partial<DictionaryColumn> | null | undefined} */ (v)?.codes &&
    /** @type {Partial<DictionaryColumn>} */ (v).categories,
  ) ||
  (Array.isArray(v) &&
    v.some((x) => typeof x === "string" || typeof x === "boolean"));
const colors = new Map();
/** @param {string} value @returns {number[]} */
function rgb(value) {
  if (!parseColor(value)) throw Error(`Invalid category color: ${value}`);
  if (!colors.has(value)) {
    const c = new Color(value);
    colors.set(value, [c.r, c.g, c.b]);
  }
  return colors.get(value);
}
/**
 * `shape` is a channel when it names a column or holds one value per row, and the mark's
 * symbol option when it is a shape name. Inside, the channel is `shapeField`.
 */
const warnedShapeColumns = new Set();
/** @param {import("./markPlanTypes.js").Channels} props @param {NamedScope | null | undefined} scope @param {string} kind */
export function shapeChannelProps(props, scope, kind) {
  if (props.shapeField !== undefined)
    throw Error(
      `${kind}.shapeField is not a prop: pass the column to shape (shape="species").`,
    );
  const value = props.shape;
  if (value === undefined) return props;
  // literal("star") is the shape name even when a column is called star.
  if (isLiteral(value)) return { ...props, shape: value.value };
  if (isExpression(value))
    throw Error(
      `${kind}.shape takes a column, a per-row array, or a shape name; expressions are not supported.`,
    );
  // Columns come first, as for fill: a column named like a shape is the column.
  const named = typeof value === "string" && scope?.has?.(value);
  if (named && (isShape(value) || value === "sphere" || value === "cube")) {
    const warning = `${kind}.shape="${value}" names both a column and a shape; the column wins. Use literal("${value}") for the shape.`;
    if (!warnedShapeColumns.has(warning)) {
      warnedShapeColumns.add(warning);
      console.warn(warning);
    }
  }
  const rows =
    Array.isArray(value) ||
    value instanceof JaxArray ||
    ArrayBuffer.isView(value) ||
    !!(
      /** @type {Partial<DictionaryColumn> | null | undefined} */ (value)?.codes
    );
  if (!named && !rows) return props;
  if (kind === "Points3D")
    throw Error(
      "Points3D shapes are geometry (sphere or cube); give shape a name, not a column or per-row values.",
    );
  const { shape, ...rest } = props;
  return { ...rest, shapeField: value };
}
/**
 * What a mark's preparation derives for its frame, recorded rather than written (TODO 136.12):
 * the plot's axis settings a time or model-calendar column binds (type, origin, zone, calendar)
 * and the category scales of the band axes its columns make. Reads see the recorded values over
 * the plot's, so a mark's second time column shifts onto the origin its first one bound.
 * @param {import("./markPlanTypes.js").NamedOptions} options
 * @returns {import("./markPlanTypes.js").NamedFrameBindings & {get(key: string): any, derive(key: string, value: unknown): void, isExplicit(key: string): boolean}}
 */
function frameBindings(options) {
  // Looked up on first use: options without a plot child (a bare mark's) throw on child().
  const axisOptions = () => options.child?.("plot") ?? options;
  /** @type {Record<string, unknown>} */
  const axes = {};
  return {
    axes,
    categoryAxes: {},
    get: (key) => (key in axes ? axes[key] : axisOptions().get?.(key)),
    derive: (key, value) => void (axes[key] = value),
    isExplicit: (key) => key in axes || !!axisOptions().isExplicit?.(key),
  };
}
/**
 * The frame merges what a mark's preparation derived (TODO 136.12): axis settings go on the
 * plot's derived layer (an authored or edited value stays above them), and a band axis's scale
 * and bounds on the frame's options, where the axis and its layout walk up to find them.
 * @param {import("./markPlanTypes.js").NamedFrameBindings} bindings
 * @param {import("./markPlanTypes.js").NamedOptions} options
 * @param {import("./markPlanTypes.js").NamedFrame} [frame]
 */
export function mergeFrameBindings(bindings, options, frame = undefined) {
  const axes = Object.entries(bindings.axes);
  if (axes.length) {
    const axisOptions = options.child?.("plot") ?? options;
    for (const [key, value] of axes) axisOptions.derive(key, value);
  }
  const categories = Object.entries(bindings.categoryAxes);
  if (!categories.length) return;
  // On the Frame's options, not on a scope between the Frame and the mark (a Partition group,
  // a Mapping); and on the Frame that owns the dimension: a Frame that inherits the Plot's x
  // shares the Plot's band scale with its siblings (TODO 134.13).
  const owners = new Set();
  for (const [dimension, scale] of categories) {
    const owner = dimensionOwner(frame?.options ?? options, dimension);
    owner.categoryAxes ??= {};
    const shared = owner.categoryAxes[dimension];
    // One is installed already (a sibling's, from another data scope): its categories join it,
    // and the revision below prepares every mark again against it.
    if (shared && shared !== scale && !shared.explicit)
      shared.include(scale.domain);
    else owner.categoryAxes[dimension] = scale;
    const installed = owner.categoryAxes[dimension];
    owner.set(
      `${dimension}bounds`,
      categoryBounds(dimension, installed.domain.length, owner),
    );
    owners.add(owner);
  }
  for (const owner of owners)
    owner.set("_categoryRevision", (owner.get("_categoryRevision") ?? 0) + 1);
}
/**
 * The options of the Frame that owns `dimension`: `frameOptions`, or the nearest Frame up its
 * parents that does not inherit it. A Frame drawn in its own box (placed, ranged, a facet cell or
 * inside one) keeps its own: its parent's axis is not the one it draws.
 * @param {any} frameOptions
 * @param {string} dimension
 */
function dimensionOwner(frameOptions, dimension) {
  let owner = frameOptions;
  while (
    owner.frameDefinition?.parent &&
    !owner.frameDefinition.owns(dimension) &&
    !owner.frameDefinition.spatial?.()
  )
    owner = owner.frameDefinition.parent;
  return owner;
}
/**
 * Prepare a mark's channels and merge what they derive into its frame (mergeFrameBindings).
 * @param {Parameters<typeof prepareChannels>} args
 * @returns {import("./markPlanTypes.js").NamedPreparedResult}
 */
export function prepareNamed(...args) {
  const result = prepareChannels(...args);
  try {
    mergeFrameBindings(result.frameBindings, args[2], args[5]);
  } catch (error) {
    result.dispose();
    throw error;
  }
  return result;
}
/**
 * Prepare a mark's channels without writing to its options or frame (TODO 136.12): the axis
 * settings and category axes its columns bind come back as `frameBindings`, for the frame to
 * merge (prepareNamed) or, for a facet's cell domains, to drop.
 * @param {import("./markPlanTypes.js").Channels} props
 * @param {NamedScope | null | undefined} scope
 * @param {import("./markPlanTypes.js").NamedOptions} options
 * @param {string} kind
 * @param {import("./markPlanTypes.js").NamedPreparationState} state
 * @param {import("./markPlanTypes.js").NamedFrame} [frame]
 * @param {import("./markPlanTypes.js").NamedChannelProvenance} [channelProvenance]
 * @param {import("./markPlanTypes.js").NamedEvaluation} [evaluation]
 * @returns {import("./markPlanTypes.js").NamedPreparedResult}
 */
export function prepareChannels(
  props,
  scope,
  options,
  kind,
  state,
  frame = undefined,
  channelProvenance = {},
  { time, expressionOptions, expressionEvaluator = evaluateExpression } = {},
) {
  // col.species names the column as "species" does (R2.0), with its categories, times and
  // title, where the scope has it; a missing column stays a read, which then fails.
  for (const [key, value] of Object.entries(props))
    if (
      isColumnNode(value) &&
      scope?.has?.(
        /** @type {import("../publicTypes.js").Expression} */ (value).args[0],
      )
    )
      props = {
        ...props,
        [key]: /** @type {import("../publicTypes.js").Expression} */ (value)
          .args[0],
      };
  // Text3D draws one label at its position (TODO 64): x, y and z would be ignored.
  if (
    kind === "Text3D" &&
    ["x", "y", "z"].some((key) => props[key] !== undefined)
  )
    throw Error(
      "Text3D draws one label at position={[x, y, z]}: x, y and z are not its props. For text at each row of a table, use Text.",
    );
  props = literalColorChannels(shapeChannelProps(props, scope, kind), scope);
  const output = { ...props };
  /** @type {{dispose(): void}[]} */
  const owned = [];
  /** @type {import("./markPlanTypes.js").RgbRangeCheck[]} */
  const rgbChecks = [];
  /** @type {Record<string, boolean>} */
  const rgbChannels = {};
  /** @type {Record<string, import("./markPlanTypes.js").CategoryLegendRecord>} */
  const metadata = {};
  /** @type {Record<string, {type: string; origin: number; timezone: string}>} */
  const temporal = {};
  /** @type {Set<PreparationCategoryScale>} */
  const scales = new Set();
  const bindings = frameBindings(options);
  /** @type {unknown[]} */
  const topology = [];
  // What an expression channel evaluated to: a cast's or a calendar function's type (R2.0).
  /** @type {Map<unknown, ColumnMetadata>} */
  const evaluatedMetadata = new Map();
  /** @type {Record<string, import("./expressionPlanTypes.js").ExpressionResult>} */
  const channelResults = {};
  /** @template {{dispose(): void}} T @param {T} a @returns {T} */
  const own = (a) => (owned.push(a), a);
  /** @param {unknown} v */
  const array = (v) => asArray(v);
  /** @param {unknown} v @param {string} [channel] */
  const resolve = (v, channel) => {
    // A view-state field named as a channel (x="@pointer_x", TODO 45) reads the view, not a column.
    if (typeof v === "string" && isViewStateField(v)) v = nameNode(v);
    if (
      channel === "text" &&
      typeof v === "string" &&
      !isVirtualField(v) &&
      scope?.has?.(v) &&
      scope.encodedColumn
    ) {
      const input = scope.encodedColumn(v);
      return input?.codes instanceof JaxArray
        ? { ...input, codes: own(input.codes.ref) }
        : input;
    }
    if (isExpression(v)) {
      if (!scope) throw Error(`${kind} expressions require a Data scope.`);
      // Mark channels are where @time is available: `time` is the view clock.
      // expressionOptions: a channel's tween state (TODO 28; namedMark.svelte).
      const direct = scalarAppearance(kind, channel);
      let evaluated = expressionEvaluator(v, scope, {
        time,
        broadcast: !direct,
        ...expressionOptions?.(v),
      });
      const evaluatedDictionary =
        /** @type {Partial<DictionaryColumn> | null | undefined} */ (
          evaluated.value
        );
      // Category encoding needs its row-shaped codes/dictionary, even for a reduction.
      if (
        direct &&
        evaluated.cardinality === "scalar" &&
        (evaluatedDictionary?.categories ||
          ["categorical", "ordinal", "boolean"].includes(
            evaluated.metadata?.type ?? "",
          ))
      ) {
        evaluated.dispose();
        evaluated = expressionEvaluator(v, scope, {
          time,
          ...expressionOptions?.(v),
        });
      }
      owned.push({ dispose: evaluated.dispose });
      if (channel) channelResults[channel] = evaluated;
      if (evaluated.metadata) evaluatedMetadata.set(v, evaluated.metadata);
      // The pointer over a band axis is its category, for every row.
      if (evaluated.category !== undefined)
        return new Array(scope?.length ?? 1).fill(evaluated.category);
      if (
        direct &&
        ["fill", "color", "width"].includes(channel ?? "") &&
        typeof evaluated.value === "number"
      )
        return channelScalar(evaluated.value);
      return evaluated.value;
    }
    if (isLiteral(v)) return v.value;
    // The prepared output keeps a column past this read (until the mark's next preparation).
    if (typeof v === "string" && scope?.has?.(v)) {
      const read = acquireColumn(scope, v);
      owned.push({ dispose: read.release });
      return read.value;
    }
    return scope ? scope.resolve(v) : v;
  };
  /** @type {number | null} */
  let count = null;
  /** @type {string | null} */
  let countKey = null;
  /** @param {unknown} v @param {string} key */
  function rows(v, key) {
    const s = shapeOf(
      /** @type {Partial<DictionaryColumn> | null | undefined} */ (v)?.codes ??
        v,
    );
    if (s.length) {
      if (count !== null && s[0] !== count)
        throw diagnostic(
          "data.shape_mismatch",
          `${kind}.${key} has ${s[0]} rows; ${kind}.${countKey ?? "position"} has ${count}.`,
          {
            component: kind,
            property: key,
            shape: s,
            suggestion: "Use channels with the same first dimension.",
            details: {
              expectedChannel: countKey,
              expectedRows: count,
              actualChannel: key,
              actualRows: s[0],
            },
          },
        );
      count = s[0];
      countKey ??= key;
    }
  }
  // What encoding a categorical input records, without computing its codes: its scale, its
  // identity in the category topology, and a dictionary's categories in the scale.
  /** @param {unknown} input @param {PreparationCategoryScale} scale */
  function noteCategories(input, scale) {
    const dictionaryInput =
      /** @type {Partial<DictionaryColumn> | null | undefined} */ (input);
    if (shapeOf(dictionaryInput?.codes ?? input).length !== 1)
      throw Error("Categorical columns must be one-dimensional.");
    if (!scale?.isCategorical)
      throw Error(
        "A column of categories needs a categorical scale: categorical({ domain, range }) " +
          "(Python hm.categorical(domain=..., range=...)), not a plain object or a continuous scale.",
      );
    scales.add(scale);
    const dictionary = dictionaryInput?.categories;
    if (input instanceof JaxArray || dictionary) {
      state.ids ??= new WeakMap();
      state.nextId ??= 0;
      const obj = /** @type {object} */ (
        dictionary ? dictionaryInput?.codes : input
      );
      if (!state.ids.has(obj)) state.ids.set(obj, ++state.nextId);
      topology.push(state.ids.get(obj), dictionary ?? scale.domain);
    } else {
      // A host column by identity, as a device one (TODO 26.6): the same array object holds the
      // same values (Data treats it as unchanged). Its values were listed here on every
      // preparation, and the list compared as JSON.
      state.ids ??= new WeakMap();
      state.nextId ??= 0;
      if (!state.ids.has(/** @type {object} */ (input)))
        state.ids.set(/** @type {object} */ (input), ++state.nextId);
      topology.push(state.ids.get(/** @type {object} */ (input)));
    }
    if (dictionary) scale.include(dictionary);
  }
  /** @param {unknown} input @param {PreparationCategoryScale} scale */
  function encode(input, scale) {
    noteCategories(input, scale);
    return categoryCodes(input, scale);
  }
  // An input's codes in `scale` (int32, -1 for a value outside it); its categories are noted.
  /** @param {unknown} input @param {PreparationCategoryScale} scale */
  function categoryCodes(input, scale) {
    const dictionaryInput =
      /** @type {Partial<DictionaryColumn> | null | undefined} */ (input);
    const dictionary = dictionaryInput?.categories;
    if (dictionary) {
      const indices = dictionary.map((v) => scale.index(v));
      // Transforms' codes are int32 (TODO 33.2): only their range needs checking, and a
      // dictionary in the scale's order needs no lookup. This ran ~14 operations per channel.
      if (
        dictionaryInput?.codes instanceof JaxArray &&
        dictionaryInput.codes.dtype === np.int32
      ) {
        const codes = own(array(dictionaryInput?.codes)),
          valid = np.logicalAnd(
            codes.ref.greaterEqual(0),
            codes.ref.less(dictionary.length),
          );
        if (indices.every((index, i) => index === i))
          return own(np.where(valid, codes.ref, -1));
        const lookup = own(np.array(indices, { dtype: np.int32 }));
        return own(
          np.where(
            valid.ref,
            np.take(
              lookup.ref,
              np.where(valid, codes.ref, 0).astype(np.int32),
              0,
            ),
            -1,
          ),
        );
      }
      const lookup = own(
        np.array([-1, ...indices], {
          dtype: np.int32,
        }),
      );
      const codes = own(array(dictionaryInput?.codes).astype(np.float32));
      const valid = np.logicalAnd(
        np.isfinite(codes.ref),
        np.logicalAnd(
          codes.ref.greaterEqual(0),
          np.logicalAnd(
            codes.ref.less(dictionary.length),
            codes.ref.equal(np.floor(codes.ref)),
          ),
        ),
      );
      const index = np.where(valid, codes.ref.add(1), 0).astype(np.int32);
      return own(np.take(lookup.ref, index, 0));
    }
    if (input instanceof JaxArray) {
      if (!scale.explicit)
        throw Error(
          "GPU categorical columns require an explicit domain or {codes, categories}.",
        );
      let code = own(np.full(input.shape, -1, { dtype: np.int32 }));
      scale.domain.forEach((v, i) => {
        if (typeof v !== "number" && typeof v !== "boolean") return;
        code = own(np.where(input.ref.equal(Number(v)), i, code.ref));
      });
      return code;
    }
    // Kept by the Data scope for its own columns while the scale's domain holds (TODO 26.6):
    // listing and indexing 60,000 strings took ~4 ms per preparation.
    const create = () => {
      const values = Array.from(/** @type {ArrayLike<unknown>} */ (input));
      scale.include(values);
      return np.array(
        values.map((v) => scale.index(v)),
        { dtype: np.int32 },
      );
    };
    return own(scope ? scope.encode(input, scale, create) : create());
  }
  try {
    const fieldRequired = new Set([
      "x0",
      "x1",
      "y0",
      "y1",
      "z0",
      "z1",
      "depth",
      "height",
      "position",
      "x",
      "y",
      "z",
      "start",
      "end",
      "previous",
      "control1",
      "control2",
      "size",
      "width",
      "lower",
      "upper",
      "baseline",
      "surfaceHeight",
      "shapeField",
      "rotation",
      "outlineWidth",
      "outlineOpacity",
    ]);
    /** @type {[string, unknown][]} */
    const required = [...fieldRequired].map((key) => [key, props[key]]);
    for (const key of ["start", "end"])
      if (composedVector(props[key]))
        props[key].forEach((field, i) =>
          required.push([`${key}[${i}]`, field]),
        );
    for (const [key, field] of required) {
      if (
        typeof field !== "string" ||
        !scope ||
        scope.has(field) ||
        isViewStateField(field)
      )
        continue;
      const help = fieldHelp(scope, field);
      const inherited = channelProvenance[key]?.kind === "mapping";
      const outputs = help.available;
      const scopeName = scope.identity?.id
        ? `Data ${scope.identity.id}`
        : "active Data scope";
      const message =
        inherited && scope.aggregate
          ? `${kind}.${key} inherits ${JSON.stringify(field)} from ${channelProvenance[key]?.label}, but the active aggregate scope outputs ${outputs.join(", ") || "no columns"}. Set ${key} to an output column.`
          : `${kind}.${key} references missing field ${JSON.stringify(field)} in ${scopeName}. ${help.suggestion} A nested Data replaces its enclosing table.`;
      throw diagnostic(
        inherited && scope.aggregate
          ? "mapping.aggregate_field_removed"
          : "data.missing_field",
        message,
        {
          component: kind,
          property: key,
          scope: scope.aggregate ? `aggregate ${scopeName}` : scopeName,
          field,
          suggestion: help.suggestion,
          details: { available: outputs, provenance: channelProvenance[key] },
        },
      );
    }
    if (
      kind === "Prism" &&
      props.shape !== undefined &&
      !["rectangle", "triangle", "hexagon", "circle"].includes(
        /** @type {string} */ (props.shape),
      )
    )
      throw Error(
        "Prism shape must be rectangle, triangle, hexagon, or circle.",
      );
    // RGB columns resolve component by component and stay grouped until the color loop.
    /** @type {Record<string, import("./markPlanTypes.js").RgbSpec>} */
    const rgbSpecs = {};
    for (const key of ["fill", "color", "outlineColor"])
      if (isRgbSpec(output[key])) {
        rgbSpecs[key] = output[key];
        delete output[key];
      }
    // A vector channel composed of per-axis values (start={["x", "@view_y_min"]}: a rule's end,
    // TODO 45): each component resolves, and maps onto its axis as x, y and z do (categories,
    // datetimes), as the channel "start[0]"; they stack into one vector per row below.
    /** @type {Record<string, string[]>} */
    const components = {};
    for (const key of ["start", "end"])
      if (composedVector(output[key])) {
        components[key] = output[key].map(
          (value, i) => (
            (output[`${key}[${i}]`] = resolve(value)),
            `${key}[${i}]`
          ),
        );
        delete output[key];
      }
    const componentKeys = Object.values(components).flat();
    /** @param {string} key */
    const sourceOf = (key) => {
      const part = /^(start|end)\[(\d)\]$/.exec(key);
      return part
        ? /** @type {unknown[]} */ (props[part[1]])[+part[2]]
        : props[key];
    };
    // A field of a grid table (TODO 51; gridMarks.js): drawn over two of its dimensions, whose
    // coordinates place it. x and y, if given, name those dimensions: no column is read for them.
    const tableGrid =
      capability(kind, "gridTable") && props.data === undefined
        ? scope?.grid
        : null;
    const gridField =
      Boolean(tableGrid) &&
      (typeof props.fill === "string"
        ? Boolean(scope?.has?.(props.fill)) &&
          !isCoordinate(tableGrid, props.fill)
        : kind === "Image" && isRgbSpec(rgbSpecs.fill));
    const gridDraw = gridField
      ? { grid: tableGrid, layout: gridLayout(tableGrid, props, kind) }
      : null;
    if (gridDraw) {
      delete output.x;
      delete output.y;
    } else if (
      capability(kind, "gridTable") &&
      scope?.gridDropped &&
      typeof props.fill === "string" &&
      scope.has?.(props.fill)
    )
      throw Error(
        `${kind}.fill: ${props.fill} is a column of a table whose grid was dropped. ${scope.gridDropped}`,
      );
    for (const key of NAMED_FIELDS)
      if (key in output) output[key] = resolve(output[key], key);
    // Text's datetime and duration values are written as dates and durations (TODO 143.6).
    if (capability(kind, "labels") && props.text !== undefined) {
      const logical =
        typeof props.text === "string" && scope?.has?.(props.text)
          ? scope?.metadata?.(props.text)
          : evaluatedMetadata.get(props.text);
      if (logical?.type === "datetime" || logical?.type === "duration")
        output._textMeta = {
          type: logical.type,
          origin: logical.origin ?? 0,
          timezone: logical.timezone ?? "UTC",
        };
    }
    for (const [key, spec] of Object.entries(rgbSpecs)) {
      output[key] = { [RGB]: spec };
      for (const [k, v] of Object.entries(spec)) {
        const value = resolve(v);
        if (typeof v === "string" && typeof value === "string") {
          const help = fieldHelp(scope, v);
          const scopeName = scope?.identity?.id
            ? `Data ${scope.identity.id}`
            : "active Data scope";
          throw diagnostic(
            "data.missing_field",
            `${kind}.${key}.${k} references missing field ${JSON.stringify(v)} in ${scopeName}.` +
              (scope
                ? ` Available columns: ${help.available.join(", ") || "none"}.`
                : ` ${kind} RGB columns require a Data scope.`),
            {
              component: kind,
              property: `${key}.${k}`,
              scope: scopeName,
              field: v,
              suggestion: help.suggestion,
              details: { available: help.available },
            },
          );
        }
        /** @type {Record<string, unknown>} */ (output[key])[k] = value;
      }
    }
    // A named numeric column is one value per row. As a plain array, vector channels (size,
    // width) would read it as one [x, y, z] literal and draw every row alike.
    for (const key of ["size", "width"])
      if (
        typeof props[key] === "string" &&
        Array.isArray(output[key]) &&
        output[key].length &&
        output[key].every((v) => typeof v === "number")
      )
        output[key] = own(np.array(new Float32Array(output[key])));
    for (const key of NAMED_FIELDS) {
      const value =
          /** @type {Partial<DictionaryColumn> | null | undefined} */ (
            output[key]
          )?.codes ?? output[key],
        shape = shapeOf(value);
      if (shape.length && selectionLimit(shape) > (state.limit ?? Infinity))
        throw limitError("storage", {
          component: kind,
          what: `its ${key} column`,
          count: selectionLimit(shape),
          limit: state.limit,
          property: key,
        });
    }
    for (const key of ["outlineWidth", "outlineOpacity"]) {
      const value = output[key];
      if (value === undefined) continue;
      if (
        typeof value === "string" ||
        /** @type {Partial<DictionaryColumn> | null | undefined} */ (value)
          ?.categories ||
        (Array.isArray(value) && value.some((v) => typeof v !== "number")) ||
        shapeOf(value).length > 1
      )
        throw Error(
          `${kind}.${key} requires a number, numeric column, one-dimensional array or expression.`,
        );
      if (
        typeof value === "number" &&
        (!Number.isFinite(value) ||
          value < 0 ||
          (key === "outlineOpacity" && value > 1))
      )
        throw Error(
          `${kind}.${key} must be ${key === "outlineOpacity" ? "between 0 and 1" : "nonnegative"}; pass 0 to hide the border.`,
        );
      if (shapeOf(value).length) rows(value, key);
    }
    for (const key of ["fill", "color", "outlineColor"]) {
      if (typeof output[key] !== "string") continue;
      const parsed = parseColor(output[key]);
      if (!parsed)
        throw diagnostic(
          "data.missing_field_or_invalid_color",
          `${kind}.${key} is neither a field in the active Data scope nor a valid CSS color: ${JSON.stringify(output[key])}.`,
          {
            component: kind,
            property: key,
            scope: "active Data scope",
            field: output[key],
            suggestion: fieldHelp(scope, output[key]).suggestion,
          },
        );
      // Colors are drawn opaque (three.js drops an alpha, and draws "transparent" white): flat
      // point symbols (Points) take fill="transparent" for a hollow point; elsewhere an alpha is
      // an error (TODO 64).
      const hollow = capability(kind, "symbols");
      if (
        parsed.opacity < 1 &&
        !(hollow && key === "fill" && output[key] === "transparent")
      )
        throw Error(
          `${kind}.${key} ${JSON.stringify(output[key])} is see-through, but colors are drawn opaque: use opacity for a see-through mark` +
            (hollow
              ? `, or fill="transparent" for a hollow point that draws its outline.`
              : "."),
        );
    }
    // Validate row compatibility before inferred domains can grow.
    const rawPosition = shapeOf(output.position);
    if (output.position !== undefined)
      count =
        rawPosition.length > 1 ? rawPosition[0] : rawPosition.length ? 1 : 0;
    if (output.position !== undefined) countKey = "position";
    for (const key of ["x", "y", "z", "start", "end", ...componentKeys])
      if (output[key] !== undefined) rows(output[key], key);
    // A literal plain array with one value per row is per-row data too. A short one ([4, 40]
    // on 2 points, [4, 40, 4] on 3) would otherwise read as one [x, y, z] size; the mark's row
    // count decides.
    for (const key of ["size", "width"])
      if (
        Array.isArray(output[key]) &&
        output[key].length &&
        output[key].every((v) => typeof v === "number") &&
        count !== null &&
        count > 0 &&
        output[key].length === count
      )
        output[key] = own(np.array(new Float32Array(output[key])));
    for (const key of [
      "fill",
      "color",
      "shapeField",
      "opacity",
      "outlineOpacity",
      "outlineWidth",
      "outlineColor",
      "size",
      "width",
    ])
      if (
        output[key] !== undefined &&
        (categoryInput(output[key]) ||
          props[key === "shapeField" ? "shapeScale" : key + "Scale"])
      )
        rows(output[key], key);
    // A datetime column reaches the GPU as milliseconds from its own origin (its first time;
    // columns.js, resources.js). The first on an axis, unless the axis names one, sets the
    // axis's origin; the others shift into it, so tables that start at different times share an
    // axis (TODO 48.1).
    /** @param {string} key @param {string} dimension @param {ColumnMetadata} logical */
    const datetimeAxis = (key, dimension, logical) => {
      const shift = bindDatetimeAxis(bindings, dimension, logical);
      if (shift) output[key] = own(array(output[key]).add(deviceScalar(shift)));
      // An axis's breaks (TODO 53.5): the column's times as positions, less the time removed.
      // (Lost in 3ddd9e7e's refactor: market hours were drawn at their times, an axis of months.)
      const breaks = axisBreaks(dimension);
      if (breaks && output[key] !== undefined && !(output[key] instanceof Date))
        output[key] = own(breakPositions(breaks, array(output[key])));
    };
    // A model calendar's times (TODO 53.6) stay numbers since its reference date: the axis reads
    // them in that calendar.
    /** @param {string} dimension @param {ColumnMetadata} logical */
    const modelAxis = (dimension, logical) => {
      const axis = dimension.toUpperCase();
      bindings.derive(`axis${axis}Type`, "datetime");
      bindings.derive(`axis${axis}Calendar`, {
        name: logical.calendar,
        units: logical.calendarUnits,
      });
      if (!bindings.isExplicit(`axis${axis}TimeOrigin`))
        bindings.derive(`axis${axis}TimeOrigin`, 0);
    };
    /** @param {string} dimension */
    const axisBreaks = (dimension) => {
      const axis = dimension.toUpperCase();
      const breaks = bindings.get(`axis${axis}Breaks`);
      return breaks && (!Array.isArray(breaks) || breaks.length)
        ? breakTable(
            breaks,
            bindings.get(`axis${axis}Timezone`) ?? "UTC",
            bindings.get(`axis${axis}TimeOrigin`) ?? 0,
          )
        : null;
    };
    /** @param {string} key */
    const logicalOf = (key) =>
      typeof props[key] === "string" && scope?.has?.(props[key])
        ? scope?.metadata?.(props[key])
        : null;
    for (const key of ["x", "y", "z", "lower", "upper", ...componentKeys])
      if (output[key] !== undefined) {
        const dimension = key.includes("[")
          ? "xyz"[Number(key.at(-2))]
          : key === "lower" || key === "upper"
            ? String(props.axis ?? "y")
            : kind === "Area" && props.axis === "x" && key === "x"
              ? "y"
              : key;
        // View state (@view_x_min, @pointer_x) is a position on the axis, a band axis's too,
        // unless it names a category (the pointer over a band).
        const position =
          isViewStateField(sourceOf(key)) && !categoryInput(output[key]);
        let scale = position
          ? null
          : (bindings.categoryAxes[dimension] ??
            axisCategory(options, dimension));
        const source = sourceOf(key);
        const sourceField =
          typeof source === "string" && scope?.has?.(source) ? source : null;
        // An expression's type (as_category(x), time_floor(t)) sets the axis as a column's does.
        const derived = sourceField
          ? null
          : (evaluatedMetadata.get(props[key]) ?? null);
        // A time (a rule's x={new Date(...)}) is milliseconds from the axis's origin; it sets a
        // datetime axis's origin only when nothing else did.
        if (output[key] instanceof Date) {
          const axis = dimension.toUpperCase();
          if (bindings.get(`axis${axis}Type`) !== "datetime")
            datetimeAxis(key, dimension, { origin: output[key].getTime() });
          output[key] = breakPosition(
            axisBreaks(dimension),
            output[key].getTime() -
              (bindings.get(`axis${axis}TimeOrigin`) ?? 0),
          );
        }
        const logical = sourceField ? scope?.metadata?.(sourceField) : derived;
        if (logical?.type === "datetime") datetimeAxis(key, dimension, logical);
        else if (
          MODEL_CALENDARS.includes(/** @type {string} */ (logical?.calendar))
        )
          modelAxis(dimension, /** @type {ColumnMetadata} */ (logical));
        // Band edges are positions, like Rect's interval ends: a violin's GPU-computed
        // fractions of category bands must not be encoded again as category labels.
        if (key === "lower" || key === "upper") continue;
        // A column of categories (text, or a transform's group keys) makes a band axis, as its
        // type does (TODO 64: a Violin's categories, which carry no type, needed a scale).
        const categories =
          ["categorical", "ordinal", "boolean"].includes(logical?.type ?? "") ||
          Boolean(sourceField && categoryInput(output[key]));
        const columnCategories = () =>
          logical?.domain ??
          /** @type {Partial<DictionaryColumn> | null | undefined} */ (
            output[key]
          )?.categories ?? [
            ...new Set(
              Array.from(
                /** @type {ArrayLike<unknown>} */ (output[key]),
              ).filter((value) => value != null),
            ),
          ];
        // A scale a sibling Frame installed on the Plot's axis, from another data scope, may lack
        // this column's categories: this mark brings its own, which the frame joins to it
        // (mergeFrameBindings), and its marks prepare again against the whole (TODO 134.13).
        if (
          scale &&
          !scale.explicit &&
          !bindings.categoryAxes[dimension] &&
          (sourceField || derived) &&
          categories &&
          // A dictionary's categories join the scale as it is encoded (noteCategories).
          !(
            /** @type {Partial<DictionaryColumn>} */ (output[key])?.categories
          ) &&
          columnCategories().some((value) => scale?.index(value) === -1)
        )
          scale = null;
        if (!scale && (sourceField || derived) && categories) {
          scale = /** @type {NonNullable<typeof scope>} */ (scope).scale(
            `${sourceField ?? logical?.source ?? key}:position`,
          );
          scale.include(columnCategories());
          // The axis and its layout walk up from the Frame: the frame installs it
          // (mergeFrameBindings).
          bindings.categoryAxes[dimension] = scale;
        }
        if (scale) {
          if (
            options.get("coordinates") === "spherical" ||
            (options.get(dimension + "Transform") ?? "linear") !== "linear"
          )
            throw Error(
              "Categorical axes require Cartesian linear coordinates.",
            );
          const input = /** @type {DictionaryColumn} */ (output[key]);
          if (
            input?.categories &&
            input.codes instanceof JaxArray &&
            input.codes.dtype === np.int32
          ) {
            noteCategories(input, scale);
            const { plan, params } = codeParams(input, scale);
            output[key] = own(
              planProgram(
                CODE_POSITIONS,
                plan,
                codePositionKernel,
              )({ codes: array(input.codes), params }),
            );
          } else {
            const code = encode(input, scale);
            output[key] = own(
              np.where(
                code.ref.greaterEqual(0),
                code.ref.astype(np.float32),
                np.nan,
              ),
            );
          }
        } else if (
          categoryInput(output[key]) ||
          typeof output[key] === "string"
        )
          throw Error(
            `${key} requires a categorical axis scale or a numeric column.`,
          );
      }
    for (const [key, keys] of Object.entries(components)) {
      output[key] = own(
        stackComponents(
          keys.map((part) => output[part]),
          count ?? scope?.length ?? 1,
        ),
      );
      for (const part of keys) delete output[part];
    }
    // Interval ends (Rect, error bars) are positions on their axis too.
    for (const key of ["x0", "x1", "y0", "y1", "z0", "z1"]) {
      const logical = output[key] !== undefined ? logicalOf(key) : null;
      if (logical?.type === "datetime") datetimeAxis(key, key[0], logical);
      else if (
        MODEL_CALENDARS.includes(/** @type {string} */ (logical?.calendar))
      )
        modelAxis(key[0], /** @type {ColumnMetadata} */ (logical));
    }
    // xOffset/yOffset move each row along its axis in data units: on a categorical axis a band
    // is one unit, so 0.25 is a quarter band (grouped bars, dodged points). The axis keeps
    // reading x and y; dx/dy are the pixel offsets.
    for (const [axis, key] of /** @type {const} */ ([
      ["x", "xOffset"],
      ["y", "yOffset"],
    ])) {
      if (output[key] === undefined) continue;
      if (output[axis] === undefined)
        throw Error(
          `${kind}.${key} moves each row along ${axis}, so it needs ${axis}.`,
        );
      rows(output[key], key);
      const base =
          typeof output[axis] === "number"
            ? np.full([count ?? scope?.length ?? 1], output[axis])
            : array(output[axis]),
        shift =
          typeof output[key] === "number" ? output[key] : array(output[key]);
      output[axis] = own(base.add(shift));
      delete output[key];
    }
    const positionMark = capability(kind, "xyzPosition");
    if (
      positionMark &&
      (output.x !== undefined ||
        output.y !== undefined ||
        output.z !== undefined)
    ) {
      if (output.position !== undefined)
        throw Error("Use position or x/y/z, not both.");
      if (output.x === undefined || output.y === undefined)
        throw Error(
          `${output.x === undefined ? "x" : "y"} is missing: a position needs both x and y (and z in 3D), or position= instead.`,
        );
      const values = ["x", "y", ...(output.z === undefined ? [] : ["z"])].map(
        (k) => {
          rows(output[k], k);
          return typeof output[k] === "number"
            ? np.full([count ?? scope?.length ?? 1], output[k])
            : array(output[k]);
        },
      );
      output.position = own(np.stack(values, 1));
      delete output.x;
      delete output.y;
      delete output.z;
    }
    // Raster colors: Image takes [height, width, 3 or 4] with the RGB dtype rule (integer
    // 0-255, float 0-1); Heatmap maps one value per cell, so an RGB grid there is an error.
    /** @param {unknown} value */
    const rasterShape = (value) =>
      typeof value === "string" || categoryInput(value) ? [] : shapeOf(value);
    if (kind === "Heatmap" && output.fill !== undefined) {
      const shape = rasterShape(output.fill);
      if (shape.length === 3 && [3, 4].includes(shape[2]))
        throw Error(
          `Heatmap.fill has shape [${shape.join(", ")}], an RGB image: Heatmap colors one value per cell through a colormap. Use Image (data=...) for [height, width, 3 or 4] colors.`,
        );
      // A plain grid's cells sit at their indices (TODO 134.15): column j at x = j, row i at
      // y = i (row 0 at the bottom). The automatic domain it reports (markDomainPublisher.js)
      // spans [-0.5, n - 0.5], unpadded (anchored: the grid fills its frame's extent), where the
      // axis is Cartesian and linear; an explicit domain or bounds still win, and a grid table
      // is placed by its coordinates.
      if (
        !gridDraw &&
        shape.length === 2 &&
        (options.get("coordinates") ?? "cartesian") === "cartesian"
      )
        output._cellBounds = Object.fromEntries(
          /** @type {[string, number][]} */ ([
            ["x", shape[1]],
            ["y", shape[0]],
          ])
            .filter(
              ([axis]) =>
                (options.get(axis + "Transform") ?? "linear") === "linear",
            )
            .map(([axis, size]) => [
              axis,
              Object.assign([-0.5, size - 0.5], { anchored: [true, true] }),
            ]),
        );
    }
    if (kind === "Image" && output.data !== undefined) {
      const shape = rasterShape(output.data),
        where = "Image.data";
      if (shape.length === 3 && [3, 4].includes(shape[2])) {
        const integer = integerData(
          output.data,
          typeof props.data === "string" ? props.data : undefined,
          scope,
        );
        if (output.data instanceof JaxArray) {
          // Float images pass through unchanged (no copy, same identity, so an unchanged image
          // is not uploaded again) and each source array is range-checked once, beside the
          // upload (namedMark defers checks that carry a `source`). Integer images are scaled
          // to 0-1 here and checked before they are shown.
          const source = output.data;
          if (integer) {
            output.data = own(
              array(source)
                .astype(np.float32)
                .mul(1 / 255),
            );
            rgbChecks.push({
              array: /** @type {JaxArray} */ (output.data),
              integer,
              where,
              raster: true,
            });
          } else if (!checkedRasters.has(source))
            rgbChecks.push({
              array: source,
              integer,
              where,
              raster: true,
              source,
            });
        } else {
          /** @type {number[]} */
          const raw = [];
          /** @param {unknown} value */
          const walk = (value) => {
            if (typeof value === "object" && value !== null)
              for (const item of /** @type {Iterable<unknown>} */ (value))
                walk(item);
            else raw.push(Number(value));
          };
          walk(output.data);
          checkRgbRange(raw, integer, where);
          output.data = own(
            np
              .array(Float32Array.from(raw, (v) => (integer ? v / 255 : v)))
              .reshape(shape),
          );
        }
      }
    }
    // RGB rows become per-instance colors (categoryColor / categoryOutline); an alpha channel
    // multiplies into the per-row opacity. No scale, colormap, or legend applies.
    /** @type {JaxArray | null} */
    let rgbAlpha = null;
    /** @param {string} channel @param {unknown} value */
    const prepareRgb = (channel, value) => {
      const input =
        /** @type {Record<string | symbol, unknown> & ArrayLike<ArrayLike<unknown>>} */ (
          value
        );
      const where = `${kind}.${channel}`;
      if (!capability(kind, "rowColors"))
        throw Error(
          `${where} does not accept RGB rows. Use Text for per-row colors.`,
        );
      if (channel === "outlineColor" && !capability(kind, "outlines"))
        throw Error(
          `${where} RGB outlines require a filled mark (${kindsWith("outlines").join(", ")}).`,
        );
      const spec =
        /** @type {import("./markPlanTypes.js").RgbSpec | undefined} */ (
          input[RGB]
        );
      const components = spec
        ? ["r", "g", "b", ...("a" in input ? ["a"] : [])].map(
            (k) => /** @type {ArrayLike<unknown> | JaxArray} */ (input[k]),
          )
        : null;
      const componentNames = spec
        ? ["r", "g", "b", "a"].map(
            (k) => spec[/** @type {keyof typeof spec} */ (k)],
          )
        : [];
      const columnName =
        typeof props[channel] === "string" ? props[channel] : undefined;
      const integer = components
        ? integerData(components[0], componentNames[0], scope)
        : integerData(input, columnName, scope);
      if (components) {
        if (
          components.some(
            (c, i) => integerData(c, componentNames[i], scope) !== integer,
          )
        )
          throw Error(
            `${where} RGB columns mix integer (0-255) and float (0-1) data; use one kind for all components.`,
          );
        components.forEach((c, i) => {
          if (shapeOf(c).length !== 1)
            throw Error(
              `${where}.${"rgba"[i]} must be a one-dimensional column.`,
            );
          rows(c, channel);
        });
      } else rows(input, channel);
      const channels = components ? components.length : shapeOf(input)[1];
      const scale = 1 / (integer ? 255 : 1);
      let matrix;
      if (
        components
          ? components.some((c) => c instanceof JaxArray)
          : input instanceof JaxArray
      ) {
        matrix = own(
          normalizeRgbMatrix(
            /** @type {RgbRows} */ (/** @type {unknown} */ (input)),
            components,
            integer,
          ),
        );
        rgbChecks.push({ array: matrix, integer, where });
      } else {
        const count = components
            ? /** @type {ArrayLike<unknown>} */ (components[0]).length
            : input.length,
          flat = new Float32Array(count * channels),
          raw = [];
        for (let i = 0; i < count; i++)
          for (let c = 0; c < channels; c++) {
            const value = Number(
              components
                ? /** @type {ArrayLike<unknown>} */ (components[c])[i]
                : input[i][c],
            );
            raw.push(value);
            flat[i * channels + c] = value * scale;
          }
        checkRgbRange(raw, integer, where);
        matrix = own(np.array(flat).reshape([count, channels]));
      }
      // Per-instance colors are linear, like categorical palettes after THREE.Color; RGB input is sRGB.
      const srgb = channels === 4 ? own(matrix.ref.slice([], [0, 3])) : matrix;
      const rgb = own(
        np.where(
          srgb.ref.lessEqual(0.04045),
          srgb.ref.div(12.92),
          np.power(srgb.ref.add(0.055).div(1.055), 2.4),
        ),
      );
      if (channels === 4) {
        if (channel === "outlineColor")
          throw Error(
            `${where} RGBA alpha is not supported on outlines; use three channels and outlineOpacity.`,
          );
        // Point marks' per-row opacity can carry an RGBA alpha channel.
        if (!capability(kind, "points"))
          throw Error(
            `${where} RGBA alpha is supported on Points, Points3D, and Text. Use three channels and opacity.`,
          );
        const alpha = own(matrix.ref.slice([], 3));
        rgbAlpha = rgbAlpha ? own(rgbAlpha.ref.mul(alpha.ref)) : alpha;
      }
      const ignored = [
        ...(props[channel + "Scale"] ? [channel + "Scale"] : []),
        ...(channel !== "outlineColor"
          ? ["cmapIndex", "levels", "quantize"].filter(
              (key) => props[key] !== undefined,
            )
          : []),
      ];
      if (ignored.length) {
        const warning = `${where} is RGB, so ${ignored.join(", ")} ${ignored.length > 1 ? "are" : "is"} ignored.`;
        if (!warnedRgbScales.has(warning)) {
          warnedRgbScales.add(warning);
          console.warn(warning);
        }
      }
      rgbChannels[channel] = true;
      if (channel === "outlineColor") {
        output.categoryOutline = rgb;
        delete output.outlineColor;
      } else {
        output.categoryColor = rgb;
        output[channel] = "#92989f";
      }
    };
    /** @type {JaxArray | null} */
    let mask = null;
    for (const channel of [
      "fill",
      "color",
      "shape",
      "outlineColor",
      "size",
      "width",
      "opacity",
    ]) {
      const key = channel === "shape" ? "shapeField" : channel,
        input = output[key];
      const dictionaryInput = /** @type {DictionaryColumn | undefined} */ (
        input
      );
      if (input === undefined) continue;
      // Datetime columns reach the GPU as milliseconds from the column's origin; legends
      // (colorbar and ramp ticks) map their bounds back through it.
      if (
        (typeof props[key] === "string" && scope?.has?.(props[key])) ||
        evaluatedMetadata.has(props[key])
      ) {
        const logical =
          typeof props[key] === "string"
            ? scope?.metadata?.(props[key])
            : evaluatedMetadata.get(props[key]);
        if (logical?.type === "datetime" || logical?.type === "duration")
          temporal[channel] = {
            type: logical.type,
            origin: logical.origin ?? 0,
            timezone: logical.timezone ?? "UTC",
          };
      }
      const rgbInput =
        /** @type {{[RGB]?: import("./markPlanTypes.js").RgbSpec} | null | undefined} */ (
          input
        );
      const rgbRows =
        capability(kind, "rows") !== false &&
        (channel === "fill" ||
          channel === "color" ||
          channel === "outlineColor") &&
        (rgbInput?.[RGB] ||
          (shapeOf(input).length === 2 && [3, 4].includes(shapeOf(input)[1])));
      if (rgbRows) {
        prepareRgb(channel, input);
        continue;
      }
      if (channel === "shape" && typeof input === "string")
        throw Error(`Missing data column: ${input}`);
      if (channel === "shape" && !capability(kind, "symbols"))
        throw Error(
          `${kind} does not support a shape channel; shape channels require flat point marks (${kindsWith("symbols").join(", ")}).`,
        );
      if (channel === "shape" && !props.shapeScale) {
        const names = dictionaryInput?.codes
          ? dictionaryInput.categories
          : Array.isArray(input)
            ? input
            : null;
        const strings =
          names?.length && names.every((v) => typeof v === "string");
        if (strings && names.every(isShape)) {
          rows(input, key);
          const table = own(np.array(new Float32Array(names.map(shapeCode))));
          if (dictionaryInput?.codes) {
            // Missing (-1) or out-of-range codes fall back to the circle, as the categorical path does.
            const codes = own(array(dictionaryInput?.codes).astype(np.int32));
            const valid = own(
              np.logicalAnd(
                codes.ref.greaterEqual(0),
                codes.ref.less(names.length),
              ),
            );
            const safe = own(np.where(valid.ref, codes.ref, 0));
            output.symbolCode = own(
              np.where(valid.ref, np.take(table.ref, safe.ref, 0), 0),
            );
          } else output.symbolCode = table;
          continue;
        }
        if (strings && names.some(isShape)) {
          const unknown = names.find((v) => !isShape(v));
          const warning = `${kind}.shape: ${JSON.stringify(unknown)} is not a shape name, so the values are treated as categories with automatic symbols. Register it with registerShape, or check the spelling.`;
          if (!warnedShapeColumns.has(warning)) {
            warnedShapeColumns.add(warning);
            console.warn(warning);
          }
        }
      }
      if (
        channel !== "shape" &&
        (typeof input === "string" || typeof input === "number")
      )
        continue;
      // size, width and opacity map categories to numbers; numeric input stays continuous.
      const numeric = channel in NUMERIC_CATEGORY_RANGES,
        family = channel === "shape" ? "shape" : numeric ? channel : "color";
      let scale = /** @type {PreparationCategoryScale | null | undefined} */ (
        props[channel + "Scale"]
      );
      if (numeric && !scale?.isCategorical && !categoryInput(input)) {
        // Row opacity is also consumed by feedback/lifecycle arithmetic, which holds device
        // references. Preserve ordinary numeric host columns as owned device rows instead
        // of leaving a plain array that that arithmetic would replace with its fallback 1.
        if (
          channel === "opacity" &&
          shapeOf(input).length &&
          !(input instanceof JaxArray)
        )
          output.opacity = own(array(input));
        continue;
      }
      if (!scale && (channel === "shape" || categoryInput(input))) {
        const identity = typeof props[key] === "string" ? props[key] : key;
        const named =
          typeof props[key] === "string" && scope?.has?.(props[key]);
        const sourceIdentity = named
          ? scope?.columnIdentity?.(/** @type {string} */ (props[key]))
          : null;
        scale = /** @type {PreparationCategoryScale | null | undefined} */ (
          sourceIdentity &&
            frame?.categoryFor?.(
              sourceIdentity,
              family,
              family === "color" ? state.palette : undefined,
            )
        );
        if (scale && named) {
          let origin = /** @type {import("./dataViewTypes.js").RowScope} */ (
            scope
          );
          while (
            sourceIdentity &&
            origin.parent &&
            origin.parent.columnIdentity?.(
              /** @type {string} */ (props[key]),
            ) === sourceIdentity
          )
            origin = origin.parent;
          const facetSource = frame?.facet?.sharedSource(family);
          if (
            facetSource?.columnIdentity?.(
              /** @type {string} */ (props[key]),
            ) === sourceIdentity
          )
            origin = /** @type {NonNullable<typeof facetSource>} */ (
              facetSource
            );
          const values = origin.get(/** @type {string} */ (props[key]));
          if (values?.categories) scale.include(values.categories);
          else if (Array.isArray(values)) scale.include(values);
        }
        scale ??= scope?.scale(
          identity + (family === "color" ? "" : ":" + family),
          family === "color" ? state.palette : undefined,
        );
        if (!scale) {
          scale = state.auto[
            identity + (family === "color" ? "" : ":" + family)
          ] ??= categorical(family === "color" ? { range: state.palette } : {});
          if (family === "color") {
            state.paletteKeys ??= {};
            const signature = JSON.stringify(state.palette ?? CATEGORY_COLORS);
            if (state.paletteKeys[identity] !== signature) {
              scale.setRange(state.palette ?? CATEGORY_COLORS);
              state.paletteKeys[identity] = signature;
            }
          }
        }
      }
      if (!scale || scale.isContinuous) continue;
      if (
        !capability(kind, "rowColors") &&
        !(kind === "Heatmap" && gridDraw && channel === "fill")
      )
        throw Error(
          `${kind} does not support per-observation categorical colors. Use categorical point, line, or uncertainty marks.`,
        );
      if (channel === "outlineColor" && !capability(kind, "outlines"))
        throw Error(
          `${kind} outlineColor categories require a filled mark (${kindsWith("outlines").join(", ")}).`,
        );
      rows(input, key);
      noteCategories(input, scale);
      // A host column's values join the scale as its codes are made, before the palette.
      const device =
        Boolean(dictionaryInput?.categories) || input instanceof JaxArray;
      let code = device ? null : categoryCodes(input, scale);
      const hidden = state.hidden[channel] ?? new Set();
      const palette = numeric
        ? [-1, ...scale.domain.keys()].map((i) =>
            numericCategoryValue(scale, i, channel),
          )
        : [
            scale.value(-1, channel),
            ...scale.domain.map((_, i) => scale.value(i, channel)),
          ];
      if (
        channel === "opacity" &&
        palette.some(
          (v) =>
            !(/** @type {number} */ (v) >= 0 && /** @type {number} */ (v) <= 1),
        )
      )
        throw Error(`${kind} opacity categories need values between 0 and 1.`);
      if (
        (channel === "size" || channel === "width") &&
        palette.some((v) => !(/** @type {number} */ (v) >= 0))
      )
        throw Error(`${kind} ${channel} categories need nonnegative values.`);
      const unknownShape =
        channel === "shape" && palette.find((v) => !isShape(v));
      if (
        unknownShape !== undefined &&
        /** @type {string | number | boolean} */ (unknownShape) !== false
      )
        throw Error(
          `Unknown point shape: ${unknownShape}. Use a built-in shape or register it with registerShape first.`,
        );
      const target =
        channel === "shape"
          ? "symbolCode"
          : numeric
            ? channel
            : channel === "outlineColor"
              ? "categoryOutline"
              : "categoryColor";
      // The same codes (one object) under the same categories and palette give the same values
      // as last time: reuse them, so the field writes nothing. A Force step re-prepares its
      // marks with the same columns; this was ~12 operations and a write per channel (TODO 33.4).
      // A host column's owner already caches its encoded codes. Use those as its identity too:
      // fresh columns or a changed domain replace the codes, while numerical table updates do not.
      const source = device ? (dictionaryInput?.codes ?? input) : code,
        signature = JSON.stringify([scale.domain, palette]);
      const cached = state.categoryValues?.get(channel);
      if (
        !hidden.size &&
        kind !== "Heatmap" &&
        cached &&
        cached.source === source &&
        cached.categories === dictionaryInput?.categories &&
        cached.signature === signature
      )
        output[target] = own(cached.values.ref);
      else {
        const table = np.array(
          channel === "shape"
            ? palette.map(shapeCode)
            : numeric
              ? new Float32Array(/** @type {number[]} */ (palette))
              : /** @type {string[]} */ (palette).map(rgb),
        );
        if (
          device &&
          !code &&
          !hidden.size &&
          kind !== "Heatmap" &&
          dictionaryInput?.codes instanceof JaxArray &&
          dictionaryInput.codes.dtype === np.int32
        ) {
          // A transform's codes: validation, the scale lookup and the table in one program.
          const { plan, params } = codeParams(
            /** @type {DictionaryColumn} */ (dictionaryInput),
            scale,
          );
          output[target] = own(
            planProgram(
              CODE_VALUES,
              plan,
              codeValueKernel,
            )({ codes: array(dictionaryInput?.codes), params, table }),
          );
        } else {
          code ??= categoryCodes(input, scale);
          own(table);
          output[target] = own(
            np.take(
              table.ref,
              /** @type {JaxArray} */ (code).ref.add(1).astype(np.int32),
              0,
            ),
          );
        }
        if (kind !== "Heatmap") {
          state.categoryValues ??= new Map();
          cached?.values.dispose();
          state.categoryValues.set(channel, {
            source,
            categories: dictionaryInput?.categories,
            signature,
            values: /** @type {JaxArray} */ (output[target]).ref,
          });
        }
      }
      if (channel === "outlineColor") delete output.outlineColor;
      else if (!numeric && channel !== "shape") output[channel] = "#92989f";
      // Which rows the legend hides: only read when a category is hidden (and a Heatmap draws
      // it as alpha).
      let current = null;
      if (hidden.size || kind === "Heatmap") {
        const visibility = own(
          np.array([1, ...scale.domain.map((v) => (hidden.has(v) ? 0 : 1))]),
        );
        current = own(
          np.take(
            visibility.ref,
            /** @type {JaxArray} */ (code).ref.add(1).astype(np.int32),
            0,
          ),
        );
        mask = mask
          ? own(np.logicalAnd(mask.ref, current.ref.greater(0)))
          : own(current.ref.greater(0));
      }
      if (kind === "Heatmap") {
        if (props.surfaceMode || props.zScale)
          throw Error("Categorical grid values cannot define surface height.");
        // Palette colors are linear; the image texture takes sRGB (it linearizes on upload).
        const linear = /** @type {JaxArray} */ (output.categoryColor);
        const rgbValues = own(
          np.where(
            linear.ref.lessEqual(0.0031308),
            linear.ref.mul(12.92),
            np
              .power(np.maximum(linear.ref, 0.0031308), 1 / 2.4)
              .mul(1.055)
              .sub(0.055),
          ),
        );
        output.fill = own(
          np.concatenate(
            [
              rgbValues.ref,
              /** @type {JaxArray} */ (current).ref.reshape([-1, 1]),
            ],
            1,
          ),
        );
        delete output.categoryColor;
        output.image = true;
        output.pixelated = true;
      }
      // Entries carry only the attribute this channel drives; legends merge channels
      // that share a column (guides.js categoryEntries).
      metadata[channel] = {
        scale,
        hidden,
        field: typeof props[key] === "string" ? props[key] : null,
        entries: scale.domain.map((v, i) => ({
          value: v,
          label: scale.label(v),
          visible: !hidden.has(v),
          ...(channel === "shape"
            ? { shape: scale.value(i, "shape") }
            : numeric
              ? { [channel]: palette[i + 1] }
              : channel === "outlineColor"
                ? { outline: scale.value(i) }
                : { color: scale.value(i) }),
        })),
      };
    }
    // RGBA alpha multiplies into whatever opacity the mark has: a number, a per-row array, or a
    // column (its own extent still drives the opacity legend, see opacitySource).
    let opacitySource, rowOpacity;
    if (rgbAlpha) {
      const base = output.opacity;
      if (
        shapeOf(
          /** @type {Partial<DictionaryColumn> | null | undefined} */ (base)
            ?.codes ?? base,
        ).length
      ) {
        rows(base, "opacity");
        opacitySource = base;
        output.opacity = own(
          array(base)
            .astype(np.float32)
            .mul(/** @type {JaxArray} */ (rgbAlpha).ref),
        );
      } else rowOpacity = rgbAlpha;
    }
    let gridValues = null,
      gridPlacement = null;
    if (gridDraw) {
      const { layout } = gridDraw;
      const grid = /** @type {NonNullable<typeof tableGrid>} */ (gridDraw.grid);
      if (categoryInput(output.fill))
        throw Error(
          "A Heatmap of interpolated categories requires nearest color encoding.",
        );
      let values;
      if (kind === "Image") {
        // Colors: an [n, 3 or 4] column or { r, g, b, a } columns, 0-255 integers or 0-1 floats.
        const input = /** @type {Record<string | symbol, unknown>} */ (
            output.fill
          ),
          spec =
            /** @type {import("./markPlanTypes.js").RgbSpec | undefined} */ (
              input?.[RGB]
            ),
          where = "Image.fill";
        const components = spec
          ? ["r", "g", "b", ...("a" in input ? ["a"] : [])].map(
              (k) => /** @type {ArrayLike<unknown> | JaxArray} */ (input[k]),
            )
          : null;
        const shape = components ? null : shapeOf(input);
        if (
          !components &&
          !(
            /** @type {number[]} */ (shape).length === 2 &&
            [3, 4].includes(/** @type {number[]} */ (shape)[1])
          )
        )
          throw Error(
            `${where} on a grid table is an [n, 3 or 4] column or { r, g, b, a } columns (TODO 51).`,
          );
        const integer = components
          ? integerData(components[0], spec?.r, scope)
          : integerData(input, props.fill, scope);
        values = own(
          normalizeRgbMatrix(
            /** @type {RgbRows} */ (/** @type {unknown} */ (input)),
            components,
            integer,
          ),
        );
        rgbChecks.push({ array: values, integer, where });
      } else values = own(array(output.fill));
      if (kind === "Heatmap" && !output.image) gridValues = values;
      // A padded view's hidden cells (a Filter's) draw transparent, as missing values do.
      const shown = scope?.physical ? scope.valid : null;
      const raster = own(
        gridRaster(grid, layout, values.ref, shown ? shown.ref : null),
      );
      if (kind === "Image") {
        output.data = raster;
        delete output.fill;
      } else output.fill = raster;
      output.shape = props.shape ?? "square";
      const xdim = grid.dims[layout.columns],
        ydim = grid.dims[layout.rows];
      // A time on an axis counts from the axis's origin (as datetimeAxis does for columns).
      /** @type {Record<string, number>} */
      const shifts = { x: 0, y: 0 };
      // A latitude's cells end at the poles: an edge past one (half a step beyond the last
      // coordinate) would fold over it on a map or the globe.
      /** @param {string} axis */
      const latitude = (axis) =>
        axis === "y" && options.get("coordinates") === "spherical";
      /** @param {string} axis @param {import("./dataViewTypes.js").GridDimension} dim */
      const extentOf = (axis, dim) => {
        const [lo, hi] = dimExtent(dim);
        return latitude(axis)
          ? [Math.max(lo, -90), Math.min(hi, 90)]
          : [lo, hi];
      };
      /** @param {string} axis @param {import("./dataViewTypes.js").GridDimension} dim */
      const place = (axis, dim) => {
        if (props[axis + "bounds"] !== undefined) return props[axis + "bounds"];
        const extent = extentOf(axis, dim),
          logical = dim.metadata;
        if (logical?.type !== "datetime") return extent;
        const shift = bindDatetimeAxis(bindings, axis, logical);
        shifts[axis] = shift;
        return [extent[0] + shift, extent[1] + shift];
      };
      if (layout.curvilinear) {
        if (props.surfaceMode)
          throw Error(
            `${kind}.surfaceMode draws a grid of 1-D coordinates; a curvilinear grid draws flat, on a map or on the globe.`,
          );
        // Its own cells, each corner placed by the grid's positions (computed on the device).
        const x = pairValues(grid, layout.x),
          y = pairValues(grid, layout.y);
        const rows = grid.dims[layout.rows].size,
          columns = grid.dims[layout.columns].size;
        output._gridMesh = {
          corners: own(curvilinearCorners(x, y, rows, columns)),
          rows,
          columns,
        };
      } else {
        output.xbounds = place("x", xdim);
        output.ybounds = place("y", ydim);
        // Uneven, descending or rotated coordinates map through remap tables; an image's rows
        // are read from the top unless remapped, so its y always is.
        const image = kind === "Image" || output.image,
          clamped = extentOf("y", ydim).some(
            (v, i) => v !== dimExtent(ydim)[i],
          );
        const x = axisRemap(xdim);
        const y =
          clamped || (image && !axisRemap(ydim))
            ? remapTable(ydim, ...extentOf("y", ydim), REMAP_SIZE)
            : axisRemap(ydim);
        output._gridRemap = x || y ? { x, y } : null;
      }
      // A grid table's field blends unless pixelated is set (TODO 134.15).
      output._gridTable = true;
      gridPlacement = {
        grid,
        layout,
        shifts,
        field: typeof props.fill === "string" ? props.fill : null,
      };
    }
    if (mask && Object.values(state.hidden).some((s) => s.size)) {
      for (const key of ["position", "start", "end", "x", "x0"])
        if (output[key] !== undefined) {
          const v = own(array(output[key]));
          rows(v, key);
          output[key] = own(
            np.where(
              v.shape.length > 1 ? mask.ref.reshape([-1, 1]) : mask.ref,
              v.ref,
              np.nan,
            ),
          );
        }
    }
    for (const key of [
      "position",
      "start",
      "end",
      "x",
      "y",
      "lower",
      "upper",
      "baseline",
      "fill",
      "color",
      "size",
      "width",
      "symbolCode",
    ]) {
      const v = output[key];
      if (v === undefined) continue;
      if (typeof v === "string" && !["fill", "color"].includes(key))
        throw Error(`Missing or nonnumeric data column: ${v}`);
    }
    if (["Anchor", "Points", "Points3D", "Line", "Text3D"].includes(kind))
      validateFields(
        Object.fromEntries(
          [
            "position",
            "fill",
            "color",
            "size",
            "width",
            "symbolCode",
            "categoryColor",
          ]
            .filter((k) => output[k] !== undefined)
            .map((k) => [k, output[k]]),
        ),
      );
    if (kind === "Area") {
      // A constant edge outside the value scale cannot bound the area (0 on a log axis).
      const lower = output.lower ?? 0,
        axis = props.axis === "x" ? "x" : "y",
        transform = options?.get?.(`${axis}Transform`) ?? "linear";
      if (
        typeof lower === "number" &&
        !scaleTransform(transform).inDomain(lower)
      )
        throw Error(
          `Area.lower ${lower} is outside the ${transform} ${axis} axis's domain: pass a lower edge on it, such as lower={1}.`,
        );
      validateUncertainty("area", output.x, lower, output.upper, axis);
    }
    if (kind === "ErrorBars")
      validateUncertainty(
        "errors",
        output.position,
        output.lower,
        output.upper,
        /** @type {string | undefined} */ (output.axis),
      );
    delete output.shapeField;
    for (const k of [
      "fillScale",
      "colorScale",
      "shapeScale",
      "sizeScale",
      "widthScale",
      "outlineColorScale",
      "opacityScale",
    ])
      delete output[k];
    if (topology.length || scope?.topology)
      output._categoryTopology = JSON.stringify([
        scope?.topology,
        topology,
        Object.entries(state.hidden).map(([k, v]) => [k, [...v]]),
      ]);
    let active = true,
      eventVersion = 0;
    // The tolerant pick's onnearest* handlers (TODO 72) get their row as the pointer's do.
    const handlers =
      /** @type {[string, (event: {instanceId: number; [key: string]: unknown}) => unknown][]} */ (
        Object.entries(output).filter(
          ([key, value]) =>
            /^on(pointer|click|dblclick|contextmenu|nearest)/.test(key) &&
            typeof value === "function",
        )
      );
    if (scope?.identityRows && handlers.length) {
      // The rows are the source rows: nothing to map, nothing to read back (TODO 29.1).
      for (const [key, handler] of handlers)
        output[key] = (
          /** @type {{instanceId: number; [key: string]: unknown}} */ event,
        ) => {
          const index = event.instanceId;
          if (!Number.isInteger(index) || index < 0) return handler(event);
          return handler({ ...event, rowIndex: index, sourceRow: index });
        };
    } else if (scope?.sourceIndices && handlers.length) {
      // The source rows are gathered on the first event, not at every preparation, and each
      // event reads its row once; `sourceRow` passes it on (interactionRows would read it again).
      /** @type {JaxArray | null | undefined} */
      let source;
      const sourceRows = () => {
        if (source === undefined && active) {
          source =
            /** @type {NonNullable<typeof scope.sourceIndices>} */ (
              scope.sourceIndices
            )() ?? null;
          if (source) own(source);
        }
        return source ?? null;
      };
      if (!scope.aggregate) {
        for (const [key, handler] of handlers)
          output[key] = async (
            /** @type {{instanceId: number; [key: string]: unknown}} */ event,
          ) => {
            const index = event.instanceId;
            const rows =
              Number.isInteger(index) && index >= 0 ? sourceRows() : null;
            if (!rows || index >= rows.shape[0]) return handler(event);
            const version = ++eventVersion;
            const original = Number(
              (
                await np
                  .take(rows.ref, np.array(index, { dtype: np.int32 }), 0)
                  .data()
              )[0],
            );
            if (active && (!key.endsWith("move") || version === eventVersion))
              handler({
                ...event,
                instanceId: original,
                rowIndex: index,
                sourceRow: original,
              });
          };
      } else if (scope.provenance) {
        for (const [key, handler] of handlers)
          output[key] = async (
            /** @type {{instanceId: number; [key: string]: unknown}} */ event,
          ) => {
            const index = event.instanceId;
            if (!Number.isInteger(index) || index < 0) return handler(event);
            const version = ++eventVersion;
            const aggregate =
              await /** @type {NonNullable<typeof scope.aggregateInfo>} */ (
                scope.aggregateInfo
              )(index);
            if (active && (!key.endsWith("move") || version === eventVersion))
              handler({
                ...event,
                aggregate,
                getContributors: () =>
                  /** @type {NonNullable<typeof scope.contributors>} */ (
                    scope.contributors
                  )(index),
              });
          };
      }
    }
    // Disposed once; later preparation steps add what they own with `own` (TODO 32.1).
    return disposeOnce({
      props: output,
      channelResults,
      // A grid table's field (TODO 51): its values per row (the color scale's extent) and what
      // the raster draws (tooltips find the cell under the pointer through it).
      gridValues,
      gridPlacement,
      metadata,
      temporal,
      frameBindings: {
        axes: bindings.axes,
        categoryAxes: bindings.categoryAxes,
      },
      scales,
      rgbChecks,
      // Channels driven by RGB rows: no continuous scale binds to them.
      rgb: rgbChannels,
      opacitySource,
      rowOpacity,
      dispose() {
        active = false;
        owned.forEach((a) => a.dispose());
      },
    });
  } catch (error) {
    owned.forEach((a) => a.dispose());
    throw error;
  }
}
