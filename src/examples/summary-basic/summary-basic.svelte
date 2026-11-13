<script>
  import { Plot } from "hmplot";
import { Summary } from "hmplot/stats";
import { ErrorBars } from "hmplot/charts";
  const data = { group: ["a", "a", "a", "b", "b", "b"], value: [1, 2, 3, 4, 6, 5] };
</script>

<Plot {data} height={300} axes2d>
  <Summary field="value" by="group" interval="standard-error">
    <ErrorBars x="group" y="estimate" lower="lower" upper="upper" />
  </Summary>
</Plot>
