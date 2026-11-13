<script lang="ts">
  import ComponentError from "./componentError.svelte";
  import { createExpressionEvaluator } from "./utils/expressionPlans.js";
  import { getContext, setContext, onDestroy, tick, untrack } from "svelte";
  import { numpy as np } from "@hmplot/jax";
  import { initializePlot } from "../jaxExtensions/setup.js";
  import { publishGraph, graphDependencies } from "./utils/graphData.js";
  import { layoutCoordinateNames } from "./utils/layoutPublication.js";
  import { DATA_CONTEXT } from "./utils/categorical.js";
  import { statusChannel } from "./utils/componentStatus.svelte.js";
  import {
    snapshotDataScope,
    createDataView,
    finiteExtents,
  } from "./utils/dataView.js";
  import { facetService } from "./utils/facetService.js";
  import {
    FORCE_CONTEXT,
    ALPHA_DECAY,
    forceTopology,
    forceStep,
    forceSettings,
    forceConstraint,
    forcePlan,
    resolveForceArrays,
    initialPositions,
  } from "./utils/force.js";
  import { settleUploads } from './rendering/uploadSettlement.js';
import { trackPreparation } from './rendering/viewSettlement.js';
  import { ROOT_CONTENT_CONTEXT, pendingRootContent } from "./utils/rootFrameSelection.js";
  import type { ForceProps } from "./publicTypes.js";
  import { INPUT_CONTEXT, resolveInput } from "./utils/inputs.js";
  import { settingNames } from "./utils/names.js";
  let {
    children,
    name,
    weight,
    dimensions = 2,
    seed = 42,
    repulsion = $bindable(30),
    linkDistance = $bindable(30),
    springStrength = $bindable(0.1),
    centering = $bindable(0.01),
    velocityDecay = $bindable(0.4),
    // d3's simulation parameters (TODO 30.5).
    alpha = $bindable(1),
    alphaMin = 0.001,
    alphaDecay = $bindable(ALPHA_DECAY),
    alphaTarget = $bindable(0),
    // Named forces (TODO 30.7), fixed and starting positions from node columns (30.8).
    forces = undefined,
    fixed = undefined,
    initial = undefined,
    // Ticks per published step, and ticks before the first publish.
    ticks = 1,
    warmup = 0,
    // From code or inputs (TODO 41.5): `running` plays and pauses; each change of reset's,
    // reheat's, step's or release's value runs that action once (a Button's count works).
    running: runningProp = undefined,
    reset: resetTrigger = undefined,
    reheat: reheatTrigger = undefined,
    step: stepTrigger = undefined,
    release: releaseTrigger = undefined,
    ...retiredProps
  }: ForceProps = $props();
  const expressionEvaluator = createExpressionEvaluator();
  onDestroy(() => expressionEvaluator.dispose());
  const parent: any = getContext(DATA_CONTEXT),
    facet = facetService();
  const releaseRootPending = pendingRootContent(getContext(ROOT_CONTENT_CONTEXT));
  const slot = facet?.slot();
  let signature: any[] = [];
  const sameSignature = (a, b) => a?.length === b?.length && a.every((value, i) => Object.is(value, b[i]));
  if (!parent) throw Error("Force requires graph data: wrap the edges (and nodes, if any) in GraphData.");
  let frame = $state.raw<any>(),
    simulation: any,
    input: any,
    topology: any,
    alive = true,
    iteration = $state(0),
    running = $state(false),
    pending = $state(false),
    error = $state(""),
    selected = $state<number | null>(null),
    selectedPosition = $state<number[]>([]);
  $effect(() => {
    if (!frame && !error) return;
    let canceled = false;
    tick().then(() => { if (!canceled) releaseRootPending(); });
    return () => { canceled = true; };
  });
  // The views drawing it (their services) and how many of their marks do.
  const views = new Map<any, number>(),
    drawing = () => [...views.keys()].filter((view) => view.renderer),
    // A drag's moves scheduled for a display frame (forceInteraction.svelte): settling waits.
    scheduledMoves = new Set<Promise<void>>();
  let constraints = 0;
  // Controls' values for the `forces` entries' numbers ("forces.<name>.<param>").
  let forceOverrides = $state<Record<string, Record<string, number>>>({});
  // While a node is dragged, alphaTarget is held at 0.3 (d3's drag idiom).
  const DRAG_TARGET = 0.3;
  let dragging = $state(0);
  // The tick's plan and its per-node and per-edge arrays, resolved when the forces' structure
  // or the graph changes (TODO 30.8).
  let planned: any = null, plannedArrays: any[] = [], plannedFor: any = null;
  function releasePlan() {
    plannedArrays.forEach((a) => a.dispose());
    plannedArrays = [];
    planned = plannedFor = null;
  }
  // Input reads (TODO 41.5): a prop that reads an input (repulsion={input("repulsion")}) takes
  // its value here. A Python scene's props arrive with their reads replaced (SceneNode.svelte).
  const inputStore: any = getContext(INPUT_CONTEXT) ?? null;
  const read = (value, key) => resolveInput(value, inputStore, `Force.${key}`);
  const mergedForces = () => {
    // A number in a force's entry may read an input (strength: input("pull"), TODO 41.5).
    const given = read(forces, "forces");
    if (!given && !Object.keys(forceOverrides).length) return given;
    const out = { ...(given ?? {}) };
    for (const [name, values] of Object.entries(forceOverrides)) if (out[name]) out[name] = { ...out[name], ...values };
    return out;
  };
  let epoch = 0,
    work = Promise.resolve(),
    initializing = Promise.resolve(),
    fitting = Promise.resolve(),
    timer: any,
    cancel = new AbortController();
  // col.source names the column as "source" does (R2.0).
  const config = () => ({
    ...settingNames({ weight }),
    dimensions,
    seed: read(seed, "seed"),
    repulsion: read(repulsion, "repulsion"),
    linkDistance: read(linkDistance, "linkDistance"),
    springStrength: read(springStrength, "springStrength"),
    centering: read(centering, "centering"),
    velocityDecay: read(velocityDecay, "velocityDecay"),
    alphaMin,
    alphaDecay: read(alphaDecay, "alphaDecay"),
    alphaTarget: Math.max(read(alphaTarget, "alphaTarget"), dragging ? DRAG_TARGET : 0),
    forces: mergedForces(),
    fixed,
  });
  function status() {
    return {
      kind: "Force",
      name,
      mounted: alive,
      pending,
      error,
      iteration,
      alpha,
      selected,
      selectedPosition,
      selection: topology
        ? { index: selected, position: selectedPosition, count: topology.n }
        : undefined,
    };
  }
  export const { subscribe } = statusChannel(status);
  async function retire(f, settled = false) {
    if (!f) return;
    await tick();
    try {
      if (!settled) await Promise.all(drawing().map(settleUploads));
    } finally {
      f.nodes.dispose();
      f.edges.dispose();
    }
  }
  async function publish() {
    const stops = [...views.keys()]
      .map((view) => view.updates.gate.current?.())
      .filter(Boolean);
    const columns: any = {
      ...topology.nodeFields,
      id: topology.id,
      position: simulation.position.ref,
      degree: topology.degree,
      pinned: simulation.pins.ref,
    };
    const owned = [columns.position, columns.pinned];
    for (let i = 0; i < topology.config.dimensions; i++) {
      const a = simulation.position.ref
        .slice([0, topology.n], [i, i + 1])
        .reshape([topology.n]);
      columns[["x", "y", "z"][i]] = a;
      owned.push(a);
    }
    const nodes = createDataView(topology.nodeScope, { columns, names: layoutCoordinateNames(["x", "y", "z"]) });
    // Unique to this Force's topology and stable across its numeric refreshes: another Force
    // over the same GraphData must not share its cached endpoint mapping.
    nodes.topology = topology.publication ??= {};
    nodes.onDispose = () => owned.forEach((a) => a.dispose());
    const start = np.take(simulation.position.ref, topology.from.ref, 0),
      end = np.take(simulation.position.ref, topology.to.ref, 0);
    const edges = createDataView(topology.edgeScope, {
      columns: {
        start,
        end,
        sourceIndex: topology.from,
        targetIndex: topology.to,
      },
    });
    edges.onDispose = () => {
      start.dispose();
      end.dispose();
    };
    const old = frame;
    frame = publishGraph(input, { nodes, edges });
    await tick();
    // publish runs inside the tracked Force preparation. Waiting for all
    // preparations here would wait on this same promise and deadlock.
    await Promise.all(stops.map((stop) => stop({ skipPreparations: true })));
    await retire(old, true);
  }
  function disposeState() {
    if (simulation) {
      for (const k of ["position", "velocity", "pins", "pinPosition"])
        simulation[k].dispose();
      simulation = null;
    }
  }
  async function initialize(scope, { restart = false } = {}) {
    const nextSignature = [
      ...graphDependencies(scope),
      weight,
      dimensions,
      seed,
      JSON.stringify(initial ?? null),
    ];
    if (!restart && simulation && sameSignature(signature, nextSignature)) {
      // Serialized like a step: no step advances while the topology's fields change, teardown
      // waits for it, and it never publishes after destroy or over a newer topology.
      const id = epoch;
      const task = (async () => {
        let accepted = false;
        try {
          await work;
          if (!alive || id !== epoch) return;
          pending = true;
          await topology.refresh(scope, { signal: cancel.signal });
          if (!alive || id !== epoch) return;
          const previous = input; input = scope; accepted = true;
          releasePlan();
          try { await publish(); } finally { previous?.dispose(); }
        } catch (reason) {
          if (alive && id === epoch) error = reason?.message ?? String(reason);
        } finally {
          if (!accepted) scope.dispose();
          if (id === epoch) pending = false;
        }
      })();
      work = task;
      await task;
      return;
    }
    const saved = await facet?.takeIterative(slot);
    if (!restart && saved && sameSignature(saved.signature, nextSignature)) {
      scope.dispose();
      simulation = saved.simulation;
      input = saved.input;
      topology = saved.topology;
      frame = saved.frame;
      alpha = saved.alpha;
      iteration = saved.iteration;
      signature = nextSignature;
      return;
    }
    saved?.dispose();
    const id = ++epoch;
    cancel.abort();
    cancel = new AbortController();
    running = false;
    stopLoop();
    pending = true;
    try {
      await initializePlot();
      await work;
      const next = await forceTopology(scope, config(), {
        signal: cancel.signal,
      });
      if (!alive || id !== epoch) {
        next.dispose();
        scope.dispose();
        return;
      }
      const previous = { simulation, topology, input };
      const start = await initialPositions(next, scope, initial, expressionEvaluator);
      const proposed = {
        position: start.ref,
        velocity: np.zeros(next.initial.shape),
        pins: np.zeros([next.n], { dtype: np.bool }),
        pinPosition: start,
      };
      await proposed.position.blockUntilReady();
      input = scope;
      topology = next;
      simulation = proposed;
      signature = nextSignature;
      alpha = 1;
      iteration = 0;
      selected = null;
      error = "";
      releasePlan();
      // Ticks before the first publish (d3's simulation.tick(n)).
      for (let i = 0; i < warmup && id === epoch && alive; i++) await advance(config());
      await publish();
      if (previous.simulation) {
        fitting = fit(undefined, false);
        await fitting;
      }
      if (previous.simulation)
        for (const key of ["position", "velocity", "pins", "pinPosition"])
          previous.simulation[key].dispose();
      previous.topology?.dispose();
      previous.input?.dispose();
    } catch (e) {
      scope.dispose();
      if (id === epoch && e.name !== "AbortError") error = e.message;
    } finally {
      if (id === epoch) pending = false;
    }
  }
  // The layout starts again when its graph or setup changes, and only then: a Python scene
  // passes a component's props as one object, so a new `running` (a Run checkbox) or `repulsion`
  // re-runs this effect too, and starting again would stop the layout it runs (TODO 69.10).
  let requestedScope = null, requested: any[] = [];
  $effect(() => {
    try {
      const scope = parent.read();
      for (const prop of ['source', 'target', 'nodes', 'nodeKey']) if (Object.hasOwn(retiredProps, prop))
        throw Error(`Force ${prop} is no longer a layout option; pass it to GraphData.`);
      const key = [scope.version, ...graphDependencies(scope), weight, dimensions, seed,
        JSON.stringify(initial ?? null)];
      if (scope === requestedScope && sameSignature(key, requested)) return;
      requestedScope = scope;
      requested = key;
      const snapshot = untrack(() => snapshotDataScope(scope));
      untrack(() => {
        initializing = initialize(snapshot);
        for (const view of drawing())
          trackPreparation(view, initializing);
      });
    } catch (e) {
      untrack(() => {
        error = e.message;
        running = false;
      });
    }
  });
  $effect(() => {
    read(repulsion, "repulsion");
    read(linkDistance, "linkDistance");
    read(springStrength, "springStrength");
    read(centering, "centering");
    read(velocityDecay, "velocityDecay");
    read(alphaDecay, "alphaDecay");
    read(alphaTarget, "alphaTarget");
    read(forces, "forces");
    fixed;
    untrack(() => {
      try {
        forceSettings(config());
        alpha = 1;
        resume();
      } catch (e) {
        error = e.message;
        running = false;
      }
    });
  });
  export async function whenSettled() {
    await Promise.all(scheduledMoves);
    await initializing;
    await work;
    await fitting;
    await tick();
    await Promise.all(drawing().map(settleUploads));
  }
  /**
   * One tick into `simulation`, with the plan and arrays for the current forces (resolved again
   * only when their structure or the graph changed). Resolves false when superseded.
   */
  async function advance(c) {
    const id = epoch;
    const settings = forceSettings(c);
    const next = forcePlan(settings.forceSpecs, { ...settings, n: topology.n });
    if (!planned || next.structure !== planned.structure || plannedFor !== topology) {
      const arrays = await resolveForceArrays(next, topology, input, expressionEvaluator);
      if (id !== epoch || !alive) {
        arrays.forEach((a) => a.dispose());
        return false;
      }
      releasePlan();
      [planned, plannedArrays, plannedFor] = [next, arrays, topology];
    }
    const result = await forceStep(topology, simulation.position, simulation.velocity, simulation.pins,
      simulation.pinPosition, c, alpha, { signal: cancel.signal, planned, arrays: plannedArrays });
    if (id !== epoch || !alive) {
      result.position.dispose();
      result.velocity.dispose();
      return false;
    }
    simulation.position.dispose();
    simulation.velocity.dispose();
    simulation.position = result.position;
    simulation.velocity = result.velocity;
    alpha = result.alpha;
    iteration++;
    return true;
  }
  export async function step() {
    if (pending || constraints || !simulation) return;
    pending = true;
    const id = epoch,
      c = config();
    const task = (async () => {
      try {
        const computeStart=performance.now();
        // `ticks` ticks per published step.
        for (let i = 0; i < Math.max(1, ticks); i++) if (!(await advance(c))) return;
        for(const view of views.keys())view.diagnostics.instrumentation.current?.sample("forceCompute",performance.now()-computeStart);
        await publish();
        error = "";
      } catch (e) {
        if (e.name !== "AbortError") {
          error = e.message;
          running = false;
        }
      } finally {
        if (id === epoch) pending = false;
      }
    })();
    work = task;
    await task;
  }
  // The running layout steps once per display frame (TODO 30.4; it was capped at 30 Hz): a step
  // waits for its publish, and the next frame yields to input first. A frame in which a drag's
  // move stepped the layout (constrain) has no step of its own (TODO 65.2).
  const nextFrame = (f) => (globalThis.requestAnimationFrame ? requestAnimationFrame(f) : setTimeout(f, 16));
  let loopFrame = null,
    movedAt = -Infinity;
  const looping = () => running && alive && facet?.active() !== false;
  function stopLoop() {
    clearTimeout(timer);
    if (loopFrame !== null) (globalThis.cancelAnimationFrame ?? clearTimeout)(loopFrame);
    loopFrame = null;
  }
  function schedule(frameTime = undefined) {
    stopLoop();
    if (!looping()) return;
    timer = setTimeout(async () => {
      if (frameTime === undefined || movedAt < frameTime) await step();
      // Below alphaMin the layout stops (never while alphaTarget holds it above).
      if (alpha < alphaMin && config().alphaTarget < alphaMin) running = false;
      if (running) loopFrame = nextFrame((t) => { loopFrame = null; schedule(t); });
    }, 0);
  }
  $effect(() => {
    const active = facet?.active() ?? true;
    if (active) untrack(schedule);
    else stopLoop();
  });
  let seenRunning = undefined;
  $effect(() => {
    const next = read(runningProp, "running");
    if (next === undefined || next === seenRunning) return;
    seenRunning = next;
    untrack(() => action(next ? "run" : "pause"));
  });
  // A trigger's first value is recorded in its first run, not while Force is set up: an input
  // later in the markup (a Reset button after the Force) declares its name only then.
  const UNSEEN = Symbol("unseen");
  for (const [id, trigger] of [["reset", () => read(resetTrigger, "reset")], ["reheat", () => read(reheatTrigger, "reheat")],
    ["step", () => read(stepTrigger, "step")], ["release", () => read(releaseTrigger, "release")]] as const) {
    let seen: any = UNSEEN;
    $effect(() => {
      const next = trigger();
      if (seen === UNSEEN) {
        seen = next;
        return;
      }
      if (Object.is(next, seen)) return;
      seen = next;
      untrack(() => action(id));
    });
  }
  // While `running` is true (a checked Run checkbox) the layout runs whenever it can move: after
  // a reset, a step, a reheat or a new parameter it starts again; it rests only once it cools.
  function resume() {
    let wanted = false;
    try {
      wanted = read(runningProp, "running") === true;
    } catch {}
    if (wanted && !running && alive) action("run");
  }
  export async function action(id: string) {
    if (id === "run") {
      running = true;
      if (alpha < alphaMin) alpha = 1;
      schedule();
    } else if (id === "pause") {
      running = false;
      stopLoop();
    } else if (id === "step") {
      running = false;
      stopLoop();
      await initializing;
      await work;
      if (alive) await step();
      resume();
    } else if (id === "reset") {
      // An explicit reset reseeds even when the graph structure is unchanged. Numerical
      // table refreshes take the cache path; Reset deliberately starts a new simulation.
      initializing = initialize(snapshotDataScope(parent.read()), { restart: true });
      await initializing;
      resume();
    } else if (id === "reheat") {
      alpha = 1;
      resume();
    }
    else if (id === "fit") await fit();
    else if (id === "release") {
      await work;
      if (simulation) {
        simulation.pins.dispose();
        simulation.pins = np.zeros([topology.n], { dtype: np.bool });
        await publish();
      }
    } else if ((id === "pin" || id === "unpin") && selected !== null)
      await constrain(selected, selectedPosition, id === "pin");
  }
  export async function update(patch) {
    if (Object.hasOwn(patch, "selected")) {
      const index = Number(patch.selected);
      if (!Number.isInteger(index) || index < 0 || index >= topology.n)
        throw Error("Invalid node index.");
      await select(index);
      if(!patch.selectedPosition)return;
    }
    if (patch.selectedPosition) {
      if (
        selected === null ||
        patch.selectedPosition.length !== dimensions ||
        !patch.selectedPosition.every(Number.isFinite)
      )
        throw Error("Enter finite node coordinates.");
      await constrain(
        selected,
        patch.selectedPosition,
        await isPinned(selected),
      );
      return;
    }
    const forcePatch = Object.entries(patch).filter(([key]) => key.startsWith("forces."));
    if (forcePatch.length) {
      const next = structuredClone($state.snapshot(forceOverrides));
      for (const [key, value] of forcePatch) {
        const [, name, param] = key.split(".");
        if (!mergedForces()?.[name] || !Number.isFinite(Number(value))) throw Error(`Unknown force control ${key}.`);
        (next[name] ??= {})[param] = Number(value);
      }
      forceSettings({ ...config(), forces: { ...mergedForces(), ...Object.fromEntries(Object.entries(next).map(([name, values]) => [name, { ...mergedForces()[name], ...values }])) } });
      forceOverrides = next;
    }
    const rest = Object.fromEntries(Object.entries(patch).filter(([key]) => !key.startsWith("forces.")));
    const c = forceSettings({ ...config(), ...rest });
    repulsion = c.repulsion;
    linkDistance = c.linkDistance;
    springStrength = c.springStrength;
    centering = c.centering;
    velocityDecay = c.velocityDecay;
    alphaDecay = c.alphaDecay;
    if (Object.hasOwn(rest, "alphaTarget")) alphaTarget = c.alphaTarget;
    alpha = 1;
    await tick();
  }
  $effect(() => {
    const n = name;
    return untrack(() =>
      facet?.registerTransform(n, {
        subscribe,
        update,
        whenSettled,
        action,
      }),
    );
  });
  $effect(() => {
    const overrides = facet?.transformSettings(name);
    if (overrides)
      untrack(() => {
        if (overrides.repulsion !== undefined) repulsion = overrides.repulsion;
        if (overrides.linkDistance !== undefined)
          linkDistance = overrides.linkDistance;
        if (overrides.springStrength !== undefined) springStrength = overrides.springStrength;
        if (overrides.centering !== undefined) centering = overrides.centering;
        if (overrides.velocityDecay !== undefined) velocityDecay = overrides.velocityDecay;
        if (overrides.alphaDecay !== undefined) alphaDecay = overrides.alphaDecay;
        if (overrides.alphaTarget !== undefined) alphaTarget = overrides.alphaTarget;
        const forceKeys = Object.entries(overrides).filter(([key]) => key.startsWith("forces."));
        if (forceKeys.length) {
          const next = structuredClone($state.snapshot(forceOverrides));
          for (const [key, value] of forceKeys) {
            const [, name, param] = key.split(".");
            (next[name] ??= {})[param] = Number(value);
          }
          forceOverrides = next;
        }
      });
  });
  async function select(index) {
    if (!simulation || index < 0 || index >= topology.n) return;
    const id = epoch;
    const values = Array.from(
      await simulation.position.ref.slice([index, index + 1]).data(),
    ) as number[];
    if (id === epoch) {
      selected = index;
      selectedPosition = values;
    }
    return values;
  }
  /**
   * Pin node `index` at `position` (unpinned with pin=false) and publish. Constraints apply in
   * order, after the work before them. A drag's `move` (one per display frame) while the layout
   * runs is that frame's batch (TODO 65.2): the constraint, the frame's ticks and one publication,
   * so a drag keeps the layout moving and publishes once a frame; paused, it only moves the node.
   */
  function constrain(index, position, pin = true, generation = epoch, { move = false } = {}) {
    constraints++;
    if (move) movedAt = performance.now();
    const task = work.then(async () => {
      if (!simulation || !alive || generation !== epoch) return;
      // No wait for the GPU here: publish settles the renderer, which waits once for the
      // constraint, the ticks and the marks' uploads together (TODO 65.3).
      const next = await forceConstraint(simulation, index, position, pin, { wait: false });
      if (!alive || generation !== epoch) {
        Object.values(next).forEach((a: any) => a.dispose());
        return;
      }
      for (const key of ["position", "pinPosition", "pins"]) {
        simulation[key].dispose();
        simulation[key] = next[key];
      }
      selected = index;
      selectedPosition = [...position];
      alpha = dragging ? Math.max(alpha, DRAG_TARGET) : 1;
      if (move && looping()) {
        const c = config(), computeStart = performance.now();
        for (let i = 0; i < Math.max(1, ticks); i++) if (!(await advance(c))) return;
        for (const view of views.keys()) view.diagnostics.instrumentation.current?.sample("forceCompute", performance.now() - computeStart);
      }
      await publish();
    }).catch(e => {
      if (alive && generation === epoch) {
        error = e.message;
        running = false;
      }
    }).finally(() => constraints--);
    work = task;
    return task;
  }
  async function fit(only = undefined, explicit = true) {
    await work;
    if (!simulation) return;
    const generation = epoch,
      bounds = {};
    // Every dimension's extent in one readback (TODO 29.3).
    const columns = Array.from({ length: topology.config.dimensions }, (_, i) =>
      simulation.position.ref.slice([0, topology.n], [i, i + 1]).reshape([topology.n]),
    );
    let extents;
    try {
      extents = await finiteExtents(columns);
    } finally {
      columns.forEach((a) => a.dispose());
    }
    const span = Math.max(1, ...extents.map(([a, b]) => (b - a) * 1.15));
    extents.forEach(
      ([a, b], i) =>
        (bounds[["x", "y", "z"][i]] = [(a + b - span) / 2, (a + b + span) / 2]),
    );
    if (!alive || generation !== epoch) return;
    for (const view of only ? [only] : views.keys()) {
      if (!views.has(view)) continue;
      view.domains.dataBounds.current?.(bounds, explicit);
      if (explicit) view.navigation.controls.current?.setViewport?.({ x: 0.5, y: 0.5, zoom: 1 });
    }
  }
  async function isPinned(index) {
    await work;
    return Boolean(
      (await simulation.pins.ref.slice([index, index + 1]).data())[0],
    );
  }
  setContext(DATA_CONTEXT, { read() {
    if (!frame) throw Error("Force is preparing data.");
    return frame.edges;
  } });
  setContext(FORCE_CONTEXT, {

    read: (kind) => {
      if (!frame) throw Error("Force is preparing data.");
      return frame[kind];
    },
    registerView(view) {
      const first = !views.has(view);
      views.set(view, (views.get(view) ?? 0) + 1);
      trackPreparation(view.renderer ? view : undefined, initializing);
      if (first) fitting = fit(view, false);
      return () => {
        const n = views.get(view) - 1;
        if (n) views.set(view, n);
        else views.delete(view);
      };
    },
    select,
    constrain,
    /** A drag's move waiting for a display frame: whenSettled waits for it. */
    track(work: Promise<void>) {
      scheduledMoves.add(work);
      work.finally(() => scheduledMoves.delete(work));
    },
    /** A drag starts (true) or ends (false): alphaTarget is held at 0.3 meanwhile. */
    hold(on: boolean) {
      dragging = Math.max(0, dragging + (on ? 1 : -1));
    },
    get dimensions() {
      return topology?.config.dimensions ?? dimensions;
    },
    get generation() {
      return epoch;
    },
    pinned: isPinned,
  });
  onDestroy(() => {
    releaseRootPending();
    alive = false;
    running = false;
    releasePlan();
    stopLoop();
    epoch++;
    cancel.abort();
    const old = frame;
    frame = undefined;
    const completion = work.then(() => ({
      signature,
      simulation,
      input,
      topology,
      frame: old,
      alpha,
      iteration,
      dispose: async () => {
        await retire(old);
        disposeState();
        topology?.dispose();
        input?.dispose();
      },
    }));
    if (facet && simulation) facet.saveIterative(slot, completion);
    else completion.then((saved) => saved.dispose());
  });
</script>

<ComponentError kind="Force" {error} />
{#if frame}{@render children?.()}{/if}

<style>
  p {
    font: 12px system-ui;
    color: #a13939;
  }
</style>
