const n=`<script>
  import { Plot, Polygon } from "hmplot";
  const data = {
    x: [0, 2, 2, 0, 3, 5, 4],
    y: [0, 0, 2, 2, 0, 0, 2],
    shape: ["a", "a", "a", "a", "b", "b", "b"],
  };
<\/script>

<Plot {data} height={300} axes2d>
  <Polygon x="x" y="y" series="shape" />
</Plot>
`;export{n as default};
