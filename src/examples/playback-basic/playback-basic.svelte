<script>
  import { Filter, InputContext, Playback, Plot, Points, col, input, less_equal } from "hmplot";
  const data = { x: [1, 2, 3, 4], y: [3, 1, 4, 2] };
</script>

<!-- Play shows the points up to x = until, one more each second. -->
<InputContext>
  <Playback name="until" min={1} max={4} step={1} />
  <Plot {data} height={300} axes2d x={{ domain: [0, 5] }} y={{ domain: [0, 5] }}>
    <Filter where={less_equal(col("x"), input("until"))}>
      <Points x="x" y="y" />
    </Filter>
  </Plot>
</InputContext>
