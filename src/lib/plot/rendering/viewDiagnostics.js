/** Read a view/renderer diagnostic snapshot without retaining resources or adding GPU reads. */
import { animationClock } from "../utils/animation.js";
import { registeredManagers } from "./uploadSettlement.js";
/**
 * @param {import("../utils/internalTypes.js").PlotRenderer} renderer
 * @param {import("../utils/internalTypes.js").ViewServices} view The renderer's view.
 */
export function rendererDiagnostics(renderer, view) {
  const { diagnostics } = view,
    instrumentation = diagnostics.instrumentation.current;
  return {
    instrumentation:
      instrumentation?.renderer === renderer
        ? instrumentation.snapshot()
        : undefined,
    expressionPlans: [...diagnostics.expressionPlans].map((read) => read()),
    completedFrame: view.lifecycle.completedFrame,
    pendingPreparations: view.lifecycle.preparations.size,
    markPreparations: diagnostics.counters.markPreparations,
    transformRuns: { ...diagnostics.counters.transformRuns },
    axisTitleUpdates: diagnostics.counters.axisTitleUpdates,
    frameConfigurations: diagnostics.counters.frameConfigurations,
    peakVaryings: diagnostics.counters.peakVaryings,
    viewport: view.navigation.controls.current?.getViewport?.(),
    animation: {
      active: [...animationClock(renderer).tracks].filter(
        (track) => !track.procedural,
      ).length,
      procedural: [...animationClock(renderer).tracks].filter(
        (track) => track.procedural,
      ).length,
      frame: animationClock(renderer).frame,
    },
    overview: diagnostics.overview.current?.() ?? {
      clients: 0,
      targets: 0,
      draws: 0,
    },
    surfaceTextures: [...view.drawing.surfaceTextures].map((t) => ({
      resolution: t.resolution,
      version: t.version,
      draws: t.draws,
      targets: (t.frames.length + (t.pending?.frames.length ?? 0)) * 2,
    })),
    pickingObjects:
      view.picking.context.current?.interactiveObjects.length ?? 0,
    lastPick: diagnostics.lastPick,
    memory: { ...renderer.info.memory },
    managers: registeredManagers(renderer)?.size ?? 0,
    marks: [...(registeredManagers(renderer) ?? [])].map((m) => ({
      name: m.options?.presentation?.label ?? m.options?.name,
      geometryError: [...m.fields.values()].find((f) => f.target?.curvedPaths)
        ?.target?.curvedPaths?.error,
      capacity: m.maxElements,
      fields: Object.fromEntries(
        [...m.fields].map(([key, f]) => [
          key,
          { count: f.count, bufferId: f.buffer?.id },
        ]),
      ),
    })),
    fields: [...(registeredManagers(renderer) ?? [])].reduce(
      (n, m) => n + m.fields.size,
      0,
    ),
  };
}
