// @ts-check
/**
 * @typedef {import("./expressionPlanTypes.js").ExpressionScope} ExpressionScope
 * @typedef {import("./expressionPlanTypes.js").RuntimePort} RuntimePort
 * @typedef {import("./expressionPlanTypes.js").RuntimePorts} RuntimePorts
 * @typedef {import("./expressionPlanTypes.js").LoweredRoots} LoweredRoots
 * @typedef {import("./expressionPlanTypes.js").LoweredOperand} LoweredOperand
 * @typedef {import("./expressionPlanTypes.js").Binding} Binding
 * @typedef {import("./expressionPlanTypes.js").ProgramPlan} ProgramPlan
 * @typedef {import("./expressionPlanTypes.js").ProgramRecord} ProgramRecord
 * @typedef {import("./expressionPlanTypes.js").ExecutionInputs} ExecutionInputs
 * @typedef {import("./expressionPlanTypes.js").PlanStructure} PlanStructure
 * @typedef {import("./expressionPlanTypes.js").EvaluationOptions} EvaluationOptions
 * @typedef {import("./expressionPlanTypes.js").ExpressionResult} ExpressionResult
 * @typedef {import("./expressionPlanTypes.js").ExpressionEvaluator} ExpressionEvaluator
 * @typedef {import("./expressionPlanTypes.js").ExpressionStats} ExpressionStats
 * @typedef {import("./expressionPlanTypes.js").TracedDescriptions} TracedDescriptions
 * @typedef {import("./expressionPlanTypes.js").ResultDescription} ResultDescription
 * @typedef {import("./expressionPlanTypes.js").OperationLiteral} OperationLiteral
 * @typedef {import("../publicTypes.js").Expression} Expression
 * @typedef {import("./dataViewTypes.js").ColumnMetadata} ColumnMetadata
 */
/**
 * Consumer-owned, bounded expression programs. Numerical operators and reductions stay in
 * evaluateExpression; this helper admits ordinary row columns, supplies them and literal slots
 * as runtime buffers, and owns the resulting JIT plans until eviction or component teardown.
 * All unsupported expressions keep the eager evaluator and its normal diagnostics/lifetime.
 */
import { Array as JaxArray, numpy as np } from "@hmplot/jax";
import {
  evaluateExpressionEager,
  isExpression,
  nodeField,
  rebuildExpression,
  expressionFields,
  expressionHasReduction,
  REDUCTIONS,
} from "./expressions.js";
import { nameNode, isLiteral, literal, field } from "./names.js";
import { asArray, isDeviceArray } from "./data.js";
import { deviceArray, deviceScalar } from "./deviceParams.js";
import { planProgram } from "./programs.js";
import {
  isViewStateSubtree,
  isConstantSubtree,
  hostValue,
  viewState as makeViewState,
} from "./viewState.js";
import { ownCacheEntry } from "./cacheEntries.js";
import { LIMITS, limitError } from "./limits.js";
import {
  semanticMetadata,
  tracedMetadata,
  metadataSource,
  describedMetadata,
} from "./expressionMetadata.js";

/** @param {unknown} value @returns {value is OperationLiteral} */
const operationLiteral = (value) =>
  Boolean(
    value &&
    typeof value === "object" &&
    "__expressionLiteral" in value &&
    value.__expressionLiteral,
  );

