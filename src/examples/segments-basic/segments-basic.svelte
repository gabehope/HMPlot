<script>
  import { Plot, Segments } from "hmplot";
  const start = [[0, 0], [1, 2], [2, 1]];
  const end = [[1, 1], [2, 3], [4, 0]];
</script>

<Plot height={300} axes2d autoBounds>
  <Segments {start} {end} />
</Plot>
