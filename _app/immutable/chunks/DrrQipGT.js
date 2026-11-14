const t=`<script>
  import { Plot, Line } from "hmplot";
import { Callout } from "hmplot/charts";
  const data = { x: [1, 2, 3, 4, 5, 6], y: [3, 4, 2, 5, 6, 5] };
<\/script>

<Plot {data} height={300} axes2d>
  <Line x="x" y="y" />
  <Callout x={5} y={6} text="Peak" />
</Plot>
`;export{t as default};