const OPS = new Set([
  "add",
  "subtract",
  "multiply",
  "divide",
  "power",
  "negative",
  "abs",
  "square",
  "sqrt",
  "log",
  "exp",
  "minimum",
  "maximum",
  "clip",
  "sin",
  "cos",
  "floor",
  "round",
  "equal",
  "not_equal",
  "less",
  "less_equal",
  "greater",
  "greater_equal",
  "logical_and",
  "logical_or",
  "logical_not",
  "where",
  "is_missing",
  "is_finite",
  "coalesce",
  "sum",
  "count",
  "mean",
  "min",
  "max",
  "std",
  "variance",
  "median",
  "quantile",
  "mode",
  "first",
  "last",
  "any",
  "all",
  "cumsum",
  "lag",
  "lead",
  "window",
]);
const INELIGIBLE = Error("Expression requires the ordinary evaluator.");
// The logical types a plan admits for a column.
const PLAN_TYPES = [
  "numeric",
  "boolean",
  "datetime",
  "duration",
  "categorical",
  "ordinal",
];
// Plan metadata must survive JSON snapshotting without changing any data values. Custom
// metadata stays on the ordinary evaluator rather than acquiring serialized semantics. Column
// metadata reaches here as its semantic part (expressionMetadata.js).
/** @param {unknown} root @returns {boolean} */
function losslessMetadata(root) {
  if (root === undefined) return true;
  /** @type {Set<object>} */
  const ancestors = new Set();
  let nodes = 0,
    characters = 0;
  /** @param {unknown} value @param {number} [depth] @returns {boolean} */
  const visit = (value, depth = 0) => {
    if (++nodes > 256 || depth > 64) return false;
    if (typeof value === "string") return (characters += value.length) <= 65536;
    if (value === null || typeof value === "boolean") return true;
    if (typeof value === "number")
      return Number.isFinite(value) && !Object.is(value, -0);
    if (!value || typeof value !== "object" || ancestors.has(value))
      return false;
    const array = Array.isArray(value),
      prototype = Object.getPrototypeOf(value);
    if (
      array
        ? prototype !== Array.prototype || value.length > 256
        : prototype !== Object.prototype
    )
      return false;
    if ("toJSON" in value) return false;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length > 257) return false;
    if (
      ownKeys.some(
        (key) =>
          typeof key !== "string" ||
          (!Object.getOwnPropertyDescriptor(value, key)?.enumerable &&
            !(array && key === "length")),
      )
    )
      return false;
    // The preceding own-key check excludes symbols; array length is the only non-data key.
    const keys = /** @type {string[]} */ (
      array ? ownKeys.filter((key) => key !== "length") : ownKeys
    );
    if (
      array &&
      (keys.length !== value.length ||
        keys.some((key, index) => key !== String(index)))
    )
      return false;
    ancestors.add(value);
    try {
      return keys.every((key) => {
        if ((characters += key.length) > 65536) return false;
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return (
          descriptor &&
          Object.hasOwn(descriptor, "value") &&
          visit(descriptor.value, depth + 1)
        );
      });
    } finally {
      ancestors.delete(value);
    }
  };
  return visit(root);
}
// These are operation/layout checks only. Source metadata and dtype remain per-publication
// checks, because the same authored column can acquire a different logical type or shape.
/** @param {unknown} root */
function authoredForm(root) {
  const seen = new Set();
  let frozen = true,
    fields = false,
    nodes = 0;
  /** @param {unknown} node @param {number} [depth] @returns {boolean} */
  const visit = (node, depth = 0) => {
    if (depth > 64) return false;
    if (typeof node === "string") node = nameNode(node);
    if (isLiteral(node)) {
      frozen = false;
      return typeof node.value === "number" || typeof node.value === "boolean";
    }
    if (node === null || typeof node === "number" || typeof node === "boolean")
      return true;
    if (operationLiteral(node)) return losslessMetadata(node);
    if (!isExpression(node)) {
      if (node && typeof node === "object") frozen = false;
      return false;
    }
    if (!Array.isArray(node.args)) {
      frozen = false;
      return false;
    }
    if (seen.has(node)) return true;
    seen.add(node);
    frozen &&= Object.isFrozen(node) && Object.isFrozen(node.args);
    if (++nodes > 256) return false;
    if (isViewStateSubtree(node)) return true;
    const name = nodeField(node);
    if (name !== null) {
      if (typeof name !== "string") {
        frozen = false;
        return false;
      }
      fields = true;
      return true;
    }
    return OPS.has(node.op) && node.args.every((arg) => visit(arg, depth + 1));
  };
  const supported = visit(root);
  return { supported, frozen };
}

// The planner's stages, in order (Stage 116.3), after authoredForm has qualified the
// authored tree: normalize, lower, bind, plan (whose JSON is the program key), record and
// kernel. Each takes what the ones before returned; INELIGIBLE from any of them leaves the
// expression on the eager evaluator. prepare() runs them and owns the arrays they acquire.

/**
 * Normalize: host-managed values become runtime parameters, fields named
 * "@expression_parameter:N" (cached data-only reductions, view-state scalars, window sizes and
 * the scope's scalar inputs), so their values never enter a plan.
 * Returns { roots, runtime }: the rewritten roots and each parameter's { value, metadata }.
 */
