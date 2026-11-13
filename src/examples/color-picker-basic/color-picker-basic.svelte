<script>
  import { ColorPicker, InputContext, Plot, Points, input } from "hmplot";
  const data = { x: [1, 3, 5, 7, 9], y: [2, 4, 1, 5, 3] };
</script>

<InputContext>
  <ColorPicker name="ink" value="#4f7dff" />
  <Plot {data} height={300} axes2d >
    <Points x="x" y="y" size={12} fill={input("ink")} />
  </Plot>
</InputContext>
