const e=`<script>
  import { Provider, Plot, Points, Voronoi, Hull, Delaunay, Polygon, Segments, categorical } from "$lib";
  import { untrack } from "svelte";
  let { onready } = $props(), plot = $state();
  const species = categorical({ domain: ["Adelie", "Chinstrap", "Gentoo"] });
  $effect(() => { const p = plot; untrack(() => onready?.(p)); });
<\/script>

<p>
  Each penguin's Voronoi cell: hover a cell to highlight its penguin. Beside it, each species'
  convex hull and the Delaunay triangulation. Computed on the host with d3-delaunay; the cells and
  hulls are drawn by Polygon. Data: Palmer penguins (CC0).
</p>
<Provider url="/data/penguins/penguins.csv" format="csv">
  <div class="views">
    <Plot bind:this={plot} responsive height={340} axes2d fillScale={species}>
      <Voronoi x="bill_length_mm" y="bill_depth_mm">
        <Polygon fill="species" opacity={0.3} outlineColor="#ffffff" outlineWidth={0.5} hover respond="hovered" />
      </Voronoi>
      <Points x="bill_length_mm" y="bill_depth_mm" fill="species" size={2.5} respond="hovered" />
    </Plot>
    <Plot responsive height={340} axes2d fillScale={species}>
      <Hull x="bill_length_mm" y="bill_depth_mm" by="species">
        <Polygon fill="species" opacity={0.25} outlineColor="#30343b" outlineWidth={1.5} />
      </Hull>
      <Points x="bill_length_mm" y="bill_depth_mm" fill="species" size={2} />
    </Plot>
    <Plot responsive height={340} axes2d>
      <Delaunay x="bill_length_mm" y="bill_depth_mm">
        <Segments start="start" end="end" color="#9aa3ad" width={0.7} />
      </Delaunay>
      <Points x="bill_length_mm" y="bill_depth_mm" fill="#30343b" size={2} />
    </Plot>
  </div>
</Provider>

<style>
  .views { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 12px; }
</style>
`;export{e as default};
