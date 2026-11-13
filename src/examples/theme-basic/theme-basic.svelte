<script>
  import { Plot, Points, Theme, themes } from "hmplot";
  const data = { x: [1, 2, 3, 4], y: [3, 1, 4, 2] };
</script>

<Theme value={themes.dark}>
  <Plot {data} height={300} axes2d>
    <Points x="x" y="y" />
  </Plot>
</Theme>
