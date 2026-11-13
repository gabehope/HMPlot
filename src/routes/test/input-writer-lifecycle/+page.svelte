<script>
  // TODO 145.2 review: an input writer's lifecycle. A hovering writer that goes restores the
  // committed value; writers of one input agree on its default whatever order they register in;
  // a TableView's changed writer props release the inputs they no longer write; a TableView's
  // hover read that a leave overtakes stays withdrawn.
  import { onMount } from "svelte";
  import { Data, Group, Plot, Points, Select, TableView, InputContext, count } from "$lib/index";
  const points = { x: [1, 2, 3, 4], y: [1, 2, 1, 2], series: ["p", "p", "q", "q"] };
  let context = $state(), data = $state(), plot = $state(), showHover = $state(true), tableInput = $state("a");
  onMount(() => {
    window.lifecycle = {
      get context() { return context; }, get data() { return data; }, get plot() { return plot; },
      hideHover() { showHover = false; }, renameTableInput(name) { tableInput = name; },
    };
    return () => { delete window.lifecycle; };
  });
</script>

<InputContext bind:this={context}>
  <Select name="focus" options={["committed", "p", "q"]} />
  <Plot bind:this={plot} data={points} width={360} height={200} animation={false} x={{ domain: [0, 5] }} y={{ domain: [0, 3] }}>
    {#if showHover}<Points x="x" y="y" size={16} hover={{ input: "focus", column: "series" }} />{/if}
  </Plot>
  <!-- Two writers of each input, one with a default: in both orders the default applies. -->
  <Plot data={points} width={200} height={120} animation={false}>
    <Points x="x" y="y" select={{ input: "first", column: "series" }} />
    <Points x="x" y="y" select={{ input: "first", column: "series", default: "root" }} />
    <Points x="x" y="y" select={{ input: "second", column: "series", default: "root" }} />
    <Points x="x" y="y" select={{ input: "second", column: "series" }} />
  </Plot>
  <Data bind:this={data} value={points}>
    <TableView name="writer" select={{ input: tableInput, column: "series" }} />
    <Group by="series" columns={{ rows: count() }}><TableView name="grouped" hover /></Group>
  </Data>
</InputContext>
