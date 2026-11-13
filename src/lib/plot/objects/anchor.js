import { BasePlotObject } from "./base.js";
import { BufferedField } from "../utils/proputils.js";
import { PositionType } from "./types.js";

/**
 * Anchor (Stage 15): an invisible positional mark that connections attach to. It keeps one
 * `position` field (a live GPU buffer, animated by the View clock like any instanced mark's
 * position) and nothing else: no geometry, no material work, no picking target, no legend
 * entry (`static guide = false` keeps it out of the guide registry), and no opacity field,
 * so keyed lifecycles and interaction feedback have nothing to fade. It is never added to the
 * scene graph and stays invisible, so no render, picking, minimap or export pass sees it.
 */
export class Anchor extends BasePlotObject {
  static componentName = "Anchor";
  static guide = false;
  constructor(options, view, invalidate) {
    super(options, view, invalidate);
    this.visible = false;
    this.exportKind = "anchor";
    this.manager.registerField(
      new BufferedField(new PositionType({ targetNodes: ["coordinatesNode"] }), this, {
        onCount: (count) => { this.count = count; },
      }),
    );
  }
  build() {}
  ensureInteractionOpacity() {}
}
