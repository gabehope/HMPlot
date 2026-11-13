import { dragChannels } from "./dragSession.js";
import { forceDragRows, markLayoutPolicy } from "./forceContext.js";
import { capability, kindsWith } from "./markKinds.js";
import { coordinateView } from "./coordinates.js";
import { axisCategory } from "./categorical.js";
import type { NamedScope } from "./markPlanTypes.js";
import type { OptionsNode } from "../../options/options.js";

/**
 * One mark's drag policy. Borrows the layout context and prepared rows; owns only the
 * published interaction configuration. The companion component owns pointer listeners and
 * releases them on unmount. Inherited layout dragging never crosses a changed row mapping.
 */
export class DragController {
  #layout: Parameters<typeof markLayoutPolicy>[0];
  #options: OptionsNode;
  force = $state.raw<ReturnType<typeof forceDragRows>>(null);
  config = $state.raw<unknown>(null);

  constructor(
    layout: Parameters<typeof markLayoutPolicy>[0],
    options: OptionsNode,
  ) {
    this.#layout = layout;
    this.#options = options;
  }

  policy(drag: unknown) {
    return markLayoutPolicy(this.#layout, drag);
  }

  /** Update inherited dragging only when the preparation has established its row space. */
  rows(
    policy: ReturnType<typeof markLayoutPolicy>,
    scope: NamedScope | undefined,
  ) {
    this.force = forceDragRows(policy.force, scope);
  }

  /** Resolve authored channels before publication, so an invalid drag reports on the mark. */
  prepare(
    kind: string,
    props: Record<string, unknown>,
    scope: NamedScope | undefined,
    selection: unknown,
  ) {
    if (props.drag === undefined || props.drag === false) return null;
    if (!capability(kind, "drag"))
      throw Error(
        `${kind} cannot be dragged yet; drag moves the rows of ${kindsWith("drag").join(", ")}.`,
      );
    const channels = dragChannels({
      kind,
      drag: props.drag,
      props,
      scope,
      dimensions:
        coordinateView(this.#options) === "3d" ? ["x", "y", "z"] : ["x", "y"],
      categorical: (axis: string) => Boolean(axisCategory(this.#options, axis)),
    });
    return {
      kind,
      channels,
      scope,
      selection: selection ?? scope?.identity?.selection,
      ondrag: props.ondrag,
      ondragend: props.ondragend,
    };
  }

  publish(config: unknown) {
    this.config = config ?? null;
  }
}
