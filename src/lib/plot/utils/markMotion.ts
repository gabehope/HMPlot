import { capability } from "./markKinds.js";
import { animationClock } from "./animation.js";
import { expressionTweens, isExpression } from "./expressions.js";
import { tweenHandler, type TweenState } from "./tweenState.js";
import {
  readsOffsets,
  scopeReadsOffsets,
} from "../interaction/offsetDependencies.js";
import { trackPreparation } from "../rendering/viewSettlement.js";
import type {
  PlotRenderer,
  PreparedMark,
  ViewServices,
} from "./internalTypes.js";
import type { NamedScope, MarkComponentExports } from "./markPlanTypes.js";
import type { EagerEvaluationOptions } from "./expressionPlanTypes.js";
import type { OptionsNode } from "../../options/options.js";

/**
 * One mark's procedural motion: owns tween values, clock tracks and the pointer subscription.
 * Reads accepted animation metadata and the current mark; calls the existing channel writer
 * for a time or pointer update. A release removes its tracks and releases its cached arrays.
 * Upstream live columns remain their producer's responsibility.
 */
export function createMarkMotion(host: {
  renderer: PlotRenderer;
  view: ViewServices;
  options(): OptionsNode;
  mark(): ReturnType<MarkComponentExports["getMark"]>;
  step(time: number): Promise<boolean>;
  report(error: unknown): void;
  correspondence?(scope: NamedScope | null | undefined): {scheme: string; tokens: string[]} | null;
}) {
  const { renderer, view } = host;
  const tweens = new Map<string, TweenState>();
  let released = false;
  let pointerRelease: (() => void) | null = null;
  let pointerWork: Promise<void> | null = null;
  let pointerDirty = false;
  let procedural: {
    owner: object | undefined;
    procedural: true;
    explicit: true;
    apply(): void;
    changed(): Promise<boolean>;
  } | null = null;
  let hold: {
    owner: object;
    explicit: true;
    customDuration: number;
    end: number;
    apply(): void;
  } | null = null;

  function updatePointer() {
    pointerDirty = true;
    if (pointerWork) return;
    pointerWork = Promise.resolve()
      .then(async () => {
        try {
          while (pointerDirty && !released) {
            pointerDirty = false;
            await host.step(view.clock.time);
          }
        } finally {
          pointerWork = null;
        }
      })
      .catch(host.report);
    trackPreparation(view, pointerWork);
  }

  return {
    applyTheme(kind: string, props: Record<string, unknown>) {
      const options = host.options();
      // Theme fades only default keyed marks that already animate; false cancels a parent fade.
      if (capability(kind, "keyed") && (props.animation ?? options.get("animation")))
        for (const key of ["enterEffect", "exitEffect"]) {
          const themed = options.get(key);
          if (props[key] === undefined && themed) props[key] = themed;
        }
    },
    tweenOptions(
      expression: unknown,
      channel: string,
      scope: NamedScope | null | undefined,
      time: number,
      flight: { end: number; finalDue: boolean },
      publishedOffsets: number | undefined,
    ): EagerEvaluationOptions {
      if (!isExpression(expression) || !expressionTweens(expression).length)
        return {};
      return {
        tween: tweenHandler({
          cache: tweens,
          correspondence: host.correspondence?.(scope),
          scope,
          time,
          root: expression,
          prefix: `channel/${channel}`,
          landed: animationClock(renderer).reduced,
          arrive:
            Boolean(
              (
                scope?.identity?.offsets as
                  | ReturnType<typeof import("./offsets.js").createOffsetLayer>
                  | undefined
              )?.draggedSince(publishedOffsets),
            ) &&
            (readsOffsets(expression) || scopeReadsOffsets(scope)),
          moving: ({ end }: { end: number }) => {
            flight.end = Math.max(flight.end, end);
          },
        }),
      };
    },
    sync(entry: PreparedMark | null | undefined) {
      const mark = host.mark(),
        clock = animationClock(renderer),
        flight = entry?.tweenFlight;
      const moving = Boolean(
        flight &&
        (flight.end > clock.time || flight.finalDue) &&
        Object.keys(entry?.animation?.tweened ?? {}).length,
      );
      const wanted =
        mark &&
        entry?.animation &&
        (Object.keys(entry.animation.clocked ?? entry.animation.procedural)
          .length +
          Object.keys(entry.animation.stepped ?? {}).length >
          0 ||
          moving);
      const pointing = Boolean(
        mark && Object.keys(entry?.animation?.tracked ?? {}).length,
      );
      if (pointing && !pointerRelease && view.navigation.pointer.current)
        pointerRelease = view.navigation.pointer.current.subscribe(
          host.options(),
          updatePointer,
        );
      else if (!pointing && pointerRelease) {
        pointerRelease();
        pointerRelease = null;
      }
      // Keep whenAnimationsFinished waiting until this mark's own tween expressions land.
      const end = moving ? flight!.end : -Infinity;
      if (hold && (hold.end !== end || hold.owner !== mark)) {
        clock.remove(hold);
        hold = null;
      }
      if (!hold && mark && end > clock.time) {
        hold = {
          owner: mark,
          explicit: true,
          customDuration: end - clock.time,
          end,
          apply() {},
        };
        clock.add(hold);
      }
      if (wanted && !procedural) {
        procedural = {
          owner: mark,
          procedural: true,
          explicit: true,
          apply() {},
          changed: () => host.step(view.clock.time),
        };
        clock.add(procedural);
      } else if (!wanted && procedural) {
        clock.remove(procedural);
        procedural = null;
      } else if (wanted && procedural) procedural.owner = mark;
    },
    release() {
      released = true;
      pointerRelease?.();
      if (procedural) animationClock(renderer).remove(procedural);
      if (hold) animationClock(renderer).remove(hold);
      for (const state of tweens.values()) state.dispose();
      tweens.clear();
    },
  };
}
