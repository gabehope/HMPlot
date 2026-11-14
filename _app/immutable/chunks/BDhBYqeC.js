const t=`<script>
  import { Plot } from "hmplot";
import { Pie } from "hmplot/charts";
  const data = { region: ["North", "East", "South", "West"], sales: [42, 18, 27, 13] };
<\/script>

<Plot {data} height={300}>
  <Pie value="sales" category="region" />
</Plot>
`;export{t as default};
