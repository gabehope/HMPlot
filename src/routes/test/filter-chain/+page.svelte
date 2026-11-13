<script>
  // Stage 17 benchmark fixture: brush-driven Filter chains. One deterministic table; plot A is a
  // brushable scatter, and plots B-E filter the table by @brushed before a Bin, a Group, a Sort
  // and a Calculate with a reduction. Plot G is the common fast path: Filter @brushed straight
  // into a point mark on explicit axes (drawn as opacity). Plot F's Filter value follows a slider over the integer
  // "bucket" column, so values between two integers keep the match count. Axes are automatic
  // (as a user would leave them), so every brush move also recomputes domains. ?rows=500000
  // selects the large variant (17.3h). No animation.
  import { onMount } from "svelte";
  import { Data, Plot, Points, Filter, Group, Sort, Calculate, Rect, Line, add, subtract, mean } from "$lib/index";
import { Bin } from "$lib/stats/index.js";
  const query = new URLSearchParams(globalThis.location?.search ?? "");
  const rows = Number(query.get("rows")) || 50000;
  // ?plots=abc mounts only those plots (a is the brush source), to measure one chain at a time.
  const shown = (id) => !query.get("plots") || query.get("plots").includes(id);
  const noise = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  const table = {
    x: Float32Array.from({ length: rows }, (_, i) => noise(i, 1)),
    y: Float32Array.from({ length: rows }, (_, i) => noise(i, 2)),
    // A value that depends on x, so brushing a range of x moves every downstream extent.
    v: Float32Array.from({ length: rows }, (_, i) => 100 * noise(i, 1) + 20 * noise(i, 3)),
    bucket: Float32Array.from({ length: rows }, (_, i) => Math.floor(16 * noise(i, 4))),
  };
  let threshold = $state(7.5);
  const plots = $state({}), marks = $state({}), transforms = $state({});
  onMount(() => {
    window.filterChain = {
      rows, plots, marks, transforms,
      get threshold() { return threshold; },
      setThreshold(value) { threshold = value; },
      /** Every plot settled (transforms, marks and their GPU work). */
      async settle() { await Promise.all(Object.values(plots).map((plot) => plot?.whenSettled?.())); },
      shown,
    };
    return () => { delete window.filterChain; };
  });
  const size = { width: 420, height: 260, axes2d: true, toneMapping: 0 };
</script>

<label>Plot F: bucket &gt; <input type="range" min="0" max="16" step="0.1" bind:value={threshold} /> {threshold}</label>
<Data value={table}>
  <div class="grid">
    <Plot bind:this={plots.a} {...size} x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
      <Points bind:this={marks.a} x="x" y="y" size={1} fill="#547ba2" brush maxElements={rows} maxInstances={rows} />
    </Plot>
    {#if shown("b")}
    <Plot bind:this={plots.b} {...size}>
      <Filter bind:this={transforms.b} where="@brushed">
        <Bin x="v" bins={32}><Rect bind:this={marks.b} x0="x0" x1="x1" y0={0} y1="count" fill="#cf8955" /></Bin>
      </Filter>
    </Plot>
    {/if}
    {#if shown("c")}
    <Plot bind:this={plots.c} {...size}>
      <Filter bind:this={transforms.c} where="@brushed">
        <Group by="bucket" columns={{ m: mean("v") }}>
          <Rect bind:this={marks.c} x0="bucket" x1={add("bucket", 0.8)} y0={0} y1="count" fill="#7b9865" />
        </Group>
      </Filter>
    </Plot>
    {/if}
    {#if shown("d")}
    <Plot bind:this={plots.d} {...size}>
      <Filter bind:this={transforms.d} where="@brushed">
        <Sort by="x"><Line bind:this={marks.d} x="x" y="v" color="#a278a4" maxElements={rows} /></Sort>
      </Filter>
    </Plot>
    {/if}
    {#if shown("e")}
    <Plot bind:this={plots.e} {...size}>
      <Filter bind:this={transforms.e} where="@brushed">
        <Calculate columns={{ dv: subtract("v", mean("v")) }}>
          <Points bind:this={marks.e} x="x" y="dv" size={1} fill="#c4a451" maxElements={rows} maxInstances={rows} />
        </Calculate>
      </Filter>
    </Plot>
    {/if}
    {#if shown("g")}
    <Plot bind:this={plots.g} {...size} x={{ domain: [0, 1] }} y={{ domain: [0, 120] }}>
      <Filter bind:this={transforms.g} where="@brushed">
        <Points bind:this={marks.g} x="x" y="v" size={1} fill="#bc7180" maxElements={rows} maxInstances={rows} />
      </Filter>
    </Plot>
    {/if}
    {#if shown("f")}
    <Plot bind:this={plots.f} {...size}>
      <Filter bind:this={transforms.f} where={{ field: "bucket", op: "gt", value: threshold }}>
        <Bin x="x" bins={32}><Rect bind:this={marks.f} x0="x0" x1="x1" y0={0} y1="count" fill="#579b9a" /></Bin>
      </Filter>
    </Plot>
    {/if}
  </div>
</Data>

<style>
  .grid { display: grid; grid-template-columns: repeat(3, 420px); gap: 8px; }
  label { font: 13px system-ui; display: block; margin: 6px 0; }
</style>
