const n=`<script>
  import { Plot, Line } from "hmplot";
  import { BandX } from "hmplot/charts";
  const data = { x: [1, 2, 3, 4, 5, 6], y: [3, 4, 2, 5, 6, 5] };
<\/script>

<Plot {data} height={300} axes2d>
  <BandX x0={2} x1={4} fill="#3478c7" />
  <Line x="x" y="y" />
</Plot>
`;export{n as default};
