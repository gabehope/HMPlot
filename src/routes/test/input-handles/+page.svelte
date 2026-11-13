<script>
  // TODO 145.7: an input's writes made from the input itself. root = input("root", { default })
  // reads it; root.set("id") on a mark writes the clicked row's id, root.set(literal(v)) a
  // constant, root.reset() the default; a Button's set writes on a press. No widget declares
  // root: its writers do, with the handle's default.
  import { onMount } from "svelte";
  import { Plot, GraphData, Treemap, Nodes, Rect, Points, InputContext, Button, input, literal } from "$lib/index";
  const data = { source: ["root", "root", "a", "a", "a", "b", "b"], target: ["a", "b", "a1", "a2", "a3", "b1", "b2"] };
  const nodes = { id: ["root", "a", "b", "a1", "a2", "a3", "b1", "b2"], weight: [0, 0, 0, 1, 2, 3, 4, 4] };
  const root = input("root", { default: "root" });
  let drill = $state(), level = $state(), points = $state(), context = $state(), counter = $state();
  onMount(() => {
    window.inputHandles = {
      get drill() { return drill; }, get level() { return level; }, get points() { return points; },
      get context() { return context; }, get counter() { return counter; },
    };
    return () => { delete window.inputHandles; };
  });
</script>

<InputContext bind:this={context}>
  <Button label="Top" set={root.reset()} />
  <Button label="Go to b" set={root.set(literal("b"))} />
  <Button bind:this={counter} name="presses" label="Count and top" set={[root.reset()]} />
  <Plot bind:this={drill} width={360} height={240} animation={false} x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
    <GraphData {nodes} edges={data} source="source" target="target">
      <Treemap root={root} value="weight" levels={1} padding={0.02}>
        <Nodes bind:this={level}><Rect x0="x0" x1="x1" y0="y0" y1="y1" fill="#4a6f8f" select={root.set("id")} /></Nodes>
      </Treemap>
    </GraphData>
  </Plot>
  <!-- A click on the point writes a constant: the same input, from another mark. -->
  <Plot bind:this={points} data={{ x: [0.5], y: [0.5] }} width={240} height={160} animation={false} x={{ domain: [0, 1] }} y={{ domain: [0, 1] }}>
    <Points x="x" y="y" size={30} select={root.set(literal("a"))} />
  </Plot>
</InputContext>
