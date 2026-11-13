<script>
  import { InputContext, Plot, Rect, Slider, input } from "hmplot";
import { Bin } from "hmplot/stats";
  const data = { x: [1, 2, 2, 3, 3, 3, 4, 4, 5, 7] };
</script>

<InputContext>
  <Slider name="bins" min={1} max={10} step={1} value={4} />
  <Plot {data} height={300} axes2d>
    <Bin x="x" bins={input("bins")}>
      <Rect x0="x0" x1="x1" y0={0} y1="count" />
    </Bin>
  </Plot>
</InputContext>
