const t=`<script>
  import { Minimap, Plot, Points } from "hmplot";
  const data = { x: [1, 2, 3, 4], y: [3, 1, 4, 2] };
  let plot = $state();
<\/script>

<Plot bind:this={plot} {data} height={300} axes2d>
  <Points x="x" y="y" />
</Plot>
<Minimap for={plot} />
`;export{t as default};