/** @param {unknown[]} roots @param {ExpressionScope} scope @param {{broadcast: boolean, state?: import("./expressionPlanTypes.js").ViewStateRecord, reductionCache?: import("./expressionPlanTypes.js").ReductionCache}} options */
function normalizeRoots(roots, scope, { broadcast, state, reductionCache }) {
  /** @type {RuntimePorts} */
  const runtime = new Map();
  /** @type {Map<Expression, unknown>} */
  const normalized = new Map();
  /** @param {RuntimePort} value */
  const parameter = (value) => {
    const name = `@expression_parameter:${runtime.size}`;
    runtime.set(name, value);
    return field(name);
  };
  // View-only arithmetic retains the evaluator's float64 host semantics. The resulting
  // float32 scalar is a runtime input, never a captured clock or pointer value.
  /** @param {unknown} node @returns {unknown} */
  const normalize = (node) => {
    if (typeof node === "string") node = nameNode(node);
    if (!isExpression(node)) return node;
    if (normalized.has(node)) return normalized.get(node);
    /** @type {unknown} */
    let out = node;
    if (
      reductionCache &&
      Object.hasOwn(REDUCTIONS, node.op) &&
      ![...expressionFields(node)].some((name) => name.startsWith("@"))
    ) {
      let value = reductionCache.get(node);
      if (!value) {
        const evaluated = evaluateExpressionEager(node, scope, {
          broadcast: false,
          reductionCache,
          viewState: state,
        });
        evaluated.dispose();
        value = reductionCache.get(node);
      }
      if (!value) throw INELIGIBLE;
      out = parameter(value);
    } else if (isViewStateSubtree(node)) {
      if (!state || !broadcast) throw INELIGIBLE;
      const value = hostValue(node, state);
      if (typeof value !== "number" && typeof value !== "boolean")
        throw INELIGIBLE;
      out = parameter({ value: Number(value), metadata: { type: "numeric" } });
    } else if (node.op === "window") {
      const authored = node.args[2] ?? 5;
      const size =
        isExpression(authored) && isConstantSubtree(authored)
          ? hostValue(authored, state)
          : authored;
      if (!Number.isInteger(size) || size < 1) throw INELIGIBLE;
      const sizeField = parameter({
        value: size,
        metadata: { type: "numeric" },
      });
      out = rebuildExpression(node, [
        normalize(node.args[0]),
        node.args[1],
        sizeField,
      ]);
    } else {
      const name = nodeField(node);
      const scalar = name === null ? undefined : scope.scalarInput?.(name);
      if (typeof scalar === "number") {
        // A scope scalar (Simulate's @dt) is one runtime input for this evaluation.
        out = parameter({ value: scalar, metadata: { type: "numeric" } });
      } else if (name === null)
        out = rebuildExpression(node, node.args.map(normalize));
    }
    normalized.set(node, out);
    return out;
  };
  return { roots: roots.map(normalize), runtime };
}

/**
 * Lower: each normalized root becomes a canonical operation tree, in which a numeric or
 * boolean literal is a slot ({ scalar, kind, integer }, its value in `literals`) and a field
 * is a typed read ({ field, type }).
 * Returns { roots, fields, literals }: the trees, the fields they read (a Set, in first-read
 * order) and the literal values by slot.
 */
/** @param {unknown[]} roots @param {ExpressionScope} scope @param {RuntimePorts} runtime @returns {LoweredRoots} */
function lowerRoots(roots, scope, runtime) {
  /** @type {(number | boolean)[]} */
  const literals = [];
  /** @type {Set<string>} */
  const fields = new Set();
  /** @param {number | boolean} value */
  const slot = (value) => {
    const index = literals.length;
    literals.push(value);
    return {
      scalar: index,
      kind: typeof value,
      integer: Number.isInteger(value),
    };
  };
  /** @param {string} name */
  const read = (name) => {
    if (!runtime.has(name) && !scope.has?.(name)) throw INELIGIBLE;
    const metadata = runtime.has(name)
      ? runtime.get(name)?.metadata
      : scope.metadata?.(name);
    if (
      !runtime.has(name) &&
      metadata &&
      !(typeof metadata.type === "string" && PLAN_TYPES.includes(metadata.type))
    )
      throw INELIGIBLE;
    fields.add(name);
    return { field: name, type: metadata?.type ?? "numeric" };
  };
  const lowered = roots.map((root) => {
    /** @type {Map<Expression, LoweredOperand>} */
    const seen = new Map();
    let nodes = 0;
    /** @param {unknown} node @param {number} [depth] @returns {LoweredOperand} */
    const lower = (node, depth = 0) => {
      if (depth > /** @type {number} */ (LIMITS.expressionDepth.value))
        throw limitError("expressionDepth");
      if (typeof node === "string") node = nameNode(node);
      if (isLiteral(node)) {
        if (typeof node.value !== "number" && typeof node.value !== "boolean")
          throw INELIGIBLE;
        node = node.value;
      }
      if (node === null) return null; // count() is the only admitted null operand.
      if (typeof node === "number" || typeof node === "boolean")
        return slot(node);
      if (operationLiteral(node)) {
        if (!losslessMetadata(node)) throw INELIGIBLE;
        for (const name of [node.by ?? [], node.orderBy ?? []].flat())
          read(name);
        return node;
      }
      if (!isExpression(node)) throw INELIGIBLE;
      const previous = seen.get(node);
      if (previous !== undefined) return previous;
      if (++nodes > /** @type {number} */ (LIMITS.expressionOperations.value))
        throw limitError("expressionOperations");
      const name = nodeField(node);
      if (name !== null) {
        const out = read(name);
        seen.set(node, out);
        return out;
      }
      if (!OPS.has(node.op)) throw INELIGIBLE;
      const out = {
        op: node.op,
        args: node.args.map((arg) => lower(arg, depth + 1)),
      };
      seen.set(node, out);
      return out;
    };
    return lower(root);
  });
  return { roots: lowered, fields, literals };
}

