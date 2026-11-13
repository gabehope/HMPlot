<script lang="ts">
  import { getContext, setContext, onDestroy, tick, untrack } from "svelte";
  import type { Snippet } from "svelte";
  import { ANIMATION_GROUP_CONTEXT } from "./utils/animationGroup.js";
  import { DATA_CONTEXT } from "./utils/categorical.js";
  import { snapshotDataScope } from "./utils/dataView.js";
  import { facetService } from "./utils/facetService.js";
  import { runTransform, resolveTransformParameters, transformDefaults, expressionParams, transformProducerDeadline, transformDependencies, transformCategoryAxis, transformValueAxis, transformOwnsTweens, transformDomainFields, transformSharedBins } from "./utils/transforms.js";
  import { createTransformRunner } from "./utils/transforms/transformRunner.js";
  import { axisCategory } from "./utils/categorical.js";
  import { getOptionsContext } from "./utils/context.js";
  import { analyzeDependencies, interactionResources, readsInteraction, watchResources } from "./utils/transforms/dependencies.js";
  import { useThrelte } from "@threlte/core";
  import { settleUploads } from './rendering/uploadSettlement.js';
  import { settlePreparations, settleClock } from './rendering/viewSettlement.js';
  import { reportDataError } from "./utils/dataErrors.js";
  import { useViewServices, attributed, currentSceneNode } from "./utils/viewServices.js";
  import { noteTransformRun } from "./utils/rerunGuard.js";
  import { expressionHasTween } from "./utils/expressions.js";
  import { expressionEvaluator, registerExpressionDiagnostics } from "./utils/expressionPlans.js";
  import { ROOT_CONTENT_CONTEXT, pendingRootContent } from "./utils/rootFrameSelection.js";
  import { statusChannel } from "./utils/componentStatus.svelte.js";
  import { animationClock } from "./utils/animation.js";
  import { VIEW_CLOCK_CONTEXT, viewState, viewStateKey, sameKey } from "./utils/viewState.js";
  import { INPUT_CONTEXT, InputPending, resolveInputs, inputNames } from "./utils/inputs.js";
  import { settingNames } from "./utils/names.js";
  import { AXIS_CONTEXT } from "./utils/axisFrame.js";
  import { defaultInteractionKind, onMembershipChange } from "./utils/interaction.js";
  import { interactionClaimed, onInteractionClaims } from "./utils/interactionClaims.js";
  import { useReporter } from "./utils/reporter.js";
  import { readTable } from "./utils/readback.js";
  let {
    kind,
    children,
    onconfigure,
    ...config
  }: { kind: string; children?: Snippet; [key: string]: any } = $props();
  // The pointer states a Filter can read, and the mark prop that sets each (TODO 136.13).
  const POINTER_PROPS: Record<string, string> = { brush: "brush", hover: "hover", nearby: "nearby" };
  const animationGroup: (() => string | string[] | null | undefined) | undefined = getContext(ANIMATION_GROUP_CONTEXT);
  const parent: any = getContext(DATA_CONTEXT),
    facet = facetService();
  const releaseRootPending = pendingRootContent(getContext(ROOT_CONTENT_CONTEXT));
  const slot = facet?.slot();
  const definitionId = facet ? `facet-${slot}` : `transform-${crypto.randomUUID()}`;
  const errorOwner = { sceneNode: currentSceneNode() }; // its diagnostics name its scene node (TODO 136.6)
  const renderer = (() => {
    try {
      return useThrelte().renderer;
    } catch {
      return undefined;
    }
  })();
  const viewServices = useViewServices();
  // An error as this transform's, without its kind (the reports add it): a limit error
  // (limits.js) named for the registry's stand-in takes this kind, and one naming it already
  // ("Stack: ...") is not named twice.
  const ownError = (e: any) => attributed(e, kind).slice(kind.length + 2);
  $effect(() =>
    reportDataError(viewServices, errorOwner, error ? `${kind}: ${error}` : ""),
  );
  // View state (@time; TODO 28). Inside a Plot the transform reads that view's clock. Outside
  // every Plot (Data > Calculate > Plot) the views under it adopt it, and it reads the clock of
  // the one it draws in, or of their scope when they share one (TODO 50: a Scene, an
  // InputContext, a standalone Facet or a Simulate around them); before a view mounts (its
  // first run comes first) the time is 0, where a new view's clock starts.
  const outerClock: any = getContext(VIEW_CLOCK_CONTEXT);
  let adopted = $state.raw<any[]>([]);
  const clockContext = renderer ? undefined : {
      // Called from a view's effect: reading `adopted` there would make that effect depend on it.
      adopt(view) {
        untrack(() => (adopted = [...adopted, view]));
        const release = outerClock?.adopt(view);
        return () => {
          untrack(() => (adopted = adopted.filter((entry) => entry !== view)));
          release?.();
        };
      },
    };
  if (clockContext) setContext(VIEW_CLOCK_CONTEXT, clockContext);
  // The views under it keep one clock: one view, or several in one clock scope. Adopted views
  // are their services (utils/viewServices.ts).
  const oneClock = (views: any[]) => views.every((view) => view.clock.scope === views[0].clock.scope);
  const clockView = $derived(viewServices ?? (adopted.length && oneClock(adopted) ? adopted[0] : undefined));
  const clockRenderer = $derived(renderer ?? clockView?.renderer);
  // Input reads (TODO 41) are replaced by the inputs' values here, so a moved input re-runs the
  // transform like any other setting change. A "$name" string reads in any setting but the
  // transform's name and label; a Python scene's reads arrive replaced already (SceneNode).
  const inputStore: any = getContext(INPUT_CONTEXT) ?? null;
  // A transform whose groups sit at their categories' places (BoxStats, a violin's Density)
  // reads the frame's order of that axis (TODO 130.1), so they line up with the marks drawing
  // the categories even when the axis orders them differently from the data. The frame's
  // categories can appear after this mounts (the first mark to see the column creates them),
  // and a scale's domain can change: either re-runs it.
  const optionsContext: any = (() => { try { return getOptionsContext(); } catch { return null; } })();
  let categoryTick = $state(0), domainTick = $state(0);
  const categoryAxisOf = (settings) => (optionsContext ? transformCategoryAxis(kind, settings) : null);
  // Only a transform that reads an order follows the frame's categories; which axis comes from
  // its resolved settings (an input or a Facet control may set its orientation).
  $effect(() => {
    if (categoryAxisOf(resolvedSettings()))
      return optionsContext.store("_categoryRevision").subscribe(() => untrack(() => categoryTick++));
  });
  $effect(() => {
    const axis = categoryAxisOf(resolvedSettings());
    if (!axis) return;
    categoryTick;
    const scale: any = axisCategory(optionsContext, axis);
    if (scale?.subscribe) return scale.subscribe(() => untrack(() => domainTick++));
  });
  // The order itself, replaced only when it differs: the marks under the transform register
  // the same categories again as its output arrives, which must not re-run it.
  let categoryOrder = $state.raw<any[] | undefined>(undefined);
  const sameOrder = (a: any[] | undefined, b: any[] | undefined) =>
    a === b || (!!a && !!b && a.length === b.length && a.every((value, i) => Object.is(value, b[i])));
  $effect(() => {
    const axis = categoryAxisOf(resolvedSettings());
    categoryTick; domainTick;
    const domain: any = axis ? axisCategory(optionsContext, axis)?.domain : undefined;
    const next = domain ? [...domain] : undefined;
    if (!sameOrder(next, untrack(() => categoryOrder))) categoryOrder = next;
  });
  let inputError = "", inputPending = false;
  const currentSettings = () => {
    const settings = resolvedSettings();
    if (categoryAxisOf(settings) && categoryOrder) settings.__categoryOrder = categoryOrder;
    return settings;
  };
  function resolvedSettings(): Record<string, any> {
    const settings: Record<string, any> = {
      ...config,
      ...overrides,
      ...facet?.transformSettings(overrides.name ?? config.name),
    };
    try {
      inputError = "";
      inputPending = false;
      // col.species where a column's name goes reads as "species" (R2.0).
      return { ...settingNames(resolveInputs(transformDefaults(kind, settings, parent?.read?.()), inputStore, kind, (key) => key !== "name" && key !== "label"), expressionParams(kind)), __animationGroup: animationGroup?.() };
    } catch (e) {
      // An input still reading the data: this transform waits for its value (TODO 41.2).
      if (e instanceof InputPending) inputPending = true;
      else inputError = e.message;
      return settings;
    }
  }
  // What the settings read, as the definition declares it (utils/transforms/dependencies.js):
  // interaction state, the clock and the pointer.
  const dependenciesOf = (settings) => analyzeDependencies(transformDependencies(kind, settings, parent?.read?.()));
  // What of the view state a transform reads: @time (`reads`, live or stepped), the pointer, or,
  // for a Calculate with tween(), the clock its tween state is timed by (`tweens`).
  const viewStateOf = (dependencies) => {
    const tweens = transformOwnsTweens(kind) && dependencies.expressions.some(expressionHasTween);
    return dependencies.clock || dependencies.pointer || tweens
      ? { values: dependencies.expressions, live: dependencies.live, reads: dependencies.clock, pointer: dependencies.pointer, tweens } : null;
  };
  // The pointer (TODO 45) in the frame this transform sits in: its nearest Frame, else the root
  // frame of the one view it draws in (a transform above the Plot).
  const enclosingFrame: any = getContext(AXIS_CONTEXT);
  const pointerView = () => clockView?.navigation;
  const pointerFrame = () => enclosingFrame?.options ?? pointerView()?.rootFrame.current?.();
  const pointerNow = () => pointerView()?.pointer.current?.at(pointerFrame()) ?? null;
  const visibleNow = () => pointerView()?.pointer.current?.visible(pointerFrame()) ?? null;
  let pointerKey: any[] | null = null;
  let current = $state.raw<any>(null),
    runError = $state(""),
    validationError = $state(""),
    alive = true;
  // An earlier valid run may finish after validation rejects the newest settings. Its
  // publication clears only its run error, so it cannot hide the current diagnostic.
  const error = $derived(validationError || runError);
  $effect(() => {
    if (!current && !error) return;
    let canceled = false;
    tick().then(() => { if (!canceled) releaseRootPending(); });
    return () => { canceled = true; };
  });
  let pending = $state(false);
  // Its runs (utils/transforms/transformRunner.js): the output publishes into `current`.
  const runner = createTransformRunner({
    viewServices,
    publish: (next) => { current = next; runError = ""; },
    failed: (e) => { runError = ownError(e); },
    pending: (value) => { pending = value; },
    track: (work) => facet?.track(work),
  });
  const cache: any = runner.cache;
  $effect(() => {
    const view = clockView;
    if (view) return registerExpressionDiagnostics(view, expressionEvaluator(cache),
      () => ({ consumer: "transform inputs", kind, name: overrides.name ?? config.name }));
  });
  let overrides = $state.raw<Record<string, any>>({}),
    previousProps: Record<string, any> = {};
  $effect(() => {
    const incoming = { ...config };
    untrack(() => {
      const next = { ...overrides };
      let changed = false;
      for (const key of Object.keys(next))
        if (
          Object.hasOwn(previousProps, key) &&
          !Object.is(previousProps[key], incoming[key])
        ) {
          delete next[key];
          changed = true;
        }
      previousProps = incoming;
      if (changed) overrides = next;
    });
  });
  let accepted: any = null,
    requestVersion = 0;
  function status() {
    return {
      kind,
      name: overrides.name ?? config.name,
      pending,
      error,
      mounted: alive,
    };
  }
  /** The output on screen (its view), for a transform component's own readers (Regression's fit). */
  export const output = () => current;
  // A plugin's lazy summary, with auxiliary buffers owned by the accepted publication.
  export async function inspect() {
    await whenSettled();
    return (await current?.inspect?.()) ?? null;
  }
  /** The axis its rows' values run along (0 x, 1 y), or null: a template's attachments (TODO 130.2). */
  export const valueAxis = () => transformValueAxis(kind, resolvedSettings(), parent?.read?.());
  export const { subscribe } = statusChannel(status);
  export async function update(patch) {
    if (!alive) throw Error("Transform has been unmounted.");
    const before = accepted,
      previousOverrides = overrides;
    const requested = ++requestVersion;
    overrides = { ...overrides, ...patch };
    onconfigure?.(patch);
    await tick();
    try {
      await whenSettled();
    } catch (e) {
      if (requested === requestVersion && before) {
        overrides = previousOverrides;
        onconfigure?.(before);
        await tick();
        await whenSettled();
      }
      throw e;
    }
  }
  export async function whenSettled({ loads = true } = {}) {
    await runner.settled();
    // The marks drawing this output prepare after it publishes, and publish with their axis
    // extents (TODO 26.5): wait for them, as a plot's whenSettled does, then for the uploads.
    // With `loads: false`, not for a Provider loading in the same plot (TODO 20).
    if (viewServices) {
      await settlePreparations(viewServices, settleClock(), { loads });
      await settleUploads(viewServices);
    }
    if (error) throw Error(`${kind}: ${error}`);
  }

  $effect(() => {
    const name = overrides.name ?? config.name;
    return untrack(() =>
      facet?.registerTransform(name, {
        subscribe,
        update,
        whenSettled,
      }),
    );
  });
  if (!parent)
    throw Error(untrack(() => `${kind} has no table to transform: put it inside a Data (Python: with hm.Data(table):), or give the Plot around it data=.`));
  const source = {
    read() {
      if (!current) throw Error(`${kind} is preparing data.`);
      return current;
    },
    // Domain from input (TODO 136.8): rows a transform makes from the view (a Hexbin radius from
    // @view_x_max) follow the view; marks drawing them take the axes' domains from the input,
    // which the view does not change. Their own extents fed the domain, which moved the view,
    // which re-ran the transform: the taxi explorer re-binned while idle.
    // Any transform whose settings read the view (a Filter to the visible window) passes on its
    // input's columns (fields null: the mark's own); a binning one maps x and y to its input
    // columns. Chained, the first such transform's input is the source.
    domainSource() {
      const upstream = parent?.domainSource?.() ?? null;
      const settings = currentSettings();
      if (!viewStateOf(dependenciesOf(settings))?.pointer) return upstream;
      let base = upstream;
      if (!base)
        try {
          base = { scope: parent.read(), fields: null, reader: kind };
        } catch {
          return null;
        }
      const fields = transformDomainFields(kind, settings);
      return fields ? { ...base, fields } : base;
    },
    // An explicit reference to this output (TODO 142.3, Data value={handle}): the same live
    // output its children read, by marks anywhere, never a copy.
    get kind() { return kind; },
    definition: definitionId,
    /** Whether its transform is still mounted. */
    get alive() { return alive; },
    /** The published output, or null before the first or after unmount (reactive). */
    current: () => (alive ? current : null),
    /** A view drawing this output through a reference shares its clock (as one under it would). */
    adopt: (view: any) => (renderer ? undefined : clockContext?.adopt(view)),
    /** Resolves once its current inputs have run (a referencing Data's read() waits for it). */
    whenSettled: () => whenSettled(),
    /** Whether a run is in flight here or above (reactive): a TableView below shows it busy. */
    upstreamPending: (): boolean => pending || Boolean(parent?.upstreamPending?.()),
  };
  setContext(DATA_CONTEXT, source);
  /** This transform's output as a data source (TODO 142.3): `<Data value={handle}>`. */
  export const dataSource = () => source;
  /**
   * Its output's rows on the host (TODO 145.1): `{ length, version, columns }` (`rows` with
   * `{ rows: true }`), once its current inputs have run and the marks drawing it have drawn.
   * The output is held for the read, so a newer run cannot release it meanwhile.
   */
  export async function read(options: { columns?: string[]; rows?: boolean } = {}) {
    if (!alive) throw Error(`${kind}: it has been unmounted.`);
    await whenSettled();
    const output = current;
    if (!output) throw Error(`${kind}: it has no output to read yet.`);
    const release = output.retain?.();
    try {
      return await readTable(output, { ...options, component: kind });
    } finally {
      release?.();
    }
  }
  // Transforms that read interaction state (@brushed, @any_selected, a selection, ...) rerun
  // when it changes. Resource revisions are not reactive: subscribe to the resources the
  // settings read in the input, keeping them as the settings change.
  let interactionTick = $state(0);
  const interactionWatch = watchResources(() => untrack(() => interactionTick++));
  $effect(() => {
    const dependencies = dependenciesOf(currentSettings());
    let scope;
    if (dependencies.interaction.length) try { scope = parent.read(); } catch {}
    interactionWatch.update(interactionResources(dependencies, scope));
  });
  // A Filter on a pointer state no mark sets is a lint (TODO 136.13): "@brushed" on data no mark
  // brushes never changes, so the Filter keeps the same rows (all of them, or none). Marks claim
  // the states their bindings set (interactionClaims.js), so this follows them as they mount; a
  // state set from code (Python's table.brush.replace) has members, and is not linted.
  const reportLint = useReporter(kind, { severity: "lint" });
  $effect(() => {
    if (kind !== "Filter") return;
    const dependencies = dependenciesOf(currentSettings());
    let scope: any;
    if (dependencies.interaction.length) try { scope = parent.read(); } catch {}
    const read = dependencies.interaction
      .map((field: string) => [field, POINTER_PROPS[defaultInteractionKind(field) ?? ""], scope?.interactionResource?.(field)])
      .filter(([, prop, resource]: any[]) => prop && resource);
    const check = () => {
      const unset = read.find(([, , resource]: any[]) => !interactionClaimed(resource) && !resource.active && !resource.status?.().count);
      reportLint(unset ? {
        severity: "lint", code: "lint.interaction-unset", property: "where",
        message: `Filter: no mark drawing this data has ${unset[1]}=True, so "${unset[0]}" never changes and this Filter always keeps the same rows. Give a mark that draws the same data ${unset[1]}=True (in the same Data, or the same table), or remove the condition.`,
      } : "");
    };
    const stops = read.flatMap(([, , resource]: any[]) => [onInteractionClaims(resource, check), onMembershipChange(resource, check)]);
    untrack(check);
    // No report on cleanup: the next run reports over it, and unmounting withdraws it.
    return () => stops.forEach((stop: () => void) => stop());
  });
  // The clock re-runs a transform that reads view state when a view-state value it reads changed
  // (the change key, utils/viewState.js): a still clock, or floor(@time / 1000) within a second,
  // re-runs nothing. After a step that started a run, the next waits for a drawn frame, as an
  // @time channel's does: a run makes its marks upload, and rendering waits for uploads, so a
  // run every animation frame would starve it (drawTimeout: a run that draws nothing, with no
  // marks under it, waits 250 ms). changed() waits for the run to be tracked, so
  // setAnimationTime's whenSettled (and an export after it) includes the run.
  // A Calculate owning active tween producers re-runs until its deadline, then once more on
  // the final revision. Ordinary consumers follow source publications without their own clock.
  // A finite track holds whenAnimationsFinished until then; landed producers unsubscribe.
  let viewStateTick = $state(0),
    requestedKey: any[] | null = null,
    liveUntil = -Infinity,
    finalDue = false,
    holdEnd = $state(-Infinity);
  const trackOwner = { isDisposed: false };
  $effect(() => {
    const reading = viewStateOf(dependenciesOf(currentSettings()));
    const target = clockRenderer, tweening = holdEnd > -Infinity;
    if ((!reading?.reads && !tweening) || !target) return;
    const clock = animationClock(target);
    const track = {
      owner: trackOwner, procedural: true, explicit: true, drawTimeout: 250, apply() {},
      async changed() {
        let due = false;
        if (reading?.reads) {
          const key = viewStateKey(reading.values, viewState({ time: clock.time }));
          if (!sameKey(key, requestedKey)) {
            requestedKey = key;
            due = true;
          }
        }
        if (clock.time < liveUntil) due = true;
        else if (finalDue) {
          finalDue = false;
          due = true;
        }
        if (!due) return false;
        viewStateTick++;
        await tick();
        return true;
      },
    };
    clock.add(track);
    return () => clock.remove(track);
  });
  $effect(() => {
    const end = holdEnd, target = clockRenderer;
    if (!target || !(end > -Infinity)) return;
    const clock = animationClock(target);
    if (end <= clock.time) return;
    const hold = { owner: trackOwner, explicit: true, customDuration: end - clock.time, apply() {} };
    clock.add(hold);
    return () => clock.remove(hold);
  });
  // A transform reading the pointer re-runs when a value it reads changes as the pointer moves
  // (TODO 45), not with the clock: at rest, and over a view without the pointer, nothing runs.
  $effect(() => {
    const reading = viewStateOf(dependenciesOf(currentSettings())), tracker = pointerView()?.pointer.current, view = clockView;
    if (!reading?.pointer || !tracker) return;
    return tracker.subscribe(pointerFrame(), async () => {
      const key = viewStateKey(reading.values, viewState({ time: view?.clock.time ?? 0, pointer: pointerNow(), visible: visibleNow() }));
      if (sameKey(key, pointerKey)) return;
      pointerKey = key;
      viewStateTick++;
      await tick();
    });
  });
  /** Whether `scope` was derived from this transform's own output (its views' parents). */
  function readsOwnOutput(scope: any) {
    const seen = new Set();
    for (let at = scope; at && !seen.has(at); at = at.parent ?? at.snapshotOf) {
      seen.add(at);
      if (at.transformDefinition === definitionId) return true;
    }
    return false;
  }
  $effect(() => {
    let source, input;
    const interactionRevision = interactionTick;
    viewStateTick;
    const settings = currentSettings();
    if (inputPending) return;
    if (inputError) {
      untrack(() => (validationError = inputError));
      return;
    }
    const dependencies = dependenciesOf(settings);
    const reading = viewStateOf(dependencies);
    // Under a Facet the interaction state a run serves is part of its config, as the view
    // state is, so the cells' cached pipelines (keyed by config) follow it.
    const interaction = readsInteraction(dependencies) ? interactionRevision : undefined;
    if ((reading?.reads || reading?.tweens) && !renderer && !oneClock(adopted)) {
      untrack(() => (validationError = `${reading.tweens ? "tween()" : "@time"}: the ${adopted.length} Plots under this ${kind} have different clocks; put them in one InputContext, whose Plots share a clock, or put the ${kind} inside one Plot, or one ${kind} in each.`));
      return;
    }
    if (reading?.pointer && !renderer && adopted.length > 1) {
      untrack(() => (validationError = `@pointer: the pointer is over one of the ${adopted.length} Plots under this ${kind} at a time; put the ${kind} inside one Plot, or one ${kind} in each.`));
      return;
    }
    try {
      source = parent.read();
      source.version;
      // Connections are fixed references to sources made before (TODO 142.2): a transform
      // whose input is its own output, through a reference, would run forever.
      if (readsOwnOutput(source) || (settings.data?.live && readsOwnOutput(settings.data.value)))
        throw Error(`its input is its own output (through a Data value or a Join's data that references this ${kind}); a pipeline reads only sources upstream of it.`);
      input = snapshotDataScope(source);
    } catch (e) {
      untrack(() => (validationError = ownError(e)));
      return;
    }
    untrack(() => (validationError = ""));
    const runInput = input;
    const run = async (signal: AbortSignal) => {
      // The view state as this run starts, so a run that waited behind a slow one computes the
      // newest time; it rides in the config, so a Facet's replay and cache key carry it.
      let timed = settings;
      const time = clockView?.clock.time ?? 0;
      // Under reduced motion the clock stands still and tweens land at once.
      const landed = clockRenderer ? animationClock(clockRenderer).reduced : false;
      if (reading) {
        const pointer = reading.pointer ? untrack(pointerNow) : undefined, visible = reading.pointer ? untrack(visibleNow) : undefined;
        if (reading.reads) requestedKey = viewStateKey(reading.values, viewState({ time, pointer, visible }));
        if (reading.pointer) pointerKey = viewStateKey(reading.values, viewState({ time, pointer, visible }));
        timed = { ...settings, __viewState: { time, live: reading.live, ...(landed ? { landed } : {}), ...(pointer ? { pointer } : {}), ...(visible ? { visible } : {}) } };
      }
      // Producers publish current values before dependent transforms run. Consumers read the
      // ordinary snapshot; no timing interpretation or injected Calculate. Expression-valued
      // parameters (bin counts, bandwidths) evaluate against this transform's input, which is
      // also what it re-runs on.
      const resolved = await resolveTransformParameters(kind, timed, runInput, cache);
      // Under a Facet the cell runs it (with the bins its slot shares across cells).
      return facet
        ? facet.run(slot as number, kind, runInput, resolved, {
            sharedBins: Boolean(transformSharedBins(kind, settings)),
            bins: settings.bins,
            interaction,
            signal,
          })
        : runTransform(kind, runInput, resolved, { signal, cache });
    };
    // A grid output (a Density's, an Interpolate's) inside a Plot leaves the plot's bounds to the
    // marks that draw it, as any other output does (TODO 64: setting them here raced the marks'
    // automatic domains, so a DensityContour's axes changed from run to run). Around a Plot its
    // grid sets them (viewCore.svelte).
    // The inputs its settings read, on its output (TODO 145.2b): a mark below it that hovers to
    // write one of them is refused, since each hover would move the rows under the pointer.
    const reads = inputNames({ ...config, ...overrides }, (key) => key !== "name" && key !== "label");
    return untrack(() => runner.request(runInput, run, (next) => {
      next.transformDefinition = definitionId;
      next.inputReads = reads;
      next.inputReader = kind;
      // Only this Calculate's own producers need clock scheduling. Upstream live data
      // publishes revisions that already schedule its ordinary dependents.
      liveUntil = reading?.tweens ? transformProducerDeadline(next) : -Infinity;
      if (liveUntil > -Infinity) finalDue = true;
      if (holdEnd !== liveUntil) holdEnd = liveUntil;
      accepted = settings;
    }));
  });
  onDestroy(() => {
    releaseRootPending();
    alive = false;
    trackOwner.isDisposed = true;
    interactionWatch.stop();
    reportDataError(viewServices, errorOwner, "");
    runner.dispose();
  });
</script>

{#if error && !renderer}<div class="transform-error" role="alert">
    {kind}: {error}
  </div>{/if}
{#if current}{@render children?.()}{/if}

<style>
  .transform-error {
    font: 12px/1.4 system-ui;
    color: #9d3535;
    padding: 6px;
  }
</style>
