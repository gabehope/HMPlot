import { onDestroy, untrack } from "svelte";
import { getOptionsContext, getMarkLabelContext } from "./context.js";
import { reportDataError } from "./dataErrors.js";
import { useViewServices, currentSceneNode } from "./viewServices.js";
import { installAxisMask } from "./axisMask.js";

// Pointer/click/wheel and tolerant-nearest handlers pass to the runtime object. `_pickable`
// also enables picking for a brush or shared tooltip when the mark has no handler of its own.
const MARK_EVENT =
  /^(on(pointer|click|dblclick|contextmenu|wheel|nearest)|_pickable$)/;
const markEvents = (props) =>
  Object.fromEntries(
    Object.entries(props).filter(([key]) => MARK_EVENT.test(key)),
  );

/**
 * What every raw mark component does around its data (TODO 32.9): an options node under the
 * parent's, named by the `name` prop or `label`; its settings list and pass-through options
 * kept current; its pointer handlers; its data errors shown on the plot, scoped to it (TODO
 * 32.5); and on unmount, its error cleared, then `cleanup`, the mark and its options disposed.
 * Call it where the component would set these up (its effects run in declaration order).
 *
 * - setup(parent): runs before the split (option types the mark needs); its result is
 *   passed to `display`.
 * - create(local, parent): builds the mark (anything with dispose(), or a plain three.js object
 *   whose `cleanup` releases its geometry and material).
 * - display(defaults): the settings list; populate(): the options passed through;
 *   handlers(): the props holding on* handlers (populate's by default).
 * @param {string} label
 * @param {object} parts
 * @param {() => string | undefined} parts.name
 * @param {(parent: any) => any} [parts.setup]
 * @param {(local: any, parent: any) => any} parts.create
 * @param {(defaults: any) => any} parts.display
 * @param {() => any} parts.populate
 * @param {() => any} [parts.handlers]
 * @param {() => void} [parts.cleanup]
 */
export function markComponent(
  label,
  {
    name,
    setup = () => undefined,
    create,
    display,
    populate,
    handlers = populate,
    cleanup = () => {},
  },
) {
  const view = useViewServices();
  const parent = getOptionsContext();
  const defaults = setup(parent);
  let given;
  try {
    given = getMarkLabelContext();
  } catch {
    given = undefined;
  }
  const local = parent.splitUnique(untrack(name), "mark", given ?? label);
  const mark = create(local, parent);
  // Its errors, and its fields' and refinements', name its scene node (TODO 136.6).
  mark.sceneNode = currentSceneNode();
  // A plain three.js object (Text3D's mesh) takes its view as BasePlotObject's marks do: its
  // accepted binding is read through it (Stage 117.2).
  if (!mark.isPlotObject) mark.view = view;
  // BasePlotObject owns the shared mask for GPU marks, including GeoJSON/tile objects.
  // Plain data-text meshes use this same hook without joining the mark object hierarchy.
  const releaseMask = mark.isPlotObject ? () => {} : installAxisMask(mark);
  const errorOwner = {};
  $effect(() => {
    local.setDisplayList(display(defaults));
  });
  $effect(() => {
    local.populate(populate());
  });
  const events = $derived(markEvents(handlers()));
  onDestroy(() => {
    reportDataError(view, errorOwner, "");
    releaseMask();
    cleanup();
    mark.dispose?.(); // a plain three.js object has none: its cleanup releases its parts
    local.dispose();
  });
  return {
    local,
    mark,
    get events() {
      return events;
    },
    /** Show `error` on the plot, or clear this mark's error (no argument). */
    report(error) {
      reportDataError(
        view,
        errorOwner,
        error ? (error.message ?? String(error)) : "",
      );
    },
  };
}
