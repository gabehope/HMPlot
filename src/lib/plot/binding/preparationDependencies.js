// @ts-check
/**
 * Capture the borrowed inputs needed to prove preparation reuse. namedMark owns row identity
 * and publication; markUpdatePlan compares these captured keys. No arrays or scopes are
 * acquired here, and this module neither schedules writes nor publishes prepared results.
 */
import { Array as JaxArray } from "@hmplot/jax";
import { isLiteral, isExpression } from "../utils/names.js";
import {
  expressionFields,
  expressionHasTween,
  expressionNeedsRows,
} from "../utils/expressions.js";
import { interactionVersion } from "../utils/interaction.js";
import { NAMED_FIELDS } from "../utils/namedData.js";
import { viewStateReads } from "../utils/viewState.js";

/**
 * @typedef {import("../utils/markPlanTypes.js").Channels} Channels
 * @typedef {import("../utils/markPlanTypes.js").PlannedRows} PlannedRows
 * @typedef {import("../utils/markPlanTypes.js").DependencyKey} DependencyKey
 * @typedef {import("../utils/markPlanTypes.js").PreparationDependencies} PreparationDependencies
 */

/**
 * Capture what unchanged channels actually read. Inherited views may gather a fresh array;
 * the immutable producer value is sufficient when the caller has certified identical rows.
 * Own-column and aggregate barriers remain producers, and snapshots never cross snapshotOf.
 * Host columns additionally require a captured producer version; authored mutable arrays
 * cannot certify reuse. Interaction stamps capture values now, not through a mutable scope.
 * @param {Channels} props
 * @param {PlannedRows | null | undefined} scope
 * @param {Channels} channels Channels written live, excluded from the preparation key.
 * @param {{ rows?: boolean }} options Whether row-dependent expressions may be certified.
 * @returns {DependencyKey}
 */
export function channelDependencyKey(
  props,
  scope,
  channels = {},
  { rows = false } = {},
) {
  /** @type {unknown[]} */
  const key = [];
  /** @param {string} field */
  const column = (field) => {
    if (field.startsWith("@")) {
      const resource = scope?.interactionResource?.(
        field.replace(/^@any_/, "@"),
      );
      if (!resource) return false;
      key.push(
        field,
        resource,
        resource.version ?? interactionVersion(resource),
        Boolean(resource.previewActive),
      );
      return true;
    }
    if (!scope?.has?.(field)) return false;
    let producer = scope;
    while (
      producer.parent &&
      !producer.aggregate &&
      producer.hasOwnColumn?.(field) === false
    )
      producer = producer.parent;
    const value = producer.get(field);
    key.push(field, JSON.stringify(scope.metadata?.(field) ?? null));
    if (value instanceof JaxArray) key.push(value);
    else if (
      value &&
      (typeof value === "object" || typeof value === "function") &&
      "codes" in value &&
      value.codes instanceof JaxArray
    ) {
      // Dictionary codes are immutable, but their host category list is not a device value.
      if (
        !("categories" in value) ||
        !Array.isArray(value.categories) ||
        value.categories.some(
          (category) =>
            category !== null &&
            !["number", "boolean", "string"].includes(typeof category),
        )
      )
        return false;
      key.push(value.codes, value.categories.length, ...value.categories);
    } else if (Array.isArray(value) || ArrayBuffer.isView(value)) {
      if (!Number.isFinite(producer.version)) return false;
      key.push(producer.snapshotOf ?? value, producer.version);
    } else if (
      value === null ||
      ["number", "boolean", "string"].includes(typeof value)
    )
      key.push(value);
    else return false;
    return true;
  };
  for (const [name, value] of Object.entries(props)) {
    if (!NAMED_FIELDS.has(name) || name in channels) continue;
    const reads = viewStateReads(value);
    if (reads.live || reads.stepped || reads.tracked) return null;
    if (isExpression(value)) {
      if (expressionHasTween(value) || (!rows && expressionNeedsRows(value)))
        return null;
      if (rows && expressionNeedsRows(value))
        key.push(
          /** @type {PlannedRows} */ (scope).length,
          /** @type {PlannedRows} */ (scope).valid ?? null,
        );
      for (const field of expressionFields(value))
        if (!column(field)) return null;
    } else if (typeof value === "string" && scope?.has?.(value)) {
      if (!column(value)) return null;
    } else {
      const literal = isLiteral(value) ? value.value : value;
      if (
        (literal !== null && typeof literal === "object") ||
        typeof literal === "function"
      )
        return null;
    }
  }
  return key;
}

/** @param {DependencyKey | undefined} a @param {DependencyKey | undefined} b */
export const sameDependencyKey = (a, b) =>
  Boolean(
    a &&
    b &&
    a.length === b.length &&
    a.every((value, i) => Object.is(value, b[i])),
  );

/**
 * Shared channel dependencies; row identity/order is certified by the preparation owner.
 * @param {Channels} props
 * @param {PlannedRows | null | undefined} scope
 * @returns {PreparationDependencies}
 */
export function capturePreparationDependencies(props, scope) {
  const dependencies = Object.fromEntries(
    Object.entries(props)
      .filter(([name]) => NAMED_FIELDS.has(name))
      .map(([name, value]) => [
        name,
        channelDependencyKey({ [name]: value }, scope, {}, { rows: true }),
      ]),
  );
  const rowKey = scope?.identity?.key;
  dependencies.__rowKey =
    typeof rowKey === "string" && /** @type {PlannedRows} */ (scope).has(rowKey)
      ? channelDependencyKey({ x: rowKey }, scope)
      : [rowKey ?? null];
  return dependencies;
}

/**
 * Unknown dependencies require full preparation rather than guessing that they are static.
 * @param {PreparationDependencies | null | undefined} previous
 * @param {PreparationDependencies | null | undefined} next
 * @param {Channels} props
 * @returns {Channels | null} The changed channels' values; null when unknown.
 */
export function changedPreparationChannels(previous, next, props) {
  if (!previous || !next) return null;
  /** @type {Channels} */
  const changed = {};
  for (const [name, key] of Object.entries(next)) {
    if (!key || !previous[name]) return null;
    if (name === "__rowKey") {
      if (!sameDependencyKey(previous[name], key)) return null;
      continue;
    }
    if (!sameDependencyKey(previous[name], key)) changed[name] = props[name];
  }
  return changed;
}
