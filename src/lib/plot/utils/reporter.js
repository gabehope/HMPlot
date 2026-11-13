// @ts-check
/**
 * Diagnostics reporters (TODO 136.6): a component outside every Plot (Data, an input, a Title,
 * a graph) has no view to report its errors to, so each showed them only as its own alert, and
 * hm.check read the page's alerts to find them. A scene node now provides a reporter that names
 * it (SceneNode.svelte), and a component reports its error through the nearest one: the error is
 * then one of SceneRuntime.diagnostics(), with its component and scene node. Outside a scene
 * a plain Svelte Plot supplies a local reporter. Components outside both still show alerts.
 */
import { getContext, setContext, onDestroy } from "svelte";
import { toDiagnostic } from "./diagnostics.js";

/** @typedef {import("./diagnostics.js").Diagnostic} Diagnostic */
/**
 * @typedef {{ node?: string, kind: string,
 *   report(owner: object, entry: Diagnostic | null): void }} Reporter
 */

const REPORTER_CONTEXT = Symbol("hmplot diagnostics reporter");

/** @param {Reporter} reporter */
export function provideReporter(reporter) {
  setContext(REPORTER_CONTEXT, reporter);
}

/** Keep a scene's node attribution; ordinary Svelte descendants report to their plot.
 * @param {Reporter["report"]} report */
export function provideViewReporter(report) {
  if (!getContext(REPORTER_CONTEXT)) provideReporter({kind: "Plot", report});
}

/** The scene node the calling component renders in (undefined outside a scene). */
export function currentSceneNode() {
  return /** @type {Reporter | undefined} */ (getContext(REPORTER_CONTEXT))?.node;
}

/**
 * The calling component's report: `report(error)` makes `error` (a string, an Error, or "" for
 * none) its diagnostic, named `component` (by default the scene node's kind) and the scene node;
 * unmounting withdraws it.
 * @param {string} [component]
 * @param {{ severity?: Diagnostic["severity"] }} [options] "warning" for what does not stop the
 *   scene drawing (settle fails on the first error).
 * @returns {(error: unknown) => void}
 */
export function useReporter(component = undefined, { severity = "error" } = {}) {
  const reporter = /** @type {Reporter | undefined} */ (getContext(REPORTER_CONTEXT));
  if (!reporter) return () => {};
  component ??= reporter.kind;
  const owner = {};
  onDestroy(() => reporter.report(owner, null));
  const named = new RegExp(`^${component}\\b`);
  return (error) => {
    const entry = toDiagnostic(error, { component, node: reporter.node, severity });
    // Named as every diagnostic is: "Slider: ...".
    if (entry && !named.test(entry.message)) entry.message = `${component}: ${entry.message}`;
    reporter.report(owner, entry);
  };
}
