<script>
  import { Frame, Line, Plot } from "hmplot";
  const data = { x: [1, 2, 3, 4], y: [3, 1, 4, 2], count: [40, 10, 25, 5] };
</script>

<Plot {data} height={300} axes2d>
  <Line x="x" y="y" />
  <Frame y={{ domain: "auto", side: "right" }}>
    <Line x="x" y="count" />
  </Frame>
</Plot>
