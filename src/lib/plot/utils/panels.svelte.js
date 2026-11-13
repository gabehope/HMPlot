// Panels (TODO 136.16 slice 3): stacked Plots over one x, as matplotlib's sharex and ggplot's
// facet columns draw them. Each Plot inside joins (plot.svelte): its x shows one union domain
// with the others' (a domain group), pans and zooms with them, and takes the Panels' x settings;
// only the last Plot draws its x axis, so the axis and its title appear once, under the stack.
import { createDomainGroup } from "./domainGroup.js";

export const PANELS_CONTEXT = Symbol("hmplot panels");

/**
 * @param {() => Record<string, unknown> | undefined} axis the Panels' x settings, under each Plot's own
 */
export function createPanels(axis) {
  const group = createDomainGroup(["x"]);
  /** @type {{ setViewport: (viewport: unknown, axes: string) => unknown }[]} */
  let members = $state.raw([]);
  // While one change is passed on, the changes it causes in the others are not passed back.
  let linking = false;
  return {
    /**
     * A Plot joins: `plot` is its handle (joinDomainGroup, setViewport). Returns its panel: its x
     * settings, what to call when its viewport changes, and leave().
     * @param {{ joinDomainGroup: (group: unknown) => () => void, setViewport: (viewport: unknown, axes: string) => unknown }} plot
     */
    join(plot) {
      members = [...members, plot];
      const leaveGroup = plot.joinDomainGroup(group);
      return {
        /** Its x settings: the Panels', then its own; hidden (no labels, no title) but on the last. */
        x(own) {
          const last = members.at(-1) === plot;
          const merged = { ...(axis() ?? {}), ...(own && typeof own === "object" ? own : {}) };
          return last ? merged : { ...merged, visible: false };
        },
        /** @param {unknown} viewport */
        viewportChanged(viewport) {
          if (linking) return;
          linking = true;
          try {
            for (const other of members) if (other !== plot) other.setViewport(viewport, "x");
          } finally {
            linking = false;
          }
        },
        leave() {
          members = members.filter((member) => member !== plot);
          leaveGroup?.();
        },
      };
    },
  };
}
