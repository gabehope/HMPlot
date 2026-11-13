<script>
  import { Plot } from "hmplot";
import { Ecdf } from "hmplot/charts";
  const data = { value: [3, 1, 4, 1, 5, 9, 2, 6] };
</script>

<Plot {data} height={300} axes2d>
  <Ecdf x="value" />
</Plot>
