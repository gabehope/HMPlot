<script>
  import { Plot, Points, Text } from "$lib";
  import { onDestroy } from "svelte";

  let { onready = () => {} } = $props();
  const memberships = [
    Array.from({ length: 30 }, (_, index) => index),
    Array.from({ length: 30 }, (_, index) => index + 8),
    Array.from({ length: 30 }, (_, index) => index * 2),
    Array.from({ length: 30 }, (_, index) => 44 - index),
  ];
  function makeFrame(frame) {
    return memberships[frame].map((id, order) => {
      const angle = id * 2.399963 + frame * 0.43;
      const radius = 0.12 + 0.34 * ((id % 13) / 12);
      return {
        id: `node-${id}`,
        label: `N${id}`,
        group: ["Alpha", "Beta", "Gamma"][id % 3],
        x: 0.5 + radius * Math.cos(angle) + 0.035 * Math.sin(frame + order),
        y: 0.5 + radius * Math.sin(angle) + 0.035 * Math.cos(frame * 0.7 + order),
      };
    });
  }
  let frame = $state(0), observations = $state(makeFrame(0)), plot = $state(), selectedCount = $state(0);
  let timers = [];
  $effect(() => onready(plot));
  $effect(() => {
    const resource = plot?.getSelection?.();
    if (resource) return resource.subscribe(({ count }) => selectedCount = count);
  });
  function advance() {
    frame = (frame + 1) % memberships.length;
    observations = makeFrame(frame);
  }
  function burst() {
    timers.forEach(clearTimeout);
    timers = [0, 110, 220, 330].map((delay) => setTimeout(advance, delay));
  }
  function selectSurvivors() {
    plot?.getSelection?.()?.replace([0, 4, 8, 12, 16, 20]);
  }
  onDestroy(() => { timers.forEach(clearTimeout); onready(undefined); });
</script>

<div class="toolbar">
  <button onclick={advance}>Next keyed frame</button>
  <button onclick={burst}>Interrupt with four targets</button>
  <button onclick={selectSurvivors}>Select six current rows</button>
  <button onclick={() => plot?.getSelection?.()?.clear()}>Clear</button>
  <span aria-live="polite">Frame {frame + 1} · {selectedCount} selected</span>
</div>
<p class="explanation">
  Stable keys preserve matching rows and interaction state. Halos fade over 900 ms, points over 520 ms,
  and labels over 240 ms while retained positions animate. Shift-drag also tests brush remapping during updates.
</p>

<Plot bind:this={plot} data={observations} key="id" responsive height={500} axes2d
  x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
  <Points x="x" y="y" size={12.5} fill="transparent" outlineColor="#9eb1c2"
    outlineWidth={0.5} animation animationDuration={900} animationEasing="sine-in-out"
    enterEffect="fade" exitEffect="fade" respond="selected" selectionOpacity={0} />
  <Points x="x" y="y" size={6.5} fill="group" outlineColor="#ffffff"
    outlineWidth={0.4} animation animationDuration={520} animationEasing="cubic-in-out"
    enterEffect="fade" exitEffect="fade" select hover brush
    respond={["selected", "brushed", "hovered"]} selectionOpacity={0.14} />
  <Text x="x" y="y" text="label" dx={12} dy={-13} align="left"
    size={11} color="#40505d" animation animationDuration={240} animationEasing="quad-out"
    enterEffect="fade" exitEffect="fade" respond={["selected", "hovered"]} selectionOpacity={0.18} />
</Plot>

<style>
  .toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin:12px 0 8px; color:#536270; font-size:13px; }
  button { border:1px solid #c9d2dd; border-radius:7px; background:#fff; padding:7px 11px; color:#32485e; font:inherit; }
  .explanation { margin:0 0 12px; color:#657482; font-size:12px; line-height:1.5; }
</style>
