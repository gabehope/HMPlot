<script>
  import { Plot } from "hmplot";
  import { ForestPlot } from "hmplot/charts";
  const data = { study: ["Trial A", "Trial B", "Trial C"], estimate: [0.8, 1.1, 1.3],
    low: [0.6, 0.9, 1.0], high: [1.0, 1.4, 1.6] };
</script>

<Plot {data} height={300} axes2d x={{ label: "Risk ratio" }}>
  <ForestPlot x="estimate" y="study" lower="low" upper="high" reference={1}
    interval={{ color: "#5b6470", capSize: 8 }} />
</Plot>
