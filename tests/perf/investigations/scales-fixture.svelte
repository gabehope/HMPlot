<script>
  import { onMount } from 'svelte';
  import { Plot, Points, Filter, Legend, continuous, normalization } from '$lib/index';
  const query = new URLSearchParams(globalThis.location?.search ?? '');
  const rows = Number(query.get('rows') ?? 50000), copies = Number(query.get('marks') ?? 4);
  const automatic = query.get('bounds') === 'auto', filtered = query.get('filter') === '1';
  const hover = query.get('hover') === '1', nearest = query.get('nearest') === '1', tooltip = query.get('tooltip') === '1';
  const table = {
    x: Float32Array.from({ length: rows }, (_, i) => ((i * 7919) % rows) / rows),
    y: Float32Array.from({ length: rows }, (_, i) => ((i * 3571) % rows) / rows),
    v: Float32Array.from({ length: rows }, (_, i) => i % 997),
  };
  let threshold = $state(996), pointSize = $state(3), width = $state(760), plot = $state(), marks = $state([]);
  const norm = normalization();
  const colorScale = continuous({ normalization: norm, colormap: 'Viridis' });
  const sizeScale = continuous({ normalization: norm, range: [2, 5] });
  onMount(() => {
    window.investigation = {
      plot: () => plot,
      marks: () => marks,
      settle: () => plot?.whenSettled(),
      setThreshold: value => { threshold = value; },
      setSize: value => { pointSize = value; },
      setWidth: value => { width = value; },
      setColormap: value => colorScale.update({ colormap: value }),
      setRange: value => sizeScale.update({ range: value }),
      read: () => marks.map(handle => {
        const mark = handle?.getMark?.();
        return { count: mark?.view.marks.of(mark)?.rows.count ?? mark?.count, color: mark?.options.get('valueBounds'), size: mark?.options.get('scaleBounds') };
      }),
    };
    return () => { delete window.investigation; colorScale.dispose(); sizeScale.dispose(); };
  });
</script>
<Plot bind:this={plot} data={table} {width} height={440} axes2d
  x={automatic ? undefined : {domain: [0, 1]}} y={automatic ? undefined : {domain: [0, 1]}}
  settings={{showTrigger: false}}>
  {#if filtered}
    <Filter where={{field: 'v', op: 'lte', value: threshold}}>
      {#each Array(copies).fill(0) as _, i}
        <Points bind:this={marks[i]} x="x" y="y" fill="v" fillScale={colorScale}
          size="v" {sizeScale} opacity={0.6} {hover} {nearest} tooltip={tooltip ? ['v'] : false}
          respond={hover ? 'hovered' : nearest ? 'nearest' : false}
          maxElements={rows} maxInstances={rows} />
      {/each}
    </Filter>
  {:else}
    {#each Array(copies).fill(0) as _, i}
      <Points bind:this={marks[i]} x="x" y="y" fill="v" fillScale={colorScale}
        size={pointSize} opacity={0.6} {hover} {nearest} tooltip={tooltip ? ['v'] : false}
        respond={hover ? 'hovered' : nearest ? 'nearest' : false}
        maxElements={rows} maxInstances={rows} />
    {/each}
  {/if}
  <Legend target={marks[0]} channel="fill" />
</Plot>
