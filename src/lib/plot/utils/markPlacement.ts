import { getContext } from "svelte";
import { DODGE_CONTEXT } from "./dodgeLayout.js";
import { capability } from "./markKinds.js";
import type { DodgeLayout, DodgeCamera, DodgeRenderer } from "./dodgeLayout.js";
import type { OptionsNode } from "../../options/options.js";
import type { ViewServices } from "./internalTypes.js";
import type { Array as JaxArray } from "@hmplot/jax";

/**
 * A mark's screen-space placement, owned by Dodge. Borrows rows, camera and options;
 * owns the resize/zoom watch and option subscription. Each preparation captures its
 * settings and returns a claim to release with that preparation, plus owned offsets.
 * The mark coordinator need not know which axis is offset or how a layout claims rows.
 */
export function createPlacementController(host: {
  renderer: DodgeRenderer;
  view: ViewServices;
  options: OptionsNode;
  relayout(): void;
}) {
  const layout = getContext<DodgeLayout | undefined>(DODGE_CONTEXT);
  const watch = layout?.watch(host);
  let active = false;
  let drawnOptions: OptionsNode | undefined;
  let stopOptions = () => {};
  const covers = (scope: unknown) => Boolean(layout?.covers(scope));
  return {
    covers,
    watchesCamera: Boolean(watch),
    get active() {
      return active;
    },
    frame(camera: DodgeCamera | undefined) {
      if (active) watch?.frame(camera);
    },
    drawn(options: OptionsNode) {
      if (!active || drawnOptions === options) return;
      stopOptions();
      drawnOptions = options;
      stopOptions = watch!.options(options, host.relayout);
    },
    prepare(
      kind: string,
      props: Record<string, unknown>,
      scope: unknown,
      owner: object,
    ) {
      active = covers(scope);
      if (!active || !layout) return null;
      if (!capability(kind, "dodge"))
        throw Error("Dodge supports one flat point mark.");
      const config = layout.config;
      const channel = config.axis === "y" ? "dy" : "dx";
      const other = config.axis === "y" ? "dx" : "dy";
      if (
        (props[channel] !== undefined && props[channel] !== config.as) ||
        props[other] === config.as
      )
        throw Error(
          `${kind} under a Dodge takes its offsets along ${config.axis} itself: leave out ${props[other] === config.as ? other : channel}.`,
        );
      delete props[channel];
      return {
        release: layout.claim(owner),
        track: layout.track,
        async place(camera: DodgeCamera | undefined, signal: AbortSignal) {
          const value: JaxArray = await layout.place(props, scope, {
            options: drawnOptions ?? host.options,
            camera,
            renderer: host.renderer,
            config,
            signal,
          });
          return { channel, value };
        },
      };
    },
    release() {
      stopOptions();
      watch?.dispose();
    },
  };
}
