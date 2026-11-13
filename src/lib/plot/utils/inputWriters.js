// @ts-check
// Inputs a click or a hover sets (TODO 145.2, 145.7): with root = input("root", { default: "all" }),
// select={root.set("id")} writes the clicked row's id to the input "root" (a click on nothing
// restores its default); hover={focus.set("series")} shows the hovered row's series while the
// pointer is on it and the committed value after; a Button's set={root.reset()} restores it. The
// value is one input's, for global visualization state (a drill-down's root, a focused series);
// a selection is a set of rows.
import { NAME_PATTERN } from "./names.js";
import { categoryColumn } from "./dataView.js";
import { interactionResource } from "./interaction.js";
import { onDestroy } from "svelte";

/**
 * @typedef {{ name: string, column: string | null, value?: unknown, reset?: boolean, given: unknown }} InputWriter
 * What it writes: the row's `column` value, or the constant `value` (column null), or with
 * `reset` the input's default. `given` is the writer's default (undefined: it has none of its
 * own; a widget's, or null, applies).
 */

/** What a write sets, when it is not a value: the input's default. */
export const RESET = Symbol("reset");

/**
 * The input a select, hover or Button set writes, or null for a selection setting (true, a
 * resource, an options object without `input`). It is input("root").set("id") (the row's id),
 * .set(literal("all")) (a constant), .reset() (the default), or the same as an object:
 * { input, column }, { input, value }, { input, reset: true }, each with an optional default.
 * @param {unknown} value @param {string} kind The component's kind, for errors.
 * @param {"select" | "hover" | "set"} role
 * @returns {InputWriter | null}
 */
export function inputWriter(value, kind, role) {
  if (!value || typeof value !== "object" || !("input" in value)) return null;
  const { input, column, value: constant, reset, default: given, ...rest } = /** @type {Record<string, unknown>} */ (value);
  const extra = Object.keys(rest);
  if (extra.length)
    throw Error(`${kind}: ${role} writes an input; it takes no ${extra.join(", ")} (a selection is select={true} or a selection()).`);
  if (typeof input !== "string" || !NAME_PATTERN.test(input))
    throw Error(`${kind}: ${role}'s input names the input it writes, an identifier such as "root"; received ${JSON.stringify(input)}.`);
  const forms = [column !== undefined && "column", "value" in value && "value", reset !== undefined && "reset"].filter(Boolean);
  const what = role === "select" ? "clicked" : "hovered";
  if (forms.length > 1)
    throw Error(`${kind}: ${role} writes the input "${input}" from one of a column, a value or reset; it gives ${forms.join(" and ")}.`);
  if (role === "set" && column !== undefined)
    throw Error(`${kind}: set={input("${input}").set("${column}")} reads a row, which a Button has none of: set a constant (input("${input}").set(literal(...))) or input("${input}").reset().`);
  if (reset !== undefined) {
    if (reset !== true) throw Error(`${kind}: ${role}'s reset is true (input("${input}").reset()); received ${JSON.stringify(reset)}.`);
    if (role === "hover")
      throw Error(`${kind}: hover cannot reset the input "${input}": a hover shows a value while the pointer is on a row; reset it on click (select) or with a Button.`);
    return { name: input, column: null, reset: true, given };
  }
  if ("value" in value) return { name: input, column: null, value: constant, given };
  if (typeof column !== "string" || !column)
    throw Error(`${kind}: ${role} writes the input "${input}", and needs the column whose value at the ${what} row it takes: input("${input}").set("id"), or { input: "${input}", column: "id" }.`);
  return { name: input, column, given };
}

/**
 * What `writer` writes at a row: RESET, its constant, or the row's value of its column read by
 * `read(column)` (undefined: no row).
 * @param {{ column: string | null, value?: unknown, reset?: boolean }} writer
 * @param {(column: string) => unknown} read
 */
export function writerValue(writer, read) {
  if (writer.reset) return RESET;
  const value = writer.column === null ? writer.value : read(writer.column);
  // A mark reads the row asynchronously: normalize what the promise gives.
  return value instanceof Promise ? value.then(plainValue) : plainValue(value);
}

/** An int64 column's value is a BigInt, which inputs compare and send as JSON (2026-10-22:
 * "Do not know how to serialize a BigInt" on hover). A safe integer is a number; past 2^53, text. */
const plainValue = (/** @type {unknown} */ value) =>
  typeof value !== "bigint" ? value
    : value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : String(value);

/** How a writer is named in errors: "select writes id", "set resets it". */
export const writerLabel = (/** @type {string} */ kind, /** @type {string} */ role, /** @type {InputWriter} */ writer) =>
  `${kind} (${role} ${writer.reset ? "resets it" : writer.column === null ? `sets ${JSON.stringify(writer.value)}` : `writes ${writer.column}`})`;

/** The kind of value a constant is, for writers of one input to agree on (null: no check). */
function constantType(/** @type {unknown} */ value) {
  if (typeof value === "number") return "numeric";
  if (typeof value === "string") return "categorical";
  if (value instanceof Date) return "datetime";
  return null;
}

