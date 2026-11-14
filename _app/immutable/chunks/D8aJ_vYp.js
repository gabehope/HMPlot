const t=`<script>
  import { Plot } from "hmplot";
import { Histogram } from "hmplot/charts";
  const data = {
    value: [1.2, 2.3, 2.8, 3.1, 3.4, 3.6, 3.9, 4.2, 4.5, 4.7, 5.1, 5.6, 6.4, 7.3],
  };
<\/script>

<Plot {data} height={300} axes2d>
  <Histogram x="value" bins={5} />
</Plot>
`;export{t as default};
