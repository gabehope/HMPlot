<script>
  // TODO 136.16 slice 4: a Title reading live values (a readout): the brushed count and a mean in
  // its own format, following the brush; "—" when no row is brushed.
  import { onMount } from "svelte";
  import { Data, Plot, Points, Title, count, mean } from "$lib/index";
  const n = 400;
  const table = {
    x: Array.from({ length: n }, (_, i) => (i * 37) % 100),
    fare: Array.from({ length: n }, (_, i) => 5 + ((i * 61) % 100) / 4),
  };
  let plot = $state(), title = $state();
  onMount(() => {
    window.titleReadout = { get plot() { return plot; }, get title() { return title; } };
    return () => { delete window.titleReadout; };
  });
</script>

<Data value={table}>
  <Title bind:this={title} text={["Selected trips: ", count({ where: "@brushed" }), " · mean fare ", { value: mean("fare", { where: "@brushed" }), format: "$.2f" }]} />
  <Plot bind:this={plot} width={360} height={220} animation={false}>
    <Points x="x" y="fare" size={4} brush={true} />
  </Plot>
</Data>
