<script>
  import ComponentError from "./componentError.svelte";
  import { getContext, onDestroy, tick, untrack } from "svelte";
  import { DATA_CONTEXT, createDataScope } from "./utils/categorical.js";
  import { provideLayoutFrame } from "./utils/layoutFrame.js";
  import { ANIMATION_GROUP_CONTEXT } from "./utils/animationGroup.js";
  const animationGroup = getContext(ANIMATION_GROUP_CONTEXT);
  import { treeLayout } from "./utils/tree.js";
  import { snapshotDataScope } from "./utils/dataView.js";
  import { initializePlot } from "../jaxExtensions/setup.js";
  import { trackPreparation, publishWithCause, currentCause } from './rendering/viewSettlement.js';
  import { expressionFields } from "./utils/expressions.js";
  import { expressionEvaluator, registerExpressionDiagnostics } from "./utils/expressionPlans.js";
  import { animationClock } from "./utils/animation.js";
  import { onMembershipChange } from "./utils/interaction.js";
  import {
    ROOT_CONTENT_CONTEXT,
    pendingRootContent,
  } from "./utils/rootFrameSelection.js";
  import { statusChannel } from "./utils/componentStatus.svelte.js";
  import {
    INPUT_CONTEXT,
    InputPending,
    resolveInputs,
  } from "./utils/inputs.js";
  import { settingNames } from "./utils/names.js";
  let {
    children,
    name,
    root = $bindable(),
    directed = false,
    orientation = $bindable("down"),
    siblingSpacing = 1,
    depthSpacing = 1,
    mode = "tidy",
    layerHeight = 1,
    nodeWidth = undefined,
    childAlign = "center",
    widthMode = "proportional",
    visualMargin = 0,
    height = undefined,
    edgeLength = 1,
    where = undefined,
    enter = undefined,
    exit = undefined,
    animationDuration = 300,
    animationEasing = "cubic-in-out",
    ...retiredProps
  } = $props();
  const parent = getContext(DATA_CONTEXT);
  if (!parent) throw Error("Tree requires graph data: wrap the edges (and nodes, if any) in GraphData.");
  const nodeScope = createDataScope();
  const releaseRootPending = pendingRootContent(
    getContext(ROOT_CONTENT_CONTEXT),
  );
  let frame = $state.raw(),
    pending = $state(false),
    error = $state(""),
    alive = true,
    work = Promise.resolve(),
    preparation = work;
  const cache = new Map();
  let registered = $state.raw([]),
    clockTick = $state(0),
    holdEnd = $state(-Infinity),
    finalDue = false;
  const clockOwner = { isDisposed: false };
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
  const status = () => ({ kind: "Tree", name, mounted: alive, pending, error });
  export const { subscribe } = statusChannel(status);
  export async function update(p) {
    const previous = { root, orientation };
    if (p.root !== undefined) root = p.root;
    if (p.orientation !== undefined) orientation = p.orientation;
    await tick();
    try {
      await whenSettled();
    } catch (e) {
      root = previous.root;
      orientation = previous.orientation;
      await tick();
      throw e;
    }
  }
  // The views drawing it (their services) register through the layout frame.
  const { views, drawing, settle } = provideLayoutFrame(() => frame, {
    preparing: () => "Tree is preparing.",
    edgesPreparing: () => "Tree is preparing data.",
    onView(view) {
      const unregister = registerExpressionDiagnostics(view, expressionEvaluator(cache),
        () => ({ consumer: "layout inputs", kind: "Tree", name }));
      registered = drawing();
      return () => {
        unregister();
        registered = drawing();
      };
    },
  });
  export async function whenSettled() {
    await work;
    await tick();
    await settle();
    if (error) throw Error(error);
  }
  const retire = (f) =>
    tick()
      .then(settle)
      .then(() => f?.dispose());
  // Input reads (TODO 41.5) are replaced by their values; a pending input waits.
  const inputStore = getContext(INPUT_CONTEXT) ?? null;
  let interactionTick = $state(0);
  $effect(() => {
    const reads = new Set();
    for (const value of [
      root,
      nodeWidth,
      layerHeight,
      height,
      edgeLength,
      where,
    ])
      expressionFields(value, reads);
    const fields = [...reads].filter((field) => field.startsWith("@"));
    if (!frame || !fields.length) return;
    const resources = new Set(
      fields
        .map((field) =>
          frame.nodes.interactionResource?.(field.replace(/^@any_/, "@")),
        )
        .filter(Boolean),
    );
    const stops = [...resources].map((resource) =>
      onMembershipChange(resource, () => untrack(() => interactionTick++)),
    );
    return () => stops.forEach((stop) => stop());
  });
  // As with live transforms, publish numeric GPU layouts on the plot clock. The clock waits
  // for a drawn frame between preparations, as the ordinary transform pipeline does.
  $effect(() => {
    const view = registered[0],
      end = holdEnd;
    if (!view || end === -Infinity) return;
    const clock = animationClock(view.renderer);
    const track = {
      owner: clockOwner,
      procedural: true,
      explicit: true,
      drawTimeout: 250,
      apply() {},
      async changed() {
        if (clock.time >= end && !finalDue) return false;
        if (clock.time >= end) finalDue = false;
        clockTick++;
        await tick();
        await work;
        return true;
      },
    };
    clock.add(track);
    const hold =
      end > clock.time
        ? {
            owner: clockOwner,
            explicit: true,
            customDuration: end - clock.time,
            apply() {},
          }
        : null;
    if (hold) clock.add(hold);
    return () => {
      clock.remove(track);
      if (hold) clock.remove(hold);
    };
  });
  $effect(() => {
    let c = {
      ...retiredProps,
      __animationGroup: animationGroup?.(),
      root,
      directed,
      orientation,
      siblingSpacing,
      depthSpacing,
      mode,
      layerHeight,
      nodeWidth,
      childAlign,
      widthMode,
      visualMargin,
      height,
      edgeLength,
      where,
      enter,
      exit,
      animationDuration,
      animationEasing,
    };
    interactionTick;
    clockTick;
    try {
      c = settingNames(
        resolveInputs(
          c,
          inputStore,
          "Tree",
          (key) => typeof c[key] === "string",
        ),
      );
    } catch (e) {
      if (!(e instanceof InputPending)) untrack(() => (error = e.message));
      return;
    }
    const input = snapshotDataScope(parent.read()),
      cancel = new AbortController();
    const view = untrack(() => registered[0]),
      renderer = view?.renderer;
    const cause = currentCause(view),
      stops = [];
    pending = true;
    // Serialize layout/cache writes, not gate release: that release waits for descendants
    // and can include this next tracked preparation. Waiting on it here creates a cycle.
    const prepared = preparation
      .catch(() => {})
      .then(() => initializePlot())
      .then(() =>
        treeLayout(input, c, {
          signal: cancel.signal,
          nodeScope,
          cache,
          time: view?.clock.time ?? 0,
          landed: renderer ? animationClock(renderer).reduced : false,
        }),
      )
      .then((next) => {
        if (!alive || cancel.signal.aborted) {
          next.dispose();
          return;
        }
        // Publish marks and their inferred domains together, using the existing plot update gate.
        // Track only preparation: release waits for descendant jobs, never for itself.
        stops.push(
          ...[...views].map((view) => view.updates.gate.current?.()).filter(Boolean),
        );
        const old = frame;
        publishWithCause(view, cause, () => {
          frame = next;
          holdEnd = next.liveUntil;
          finalDue = holdEnd > -Infinity;
          error = "";
        });
        retire(old);
      })
      .catch((e) => {
        if (!cancel.signal.aborted) error = e.message;
      })
      .finally(() => {
        input.dispose();
        if (!cancel.signal.aborted) pending = false;
      });
    for (const drawn of drawing()) trackPreparation(drawn, prepared, cause);
    preparation = prepared;
    work = prepared.then(async () => {
      await tick();
      await Promise.all(stops.map((stop) => stop()));
    });
    return () => cancel.abort();
  });
  onDestroy(() => {
    releaseRootPending();
    alive = false;
    clockOwner.isDisposed = true;
    work.finally(() =>
      retire(frame).then(() => {
        nodeScope.dispose();
        for (const state of cache.values()) state.dispose();
        cache.clear();
      }),
    );
  });
</script>

{#if frame}{@render children?.()}{/if}
<ComponentError kind="Tree" {error} />
