/**
 * Typed per-view services (Stage 117.1; docs/REFACTOR-PLAN-2026-10-09.md, "View services and
 * mark bindings"). viewCore creates one per view and provides it through VIEW_SERVICES_CONTEXT;
 * components read it with useViewServices(), and noncomponent helpers receive it as a
 * parameter. There is no registry of views: code reaches a view only through what it is given.
 *
 * Each capability has one owner, which installs it and releases it (Capability). The services
 * object lives as long as its view, across replacements of its renderer.
 */
import { getContext, setContext } from "svelte";
import { createViewMarks } from "./markBinding.js";
import { toDiagnostic, type Diagnostic } from "./diagnostics.js";
import { disposeOnce } from "./disposers.js";
import { createGesture } from "./gesture.js";
// Reporters name limit errors through it (limits.js attributed), and their scene node.
export { attributed } from "./limits.js";
export { currentSceneNode } from "./reporter.js";
import { attributed } from "./limits.js";
import { currentSceneNode } from "./reporter.js";
/** Both, for a reporter short of lines (namedMark's ratchet). */
export const reports = { attributed, sceneNode: currentSceneNode };
import type { ClockScope } from "./clockScope.js";
import type {
  Capability,
  PlotRenderer,
  Release,
  ReportedError,
  ViewCounters,
  ViewDiagnostics,
  ViewClock,
  ViewCredits,
  ViewDomains,
  ViewDrawing,
  ViewLifecycle,
  ViewNavigation,
  ViewServices,
} from "./internalTypes.js";

export const VIEW_SERVICES_CONTEXT = Symbol("hmplot view services");

/** The services of the view around the calling component, if it is inside one. */
export function useViewServices(): ViewServices | undefined {
  return getContext<ViewServices | undefined>(VIEW_SERVICES_CONTEXT);
}

/** One owner's value at a time; an owner's release leaves a later owner's value in place. */
export function capability<T>(): Capability<T> {
  let installed: { value: T } | undefined;
  return {
    get current() {
      return installed?.value;
    },
    install(value) {
      const entry = { value };
      installed = entry;
      return () => {
        if (installed === entry) installed = undefined;
      };
    },
  };
}

/** The component a reporter belongs to: a mark, or the mark a field or refinement serves. */
const componentOf = (owner: any): string | undefined =>
  owner?.componentName ??
  owner?.constructor?.componentName ??
  owner?.target?.componentName ??
  owner?.target?.constructor?.componentName ??
  owner?.mark?.constructor?.componentName;
/** The scene node a reporter belongs to (TODO 136.6), found as its component is. */
const sceneNodeOf = (owner: any): string | undefined =>
  [owner, owner?.target, owner?.mark, owner?.target?.mark].find(
    (candidate) => typeof candidate?.sceneNode === "string",
  )?.sceneNode;
const message = (error: NonNullable<ReportedError>) =>
  typeof error === "string" ? error : (error.message ?? String(error));

function createDiagnostics(show: (message: string) => void): ViewDiagnostics {
  // Insertion order: the plot shows its errors in the order they were first reported.
  const errors = new Map<object, NonNullable<ReportedError>>();
  let renderDiagnostic: ReportedError = null;
  const counters: ViewCounters = {
    markPreparations: 0,
    transformRuns: {},
    reruns: new Map(),
    liveFieldUpdates: 0,
    staticMarkReuses: 0,
    numericExpressionCompiled: 0,
    numericExpressionFallback: 0,
    connectionPreparations: 0,
    connectionMatches: 0,
    connectionGathers: 0,
    axisTitleUpdates: 0,
    frameConfigurations: 0,
    pickFrames: 0,
    peakVaryings: 0,
  };
  return {
    report(owner, error) {
      if (error) errors.set(owner, error);
      else if (!errors.delete(owner)) return;
      const values = [...errors.values()];
      renderDiagnostic =
        values.find((value) => typeof value === "object" && value.diagnostic) ??
        null;
      show(
        [
          ...new Set(
            values
              .filter((value) => toDiagnostic(value)?.severity === "error")
              .map(message),
          ),
        ].join(" · "),
      );
    },
    get renderDiagnostic() {
      return renderDiagnostic;
    },
    list() {
      // Each owner's error as a Diagnostic, named by the mark or field that reported it.
      return [...errors]
        .map(([owner, error]) =>
          toDiagnostic(error, {
            component: componentOf(owner),
            node: sceneNodeOf(owner),
          }),
        )
        .filter((entry): entry is Diagnostic => entry !== null);
    },
    instrumentation: capability(),
    overview: capability(),
    counters,
    expressionPlans: new Set(),
    lastPick: undefined,
  };
}

