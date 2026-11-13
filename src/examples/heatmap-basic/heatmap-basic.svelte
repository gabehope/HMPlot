<script>
  import { Plot, Heatmap } from "hmplot";
  const fill = [
    [0, 1, 2, 1],
    [1, 3, 4, 2],
    [2, 4, 3, 1],
  ];
</script>

<Plot height={300} autoBounds>
  <Heatmap {fill} />
</Plot>
