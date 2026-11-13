<script>
  // Continuous size, width, or opacity legend: sample glyphs at evenly spaced scale positions.
  import { tick } from "svelte";
  import { guideSymbol, guideFillRule } from "../utils/guides.js";
  let {
    samples = [],
    channel = "size",
    vertical = false,
    color = "#547ba2",
    shape = "circle",
    format = (v) => String(v),
    label = undefined,
  } = $props();
  let svg = $state(), labelWidth = $state(0);
  const labels = $derived(samples.map((sample) => format(sample.value)));
  // Measure actual rendered labels, including after the web font becomes available.
  $effect(() => {
    labels;
    if (!svg) return;
    const element = svg;
    let current = true;
    const measure = () => {
      if (current) labelWidth = Math.ceil(Math.max(0, ...Array.from(element.querySelectorAll("text"), (text) => text.getComputedTextLength())));
    };
    void tick().then(measure);
    void document.fonts?.ready.then(measure);
    return () => { current = false; };
  });
  // Size glyphs need room for the largest sample; other channels use a fixed cell.
  const cell = $derived(channel === "size"
    ? Math.max(18, Math.max(0, ...samples.map((s) => s.output)) + 6) : 22);
  const step = $derived(vertical ? cell + 4 : Math.max(cell, 40, labelWidth + 12));
  const width = $derived(vertical ? cell + 10 + labelWidth : step * samples.length);
  const height = $derived(vertical ? step * samples.length : cell + 16);
  const center = (index) => vertical
    ? [cell / 2, step * index + cell / 2]
    : [step * index + step / 2, cell / 2];
  const symbol = (x, y, size) => {
    const path = guideSymbol(shape);
    if (!path) return null;
    // guideSymbol paths are drawn around (13, 9) with radius 6.
    return { d: path, rule: guideFillRule(shape), transform: `translate(${x} ${y}) scale(${size / 12}) translate(-13 -9)` };
  };
</script>

<div class="ramp" class:vertical role="img" aria-label={label ?? `${channel} scale`}>
  {#if label}<span class="guide-title">{label}</span>{/if}
  <svg bind:this={svg} {width} {height} data-ramp={channel}>
    {#each samples as sample, index}
      {@const [x, y] = center(index)}
      {#if channel === "width"}
        <line x1={x - cell / 2 + 2} x2={x + cell / 2 - 2} y1={y} y2={y} stroke={color} stroke-width={Math.max(0.5, sample.output)} stroke-linecap="round" />
      {:else if channel === "opacity"}
        <rect x={x - 7} y={y - 7} width="14" height="14" fill={color} fill-opacity={Math.min(1, Math.max(0, sample.output))} />
      {:else if symbol(x, y, sample.output)}
        {@const glyph = symbol(x, y, sample.output)}
        <path d={glyph.d} fill-rule={glyph.rule} transform={glyph.transform} fill={color} />
      {:else if shape === "square"}
        <rect x={x - sample.output / 2} y={y - sample.output / 2} width={sample.output} height={sample.output} fill={color} />
      {:else}
        <circle cx={x} cy={y} r={Math.max(0.5, sample.output / 2)} fill={color} />
      {/if}
      <text
        x={vertical ? cell + 6 : x}
        y={vertical ? y + 3.5 : cell + 12}
        text-anchor={vertical ? "start" : "middle"}>{labels[index]}</text>
    {/each}
  </svg>
</div>

<style>
  .ramp {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .guide-title {
    font-size: var(--hm-legend-title-font-size, var(--guide-title-size, inherit));
    font-weight: var(--hm-legend-title-font-weight, var(--guide-title-weight, 500));
  }
  svg {
    overflow: visible;
    font: 10px "Source Sans 3", system-ui, sans-serif;
    fill: currentColor;
  }
</style>
