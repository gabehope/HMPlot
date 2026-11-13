<script>
  import { Plot, Legend } from "hmplot";
  import { Waterfall } from "hmplot/charts";
  const data = { step: ["Start", "Sales", "Services", "Refunds", "Costs", "Tax"], change: [120, 45, 20, -15, -60, -22] };
</script>

<Plot {data} height={300} axes2d>
  <Waterfall x="step" y="change" />
  <Legend />
</Plot>
