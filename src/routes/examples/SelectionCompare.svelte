<script>
  import { Data, Interaction, Plot, Points, Text, Filter, selection } from "$lib";
  import { onDestroy } from "svelte";

  let { onready = () => {} } = $props();
  const primary = selection(), comparison = selection();
  const observations = Array.from({ length: 81 }, (_, index) => {
    const row = Math.floor(index / 9), column = index % 9;
    return {
      id: `cell-${row + 1}-${column + 1}`,
      group: ["A", "B", "C"][(row + column) % 3],
      x: 0.08 + column * 0.105 + 0.018 * Math.sin(row * 1.7),
      y: 0.08 + row * 0.105 + 0.018 * Math.cos(column * 1.3),
      u: 0.08 + column * 0.105 + 0.055 * Math.sin(row * 0.8 + column * 0.25),
      v: 0.08 + row * 0.105 + 0.05 * Math.cos(column * 0.7 - row * 0.2),
    };
  });
  let left = $state(), primaryCount = $state(0), comparisonCount = $state(0);
  $effect(() => onready(left));
  $effect(() => {
    const stops = [
      primary.subscribe(({ count }) => primaryCount = count),
      comparison.subscribe(({ count }) => comparisonCount = count),
    ];
    return () => stops.forEach((stop) => stop());
  });
  onDestroy(() => { primary.dispose(); comparison.dispose(); onready(undefined); });
</script>

<div class="toolbar">
  <span>Build two independent sets. Shift-click toggles membership; hover is shared by data identity.</span>
  <button onclick={() => primary.clear()}>Clear blue</button>
  <button onclick={() => comparison.clear()}>Clear orange</button>
  <strong aria-live="polite">{primaryCount} blue · {comparisonCount} orange</strong>
</div>

<Data value={observations} key="id">
  <Interaction columns={{ "@primary": primary, "@comparison": comparison }}>
    <div class="compare-grid">
      <section>
        <h3>Primary set</h3>
        <Plot bind:this={left} responsive height={330} axes2d
          x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
          <Points x="x" y="y" fill="group" size={5.5} select={primary} hover
            respond={[primary, comparison, "hovered"]} selectionOpacity={0.12} />
        </Plot>
      </section>
      <section>
        <h3>Comparison set</h3>
        <Plot responsive height={330} axes2d x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
          <Points x="u" y="v" fill="group" size={5.5} select={comparison} hover
            respond={[primary, comparison, "hovered"]} selectionOpacity={0.12} />
        </Plot>
      </section>
      <section class="combined">
        <h3>Both sets, with their intersection labeled</h3>
        <Plot responsive height={330} axes2d x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
          <Filter where="@primary" inactive="none">
            <Points x="x" y="y" size={7.5} fill="#547ba2" />
          </Filter>
          <Filter where="@comparison" inactive="none">
            <Points x="x" y="y" size={4.5} fill="#e09a55" outlineColor="#ffffff" outlineWidth={0.2} />
          </Filter>
          <Filter where={["@primary", "@comparison"]} inactive="none">
            <Text x="x" y="y" text="id" dy={-17} size={10} color="#263545" />
          </Filter>
        </Plot>
      </section>
    </div>
  </Interaction>
</Data>

<style>
  .toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin:12px 0 16px; color:#536270; font-size:13px; }
  .toolbar span { flex:1 1 360px; }
  button { border:1px solid #c9d2dd; border-radius:7px; background:#fff; padding:7px 11px; color:#32485e; font:inherit; }
  .compare-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
  .combined { grid-column:1 / -1; }
  section { min-width:0; }
  h3 { margin:0 0 7px; font-size:13px; color:#3c4d5c; }
  @media (max-width: 760px) { .compare-grid { grid-template-columns:1fr; } .combined { grid-column:auto; } }
</style>
