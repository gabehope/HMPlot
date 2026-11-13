<script>
  import { Data, row, Plot, Points } from "hmplot";
</script>

<Data rows={8}>
  <Plot height={260} axes2d x={{ domain: [-1, 8] }} y={{ domain: [0, 2] }}>
    <Points x={row()} y={1} size={8} />
  </Plot>
</Data>
