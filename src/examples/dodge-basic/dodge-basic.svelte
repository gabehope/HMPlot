<script>
  import { Plot, Dodge, Points } from "hmplot";
  const data = { value: [1, 1.1, 1.2, 2, 2.05, 2.1, 2.15, 3, 3.1, 4] };
</script>

<Plot {data} height={300} axes2d>
  <Dodge x="value">
    <Points x="value" y={0} />
  </Dodge>
</Plot>
