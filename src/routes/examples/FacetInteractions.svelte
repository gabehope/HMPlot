<script>
  import { Data, Facet, Plot, Points, Text, Filter } from "$lib";
  import { onDestroy } from "svelte";

  let { onready = () => {} } = $props();
  const regions = ["East", "Central", "West"];
  const observations = Array.from({ length: 108 }, (_, index) => {
    const regionIndex = index % regions.length;
    const local = Math.floor(index / regions.length);
    return {
      id: `${regions[regionIndex]}-${local + 1}`,
      region: regions[regionIndex],
      group: ["Control", "Treatment"][(local + regionIndex) % 2],
      x: 0.08 + ((local * 7) % 31) / 37 + regionIndex * 0.015,
      y: 0.1 + ((local * 11) % 29) / 35 + 0.05 * Math.sin(local + regionIndex),
    };
  });
  let facet = $state(), detail = $state(), selectedCount = $state(0), brushedCount = $state(0);
  const galleryHandle = $derived(facet ? {
    whenSettled: () => facet.whenSettled(),
    whenAnimationsFinished: () => Promise.all(facet.getPlots().map(({ plot }) => plot.whenAnimationsFinished())),
    exportPNG: (scale) => facet.exportPNG({ scale }),
    openSettings: (anchor) => facet.getPlots()[0]?.plot.openSettings(anchor),
    getDiagnostics: () => facet.getPlots()[0]?.plot.getDiagnostics(),
  } : detail);
  $effect(() => onready(galleryHandle));
  $effect(() => {
    if (!facet) return;
    const stops = [
      facet.getSelection()?.subscribe(({ count }) => selectedCount = count),
      facet.getBrush()?.subscribe(({ count }) => brushedCount = count),
    ].filter(Boolean);
    return () => stops.forEach((stop) => stop());
  });
  onDestroy(() => onready(undefined));
</script>

<div class="toolbar">
  <span>Each cell is a separate plot over one shared keyed identity. Interact in any cell; the detail view consumes the same states.</span>
  <button onclick={() => facet?.getSelection?.()?.clear()}>Clear selection</button>
  <button onclick={() => facet?.getBrush?.()?.clear()}>Clear brush</button>
  <strong aria-live="polite">{selectedCount} selected · {brushedCount} brushed</strong>
</div>

<Data value={observations} key="id">
  <Facet bind:this={facet} column="region" wrap={3} scales="shared" link="xy" gap={12}>
    <Plot height={260} axes2d x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
      <Points x="x" y="y" fill="group" size={5} select hover brush
        respond={["selected", "brushed", "hovered"]} selectionOpacity={0.12} />
    </Plot>
  </Facet>
  <section class="detail">
    <h3>Selected rows, with brushed rows outlined</h3>
    <Plot bind:this={detail} responsive height={320} axes2d
      x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
      <Filter where="@selected" inactive="none">
        <Points x="x" y="y" fill="group" size={6.5} />
        <Text x="x" y="y" text="id" dy={-16} size={10} color="#40505d" />
      </Filter>
      <Filter where="@brushed" inactive="none">
        <Points x="x" y="y" size={9.5} fill="transparent"
          outlineColor="#263545" outlineWidth={0.55} />
      </Filter>
    </Plot>
  </section>
</Data>

<style>
  .toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin:12px 0 16px; color:#536270; font-size:13px; }
  .toolbar span { flex:1 1 380px; }
  button { border:1px solid #c9d2dd; border-radius:7px; background:#fff; padding:7px 11px; color:#32485e; font:inherit; }
  .detail { margin-top:18px; min-width:0; }
  h3 { margin:0 0 7px; font-size:13px; color:#3c4d5c; }
</style>
