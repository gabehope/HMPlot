const t=`<script>
  import { Plot, Line } from "hmplot";
  const data = { x: [1, 2, 3, 4, 5], y: [1, 3, 2, 5, 4] };
<\/script>

<Plot {data} height={300} axes2d>
  <Line x="x" y="y" />
</Plot>
`;export{t as default};
