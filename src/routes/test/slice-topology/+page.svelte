<script>
  import { onMount, tick } from "svelte";
  import { Data, Plot, Points } from "$lib/index";
  import Transform from "$lib/plot/transform.svelte";
  let at = $state(0.25),
    slice = $state(),
    grid = $state();
  let directPlot = $state(),
    gridPlot = $state();
  const data = {
    x: [0, 0, 0, 1, 1, 1],
    time: [0, 1, 2, 0, 1, 2],
    value: [0, 10, 0, 10, 20, 10],
  };
  onMount(() => {
    window.sliceTopology = {
      get slice() {
        return slice?.output();
      },
      get grid() {
        return grid?.output();
      },
      get plots() {
        return [directPlot, gridPlot];
      },
      async update(value) {
        at = value;
        await tick();
      },
    };
    return () => delete window.sliceTopology;
  });
</script>

<Data value={data}>
  <Transform
    kind="Slice"
    field="time"
    by="x"
    values={["value"]}
    {at}
    bind:this={slice}
  >
    <Plot
      bind:this={directPlot}
      width={360}
      height={240}
      axes2d={false}
      animation={false}
      x={{ domain: [-0.2, 1.2] }}
      y={{ domain: [0, 22] }}
    >
      <Points x="x" y="value" size={6} fill="#2369d8" />
    </Plot>
    <Transform
      kind="Interpolate"
      x="x"
      values={["value"]}
      resolution={3}
      bind:this={grid}
    >
      <Plot
        bind:this={gridPlot}
        width={360}
        height={240}
        axes2d={false}
        animation={false}
        x={{ domain: [-0.2, 1.2] }}
        y={{ domain: [0, 22] }}
      >
        <Points x="x" y="value" size={6} fill="#2369d8" />
      </Plot>
    </Transform>
  </Transform>
</Data>