/**
 * The kind of value `column` holds in `scope`, for writers of one input to agree on: "categorical"
 * or "numeric". An error names the mark and the columns when the scope has no such column.
 * @param {any} scope @param {InputWriter} writer @param {string} kind @param {string} role
 * A constant's own kind, or null for a reset (it agrees with any).
 */
export function writerType(scope, writer, kind, role) {
  if (writer.column === null) return writer.reset ? null : constantType(writer.value);
  if (!scope?.has?.(writer.column))
    throw Error(`${kind}: ${role} writes the input "${writer.name}" from the column "${writer.column}", which this mark's data does not have` +
      (scope?.keys ? ` (its columns: ${scope.keys().filter((/** @type {string} */ key) => !key.startsWith("@") && !key.startsWith("__")).join(", ")}).` : "."));
  const type = scope.metadata?.(writer.column)?.type;
  if (type) return type === "categorical" || type === "ordinal" ? "categorical" : type;
  return categoryColumn(scope.get(writer.column)) ? "categorical" : "numeric";
}

/**
 * A hover that writes an input a transform above the mark reads would change the rows under the
 * pointer on every hover (TODO 145.2b): the error names both. A click writes once per gesture, a
 * loop in time only, so select may write such an input (a drill-down's root).
 * @param {any} scope The mark's data. @param {InputWriter} writer @param {string} kind
 */
export function checkHoverLoop(scope, writer, kind) {
  const seen = new Set();
  // A mark drawing a Filter's rows reads its padded form, whose `view` is the Filter's output.
  for (let at = scope; at && !seen.has(at); at = at.view && !seen.has(at.view) ? at.view : at.parent ?? at.snapshotOf) {
    seen.add(at);
    if (at.inputReads?.includes(writer.name))
      throw Error(`${kind}: hover writes the input "${writer.name}", which the ${at.inputReader ?? "transform"} above this mark reads, so each hover would change the rows under the pointer. Write it on click (select={input("${writer.name}").set(...)}), or read it in a transform this mark does not draw.`);
  }
}

/**
 * A component's input writers (TODO 145.2): its select and hover settings that write inputs,
 * registered with the input store as they appear and released as they go. Registrations are
 * kept in place across preparations: a release and a new registration would declare the input
 * afresh, back at its default. `prepare` returns the writers of the current props. Call it while
 * the component initializes: it releases them when the component is destroyed.
 * @param {any} store The input store around the component, or null.
 * @param {string | (() => string)} name The component's kind, for errors (or a getter of it).
 */
export function createInputWriters(store, name) {
  const kindOf = () => (typeof name === "function" ? name() : name);
  onDestroy(() => {
    held.forEach((release) => release());
    held.clear();
  });
  // One owner per role: a component may click to write one input and hover to write another.
  const owners = { select: {}, hover: {} };
  /** @type {Map<string, () => void>} */
  const held = new Map();
  return {
    owners,
    store,
    /**
     * The writers of the current props, and the selection resources select and hover give when
     * they write no input (`interactionScope`: the scope those resources belong to).
     * @param {Record<string, unknown>} props @param {any} scope @param {any} [interactionScope]
     */
    prepare(props, scope, interactionScope = scope) {
      const kind = kindOf();
      const writers = { select: inputWriter(props.select, kind, "select"), hover: inputWriter(props.hover, kind, "hover") };
      const any = writers.select ?? writers.hover;
      if (any && !store)
        throw Error(`${kind}: ${writers.select ? "select" : "hover"} writes the input "${any.name}", so it needs an input context around it: an InputContext, or a Python Scene.`);
      if (writers.hover) checkHoverLoop(scope, writers.hover, kind);
      const wanted = new Set();
      for (const role of /** @type {const} */ (["select", "hover"])) {
        const writer = writers[role];
        if (!writer) continue;
        const key = `${role}:${writer.name}`;
        wanted.add(key);
        const release = store.share(writer.name, owners[role], {
          label: writerLabel(kind, role, writer),
          given: writer.given,
          type: writerType(scope, writer, kind, role),
        });
        if (!held.has(key)) held.set(key, release);
      }
      for (const [key, release] of held)
        if (!wanted.has(key)) {
          release();
          held.delete(key);
        }
      return {
        ...writers,
        selectState: writers.select ? null : interactionResource(interactionScope, props.select, "selection"),
        hoverState: writers.hover ? null : interactionResource(interactionScope, props.hover, "hover"),
      };
    },
    /**
     * What the event installer (binding/markInteractionEvents.ts) needs to write them: a value is
     * read at a pick's row as the tooltip reads it (`tooltips.valueAt`), in the scope drawn then.
     * @param {{ select: InputWriter | null, hover: InputWriter | null }} writers
     * @param {{ valueAt(event: any, scope: any, column: string): Promise<unknown> }} tooltips
     */
    events(writers, tooltips) {
      return { select: writers.select, hover: writers.hover, store, owners,
        valueAt: (/** @type {any} */ event, /** @type {string} */ column, /** @type {any} */ scope) => tooltips.valueAt(event, scope, column) };
    },
    release() {
      held.forEach((release) => release());
      held.clear();
    },
  };
}

