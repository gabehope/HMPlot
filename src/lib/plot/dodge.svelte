<script lang="ts">
  import Transform from "./transform.svelte";
  import { getContext, setContext, onDestroy, tick, untrack } from "svelte";
  import type { Snippet } from "svelte";
  import { categoryField } from "./utils/dataView.js";
  import { facetService } from "./utils/facetService.js";
  import { DATA_CONTEXT } from "./utils/categorical.js";
  import { statusChannel } from "./utils/componentStatus.svelte.js";
  import { useViewServices } from "./utils/viewServices.js";
  import { trackPreparation } from './rendering/viewSettlement.js';
  import { INPUT_CONTEXT, resolveInput } from "./utils/inputs.js";
  import { DODGE_AXIS_CONTEXT, DODGE_CONTEXT, createDodgeLayout } from "./utils/dodgeLayout.js";
  let {
    x,
    y,
    mode = "collision",
    columns = $bindable(10),
    count = undefined,
    axis = "auto",
    as = "offset",
    padding = $bindable(1),
    seed = $bindable(42),
    name,
    children,
  }: {
    mode?: "collision" | "grid";
    columns?: number;
    count?: string;
    name?: string;
    x?: string;
    y?: string;
    axis?: "x" | "y" | "auto";
    as?: string;
    padding?: number;
    seed?: number;
    children?: Snippet;
  } = $props();
  const parent: any = getContext(DATA_CONTEXT),
    facet = facetService();
  const view = useViewServices();
  if (!parent) throw Error("Dodge requires Data.");
  const inputStore: any = getContext(INPUT_CONTEXT) ?? null;
  const axisRule: ((scope: any) => "x" | "y") | undefined = getContext(DODGE_AXIS_CONTEXT);
  let gridHandle = $state<any>();
  let alive = true,
    preparation = Promise.resolve(),
    pending = $state(false);
  let gridStatus = $state<any>();
  $effect(() => {
    if (mode === "grid" && gridHandle) return gridHandle.subscribe(value => gridStatus = value);
  });
  function status() {
    if (mode === "grid") return gridStatus ?? {kind:"Dodge", name, mounted:alive, pending:true, error:""};
    return {
      kind: "Dodge",
      name,
      mounted: alive,
      pending,
      error: "",
    };
  }
  export const { subscribe } = statusChannel(status);
  export async function update(patch) {
    if (mode === "grid") return gridHandle.update(patch);
    const nextPadding = patch.padding ?? padding,
      nextSeed = patch.seed ?? seed;
    if (
      !Number.isFinite(nextPadding) ||
      nextPadding < 0 ||
      !Number.isInteger(nextSeed)
    )
      throw Error("Dodge needs nonnegative padding and an integer seed.");
    padding = nextPadding;
    seed = nextSeed;
    await tick();
  }
  $effect(() => {
    if (mode === "grid") return;
    const n = name;
    return untrack(() =>
      facet?.registerTransform(n, {
        subscribe,
        update,
        whenSettled,
      }),
    );
  });
  $effect(() => {
    const overrides = facet?.transformSettings(name);
    if (overrides)
      untrack(() => {
        if (overrides.padding !== undefined) padding = overrides.padding;
        if (overrides.seed !== undefined) seed = overrides.seed;
      });
  });
  export const whenSettled = async () => {
    await tick();
    if (mode === "grid") await gridHandle?.whenSettled();
    else await preparation;
  };
  /** Its output as a data source (TODO 142.3): <Data value={handle}>. A collision Dodge lays
   * out the marks under it and has no output of its own. */
  export const dataSource = () => {
    if (mode !== "grid") throw Error('Dodge: a reference reads a mode="grid" Dodge\'s rows; mode="collision" lays out the marks under it and has no output to share.');
    return gridHandle?.dataSource?.();
  };
  /** A mode="grid" Dodge's rows on the host (TODO 145.1). */
  export const read = (options) => {
    if (mode !== "grid") throw Error('Dodge: read() reads a mode="grid" Dodge\'s rows; mode="collision" lays out the marks under it and has no output to read.');
    return gridHandle.read(options);
  };
  onDestroy(() => {
    alive = false;
  });
  // axis="auto" (TODO 130.1): points move across a categorical x (a vertical swarm per
  // category), or across their one position (y="value" alone moves them along x); otherwise
  // along y, as for a numeric x with or without a categorical y.
  const autoAxis = () => {
    if (x === undefined && y !== undefined) return "x";
    const scope = parent.read();
    return categoryField(scope, x) && !categoryField(scope, y) ? "x" : "y";
  };
  // The point mark drawing this Dodge's rows reaches its layout through DODGE_CONTEXT
  // (utils/dodgeLayout.js); the rows pass on unchanged.
  const layout = createDodgeLayout({
    config() {
      // Input reads (TODO 41.5): padding={input("padding")} takes the input's value.
      const read = (value, key) => resolveInput(value, inputStore, `Dodge.${key}`);
      const along = axisRule ? axisRule(parent.read()) : axis === "auto" ? autoAxis() : axis;
      if ((along === "y" ? x : y) === undefined)
        throw Error(`Dodge moves points along ${along}, so it needs their positions in ${along === "y" ? "x" : "y"}: give ${along === "y" ? "x" : "y"} a numeric column${axis === "auto" ? ' (a categorical x with a numeric y makes a swarm per category)' : ""}.`);
      return { field: along === "y" ? x : y, by: along === "y" ? y : x, axis: along, as, padding: read(padding, "padding"), seed: read(seed, "seed") };
    },
    track(work, cause = undefined) {
      preparation = view ? trackPreparation(view, work, cause) : work;
      pending = true;
      work.finally(() => {
        if (preparation === work) pending = false;
      });
    },
  });
  setContext(DODGE_CONTEXT, layout);
  setContext(DATA_CONTEXT, {
    read() {
      const source = parent.read();
      return mode === "grid" ? source : layout.serve(source);
    },
  });
</script>

{#if mode === "grid"}
  <Transform bind:this={gridHandle} kind="Dodge" {mode} {columns} {count} {name}
    onconfigure={(patch) => { if (patch.columns !== undefined) columns = patch.columns; }}>
    {@render children?.()}
  </Transform>
{:else if mode === "collision"}{@render children?.()}{:else}
  {@const invalid = (()=>{throw Error("Dodge mode must be collision or grid.");})()}
{/if}
