const t=`<script>
  import { Plot, Stack } from "hmplot";
import { Bar } from "hmplot/charts";
  const data = {
    region: ["North", "North", "South", "South", "East", "East"],
    product: ["A", "B", "A", "B", "A", "B"],
    sales: [3, 2, 4, 1, 2, 3],
  };
<\/script>

<Plot {data} height={300} axes2d>
  <Stack x="region" y="sales" series="product">
    <Bar x="region" y="y1" baseline="y0" fill="product" />
  </Stack>
</Plot>
`;export{t as default};
