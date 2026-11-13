// @ts-check
import { fromStore } from "svelte/store";
import { getOptionsContext } from "./context.js";
import { coordinateViewStore } from "./viewContext.js";
import { useViewServices } from "./viewServices.js";
import { reportDataError } from "./dataErrors.js";
import { POINTER_FIELDS } from "./viewState.js";

/**
 * A rule's guard (TODO 45; RuleX, RuleY and Crosshair's rules): x = c (or y = c) is a plane in a
 * 3D Cartesian view, so there the rule is refused with an error naming `kind` and is not drawn,
 * but for a rule at the pointer, which is always missing there and draws nothing. It follows the
 * view as it switches between 2D and 3D. Call it while a component initializes.
 * @param {string} kind @param {"x" | "y"} dimension @param {() => unknown} value the rule's value
 * @returns {{ readonly drawn: boolean }}
 */
export function planeRule(kind, dimension, value) {
  const view = useViewServices(), local = getOptionsContext(), owner = {};
  const coordinates = fromStore(local.store("coordinates")), mode = fromStore(coordinateViewStore(local));
  const flat3d = $derived(coordinates.current === "cartesian" && mode.current === "3d");
  $effect(() => {
    const pointer = POINTER_FIELDS.has(/** @type {string} */ (value()));
    reportDataError(view, owner, flat3d && !pointer
      ? `${kind} in a 3D Cartesian view is not supported: ${dimension} = c is a plane there. Use a 2D Plot.` : "");
    return () => reportDataError(view, owner, "");
  });
  return { get drawn() { return !flat3d; } };
}
