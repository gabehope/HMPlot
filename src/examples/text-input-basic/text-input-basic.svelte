<script>
  import { TextInput, InputContext, Plot, Points, input } from "hmplot";
  const data = { x: [1, 3, 5, 7, 9], y: [2, 4, 1, 5, 3] };
</script>

<InputContext>
  <TextInput name="caption" value="My observations" placeholder="Plot title" />
  <Plot {data} height={300} axes2d title={"{$caption}"}>
    <Points x="x" y="y" size={12}  />
  </Plot>
</InputContext>
