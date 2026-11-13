<script>
  import { Plot, Rect } from "hmplot";
import { Bin } from "hmplot/stats";
  const data = { value: [1.2, 2.5, 2.9, 3.1, 3.4, 3.8, 4.2, 4.4, 5.1, 6.3] };
</script>

<Plot {data} height={300} axes2d>
  <Bin x="value" bins={5}>
    <Rect x0="x0" x1="x1" y0={0} y1="count" />
  </Bin>
</Plot>
