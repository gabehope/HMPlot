<script>
  import { Data, Interaction, Plot, Points, Filter, selection } from "$lib";
  import { onDestroy } from "svelte";

  let { onready = () => {} } = $props();
  const observations = Array.from({ length: 24 }, (_, index) => ({
    id: `item-${index}`,
    x: 0.1 + (index % 6) * 0.16,
    y: 0.14 + Math.floor(index / 6) * 0.22,
  }));
  const focus = selection();
  let source = $state(), count = $state(0);
  $effect(() => onready(source));
  $effect(() => focus.subscribe((status) => count = status.count));
  onDestroy(() => { focus.dispose(); onready(undefined); });
</script>

<div class="controls">
  <span>An explicit selection is shared across two views and exposed as @focus.</span>
  <button onclick={() => focus.clear()}>Clear focus</button>
  <span aria-live="polite">{count} focused</span>
</div>
<Data value={observations} key="id">
  <Interaction columns={{ "@focus": focus }}>
    <div class="views">
      <section><h3>Choose observations</h3>
        <Plot bind:this={source} responsive height={340} axes2d
          x={{ domain: [0, 1.05] }} y={{ domain: [0, 1.05] }}>
          <Points x="x" y="y" size={6} fill="#547ba2" select={focus} respond={focus} />
        </Plot>
      </section>
      <section><h3>Filtered by @focus</h3>
        <Plot responsive height={340} axes2d
          x={{ domain: [0, 1.05] }} y={{ domain: [0, 1.05] }}>
          <Filter where="@focus" inactive="all">
            <Points x="x" y="y" size={7.5} fill="#7b9865" />
          </Filter>
        </Plot>
      </section>
    </div>
  </Interaction>
</Data>

<style>
  .controls { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin:12px 0; color:#40505d; }
  button { border:1px solid #c9d2dd; border-radius:7px; background:#fff; padding:7px 11px; color:#32485e; }
  .views { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr)); gap:16px; }
  h3 { margin:0 0 8px; font-size:14px; color:#3c4d5c; }
</style>
