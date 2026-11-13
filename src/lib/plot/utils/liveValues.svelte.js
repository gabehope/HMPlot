import { getContext, onDestroy, untrack } from "svelte";
import { DATA_CONTEXT } from "./categorical.js";
import { createExpressionEvaluator } from "./expressionPlans.js";
import { isExpression } from "./expressions.js";
import { scopeValue } from "./inputs.js";
import { analyzeDependencies, interactionResources, watchResources } from "./transforms/dependencies.js";
import { trackPreparation } from "../rendering/viewSettlement.js";

/**
 * VALUES READ FROM THE DATA (TODO 136.14 slice 4, 136.16 slice 4): reductions over the Data scope
 * around a component, such as a domain's ends (extent(x, {where: "@brushed"}): dataDomains.svelte.js)
 * or a Title's live parts (count({where: "@brushed"})). Each is evaluated over the scope
 * (scopeValue, as an input's data-derived props are) and again when the data or an interaction
 * state the reductions read changes. One evaluation runs at a time: changes while it runs (a
 * brush being dragged) are read once it finishes, from the latest state. whenSettled waits for
 * it (trackPreparation).
 */

/** Thrown inside an evaluation when a reduction has no finite value (no row matches). */
const NO_VALUE = /must be a finite number/;

/**
 * Call as a component initializes. `read()` gives the values to show: expressions are
 * evaluated, anything else passes through; `where(i)` names value i in messages; `needsData()`
 * is the error when there is no Data around.
 * @param {() => unknown[]} read
 * @param {import("./internalTypes.js").ViewServices | null | undefined} view
 * @param {{ where: (index: number) => string, needsData: () => string }} labels
 * @returns {{ readonly values: unknown[] | null, readonly inputs: unknown[] | null, readonly error: string }}
 *   `values`: aligned with `inputs`, the list read() gave when they were evaluated (a later list
 *   is read once the evaluation finishes); null for a reduction with no value, or null while the
 *   first read runs.
 */
export function liveValues(read, view, { where, needsData }) {
  const data = getContext(DATA_CONTEXT);
  const evaluator = createExpressionEvaluator();
  let disposed = false;
  let values = $state.raw(/** @type {unknown[] | null} */ (null));
  let inputs = $state.raw(/** @type {unknown[] | null} */ (null));
  let error = $state("");
  let interactionTick = $state(0);
  const watch = watchResources(() => untrack(() => interactionTick++));
  /** The evaluation running, and whether another is wanted after it. */
  let running = null, again = false, request = null;
  onDestroy(() => {
    disposed = true;
    watch.stop();
    if (running) running.finally(() => evaluator.dispose());
    else evaluator.dispose();
  });
  async function evaluate({ list, scope }) {
    const out = [];
    for (const [i, value] of list.entries()) {
      if (disposed) return;
      if (!isExpression(value) || !scope) {
        out.push(value);
        continue;
      }
      try {
        out.push(await scopeValue(value, scope, where(i), evaluator));
      } catch (e) {
        if (!NO_VALUE.test(e.message)) throw e;
        out.push(null);
      }
    }
    if (disposed) return;
    values = out;
    inputs = list;
    error = "";
  }
  function run() {
    const next = request;
    again = false;
    running = evaluate(next).catch((e) => {
      if (!disposed && request === next) error = e.message;
    }).finally(() => {
      running = null;
      if (again && !disposed) run();
    });
    trackPreparation(view, running);
  }
  $effect(() => {
    const list = read();
    interactionTick;
    const expressions = list.filter(isExpression);
    let scope = null;
    if (expressions.length) {
      try {
        scope = data?.read?.();
        scope?.version;
      } catch (e) {
        error = e.message;
        return;
      }
      if (!scope) {
        error = needsData();
        return;
      }
    }
    untrack(() => {
      watch.update(scope ? interactionResources(analyzeDependencies({ expressions }), scope) : []);
      request = { list, scope };
      if (running) again = true;
      else run();
    });
  });
  return {
    get values() { return values; },
    get inputs() { return inputs; },
    get error() { return error; },
  };
}