function createNavigation(): ViewNavigation {
  const cameraListeners = new Set<() => void>();
  return {
    pointer: capability(),
    tooltip: capability(),
    rootFrame: capability(),
    controls: capability(),
    camera: capability(),
    onCameraMove(listener) {
      cameraListeners.add(listener);
      return () => cameraListeners.delete(listener);
    },
    cameraMoved() {
      for (const listener of [...cameraListeners]) listener();
    },
    gesture: createGesture(),
    loops: capability(),
  };
}

function createDomains(navigation: ViewNavigation): ViewDomains {
  return {
    dataBounds: capability(),
    route({ frame, facet, owner, facetOwner }) {
      return {
        collects: () => (frame ? frame.collect() : Boolean(facet)),
        derived: (reader, mark, axes) =>
          navigation.loops.current?.derived(reader, mark, axes),
        set(axis, bounds, cause) {
          if (frame) frame.domain(axis, bounds, owner, cause);
          else facet?.domain(axis, bounds, facetOwner);
        },
        clear() {
          for (const axis of "xyz") {
            if (frame) frame.domain(axis, null, owner);
            else facet?.domain(axis, null, facetOwner);
          }
        },
      };
    },
  };
}

/**
 * A new view's lifecycle: nothing tracked or drawn yet. Its renderer's creation marks it not
 * drawable until the canvas has a size (installRendererDisposal).
 */
function createLifecycle(): ViewLifecycle {
  return {
    preparations: new Map(),
    geometryQueue: undefined,
    mountCause: undefined,
    mounting: false,
    renderHeld: false,
    drawable: true,
    deviceLost: undefined,
    completedFrame: 0,
    frameCallbacks: new Set(),
    rendererResources: disposeOnce({}),
    geometryBusy: false,
  };
}

function createClock(scope: ClockScope | undefined): ViewClock {
  const clock: ViewClock = {
    scope,
    get time() {
      return clock.scope?.time ?? 0;
    },
    held: false,
    busy: false,
  };
  return clock;
}

function createDrawing(): ViewDrawing {
  return {
    revision: 0,
    surfaceTextures: new Set(),
    overviewFrame: capability(),
  };
}

function createCredits(): ViewCredits {
  // Insertion order: the line shows the credits in the order they were first set.
  const credits = new Map<object, string>();
  const changed = capability<() => void>();
  return {
    set(owner, text) {
      if (text) credits.set(owner, String(text));
      else credits.delete(owner);
      changed.current?.();
    },
    line: () => [...new Set(credits.values())].join(" · "),
    changed,
  };
}

/** What only the view's owner (viewCore) does with its services. */
export interface ViewServicesOwner extends ViewServices {
  /** The canvas created `renderer`; the release detaches it if it is still the view's. */
  attachRenderer(renderer: PlotRenderer): Release;
}

/**
 * The services of a new view. `showErrors` receives the joined messages of its reporters
 * whenever they change ("" once none remain); `clockScope` is the scope it keeps time in.
 */
export function createViewServices({
  showErrors = () => {},
  clockScope = undefined,
}: {
  showErrors?: (message: string) => void;
  clockScope?: ClockScope;
} = {}): ViewServicesOwner {
  const renderer = capability<PlotRenderer>();
  return {
    get renderer() {
      return renderer.current;
    },
    attachRenderer: renderer.install,
    lifecycle: createLifecycle(),
    clock: createClock(clockScope),
    drawing: createDrawing(),
    credits: createCredits(),
    diagnostics: createDiagnostics(showErrors),
    ...(() => {
      const navigation = createNavigation();
      return { navigation, domains: createDomains(navigation) };
    })(),
    updates: { gate: capability() },
    picking: {
      context: capability(),
      scene: capability(),
      camera: capability(),
      brushReadback: capability(),
      nearby: new Set(),
    },
    export: { render: capability(), effects: capability() },
    marks: createViewMarks(),
  };
}

/** Create a view's services and provide them to the components under it. */
export function provideViewServices(
  options?: Parameters<typeof createViewServices>[0],
): ViewServicesOwner {
  const services = createViewServices(options);
  setContext<ViewServices>(VIEW_SERVICES_CONTEXT, services);
  return services;
}
