const t=`<script>
  import { Plot, Points } from "hmplot";
import { DensityContour } from "hmplot/charts";
  const data = { x: [1, 2, 2, 3, 3, 4, 5], y: [2, 1, 3, 2, 4, 3, 4] };
<\/script>

<Plot {data} height={300} axes2d>
  <DensityContour x="x" y="y" />
  <Points x="x" y="y" />
</Plot>
`;export{t as default};
