<script>
  // GraphData's inferred nodes (TODO 137.3 folded FromEdges in): edges alone, the surrounding
  // data as edges, and nodes without edges (an error).
  import { onMount, tick } from 'svelte';
  import { GraphData, Data, Filter, Nodes, Calculate, Plot, Points, col, literal, not_equal } from '$lib/index';
  const edges = { source: ['a', 'a', 'b'], target: ['b', 'c', 'c'] };
  let tables = $state(), scoped = $state(), misuse = $state(false), enriched = $state(), badReduce = $state(true);
  const circles = async (plot, fill) => {
    await plot.whenSettled();
    const { blob } = await plot.exportSVG({ mode: 'vector' });
    const svg = new DOMParser().parseFromString(await blob.text(), 'image/svg+xml');
    return [...svg.querySelectorAll(`circle[fill="${fill}"]`)].map(element => Number(element.getAttribute('cx')));
  };
  onMount(() => {
    window.graphInferredFixture = {
      get ready() { return !!(tables && scoped); },
      async snapshot() {
        return { tables: await circles(tables, '#8e3db3'), scoped: await circles(scoped, '#2f6f9f'),
          errors: [tables.getRenderError(), scoped.getRenderError()] };
      },
      async misuse() { misuse = true; await tick(); },
      // The enriched graph's error, then again once its reduce is dropped (its Transform unmounts).
      async enrichedErrors() {
        const read = () => { let last; enriched.subscribe(status => { last = status; })(); return last.error; };
        await enriched.whenSettled().catch(() => {});
        const before = read();
        badReduce = false; await tick(); await enriched.whenSettled();
        return [before, read()];
      },
    };
    return () => delete window.graphInferredFixture;
  });
</script>

<GraphData {edges} reduce={{ out: { op: 'count' } }}>
  <Nodes>
    <Calculate columns={{ y: literal(0) }}>
      <Plot bind:this={tables} width={360} height={200} axes2d={false} autoBounds={false} x={{ domain: [-1, 3] }} y={{ domain: [-1, 1] }}>
        <Points x="out" y="y" size={12} fill="#8e3db3" opacity={1} outlineWidth={0} />
      </Plot>
    </Calculate>
  </Nodes>
</GraphData>
<Data value={edges}>
  <Filter where={not_equal(col.source, literal('a'))}>
    <GraphData>
      <Nodes>
        <Calculate columns={{ x: literal(0), y: literal(0) }}>
          <Plot bind:this={scoped} width={360} height={200} axes2d={false} autoBounds={false} x={{ domain: [-1, 1] }} y={{ domain: [-1, 1] }}>
            <Points x="x" y="y" size={12} fill="#2f6f9f" opacity={1} outlineWidth={0} />
          </Plot>
        </Calculate>
      </Nodes>
    </GraphData>
  </Filter>
</Data>
<GraphData bind:this={enriched} {edges} nodes={{ id: ['a', 'b', 'c'] }}
  reduce={badReduce ? { bad: { field: 'source', op: 'mean' } } : {}} />
{#if misuse}<GraphData nodes={{ id: ['a'] }} />{/if}
