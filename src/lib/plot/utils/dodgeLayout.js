// @ts-check
import { tick } from "svelte";
import { prepareDodge } from "./dodge.js";
import {
  currentCause,
  publishWithCause,
  trackPreparation,
} from "../rendering/viewSettlement.js";

/**
 * Dodge's layout controller (TODO 118.4), reached through this context by the one flat point
 * mark that draws its rows. It replaces the `dodge` object Dodge once put on its table through a
 * prototype wrapper: the table stays an ordinary data scope, and the renderer policy (camera,
 * claim, placement, preparation tracking) stays here.
 */
export const DODGE_CONTEXT = Symbol("hmplot dodge layout");

/**
 * A compound's own rule for the axis its Dodge moves points along (Swarm's: across its one
 * categorical position), read with the data in place of axis="auto". It runs where the layout is
 * prepared, so its error is the mark's, and clears with the next good update.
 */
export const DODGE_AXIS_CONTEXT = Symbol("hmplot dodge axis rule");

// The mark options Dodge's placement reads (prepareDodge): a change lays it out again.
const PLACEMENT_OPTIONS = [
  "displayScale",
  "scaleTransform",
  "scaleTransformConstant",
  "scaleBounds",
  "scaleRange",
  "shape",
  "xbounds",
  "ybounds",
  "xrange",
  "yrange",
  "xTransform",
  "yTransform",
  "xTransformConstant",
  "yTransformConstant",
];

/**
 * @typedef {{ field?: string, by?: string, axis: "x" | "y", as: string, padding: number, seed: number }} DodgeConfig
 * @typedef {{ get(key: string): any, on(listener: () => void): () => void }} MarkOptions
 * @typedef {{ domElement: { clientWidth: number, clientHeight: number } }} DodgeRenderer
 * @typedef {{ projectionMatrix: { elements: ArrayLike<number> } }} DodgeCamera
 * @typedef {object} DodgeWatch A consumer's watch over what its placement reads.
 * @property {(camera: DodgeCamera | undefined) => void} frame Called every frame: a zoom or
 *   resize lays out again once the pixel scale has been still for 150 ms (TODO 30.9).
 * @property {(options: MarkOptions, changed: () => void) => () => void} options Calls
 *   `changed` when the mark options placement reads change (now too, if they differ from the
 *   last options watched); returns the stop.
 * @property {() => void} dispose
 * @typedef {object} DodgeLayout
 * @property {DodgeConfig} config The current settings, inputs resolved.
 * @property {<T>(scope: T) => T} serve Hands `scope` on as Dodge's rows (its data context).
 * @property {(scope: unknown) => boolean} covers Whether a mark drawing `scope` draws Dodge's
 *   rows: a scope Dodge handed on, or one layered over it (an Interaction's), not a transform's.
 * @property {(owner: object) => () => void} claim One consumer per Dodge; returns the release.
 * @property {(props: Record<string, any>, scope: any, view: { options: any, camera: any, renderer: any, config?: DodgeConfig, signal?: AbortSignal }) => Promise<any>} place
 *   Each row's offset (an owned array) at the camera's pixel scale, with `config` (the
 *   current settings when omitted).
 * @property {(work: Promise<any>, cause?: any) => void} track A placement in progress.
 * @property {(consumer: { renderer: DodgeRenderer, view: import("./internalTypes.js").ViewServices, relayout: () => void }) => DodgeWatch} watch
 *   The consumer's renderer (its canvas size) and view (which tracks the wait for a layout).
 */

/**
 * @param {{ config: () => DodgeConfig, track: (work: Promise<any>, cause?: any) => void }} owner
 *   Dodge's settings and its own tracking of placements in progress (its status).
 * @returns {DodgeLayout}
 */
export function createDodgeLayout({ config, track }) {
  const served = new WeakSet();
  /** @type {object | undefined} */
  let consumer;
  return {
    get config() {
      return config();
    },
    serve(scope) {
      if (scope && typeof scope === "object") served.add(scope);
      return scope;
    },
    covers(scope) {
      for (
        let at = scope;
        at && typeof at === "object";
        at = Object.getPrototypeOf(at)
      )
        if (served.has(at)) return true;
      return false;
    },
    claim(owner) {
      if (consumer && consumer !== owner)
        throw Error("Each Dodge output supports one flat point mark.");
      consumer = owner;
      return () => {
        if (consumer === owner) consumer = undefined;
      };
    },
    place(
      props,
      scope,
      { options, camera, renderer, config: settings = config(), signal },
    ) {
      return prepareDodge(
        props,
        scope,
        options,
        camera,
        renderer,
        settings,
        signal,
      );
    },
    track,
    watch({ renderer, view, relayout }) {
      let cameraKey = "",
        optionsKey = "",
        disposed = false;
      /** @type {ReturnType<typeof setTimeout> | null} */
      let timer = null;
      /** @type {(() => void) | null} */
      let wait = null;
      let layoutCause = 0;
      const endWait = () => {
        const done = wait;
        wait = null;
        done?.();
      };
      const schedule = () => {
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          if (!disposed) publishWithCause(view, layoutCause, relayout);
          // The preparation it starts is tracked on its own once the effect has run.
          tick().then(endWait);
        }, 150);
      };
      // Gutters stay frozen during a gesture and refit just after it ends. Restart the
      // quiet window then, so placement uses that final camera instead of running twice.
      const stopGesture = view?.navigation.gesture.onChange((active) => {
        if (!active && timer !== null) schedule();
      });
      return {
        frame(camera) {
          const key = [
            camera?.projectionMatrix.elements[0],
            camera?.projectionMatrix.elements[5],
            renderer.domElement.clientWidth,
            renderer.domElement.clientHeight,
          ].join(",");
          if (key === cameraKey) return;
          const first = cameraKey === "";
          cameraKey = key;
          if (first) {
            relayout();
            return;
          }
          endWait();
          // The layout serves this change: it and the wait carry its cause. The wait counts as
          // preparation, so whenSettled() includes the layout it leads to.
          const cause = currentCause(view);
          trackPreparation(
            view,
            new Promise((resolve) => (wait = () => resolve(undefined))),
            cause,
          );
          layoutCause = cause;
          schedule();
        },
        options(options, changed) {
          const check = () => {
            const key = JSON.stringify(
              PLACEMENT_OPTIONS.map((name) => options.get(name)),
            );
            if (key === optionsKey) return;
            optionsKey = key;
            changed();
          };
          const stop = options.on(check);
          check();
          return stop;
        },
        dispose() {
          disposed = true;
          stopGesture?.();
          if (timer !== null) clearTimeout(timer);
          endWait();
        },
      };
    },
  };
}
