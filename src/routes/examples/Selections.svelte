<script>
  import { Data, Plot, Points, Filter } from "$lib";
  import { onDestroy, onMount } from "svelte";

  let { onready = () => {} } = $props();
  const observations = {
    id: Array.from({ length: 30 }, (_, index) => `sample-${index}`),
    x: Array.from({ length: 30 }, (_, index) => index / 29),
    y: Array.from({ length: 30 }, (_, index) =>
      0.5 + 0.32 * Math.sin(index * 0.75) + 0.12 * Math.cos(index * 1.7)),
  };
  let source = $state(), selected = $state(), filtering = $state(), filtered = $state(), selectionCount = $state(0);
  $effect(() => onready(source));
  onMount(() => {
    if (!import.meta.env.DEV) return;
    const exposed = {
      get source() { return source; },
      get selected() { return selected; },
      get filtering() { return filtering; },
      get filtered() { return filtered; },
    };
    window.__selectionExample = exposed;
    return () => { if (window.__selectionExample === exposed) delete window.__selectionExample; };
  });
  $effect(() => {
    const resource = source?.getSelection?.();
    if (!resource) return;
    return resource.subscribe((status) => { selectionCount = status.count; });
  });
  onDestroy(() => onready(undefined));
</script>

<div class="controls">
  <span>Click a point to select it; Shift-click adds or removes points. Shift-drag brushes the plot. Drag inside the brush to move it; click outside to clear it.</span>
  <button onclick={() => source?.getSelection?.()?.clear()}>Clear selection</button>
  <button onclick={() => source?.clearBrush?.()}>Clear brush</button>
  <span aria-live="polite">{selectionCount} selected</span>
</div>
<Data value={observations} key="id">
  <div class="views">
    <section><h3>Data-owned interaction state</h3>
      <Plot bind:this={source} responsive height={350} axes2d
        x={{ domain: [-0.05, 1.05] }} y={{ domain: [-0.05, 1.05] }}>
        <Points x="x" y="y" size={6} fill="#547ba2" outlineColor="#263545"
          outlineWidth={0.35} select hover brush respond={true} />
      </Plot>
    </section>
    <section><h3>Filtered from the same selection</h3>
      <Plot bind:this={selected} responsive height={350} axes2d
        x={{ domain: [-0.05, 1.05] }} y={{ domain: [-0.05, 1.05] }}>
        <Filter bind:this={filtering} where="@selected" inactive="all">
          <Points bind:this={filtered} x="x" y="y" size={7.5} fill="#cf8955" />
        </Filter>
      </Plot>
    </section>
  </div>
</Data>

<style>
  .controls { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin:12px 0; color:#40505d; }
  .controls button { border:1px solid #c9d2dd; border-radius:7px; background:#fff; padding:7px 11px; color:#32485e; }
  .views { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr)); gap:16px; }
  h3 { margin:0 0 8px; font-size:14px; color:#3c4d5c; }
</style>