/**
 * Bind: each field read becomes a device array (`columns`), with its semantic metadata, its
 * dictionary when it is categorical, and, for a padded view (`physical`), the scope's valid
 * mask. Arrays this binding creates or acquires go to `held` (released unless a program
 * consumes them); the scope's columns it reads are borrowed.
 * Returns { columns, valid, fieldMetadata, dictionaries, described }; `described` keeps each
 * field's full metadata for describeResults().
 */
/** @param {Set<string>} fields @param {ExpressionScope} scope @param {RuntimePorts} runtime @param {{rowCount: number, physical: boolean}} layout @param {JaxArray[]} held @returns {Binding} */
function bindColumns(fields, scope, runtime, { rowCount, physical }, held) {
  /** @param {JaxArray} value */
  const hold = (value) => (held.push(value), value);
  /** @type {Binding["columns"]} */
  const columns = {};
  /** @type {Binding["fieldMetadata"]} */
  const fieldMetadata = {};
  /** @type {Binding["dictionaries"]} */
  const dictionaries = {};
  /** @type {Binding["described"]} */
  const described = new Map();
  for (const field of fields) {
    const port = runtime.get(field);
    const source = port
      ? port.categories
        ? { codes: port.value, categories: port.categories }
        : port.value
      : scope.get(field);
    // The ordinary evaluator falls back to a column's own logical metadata, and
    // dictionary-encodes plain boolean/string arrays during reductions. Preserve
    // that representation by leaving those host arrays on its existing path.
    const envelope =
      typeof source === "object" && source !== null ? source : null;
    const full =
      port?.metadata ??
      scope.metadata?.(field) ??
      (envelope && "metadata" in envelope ? envelope.metadata : undefined);
    const metadata = semanticMetadata(full);
    described.set(field, full);
    let categories =
      envelope && "categories" in envelope ? envelope.categories : undefined;
    let input =
      envelope && "codes" in envelope ? (envelope.codes ?? source) : source;
    if (
      !categories &&
      Array.isArray(source) &&
      source.some(
        (value) => typeof value === "boolean" || typeof value === "string",
      )
    ) {
      categories = [...new Set(source)].filter(
        (value) =>
          typeof value === "boolean" ||
          typeof value === "string" ||
          (typeof value === "number" && Number.isFinite(value)),
      );
      const index = new Map(categories.map((value, at) => [value, at]));
      input = Int32Array.from(source, (value) => index.get(value) ?? -1);
    }
    if (
      !losslessMetadata(metadata) ||
      (metadata &&
        !(
          typeof metadata.type === "string" &&
          PLAN_TYPES.includes(metadata.type)
        )) ||
      !(
        input instanceof JaxArray ||
        Array.isArray(input) ||
        ArrayBuffer.isView(input) ||
        typeof input === "number" ||
        typeof input === "boolean"
      )
    )
      throw INELIGIBLE;
    fieldMetadata[field] =
      metadata === undefined ? undefined : JSON.parse(JSON.stringify(metadata));
    if (categories) dictionaries[field] = categories;
    columns[field] = hold(asArray(input));
    if (
      columns[field].shape.length > 1 ||
      (columns[field].shape.length &&
        columns[field].shape[0] !== rowCount &&
        !scope.grid)
    )
      throw INELIGIBLE;
    if (!["float32", "int32", "bool"].includes(columns[field].dtype))
      throw INELIGIBLE;
  }
  // Ordinary host scalars beside int32 arrays can promote differently by operand side.
  // Keep those mixed cases on the reference path until scalar ports encode that policy.
  if (
    Object.keys(columns).some(
      (name) => !runtime.has(name) && columns[name].shape.length === 0,
    ) &&
    Object.values(columns).some((array) => array.dtype === "int32")
  )
    throw INELIGIBLE;
  const valid = physical ? hold(asArray(scope.valid)) : null;
  if (valid && (valid.shape.length !== 1 || valid.shape[0] !== rowCount))
    throw INELIGIBLE;
  return { columns, valid, fieldMetadata, dictionaries, described };
}

