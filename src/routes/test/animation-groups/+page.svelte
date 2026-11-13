<script>
  import { onMount, tick } from "svelte";
  import { Data, Plot, Frame, Filter, Calculate, Points, GraphData, Tree, Nodes, animate, tween, equal } from "$lib/index";
  const rows = { country: ["A", "B", "B", "A"], slot: ["L", "R", "L", "R"], year: [0, 0, 1, 1], x: [0, 10, 30, 20] };
  const timing = { duration: 1000, easing: "linear" };
  let rootGroup = $state("country");
  let year = $state(0), branchGroup = $state("slot"), plot = $state();
  let marks = $state({});
  let treePlot = $state(), treePoints = $state(), treeIndex = $state(0), treeGroup = $state("group");
  const trees = [
    { root: "r0", nodes: { id: ["r0", "a0", "b0"], group: ["root", "a", "b"], band: [1, 2, 4] }, edges: { source: ["r0", "r0"], target: ["a0", "b0"] } },
    { root: "r1", nodes: { id: ["r1", "b1", "a1"], group: ["root", "b", "a"], band: [1, 8, 6] }, edges: { source: ["r1", "r1"], target: ["b1", "a1"] } },
  ];
  async function read(handle, component = 0) {
    const mark = handle.getMark(), field = mark.fields.get("position"), device = mark.renderer.backend.device;
    const bytes = Math.max(16, field.count * 16);
    const staging = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(mark.renderer.backend.get(field.bufferNodeSource).buffer, 0, staging, 0, bytes);
    device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const values = Array.from(new Float32Array(staging.getMappedRange()));
    staging.destroy();
    return Array.from({length: field.count}, (_, i) => values[i * 4 + component]);
  }
  onMount(() => {
    window.animationGroups = {
      get plot() { return plot; },
      get treePlot() { return treePlot; },
      async tree(value) { treeIndex = value; await tick(); await treePlot.whenSettled(); },
      async treeGroup(value) { treeGroup = value; await tick(); await treePlot.whenSettled(); },
      async readTree() { return read(treePoints, 1); },
      async year(value) { year = value; await tick(); await plot.whenSettled(); },
      async rootGroup(value) { rootGroup = value; await tick(); await plot.whenSettled(); },
      async group(value) { branchGroup = value; await tick(); await plot.whenSettled(); },
      async read() { return Object.fromEntries(await Promise.all(Object.entries(marks).map(async ([name, mark]) => [name, await read(mark)]))); },
    };
    return () => delete window.animationGroups;
  });
</script>
<Data value={rows} key={["country", "year"]} animationGroup={rootGroup}>
  <Plot bind:this={plot} width={640} height={400} x={{domain:[-5,35]}} y={{domain:[0,5]}}>
    <Frame>
      <Filter where={year === null ? equal("year", "year") : equal("year", year)}>
        <Points bind:this={marks.animated} x={animate("x", timing)} y={1} fill="red" size={8} />
        <Calculate columns={{motion:tween("x",timing)}}>
          <Points bind:this={marks.calculated} x="motion" y={2} fill="blue" size={8} />
        </Calculate>
      </Filter>
    </Frame>
    <Frame animationGroup={branchGroup}>
      <Data value={rows} key={["country", "year"]}>
        <Filter where={year === null ? equal("year", "year") : equal("year", year)}>
          <Points bind:this={marks.overridden} x={tween("x",timing)} y={3} fill="green" size={8} />
        </Filter>
      </Data>
    </Frame>
    <Frame animationGroup={null}>
      <Filter where={year === null ? equal("year", "year") : equal("year", year)}>
        <Points bind:this={marks.fallback} x={tween("x",timing)} y={4} fill="purple" size={8} />
      </Filter>
    </Frame>
  </Plot>
</Data>

<Plot bind:this={treePlot} animationGroup={treeGroup} width={640} height={300} axes2d={false} x={{domain:[-1,1]}} y={{domain:[0,10]}}>
  <GraphData nodes={trees[treeIndex].nodes} edges={trees[treeIndex].edges} nodeKey="id" source="source" target="target">
    <Tree root={trees[treeIndex].root} directed mode="partition" orientation="up" layerHeight={tween("band",timing)}>
      <Nodes><Points bind:this={treePoints} x={0} y="y1" fill="orange" size={8} /></Nodes>
    </Tree>
  </GraphData>
</Plot>
