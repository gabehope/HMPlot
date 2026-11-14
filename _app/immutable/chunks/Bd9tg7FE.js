const t=`<script>
  import { Plot } from "hmplot";
import { Bar } from "hmplot/charts";
  const data = { group: ["A", "B", "C", "D"], total: [5, 8, 4, 7] };
<\/script>

<Plot {data} height={300} axes2d>
  <Bar x="group" y="total" />
</Plot>
`;export{t as default};
