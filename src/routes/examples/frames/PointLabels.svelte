<script>
  import { untrack } from "svelte";
  import { Plot, Points, Text } from "$lib";

  let { plot = $bindable(), onready = undefined } = $props();
  $effect(() => {
    const current = plot;
    untrack(() => onready?.(current));
  });
  let selected=$state("");
  let showLabels = $state(true);
  let labelSize = $state(14);
  const observations = [
    { name: "Alder", x: 2, y: 8 },
    { name: "Birch", x: 7.5, y: 8.3 },
    { name: "Cedar", x: 1.5, y: 6 },
    { name: "Maple", x: 7, y: 6.2 },
    { name: "Aspen", x: 2.4, y: 4 },
    { name: "Beech", x: 7.8, y: 4.2 },
    { name: "Hazel", x: 1.8, y: 2 },
    { name: "Willow", x: 7.2, y: 1.8 },
  ];
</script>

<div class="label-controls">
  <label><input type="checkbox" bind:checked={showLabels} /> Show labels</label>
  <label>
    Label size
    <input type="range" min="8" max="28" step="1" bind:value={labelSize} />
    <output>{labelSize.toFixed(1)}</output>
  </label>
</div>
<Plot
  bind:this={plot}
  data={observations}
  responsive
  height={440}
  aspect="equal"
  axes2d
  x={{ domain: [0, 12], label: "X" }}
  y={{ domain: [0, 10], label: "Y" }}
>
  <Points
    x="x"
    y="y"
    size={8}
    fill="#547ba2"
    outlineColor="#f4f2ed"
    outlineWidth={0.7}
    name="Observations"
  />
  <Text x="x" y="y" text="name" dx={8} align="left" size={labelSize} visible={showLabels} onclick={event=>selected=observations[event.instanceId]?.name??""} />
</Plot>
{#if selected}<output aria-label="Selected label">{selected}</output>{/if}

<style>
  .label-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 24px;
    margin-bottom: 12px;
  }
  label {
    display: flex;
    align-items: center;
    gap: 8px;
    font: 13px system-ui;
    color: #40505d;
  }
  input[type="range"] {
    width: 120px;
  }
  output {
    min-width: 2.5ch;
    font-variant-numeric: tabular-nums;
  }
</style>
