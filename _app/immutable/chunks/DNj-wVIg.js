const o=`<script>
  import { Plot, Voronoi, Polygon } from "hmplot";
  const data = { name: ["a", "b", "c", "d", "e"], x: [1, 3, 2, 4, 2.5], y: [1, 1, 3, 3, 2] };
<\/script>

<Plot {data} height={300} axes2d>
  <Voronoi x="x" y="y">
    <Polygon fill="name" />
  </Voronoi>
</Plot>
`;export{o as default};
