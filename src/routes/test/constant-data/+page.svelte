<script>
  import { onMount } from "svelte";
  import { Data, Calculate, row, random as randomValues, Plot, Points, Frame, Simulate, add, divide, prev, view, continuous } from "$lib";
  let rows = $state(16), random = $state(true);
  let plot = $state(), mark = $state(), nested = $state(), simulationPlot = $state(), simulation = $state();
  onMount(() => {
    window.constantFixture = { get plot() { return plot; }, get mark() { return mark; },
      get nested() { return nested; }, get simulationPlot() { return simulationPlot; },
      get simulation() { return simulation; },
      setRows(value) { rows = value; }, setRandom(value) { random = value; } };
    return () => { delete window.constantFixture; };
  });
</script>

<Data {rows}>
  <Calculate columns={{ random: randomValues({ seed: 0 }) }}>
  <Plot bind:this={plot} width={400} height={200} x={{ domain: [-1, 32] }} y={{ domain: [-1, 2] }}>
    <Points bind:this={mark} x={row()} y={1} size={8} fill={random ? "random" : "#547ba2"} fillScale={continuous({ domain: [0, 1] })} />
    <Points x={row()} y={0} size={6} fill="#cc3344" />
  </Plot>
  </Calculate>
</Data>
<Plot bind:this={nested} width={300} height={200}>
  <Data rows={3}>
    <Frame x={{ domain: [-1, 3] }} y={{ domain: [0, 2] }}>
      <Points x={row()} y={1} size={8} />
    </Frame>
  </Data>
</Plot>
<Data rows={4}>
  <Simulate bind:this={simulation} initial={{ y: 0 }} update={{ y: add(prev("y"), divide(view.dt, 1000)) }} running={false}>
    <Plot bind:this={simulationPlot} width={300} height={200} x={{ domain: [-1, 4] }} y={{ domain: [-1, 2] }}>
      <Points x={row()} y="y" size={8} />
    </Plot>
  </Simulate>
</Data>
