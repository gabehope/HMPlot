<script>
  // TODO 145.4: a Table of a brushed, sorted Filter's rows; its row clicks and hovers write
  // selections and inputs.
  import { onMount } from "svelte";
  import { Data, Filter, Group, Plot, Points, Sort, TableView, InputContext, count } from "$lib/index";
  const cars = { model: ["Civic", "Corolla", "Golf", "Model 3", "Prius", "Mustang", "Ram", "Leaf"],
    mpg: [36, 34, 31, 132, 52, 18, 15, 111], weight: [1250, 1300, 1350, 1610, 1380, 1700, 2600, 1580],
    origin: ["Japan", "Japan", "Europe", "USA", "Japan", "USA", "USA", "Japan"] };
  let context = $state(), plot = $state();
  onMount(() => {
    window.tablePage = { get context() { return context; }, get plot() { return plot; } };
    return () => { delete window.tablePage; };
  });
</script>

<InputContext bind:this={context}>
  <Data value={cars} key="model">
    <Plot bind:this={plot} width={420} height={260} axes2d animation={false} x={{ domain: [1000, 2800] }} y={{ domain: [0, 140] }}>
      <Points x="weight" y="mpg" brush size={8} respond="selected" />
    </Plot>
    <Filter where="@brushed" inactive="all">
      <Sort by="mpg" order="desc">
        <TableView name="top" columns={["model", { field: "mpg", label: "MPG", format: ".0f" }]} limit={3} title="Most efficient" select={{ input: "model", column: "model" }} />
      </Sort>
    </Filter>
    <Group by="origin" columns={{ cars: count() }}>
      <TableView name="origins" select hover={{ input: "origin", column: "origin" }} />
    </Group>
  </Data>
</InputContext>
