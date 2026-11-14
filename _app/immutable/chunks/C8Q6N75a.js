const o=`<script>
  import { Plot } from "hmplot";
import { Lollipop } from "hmplot/charts";
  const data = { category: ["A", "B", "C", "D", "E"], value: [18, 31, 12, 44, 26] };
<\/script>

<Plot {data} height={300} axes2d>
  <Lollipop x="category" y="value" />
</Plot>
`;export{o as default};
