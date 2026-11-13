<script>
  import { Plot } from "hmplot";
  import { Sparkline } from "hmplot/charts";
  const data = { day: [1, 2, 3, 4, 5, 6], value: [3, 4, NaN, 2, 5, NaN], label: ["3", "4", "", "2", "5", ""] };
</script>

<Plot {data} height={120} axes2d={false} x={{ domain: [0, 7] }}>
  <Sparkline x="day" y="value" lower={2} upper={4} text="label"
    last={{ color: "#20252b", dx: 8 }} />
</Plot>