/**
 * Plan: everything a program's trace depends on and no literal value. Its JSON is the
 * program's key: equal plans share one program.
 */
/** @param {unknown[]} roots @param {LoweredRoots} lowered @param {Binding} bound @param {PlanStructure} layout @returns {ProgramPlan} */
function programPlan(
  roots,
  lowered,
  bound,
  { broadcast, physical, prefix, rowCount },
) {
  return {
    roots: lowered.roots,
    fields: [...lowered.fields],
    broadcast,
    physical,
    prefix,
    fieldMetadata: bound.fieldMetadata,
    dictionaries: bound.dictionaries,
    rowCount,
    integerSlots: lowered.literals.map(Number.isInteger),
    inputs: Object.entries(bound.columns).map(([name, array]) => [
      name,
      array.dtype,
      array.shape,
    ]),
    valid: bound.valid ? [bound.valid.dtype, bound.valid.shape] : null,
    categoryLiterals: categoryLiterals(roots, bound.dictionaries),
  };
}

// Category lookup depends on authored literal identity, unlike a numeric threshold.
// Dictionary lookup remains host-managed and specializes only those comparisons. An
// operand computed from a dictionary column (lag, first, mode, ...) is categorical too.
/** @param {unknown[]} roots @param {Binding["dictionaries"]} dictionaries */
function categoryLiterals(roots, dictionaries) {
  /** @type {(number | boolean | string)[]} */
  const out = [];
  /** @type {Map<Expression, boolean>} */
  const reads = new Map();
  const visited = new Set();
  /** @param {unknown} node @returns {boolean} */
  const categorical = (node) => {
    const name =
      typeof node === "string" ? nodeField(nameNode(node)) : nodeField(node);
    if (name !== null) return Boolean(dictionaries[name]);
    if (!isExpression(node)) return false;
    if (!reads.has(node)) reads.set(node, node.args.some(categorical));
    return reads.get(node) ?? false;
  };
  /** @param {unknown} node */
  const categoryLookups = (node) => {
    if (!isExpression(node) || visited.has(node)) return;
    visited.add(node);
    if (
      [
        "equal",
        "not_equal",
        "less",
        "less_equal",
        "greater",
        "greater_equal",
      ].includes(node.op)
    ) {
      for (const [a, b] of [
        [0, 1],
        [1, 0],
      ]) {
        const value = isLiteral(node.args[b])
          ? node.args[b].value
          : node.args[b];
        // Categories match by Object.is, which JSON alone would not keep for -0.
        if (
          (typeof value === "number" || typeof value === "boolean") &&
          categorical(node.args[a])
        )
          out.push(Object.is(value, -0) ? "-0" : value);
      }
    }
    node.args.forEach(categoryLookups);
  };
  roots.forEach(categoryLookups);
  return out;
}

/**
 * Record: the evaluator ASTs a plan's program traces, with each literal a slot read from a
 * buffer, and the descriptions its traces produce.
 */
/** @param {LoweredRoots} lowered @returns {ProgramRecord} */
function programRecord(lowered) {
  // The cached evaluator AST's original literals are substituted exclusively through
  // buffer slices; no numerical literal value enters the canonical plan above.
  /** @type {Map<object, unknown>} */
  const copied = new Map();
  /** @param {LoweredOperand} node @returns {unknown} */
  const snapshot = (node) => {
    if (node === null || operationLiteral(node)) return node;
    if ("scalar" in node)
      return Object.freeze({
        ...literal(lowered.literals[node.scalar]),
        scalarSlot: node.scalar,
      });
    if ("field" in node) return field(node.field);
    if (copied.has(node)) return copied.get(node);
    const frozen = rebuildExpression(node, node.args.map(snapshot));
    copied.set(node, frozen);
    return frozen;
  };
  return {
    roots: lowered.roots.map(snapshot),
    fields: [...lowered.fields],
    descriptions: new Map(),
  };
}

