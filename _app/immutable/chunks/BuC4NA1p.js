const e=`<script>
  import { Data, Plot, Points, Text, Filter } from "$lib";
  import { onDestroy } from "svelte";

  let { onready = () => {} } = $props();
  const groups = ["North", "Central", "South"];
  const observations = Array.from({ length: 144 }, (_, index) => {
    const groupIndex = index % groups.length;
    const phase = index * 0.73 + groupIndex * 0.9;
    return {
      id: \`P\${String(index + 1).padStart(3, "0")}\`,
      group: groups[groupIndex],
      x: 50 + 38 * Math.sin(phase) * (0.7 + (index % 11) / 36),
      y: 50 + 36 * Math.cos(index * 0.41 + groupIndex) * (0.72 + (index % 7) / 30),
      score: (Math.sin(index * 0.29) + 1) / 2,
      response: (Math.cos(index * 0.17 + groupIndex) + 1) / 2,
    };
  });
  let source = $state(), selectedCount = $state(0), brushedCount = $state(0), hoveredCount = $state(0);
  $effect(() => onready(source));
  $effect(() => {
    if (!source) return;
    const stops = [
      source.getSelection()?.subscribe(({ count }) => selectedCount = count),
      source.getBrush()?.subscribe(({ count }) => brushedCount = count),
      source.getHover()?.subscribe(({ previewActive }) => hoveredCount = previewActive ? 1 : 0),
    ].filter(Boolean);
    return () => stops.forEach((stop) => stop());
  });
  onDestroy(() => onready(undefined));
<\/script>

<div class="toolbar">
  <span>Hover points, click to replace the selection, Shift-click to toggle, and Shift-drag to brush.</span>
  <button onclick={() => source?.getSelection?.()?.clear()}>Clear selection</button>
  <button onclick={() => source?.clearBrush?.()}>Clear brush</button>
  <strong aria-live="polite">{selectedCount} selected · {brushedCount} brushed · {hoveredCount} hovered</strong>
</div>

<Data value={observations} key="id">
  <div class="dashboard">
    <section class="primary">
      <h3>Shared interaction surface</h3>
      <Plot bind:this={source} responsive height={460} axes2d
        x={{ domain: [5, 95], label: "Feature A" }} y={{ domain: [5, 95], label: "Feature B" }}>
        <Points x="x" y="y" fill="group" size={5.5} outlineColor="#ffffff"
          outlineWidth={0.35} select hover brush
          respond={["selected", "brushed", "hovered"]} selectionOpacity={0.1} />
      </Plot>
    </section>
    <div class="details">
      <section>
        <h3>Brushed rows in another projection</h3>
        <Plot responsive height={220} axes2d
          x={{ domain: [0, 1], label: "Score" }} y={{ domain: [0, 1], label: "Response" }}>
          <Filter where="@brushed" inactive="none">
            <Points x="score" y="response" fill="group" size={5}
              respond="hovered" selectionOpacity={0.2} />
          </Filter>
        </Plot>
      </section>
      <section>
        <h3>Selected rows and live hover</h3>
        <Plot responsive height={220} axes2d
          x={{ domain: [5, 95], label: "Feature A" }} y={{ domain: [5, 95], label: "Feature B" }}>
          <Filter where="@selected" inactive="none">
            <Points x="x" y="y" fill="group" size={6} />
          </Filter>
          <Filter where="@hovered" inactive="none">
            <Points x="x" y="y" size={11} fill="transparent"
              outlineColor="#263545" outlineWidth={0.9} />
            <Text x="x" y="y" text="id" dy={-20} size={12} color="#263545" />
          </Filter>
        </Plot>
      </section>
    </div>
  </div>
</Data>

<style>
  .toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin:12px 0 16px; color:#536270; font-size:13px; }
  .toolbar span { flex:1 1 360px; }
  button { border:1px solid #c9d2dd; border-radius:7px; background:#fff; padding:7px 11px; color:#32485e; font:inherit; }
  .dashboard { display:grid; grid-template-columns:minmax(0,1.55fr) minmax(280px,.8fr); gap:16px; align-items:start; }
  .details { display:grid; gap:14px; }
  section { min-width:0; }
  h3 { margin:0 0 7px; font-size:13px; color:#3c4d5c; }
  @media (max-width: 820px) { .dashboard { grid-template-columns:1fr; } .details { grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); } }
</style>
`;export{e as default};
