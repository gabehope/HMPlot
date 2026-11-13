<script>
  import { Plot, Points, Text, where } from "$lib";
  import { onDestroy, onMount } from "svelte";

  let { onready = () => {} } = $props();
  const observations = Array.from({ length: 12 }, (_, index) => ({
    id: `point-${index}`,
    name: `P${index + 1}`,
    x: 0.1 + (index % 4) * 0.25,
    y: 0.18 + Math.floor(index / 4) * 0.3 + (index % 2) * 0.06,
  }));
  let plot = $state(), points = $state(), selectedCount = $state(0), hoverCount = $state(0);
  $effect(() => onready(plot));
  $effect(() => {
    const resource = plot?.getSelection?.();
    if (resource) return resource.subscribe(({ count }) => selectedCount = count);
  });
  $effect(() => {
    const resource = plot?.getHover?.();
    if (resource) return resource.subscribe(({ previewActive }) => hoverCount = previewActive ? 1 : 0);
  });
  onMount(() => {
    if (!import.meta.env.DEV) return;
    const exposed = {
      get plot() { return plot; },
      get points() { return points; },
    };
    window.__hoverSelectionExample = exposed;
    return () => { if (window.__hoverSelectionExample === exposed) delete window.__hoverSelectionExample; };
  });
  onDestroy(() => onready(undefined));
</script>

<div class="controls">
  <span>Hover to highlight. Click to select; Shift-click to add or remove a point.</span>
  <button onclick={() => plot?.getSelection?.()?.replace([0, 4, 8])}>Select first column</button>
  <button onclick={() => plot?.getSelection?.()?.clear()}>Clear</button>
  <span aria-live="polite">{selectedCount} selected · {hoverCount} hovered</span>
</div>
<Plot bind:this={plot} data={observations} key="id" responsive height={420} axes2d
  x={{ domain: [0, 1.05] }} y={{ domain: [0, 1.05] }}>
  <Points bind:this={points} x="x" y="y" size={where("@hovered", 10, 7)}
    fill="#547ba2" outlineColor="#263545" outlineWidth={0.3}
    select hover respond="selected" />
  <Text x="x" y="y" text="name" dx={14} align="left" size={12} color="#40505d" />
</Plot>

<style>
  .controls { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin:12px 0; color:#40505d; }
  button { border:1px solid #c9d2dd; border-radius:7px; background:#fff; padding:7px 11px; color:#32485e; }
</style>
