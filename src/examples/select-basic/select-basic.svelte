<script>
  import { InputContext, Plot, Points, Select } from "hmplot";
  const data = { a: [1, 2, 3, 4], b: [4, 2, 3, 1], y: [3, 1, 4, 2] };
</script>

<!-- "$column" reads the input where a string names a column: x plots the chosen one. -->
<InputContext>
  <Select name="column" options={["a", "b"]} />
  <Plot {data} height={300} axes2d>
    <Points x="$column" y="y" />
  </Plot>
</InputContext>
