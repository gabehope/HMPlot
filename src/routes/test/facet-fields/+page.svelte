<script>
  // Facet fields and pairs (TODO 21 Part F), one scene per ?case=:
  //   parallel   embedded parallel coordinates: fields cells, strip brushing, a keyless connector
  //   series     small multiples of different variables: Line x="time" y="value"
  //   rows       fields={{row: [...]}} x column="g", a Partition and a color legend inside
  //   external   an external fields x row="g" grid, virtualized
  //   pairs      an embedded lower-triangle scatterplot matrix
  //   pairs-xy   an external rectangular matrix
  //   error-embedded / error-external   fields on the dimension a split already takes
  //   update     embedded fields that change (window.facetFields.setFields)
  import { onMount } from "svelte";
  import { Plot, Data, Facet, Frame, Partition, Filter, Anchor, Points, Line, Legend, connect } from "$lib/index";
  const scene = typeof location === "undefined" ? "parallel" : new URLSearchParams(location.search).get("case") ?? "parallel";
  let plot = $state(), facet = $state(), points = $state(), brushed = $state(), lines = $state();
  let list = $state(["a", "b", "c"]);
  onMount(() => {
    window.facetFields = {
      scene, data, fields: ["a", "b", "c"],
      get plot() { return plot; }, get facet() { return facet; }, get points() { return points; },
      get brushed() { return brushed; }, get lines() { return lines; },
      setFields(value) { list = value; },
    };
    return () => { delete window.facetFields; };
  });
  const n = 24;
  // Three fields on different scales, so each field has its own domain.
  const data = {
    id: Array.from({ length: n }, (_, i) => i),
    g: Array.from({ length: n }, (_, i) => ["p", "q", "r"][i % 3]),
    species: Array.from({ length: n }, (_, i) => ["Adelie", "Gentoo", "Chinstrap"][Math.floor(i / 3) % 3]),
    a: Array.from({ length: n }, (_, i) => (i * 37) % 100),
    b: Array.from({ length: n }, (_, i) => ((i * 53) % 100) * 10),
    c: Array.from({ length: n }, (_, i) => ((i * 71) % 100) / 10),
    time: Array.from({ length: n }, (_, i) => i * 2),
    temp: Array.from({ length: n }, (_, i) => 10 + 8 * Math.sin(i / 4)),
    rain: Array.from({ length: n }, (_, i) => 200 + 150 * Math.cos(i / 3)),
  };
</script>

{#if scene === "parallel"}
  <Plot bind:this={plot} {data} width={640} height={360} axes2d>
    <Facet bind:this={facet} fields={["a", "b", "c"]}>
      <Frame x={{ domain: [0, 1], visible: false }}>
        <Anchor x={0.5} y="value" name="values" />
        <Points bind:this={points} x={0.5} y="value" size={3} fill="#aa5500" brush={{ axis: "y" }} select />
        <Filter where="@brushed">
          <Points bind:this={brushed} x={0.5} y="value" size={4.5} fill="#00aa00" />
        </Filter>
      </Frame>
    </Facet>
    <Line bind:this={lines} connections={connect(facet?.endpoint("values"))} color="#2a6fdb" width={1} opacity={0.5} respond="brushed" />
  </Plot>
{:else if scene === "series"}
  <Plot bind:this={plot} {data} width={640} height={300} axes2d>
    <Facet bind:this={facet} fields={["temp", "rain"]}>
      <Line x="time" y="value" color="#2a6fdb" width={2} />
    </Facet>
  </Plot>
{:else if scene === "rows"}
  <Plot bind:this={plot} {data} width={720} height={420} axes2d>
    <Facet bind:this={facet} fields={{ row: ["a", "b"] }} column="g">
      <Partition by="species">
        <Points x="id" y="value" color="species" size={3} />
      </Partition>
    </Facet>
    <Legend channel="color" label="Species" position="bottom" />
  </Plot>
{:else if scene === "external"}
  <Data value={data}>
    <Facet bind:this={facet} fields={["a", "b", "c"]} row="g" cacheSize={2}>
      <Plot height={240} axes2d><Points x="id" y="value" size={3} fill="#aa5500" /></Plot>
    </Facet>
  </Data>
{:else if scene === "pairs"}
  <Plot bind:this={plot} {data} width={600} height={600} axes2d>
    <Facet bind:this={facet} pairs={["a", "b", "c"]} triangle="lower">
      <Points x="x" y="y" size={2.5} fill="#aa5500" />
    </Facet>
  </Plot>
{:else if scene === "pairs-xy"}
  <Data value={data}>
    <Facet bind:this={facet} pairs={{ x: ["a", "b"], y: ["c"] }}>
      <Plot height={240} axes2d><Points x="x" y="y" size={2.5} fill="#aa5500" /></Plot>
    </Facet>
  </Data>
{:else if scene === "error-embedded"}
  <Plot bind:this={plot} {data} width={600} height={300} axes2d>
    <Facet bind:this={facet} fields={["a", "b"]} column="g">
      <Points x="id" y="value" />
    </Facet>
  </Plot>
{:else if scene === "error-external"}
  <Data value={data}>
    <Facet bind:this={facet} fields={["a", "b"]} column="g">
      <Plot height={240} axes2d><Points x="id" y="value" /></Plot>
    </Facet>
  </Data>
{:else if scene === "update"}
  <Plot bind:this={plot} {data} width={640} height={300} axes2d>
    <Facet bind:this={facet} fields={list}>
      <Points x="id" y="value" size={2.5} fill="#aa5500" />
    </Facet>
  </Plot>
{/if}
