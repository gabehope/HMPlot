<script>
  // TODO 143.6: Text of numbers with no category workaround. A brush-filtered Group's count (a
  // GPU column) as one label, a Calculate's value per row, a d3 format, and a datetime column.
  import { onMount } from "svelte";
  import { Data, Plot, Points, Text, Filter, Group, Calculate, count, col, divide } from "$lib/index";
  let n = $state(1200);
  const table = $derived({
    x: Array.from({ length: n }, (_, i) => (i * 37) % 100),
    y: Array.from({ length: n }, (_, i) => (i * 61) % 100),
  });
  const shares = { label: ["a", "b", "c"], share: [0.125, 0.5, 0.375], at: [0, 1, 2] };
  const dates = { at: [0, 1], when: [new Date(Date.UTC(2024, 0, 15)), new Date(Date.UTC(2024, 6, 4))] };
  let source = $state(), readout = $state(), values = $state(), times = $state(), group = $state();
  onMount(() => {
    window.numericText = {
      get source() { return source; }, get readout() { return readout; }, get values() { return values; },
      get times() { return times; }, get group() { return group; },
      setRows(value) { n = value; },
    };
    return () => { delete window.numericText; };
  });
</script>

<Data value={table}>
  <Plot bind:this={source} width={320} height={200} animation={false}>
    <Points x="x" y="y" size={4} brush={true} />
  </Plot>
  <Plot bind:this={readout} width={320} height={80} animation={false} axes2d={false} x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
    <Filter where="@brushed" inactive="all">
      <Group bind:this={group} columns={{ rows: count() }}>
        <Text x={0.5} y={0.5} text="rows" size={24} />
      </Group>
    </Filter>
  </Plot>
</Data>
<Plot bind:this={values} data={shares} width={320} height={100} animation={false} y={{ domain: [-1, 1] }}>
  <Calculate columns={{ third: divide(col.share, 3) }}>
    <Text x="at" y={0.4} text="third" size={14} />
  </Calculate>
  <Text x="at" y={-0.4} text="share" format=".1%" size={14} />
</Plot>
<Plot bind:this={times} data={dates} width={320} height={80} animation={false} y={{ domain: [-1, 1] }} x={{ domain: [-1, 2] }}>
  <Text x="at" y={0} text="when" format="%b %d, %Y" size={14} />
</Plot>
