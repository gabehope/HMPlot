<script>
  import { onMount, tick } from 'svelte';
  import { GraphData, Nodes, Edges, Calculate, Filter, Sort, Plot, Points, Segments, add, col, literal, not_equal } from '$lib/index';
  import { graphStructure } from '$lib/plot/utils/graphData.js';
  import Scope from './Scope.svelte';
  const nodes = $state({ person: ['root', 'branch', 'leaf', 'other'], rank: [3, 0, 1, 2], x: [0, 1, 2, 1], y: [1, 2, 3, 0] });
  const edges = { from: ['root', 'branch', 'root'], to: ['branch', 'leaf', 'other'], weight: [1, 2, 3] };
  const scopes = {}, plans = new WeakMap();
  let nextPlan = 0, graph = $state(), plot = $state(), points = $state(), shift = $state(0), branch = $state(false), mounted = $state(true);
  onMount(() => {
    window.graphDataFixture = {
      scopes,
      get graph() { return graph; },
      get plot() { return plot; },
      get points() { return points; },
      async set(values) {
        if (values.shift !== undefined) shift = values.shift;
        if (values.branch !== undefined) branch = values.branch;
        if (values.mounted !== undefined) mounted = values.mounted;
        if (values.lift !== undefined) nodes.y = [1, 2, 3, 0].map(y => y + values.lift);
        await tick();
      },
      async structure() {
        const plan = await graphStructure(scopes.prepared);
        if (!plans.has(plan)) plans.set(plan, ++nextPlan);
        return { plan: plans.get(plan), ids: plan.ids, rows: [...plan.rows], relation: scopes.defaults.graphRelation };
      },
      async snapshot() {
        await plot.whenSettled();
        const { blob } = await plot.exportSVG({ mode: 'vector' });
        const svg = new DOMParser().parseFromString(await blob.text(), 'image/svg+xml');
        const circles = [...svg.querySelectorAll('circle[fill="#8e3db3"]')].map(element =>
          [Number(element.getAttribute('cx')), Number(element.getAttribute('cy'))]);
        const links = [...svg.querySelectorAll('path[stroke="#d1453b"]')].map(element =>
          element.getAttribute('d').match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi).map(Number));
        const bitmap = await createImageBitmap(await plot.exportPNG());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0); bitmap.close();
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const size = svg.documentElement.viewBox.baseVal, ratioX = canvas.width / size.width, ratioY = canvas.height / size.height;
        const pixel = ([x, y]) => {
          const index = (Math.round(y * ratioY) * canvas.width + Math.round(x * ratioX)) * 4;
          return [...image.data.slice(index, index + 4)];
        };
        return { circles, links, pointPixels: circles.map(pixel),
          linkPixels: links.map(([x0, y0, x1, y1]) => pixel([(x0 + x1) / 2, (y0 + y1) / 2])),
          error: plot.getRenderError(), frames: plot.getDiagnostics().completedFrame };
      },
    };
    return () => delete window.graphDataFixture;
  });
</script>

{#if mounted}
  <GraphData bind:this={graph} {nodes} {edges} nodeKey="person" source="from" target="to"
    nodeFrom="target" reduce={{ load: { field: 'weight', op: 'sum' } }}>
    <Scope name="defaults" {scopes} />
    <Nodes>
      <Filter where={not_equal(col.person, literal(branch ? 'other' : 'absent'))}>
        <Sort by="rank" order="desc">
          <Calculate columns={{ x: add(col.x, shift) }}>
            <Scope name="prepared" {scopes} />
            <Plot bind:this={plot} width={480} height={360} axes2d={false} autoBounds={false}
              x={{ domain: [-1, 7] }} y={{ domain: [-1, 4] }}>
              <Edges><Segments start="start" end="end" color="#d1453b" width={3} opacity={1} /></Edges>
              <Nodes><Points bind:this={points} position="position" size={16} fill="#8e3db3" opacity={1} outlineWidth={0} /></Nodes>
            </Plot>
          </Calculate>
        </Sort>
      </Filter>
    </Nodes>
  </GraphData>
{/if}
