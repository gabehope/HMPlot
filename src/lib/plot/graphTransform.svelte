<script module>
  import ComponentError from "./componentError.svelte";
  import { dagLayout, sankeyLayout } from "./utils/graphLayouts.js";
  import { packLayout, treemapLayout } from "./utils/hierarchyLayouts.js";
  import { plugins } from "./plugins/runtime.js";
  const layouts = {
    DAG: dagLayout,
    Sankey: sankeyLayout,
    Pack: packLayout,
    Treemap: treemapLayout,
  };
  plugins.reserve("layout", Object.keys(layouts));
</script>

<script>
  import { createExpressionEvaluator } from "./utils/expressionPlans.js";
  import { getContext, onDestroy, tick, untrack } from "svelte";
  import { DATA_CONTEXT } from "./utils/categorical.js";
  import {
    INPUT_CONTEXT,
    InputPending,
    resolveInputs,
  } from "./utils/inputs.js";
  import { provideLayoutFrame } from "./utils/layoutFrame.js";
  import {
    runPluginLayout,
    layoutParameters,
    layoutDependencies,
  } from "./plugins/layout.js";
  import { expressionParameters } from "./plugins/parameters.js";
  import {
    analyzeDependencies,
    interactionResources,
    watchResources,
  } from "./utils/transforms/dependencies.js";
  import { animationClock } from "./utils/animation.js";
  import { useViewServices } from "./utils/viewServices.js";
  import { AXIS_CONTEXT } from "./utils/axisFrame.js";
  import { viewState, viewStateKey, sameKey } from "./utils/viewState.js";
  import { snapshotDataScope } from "./utils/dataView.js";
  import { settingNames } from "./utils/names.js";
  import { initializePlot } from "../jaxExtensions/setup.js";
  import {
    ROOT_CONTENT_CONTEXT,
    pendingRootContent,
  } from "./utils/rootFrameSelection.js";
  import { statusChannel } from "./utils/componentStatus.svelte.js";
  let {
    children = undefined,
    kind,
    params = undefined,
    orientation = undefined,
    nodeWidth = undefined,
    nodeHeight = undefined,
    nodeGap = undefined,
    layerGap = undefined,
    value = undefined,
    nodePadding = undefined,
    iterations = undefined,
    align = undefined,
    root = undefined,
    levels = undefined,
    width = undefined,
    height = undefined,
    padding = undefined,
    paddingInner = undefined,
    paddingOuter = undefined,
    tile = undefined,
    ...retiredProps
  } = $props();
  const evaluator = createExpressionEvaluator();
  const inputs = getContext(INPUT_CONTEXT);
  const parent = getContext(DATA_CONTEXT);
  if (!parent)
    throw Error(
      `${untrack(() => kind)} requires graph data: wrap the edges (and nodes, if any) in GraphData.`,
    );
  const releaseRootPending = pendingRootContent(
    getContext(ROOT_CONTENT_CONTEXT),
  );
  let frame = $state.raw(),
    error = $state(""),
    alive = true,
    work = Promise.resolve();
  const enclosingView = useViewServices();
  const enclosingFrame = getContext(AXIS_CONTEXT);
  let adopted = $state.raw([]);
  const clockView = $derived(
    enclosingView ??
      (adopted.length &&
      adopted.every((view) => view.clock.scope === adopted[0].clock.scope)
        ? adopted[0]
        : undefined),
  );
  const layoutFrame = provideLayoutFrame(() => frame, {
    preparing: () => `${kind} is preparing.`,
    onView(view) {
      untrack(() => (adopted = [...adopted, view]));
      return () =>
        untrack(() => (adopted = adopted.filter((entry) => entry !== view)));
    },
  });
  let pending = $state(false);
  export const { subscribe } = statusChannel(() => ({
    kind,
    pending,
    error,
    mounted: true,
  }));
  $effect(() => {
    if (!frame && !error) return;
    let canceled = false;
    tick().then(() => {
      if (!canceled) releaseRootPending();
    });
    return () => {
      canceled = true;
    };
  });
  export async function whenSettled() {
    await work;
    await tick();
    await layoutFrame.settle();
    if (error) throw Error(error);
  }
  const retire = (f) => layoutFrame.settle().then(() => f?.dispose());
  const definition = $derived(plugins.get("layout", kind));
  const authored = $derived(
    params ?? {
      ...retiredProps,
      orientation,
      nodeWidth,
      nodeHeight,
      nodeGap,
      layerGap,
      value,
      nodePadding,
      iterations,
      align,
      root,
      levels,
      width,
      height,
      padding,
      paddingInner,
      paddingOuter,
      tile,
    },
  );
  // Resolve defaults before inputs: a default can read an input just like an explicit value.
  const settings = $derived.by(() => {
    try {
      return {
        config: settingNames(
          resolveInputs(
            definition
              ? layoutParameters(kind, definition, authored)
              : authored,
            inputs,
            kind,
          ),
          expressionParameters(definition?.parameters),
        ),
      };
    } catch (error) {
      return { error };
    }
  });
  const dependencies = $derived(
    analyzeDependencies(
      definition && settings.config
        ? layoutDependencies(definition, settings.config)
        : {},
    ),
  );
  let dependencyTick = $state(0);
  const interactionWatch = watchResources(() =>
    untrack(() => dependencyTick++),
  );
  $effect(() => {
    interactionWatch.update(interactionResources(dependencies, parent.read()));
  });
  const pointerFrame = () =>
    enclosingFrame?.options ?? clockView?.navigation.rootFrame.current?.();
  const stateNow = () =>
    viewState({
      time: clockView?.clock.time ?? 0,
      pointer: () =>
        clockView?.navigation.pointer.current?.at(pointerFrame()) ?? null,
      visible: () =>
        clockView?.navigation.pointer.current?.visible(pointerFrame()) ?? null,
    });
  const trackOwner = { isDisposed: false };
  $effect(() => {
    const reading = dependencies,
      view = clockView;
    if (!view?.renderer || (!reading.clock && !reading.pointer)) return;
    const clock = animationClock(view.renderer);
    let key = viewStateKey(reading.expressions, stateNow());
    const changed = async () => {
      const next = viewStateKey(reading.expressions, stateNow());
      if (sameKey(key, next)) return false;
      key = next;
      dependencyTick++;
      await tick();
      await work;
      return true;
    };
    const track = {
      owner: trackOwner,
      procedural: true,
      explicit: true,
      drawTimeout: 250,
      apply() {},
      changed,
    };
    if (reading.clock) clock.add(track);
    const stop = reading.pointer
      ? view.navigation.pointer.current?.subscribe(pointerFrame(), changed)
      : null;
    return () => {
      if (reading.clock) clock.remove(track);
      stop?.();
    };
  });
  $effect(() => {
    dependencyTick;
    if (settings.error) {
      if (!(settings.error instanceof InputPending))
        error = settings.error.message;
      pending = settings.error instanceof InputPending;
      return;
    }
    const c = settings.config,
      input = snapshotDataScope(parent.read()),
      cancel = new AbortController(),
      state = untrack(stateNow);
    const builtin = layouts[kind];
    const layout =
      builtin ??
      ((scope, config, options) => {
        if (!definition) throw plugins.missing("layout", kind);
        return runPluginLayout(kind, definition, scope, config, options);
      });
    pending = true;
    work = initializePlot()
      .then(() =>
        layout(input, c, {
          signal: cancel.signal,
          evaluator,
          viewState: state,
        }),
      )
      .then((next) => {
        if (!alive || cancel.signal.aborted) {
          next.dispose();
          return;
        }
        const old = frame;
        frame = next;
        error = "";
        retire(old);
      })
      .catch((e) => {
        if (!cancel.signal.aborted) error = e.message;
      })
      .finally(() => {
        input.dispose();
        if (!cancel.signal.aborted) pending = false;
      });
    return () => cancel.abort();
  });
  onDestroy(() => {
    releaseRootPending();
    alive = false;
    trackOwner.isDisposed = true;
    interactionWatch.stop();
    work.finally(() => {
      evaluator.dispose();
      return retire(frame);
    });
  });
</script>

{#if frame}{@render children?.()}{/if}
<ComponentError {kind} {error} />