/** @param {ExecutionInputs} inputs */
const signature = (inputs) =>
  JSON.stringify(
    Object.entries(inputs.columns).map(([name, array]) => [
      name,
      array.dtype,
      array.shape,
    ]),
  );

/**
 * Kernel: what planProgram traces for a record: the eager evaluator over the bound inputs,
 * returning the roots' device values and recording their descriptions by input signature.
 */
/** @param {ProgramRecord} record @returns {(plan: ProgramPlan, inputs: ExecutionInputs) => JaxArray[]} */
function programKernel(record) {
  return (_plan, inputs) => {
    /** @type {Binding["described"]} */
    const traced = new Map();
    /** @type {ExpressionScope & {resolve(field: string): unknown}} */
    const inputScope = {
      length: _plan.rowCount,
      physical: _plan.physical,
      prefix: _plan.prefix,
      valid: inputs.valid,
      has: (field) => Object.hasOwn(inputs.columns, field),
      get: (field) =>
        _plan.dictionaries[field]
          ? {
              codes: inputs.columns[field],
              categories: _plan.dictionaries[field],
            }
          : inputs.columns[field],
      metadata: (field) => {
        if (!traced.has(field))
          traced.set(field, tracedMetadata(_plan.fieldMetadata[field], field));
        return traced.get(field);
      },
      resolve(field) {
        return this.get(field);
      },
    };
    /** @type {JaxArray[]} */
    const values = [];
    /** @type {ResultDescription[]} */
    const descriptions = [];
    /** @type {(string | undefined)[]} */
    const sources = [];
    try {
      for (const root of record.roots) {
        const evaluated = evaluateExpressionEager(root, inputScope, {
          rowCount: _plan.rowCount,
          broadcast: _plan.broadcast,
          scalarProvider: (
            /** @type {number | boolean} */ value,
            /** @type {"int32" | "float32" | "bool"} */ dtype,
            /** @type {number | undefined} */ at,
          ) => {
            // Host-managed dictionary lookups produce structural category codes.
            // Authored numerical constants are addressed by occurrence, never value.
            if (at === undefined) return deviceScalar(value, { dtype });
            const scalar = (
              dtype === "int32" ? inputs.integers : inputs.floats
            ).ref.slice(at);
            return dtype === "bool" ? scalar.astype(np.bool) : scalar;
          },
        });
        try {
          const value = evaluated.value;
          const envelope =
            value !== null && typeof value === "object" ? value : null;
          const output =
            envelope && "codes" in envelope ? envelope.codes : value;
          if (!isDeviceArray(output))
            throw Error(
              "Compiled expression requires a device numerical result",
            );
          values.push(output.ref);
          descriptions.push({
            metadata: evaluated.metadata
              ? JSON.parse(JSON.stringify(evaluated.metadata))
              : undefined,
            category: evaluated.category,
            cardinality: evaluated.cardinality,
            representation: evaluated.representation,
            categories:
              envelope &&
              "categories" in envelope &&
              Array.isArray(envelope.categories)
                ? envelope.categories
                : undefined,
          });
          sources.push(metadataSource(evaluated.metadata));
        } finally {
          evaluated.dispose();
        }
      }
      record.descriptions.set(signature(inputs), { descriptions, sources });
      return values;
    } catch (error) {
      values.forEach((value) => value.dispose());
      throw error;
    } finally {
      Object.values(inputs.columns).forEach((value) => value.dispose());
      inputs.floats.dispose();
      inputs.integers.dispose();
      inputs.valid?.dispose();
    }
  };
}

// A traced root's metadata regains the descriptive keys of the column it passed through.
/** @param {TracedDescriptions | undefined} traced @param {Binding["described"]} columns */
function describeResults(traced, columns) {
  if (!traced) return undefined;
  let out = traced.descriptions;
  traced.sources.forEach((field, index) => {
    const description = out[index];
    const metadata =
      field === undefined
        ? description.metadata
        : describedMetadata(description.metadata, columns.get(field));
    if (metadata === description.metadata) return;
    if (out === traced.descriptions) out = [...out];
    out[index] = { ...description, metadata };
  });
  return out;
}

