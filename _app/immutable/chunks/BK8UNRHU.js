const t=`<script>
  import { Plot, Filter, Points, col, greater } from "hmplot";
  const data = { x: [1, 2, 3, 4, 5, 6], y: [3, 1, 4, 1, 5, 2] };
<\/script>

<Plot {data} height={300} axes2d>
  <Filter where={greater(col.y, 2)}>
    <Points x="x" y="y" />
  </Filter>
</Plot>
`;export{t as default};
