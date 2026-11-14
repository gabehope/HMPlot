const e=`<script>
  import { Data, Plot, Points, Filter } from "$lib";
  import { onDestroy, onMount } from "svelte";

  let { onready = () => {} } = $props();
  const observations = Array.from({ length: 48 }, (_, index) => ({
    id: \`sample-\${index}\`,
    x: 0.08 + (index % 8) * 0.12,
    y: 0.1 + Math.floor(index / 8) * 0.16 + (index % 3) * 0.025,
  }));
  let source = $state(), brushed = $state(), filtered = $state(), count = $state(0);
  $effect(() => onready(source));
  $effect(() => {
    const resource = source?.getBrush?.();
    if (resource) return resource.subscribe((status) => count = status.count);
  });
  onDestroy(() => onready(undefined));
  onMount(() => {
    if (!import.meta.env.DEV) return;
    const exposed = {
      get source() { return source; },
      get brushed() { return brushed; },
      get filtered() { return filtered; },
    };
    window.__brushFilterExample = exposed;
    return () => { if (window.__brushFilterExample === exposed) delete window.__brushFilterExample; };
  });
<\/script>

<div class="controls">
  <span>Shift-drag to brush, drag inside the rectangle to move it, or click outside to clear.</span>
  <button onclick={() => source?.clearBrush?.()}>Clear brush</button>
  <span aria-live="polite">{count} brushed</span>
</div>
<Data value={observations} key="id">
  <div class="views">
    <section><h3>Brush observations</h3>
      <Plot bind:this={source} responsive height={340} axes2d
        x={{ domain: [0, 1.05] }} y={{ domain: [0, 1.05] }}>
        <Points x="x" y="y" size={5.5} fill="#547ba2" brush respond="brushed" />
      </Plot>
    </section>
    <section><h3>Rows in @brushed</h3>
      <Plot bind:this={brushed} responsive height={340} axes2d
        x={{ domain: [0, 1.05] }} y={{ domain: [0, 1.05] }}>
        <Filter where="@brushed" inactive="all">
          <Points bind:this={filtered} x="x" y="y" size={6.5} fill="#cf8955" />
        </Filter>
      </Plot>
    </section>
  </div>
</Data>

<style>
  .controls { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin:12px 0; color:#40505d; }
  button { border:1px solid #c9d2dd; border-radius:7px; background:#fff; padding:7px 11px; color:#32485e; }
  .views { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr)); gap:16px; }
  h3 { margin:0 0 8px; font-size:14px; color:#3c4d5c; }
</style>
`;export{e as default};