/** @returns {ExpressionEvaluator} */
export function createExpressionEvaluator() {
  /** @type {Map<string, ProgramRecord>} */
  const records = new Map();
  /** @type {Set<string>} */
  const rejected = new Set();
  /** @type {WeakMap<Expression, {supported: boolean, frozen: boolean}>} */
  const authored = new WeakMap();
  const programs = new (class
    extends /** @type {typeof Map<string, import("./expressionPlanTypes.js").CompiledProgram>} */ (
      Map
    )
  {
    /** @param {string} key */
    delete(key) {
      this.get(key)?.dispose?.();
      records.delete(key);
      return super.delete(key);
    }
    clear() {
      for (const key of [...this.keys()]) this.delete(key);
    }
  })();
  /** @param {unknown[]} roots @param {ExpressionScope} scope @param {EvaluationOptions} [options] @returns {import("./expressionPlanTypes.js").PreparedPlan} */
  function prepare(
    roots,
    scope,
    {
      broadcast = true,
      rowCount = scope?.length,
      time,
      viewState,
      reductionCache,
    } = {},
  ) {
    // Grid reductions need the grid's dimensional descriptor; their numeric children still
    // use plans, but the grid-aware boundary stays with the reference evaluator.
    if (scope.grid && roots.some(expressionHasReduction)) throw INELIGIBLE;
    const state =
      viewState ?? (time === undefined ? undefined : makeViewState({ time }));
    const normalized = normalizeRoots(roots, scope, {
      broadcast,
      state,
      reductionCache,
    });
    const lowered = lowerRoots(normalized.roots, scope, normalized.runtime);
    const physical = Boolean(scope.physical && scope.valid);
    /** @type {string | undefined} */
    let key;
    /** @type {ProgramRecord | undefined} */
    let record;
    /** @type {JaxArray[]} */
    const held = [];
    /** @param {JaxArray} value */
    const hold = (value) => (held.push(value), value);
    let transferred = false;
    try {
      const bound = bindColumns(
        lowered.fields,
        scope,
        normalized.runtime,
        { rowCount, physical },
        held,
      );
      const plan = programPlan(normalized.roots, lowered, bound, {
        broadcast,
        physical,
        prefix: Boolean(physical && scope.prefix),
        rowCount,
      });
      key = JSON.stringify(plan);
      record = records.get(key);
      if (!record) records.set(key, (record = programRecord(lowered)));
      if (rejected.has(key)) throw INELIGIBLE;
      // Run: literal values reach the program as buffers, never as plan constants.
      const floats = hold(deviceArray(lowered.literals));
      const intValues = lowered.literals.map((value) =>
        Number.isInteger(Number(value)) ? Number(value) : 0,
      );
      const integers = hold(deviceArray(intValues, { dtype: "int32" }));
      // These are owned transfer references. On trace failure bind never consumed them;
      // on success jit consumes them. Avoid creating an extra untracked input reference.
      const { columns, valid } = bound;
      const inputs = { columns, floats, integers, ...(valid ? { valid } : {}) };
      if (programs.has(key)) stats.hits++;
      else stats.traces++;
      /** @type {JaxArray[]} */
      const values = planProgram(programs, plan, programKernel(record))(inputs);
      transferred = true;
      stats.compiled += roots.length;
      return {
        values,
        descriptions: describeResults(
          record.descriptions.get(signature(inputs)),
          bound.described,
        ),
        plan,
        programs: programs.size,
        dispose() {
          values.forEach((value) => value.dispose());
        },
      };
    } catch (error) {
      if (key && error !== INELIGIBLE) {
        stats.traceFailures++;
        programs.delete(key);
        records.delete(key);
        if (rejected.size >= 64)
          rejected.delete(
            /** @type {string} */ (rejected.values().next().value),
          );
        rejected.add(key);
      }
      throw error;
    } finally {
      if (!transferred) {
        held.forEach((value) => value.dispose());
        if (key && !programs.has(key)) records.delete(key);
      }
    }
  }
  /** @type {ExpressionStats} */
  const stats = {
    compiled: 0,
    fallback: 0,
    lookups: 0,
    traceFailures: 0,
    traces: 0,
    hits: 0,
    reasons: {},
  };
  /** @param {Expression} root */
  function qualify(root) {
    // A permanently unsupported frozen AST can skip qualification on later publications.
    // Mutable literal wrappers/foreign descriptors are inspected again.
    let form = authored.get(root);
    if (!form) {
      form = authoredForm(root);
      if (form.frozen) authored.set(root, form);
    }
    return form.supported;
  }
  /** @param {unknown} root @param {ExpressionScope} scope @param {EvaluationOptions} [options] @returns {ExpressionResult | null} */
  function compiled(root, scope, options) {
    if (!isExpression(root) || !qualify(root)) return null;
    let result;
    try {
      result = prepare([root], scope, options);
    } catch (error) {
      return null;
    }
    const description = result.descriptions?.[0];
    return {
      value: description?.categories
        ? { codes: result.values[0], categories: description.categories }
        : result.values[0],
      ...description,
      expression: root,
      dependencies: {
        fields: expressionFields(root),
        membership: expressionHasReduction(root),
      },
      dispose: result.dispose,
    };
  }
  /** @param {unknown} root @param {ExpressionScope} scope @param {EvaluationOptions} [options] @returns {ExpressionResult} */
  function evaluate(root, scope, options = {}) {
    // A column read is already an O(1) lookup. Keeping its object also preserves alias identity.
    if (nodeField(root) !== null) {
      stats.lookups++;
      return evaluateExpressionEager(root, scope, options);
    }
    const result = compiled(root, scope, options);
    if (result) return result;
    stats.fallback++;
    const reason = !isExpression(root)
      ? "host value"
      : scope.grid && expressionHasReduction(root)
        ? "grid-aware reduction/ordered boundary"
        : !qualify(root)
          ? `host-managed operation: ${root.op}`
          : "input representation or trace unsupported";
    const bucket =
      Object.hasOwn(stats.reasons, reason) ||
      Object.keys(stats.reasons).length < 32
        ? reason
        : "other host boundaries";
    stats.reasons[bucket] = (stats.reasons[bucket] ?? 0) + 1;
    return evaluateExpressionEager(root, scope, {
      ...options,
      expressionProvider(
        /** @type {unknown} */ node,
        /** @type {import("./expressionPlanTypes.js").ViewStateRecord | undefined} */ state,
      ) {
        // Columns are already O(1) reads. View-only expressions keep float64 host math.
        if (nodeField(node) !== null || isViewStateSubtree(node)) return null;
        return compiled(node, scope, { ...options, viewState: state });
      },
    });
  }
  return {
    prepare,
    evaluate,
    stats,
    get size() {
      return programs.size;
    },
    dispose() {
      programs.clear();
      records.clear();
      rejected.clear();
    },
  };
}

