// @ts-check
import { setContext } from "svelte";
import { DATA_CONTEXT } from "./categorical.js";
import { FORCE_CONTEXT } from "./forceContext.js";
import { settleUploads } from "../rendering/uploadSettlement.js";

/**
 * Hand a static graph layout's published frame ({ nodes, edges }) to its children (DAG,
 * Sankey, Pack, Treemap, Tree; TODO 118.4): its edges as their data, and both relations and the
 * registration of the views drawing them through FORCE_CONTEXT (utils/forceContext.js). Call
 * while the layout component initializes. `preparing` is the error a read before the first
 * frame throws (`edgesPreparing` for the edges as data); `onView` runs as a view registers, and
 * what it returns once the view has left `views`.
 * @param {() => { nodes: any, edges: any } | undefined} frame
 * @param {{ preparing: () => string, edgesPreparing?: () => string,
 *   onView?: (view: any) => (() => void) | undefined }} options
 */
export function provideLayoutFrame(
  frame,
  { preparing, edgesPreparing = preparing, onView },
) {
  const views = new Set();
  const drawing = () => [...views].filter((view) => view.renderer);
  setContext(DATA_CONTEXT, {
    read() {
      const current = frame();
      if (!current) throw Error(edgesPreparing());
      return current.edges;
    },
  });
  setContext(FORCE_CONTEXT, {
    iterative: false,
    read(part) {
      const current = frame();
      if (!current) throw Error(preparing());
      return current[part];
    },
    registerView(view) {
      views.add(view);
      const release = onView?.(view);
      return () => {
        views.delete(view);
        if (release) release();
      };
    },
  });
  return {
    /** The views drawing the layout (their services). */
    views,
    /** The views that have a renderer. */
    drawing,
    /** Every drawing view has settled. */
    settle: () => Promise.all(drawing().map(settleUploads)),
  };
}
