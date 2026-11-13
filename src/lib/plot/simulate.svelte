<script lang="ts">
  // Simulate (TODO 42): per-row state stepped at a fixed interval (utils/simulate.js). Its
  // output is a root for interaction: the rows marks under it draw carry their own selection,
  // brush and hover, as a Data with data= does, and an update may read them.
  import ComponentError from "./componentError.svelte";
  import { getContext, setContext, onDestroy, untrack } from "svelte";
  import type { Snippet } from "svelte";
  import { DATA_CONTEXT, createDataScope } from "./utils/categorical.js";
  import { statusChannel } from "./utils/componentStatus.svelte.js";
  import { VIEW_CLOCK_CONTEXT, viewState } from "./utils/viewState.js";
  import { INPUT_CONTEXT, InputPending, resolveInput, resolveInputs } from "./utils/inputs.js";
  import { initializePlot } from "../jaxExtensions/setup.js";
  import { settleUploads } from './rendering/uploadSettlement.js';
  import { onMembershipChange } from "./utils/interaction.js";
  import { registerExpressionDiagnostics } from "./utils/expressionPlans.js";
  import { provideClockScope } from "./utils/clockScope.js";
  import {
    checkSimulation, stepScope, evaluateColumns, disposeState, stepsDue, remapState, largestChange, readsInteraction,
    rowTokens, createSimulationEvaluator,
  } from "./utils/simulate.js";
  import type { SimulateProps } from "./publicTypes.js";
  let {
    initial,
    update,
    step = 16,
    stop = undefined,
    running = true,
    reset = undefined,
    maxSteps = 8,
    name = undefined,
    children,
  }: SimulateProps & { children?: Snippet } = $props();
  const parent: any = getContext(DATA_CONTEXT);
  if (!parent) throw Error("Simulate requires a Data scope.");
  const inputStore: any = getContext(INPUT_CONTEXT) ?? null;

  // Its clock (TODO 50): the scope around it, else its own, which the Plots under it share.
  const clock = provideClockScope();
  // The views under it (their services): a state's arrays are freed once they have drawn the
  // state after it.
  const views = new Set<any>();
  const drawing = () => [...views].filter((view) => view.renderer);
  const outerClock: any = getContext(VIEW_CLOCK_CONTEXT);
  setContext(VIEW_CLOCK_CONTEXT, {
    // The Plots under it move as it steps (their descriptions say so, TODO 49).
    simulation: true,
    adopt(view) {
      views.add(view);
      const unregister = registerExpressionDiagnostics(view, evaluator,
        () => ({ consumer: "simulation inputs", kind: "Simulate", name }));
      const release = outerClock?.adopt(view);
      return () => {
        unregister();
        views.delete(view);
        release?.();
      };
    },
  });

  const output = createDataScope();
  let published = $state(0),
    ready = $state(false),
    error = $state(""),
    steps = $state(0),
    settled = $state(false),
    playing = $state(true);
  setContext(DATA_CONTEXT, {
    read() {
      published;
      if (!ready) throw Error("Simulate is preparing its first state.");
      return output;
    },
  });

  // The configuration with its input reads replaced; null while an input it reads is pending.
  const configuration = () => {
    try {
      const resolved = resolveInputs({ initial, update, step, stop, running, maxSteps }, inputStore, "Simulate");
      checkSimulation(resolved as any);
      return resolved;
    } catch (e) {
      if (e instanceof InputPending) return null;
      throw e;
    }
  };
  let config: any = null;
  const evaluator = createSimulationEvaluator();

  let latest: any = null, // the newest state (owned)
    shown: any = null, // the state the output scope holds
    source: any = null, // the parent scope the state was built on
    passThrough: any = {}, // the parent's columns as typed columns, kept between publishes
    taken = 0,
    time = 0,
    alive = true;
  // Everything that reads or replaces the state (a rebuild, the loop's steps, seek, disposal)
  // runs one at a time: a step awaits its stop check, and nothing may move the state meanwhile.
  let queue: Promise<any> = Promise.resolve();
  const serial = (work: () => any) => (queue = queue.catch(() => {}).then(work));
  const retire = (old) => {
    if (!old || old === latest || old === shown) return;
    Promise.all(drawing().map(settleUploads)).finally(() => disposeState(old));
  };
  function publish() {
    const previous = shown;
    // Its rows' identity (selection, brush and hover keep to them) is the tokens rebuild made:
    // the key through any Filter above, or the row's index.
    output.update({ ...passThrough, ...latest }, undefined, { tokens: source?.tokens ?? null });
    // Its state columns cannot be dragged: each step computes them (interaction/channelWriteback.js).
    output.stateColumns = new Set(Object.keys(latest));
    shown = latest;
    ready = true;
    published++;
    retire(previous);
  }
  function passThroughOf(scope) {
    const out = {};
    for (const field of scope.keys())
      if (!field.startsWith("@")) out[field] = { __hmplotColumn: true, values: scope.get(field), metadata: scope.metadata?.(field) };
    return out;
  }
  /** The first state over the parent `scope`, or the old state moved to its rows (by key). */
  async function rebuild(scope, from) {
    const tokens = await rowTokens(scope);
    const initialState = evaluateColumns(config.initial, scope, scope.length, "initial", { evaluator: evaluator.expressions });
    if (latest && from) {
      if (!(from.tokens && tokens) && from.length !== scope.length && !warnedPosition) {
        warnedPosition = true;
        console.warn(`Simulate: the rows changed from ${from.length} to ${scope.length} without a key, so rows keep their state by position; give the Data a key= to keep it by row.`);
      }
      const moved = remapState(latest === shown ? copyState(latest) : latest, initialState, from.tokens, tokens);
      latest = moved;
    } else {
      if (latest !== shown) disposeState(latest);
      latest = initialState;
    }
    source = { scope, length: scope.length, tokens };
    passThrough = passThroughOf(scope);
  }
  let warnedPosition = false;
  // A state the output scope still holds is copied before it is moved or freed.
  const copyState = (value) => Object.fromEntries(Object.entries(value).map(([key, array]: any) => [key, array.ref]));

  // Parent data, configuration and reset: a new parent version moves the state to its rows; a
  // change of reset's value (a Button's count) starts again from `initial`.
  let seenReset: any = Symbol("unseen");
  $effect(() => {
    let scope, next;
    try {
      scope = parent.read();
      scope.version;
      next = configuration();
    } catch (e) {
      untrack(() => (error = e.message));
      return;
    }
    const nextReset = resolveReset();
    untrack(() => {
      if (!next) return;
      config = next;
      error = "";
      const restart = typeof seenReset !== "symbol" && !Object.is(nextReset, seenReset);
      seenReset = nextReset;
      // Data's read() updates its scope on every read, so the version always moves: the data
      // changed when a column object, the columns or the row count did.
      const changed = !source || source.scope !== scope || scope.length !== source.length ||
        scope.keys().filter((field) => !field.startsWith("@")).some((field) => passThrough[field]?.values !== scope.get(field)) ||
        Object.keys(passThrough).some((field) => !scope.has(field));
      initializePlot().then(() => serial(async () => {
        if (!alive) return;
        try {
          if (restart) {
            if (latest !== shown) disposeState(latest);
            latest = null;
            await rebuild(scope, null);
            taken = steps = 0;
            time = 0;
          } else if (changed) await rebuild(scope, source);
          else if (!ready) await rebuild(scope, null);
          settled = false;
          publish();
          schedule();
        } catch (e) {
          error = e.message;
        }
      }));
    });
  });
  function resolveReset() {
    try {
      return resolveInput(reset, inputStore, "Simulate.reset");
    } catch (e) {
      if (e instanceof InputPending) return seenReset;
      throw e;
    }
  }
  // An update that reads its own rows' flags (@any_brushed) wakes on their changes.
  $effect(() => {
    if (!readsInteraction(update)) return;
    const identity = output.identity;
    const stops = [identity.selection, identity.brush, identity.hover, identity.nearby, identity.nearest, identity.tooltip]
      .map((resource) => onMembershipChange(resource, () => untrack(() => { settled = false; schedule(); })));
    return () => stops.forEach((stopListening) => stopListening());
  });
  // running= (a Checkbox) plays and pauses; playing again wakes a settled simulation. Playing from
  // the start is autoplay: under reduced motion it waits until running changes, as a Playback's
  // autoplay does (TODO 69.16), so the first state is what an export at rest shows.
  let firstRunning: boolean | undefined, runningChanged = false;
  $effect(() => {
    let wanted = true;
    try {
      wanted = resolveInput(running, inputStore, "Simulate.running") !== false;
    } catch (e) {
      if (!(e instanceof InputPending)) throw e;
    }
    untrack(() => {
      if (firstRunning === undefined) firstRunning = wanted;
      else if (wanted !== firstRunning) runningChanged = true;
      playing = wanted;
      if (playing) {
        settled = false;
        schedule();
      }
    });
  });

  // The loop: its clock's frames move `time` (by the frame's elapsed time, capped at 250 ms; not
  // while the scope is held, as by an export, or frozen), and each move takes the steps it
  // makes due, then publishes once. A step of setAnimationTime (a video's frame) moves it by
  // that step and waits for the steps. At most one batch runs and one waits: a batch reads the
  // time when it starts.
  let queued: Promise<any> | null = null;
  const schedule = () => clock.schedule();
  function takeDue() {
    if (queued) return queued;
    const work = serial(async () => {
      queued = null;
      if (!alive || !playing || settled || !config || !latest) return;
      const due = stepsDue(time, config.step, taken, config.maxSteps);
      if (!due) return;
      await advance(due);
      // Capped: the simulation runs behind real time instead of catching up later.
      if (due === config.maxSteps) time = Math.min(time, taken * config.step);
    }).catch((e) => {
      error = e.message;
    });
    queued = work;
    return work;
  }
  $effect(() => clock.subscribe({
    active: () => alive && playing && !settled && ready && !!config,
    // Playing since it started, not since the reader set it running: the frames do not move it
    // under reduced motion (setAnimationTime still does).
    autoplay: () => !runningChanged,
    tick(dt) {
      time += dt;
      return takeDue();
    },
  }));
  /** Take `count` steps and publish the last state; the stop rule checks every `every` steps. */
  async function advance(count) {
    const scope = source.scope, length = scope.length, stopRule = config.stop;
    for (let i = 0; i < count; i++) {
      const before = latest;
      const next = evaluator.evaluate(config.update, stepScope(scope, before, ready ? output : null, config.step), length,
        { viewState: viewState({ time: (taken + 1) * config.step }) });
      taken++;
      steps = taken;
      latest = next;
      const check = stopRule && taken % Math.max(1, stopRule.every ?? 30) === 0;
      if (check) {
        const change = await largestChange(before, next, stopRule.columns ?? Object.keys(config.update));
        if (before !== shown) disposeState(before);
        if (change <= stopRule.tolerance) {
          settled = true;
          break;
        }
      } else if (before !== shown) disposeState(before);
    }
    publish();
  }

  function status() {
    return { kind: "Simulate", name, mounted: alive, pending: !ready, error, steps, running: playing && !settled, settled };
  }
  export const { subscribe } = statusChannel(status);
  /** The steps taken since the first state (or the last reset). */
  export const getSteps = () => taken;
  /**
   * Go to `ms` of simulated time: from the first state, the steps to floor(ms / step) (fewer when
   * it settles first, as it would playing), taken in chunks that yield to the page. The same `ms`
   * gives the same state whenever it is asked.
   */
  export async function seek(ms) {
    if (!config || !source) throw Error("Simulate is preparing its first state.");
    await serial(async () => {
      if (latest !== shown) disposeState(latest);
      latest = null;
      await rebuild(source.scope, null);
      taken = steps = 0;
      time = ms;
      settled = false;
      const target = Math.floor(ms / config.step + 1e-9);
      while (taken < target && alive && !settled) {
        await advance(Math.min(200, target - taken));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (taken === 0) publish();
    });
    schedule();
  }
  export async function whenSettled() {
    await Promise.all(drawing().map(settleUploads));
    if (error) throw Error(error);
  }

  onDestroy(() => {
    alive = false;
    serial(() => Promise.all(drawing().map(settleUploads)).finally(() => {
      disposeState(latest);
      if (shown !== latest) disposeState(shown);
      evaluator.dispose();
      output.dispose();
    }));
  });
</script>

{#if ready}{@render children?.()}{/if}
<ComponentError kind="Simulate" {error} />

<style>
  .simulate-error {
    margin: 4px 0;
    color: #a32b30;
    font: 12px/1.35 system-ui, sans-serif;
  }
</style>