/**
 * Diagnostics borrow consumer counters; unregistering releases the diagnostic reference.
 * @param {import("./internalTypes.js").ViewServices | undefined} view The view reporting them.
 * @param {Pick<ExpressionEvaluator, "size" | "stats">} evaluator
 * @param {() => Record<string, unknown>} describe
 */
export function registerExpressionDiagnostics(view, evaluator, describe) {
  const entry = () => ({
    ...describe(),
    plans: evaluator.size,
    ...evaluator.stats,
    reasons: { ...evaluator.stats.reasons },
  });
  const plans = view?.diagnostics.expressionPlans;
  plans?.add(entry);
  return () => plans?.delete(entry);
}

const OWNER_KEY = Symbol("expression evaluator");
/** Attach programs to an existing consumer lifetime; ordinary cache disposal calls dispose(). */
/** @param {(Record<string, unknown> & {expressionEvaluator?: ExpressionEvaluator | null}) | Map<unknown, unknown>} owner @returns {ExpressionEvaluator} */
export function expressionEvaluator(owner) {
  if (owner instanceof Map) {
    if (!owner.has(OWNER_KEY))
      owner.set(OWNER_KEY, createExpressionEvaluator());
    return /** @type {ExpressionEvaluator} */ (owner.get(OWNER_KEY));
  }
  if (!owner.expressionEvaluator)
    ownCacheEntry(owner, "expressionEvaluator", (evaluator) =>
      evaluator.dispose(),
    );
  return (owner.expressionEvaluator ??= createExpressionEvaluator());
}

/** The compiling evaluator: a program where the planner admits the expression, the eager
 * evaluator (evaluateExpressionEager) otherwise. Callers import it by this name, never as
 * expressions.js's evaluateExpression, which stays eager without options.evaluator.
 * One-shot consumers retain programs until their result is released; persistent callers
 * supply their owner in options.evaluator. This also keeps failures from leaking programs. */
/** @param {unknown} root @param {ExpressionScope} scope @param {EvaluationOptions} [options] */
export function evaluateTransientExpression(root, scope, options = {}) {
  if (options.evaluator)
    return options.evaluator.evaluate(root, scope, options);
  const evaluator = createExpressionEvaluator();
  try {
    const result = evaluator.evaluate(root, scope, options);
    return {
      ...result,
      dispose() {
        result.dispose();
        evaluator.dispose();
      },
    };
  } catch (error) {
    evaluator.dispose();
    throw error;
  }
}
