<script>
  import { Plot } from "hmplot";
import { Arrows } from "hmplot/charts";
  // One arrow per row, from its start to its end.
  const start = [[0, 0], [2, 3], [4, 1]];
  const end = [[1.5, 2], [3.5, 3], [3, 0]];
</script>

<Plot height={300} axes2d autoBounds>
  <Arrows {start} {end} />
</Plot>
