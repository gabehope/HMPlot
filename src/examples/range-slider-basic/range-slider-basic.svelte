<script>
  import { Slider, InputContext, Plot, Points, input } from "hmplot";
  let window = $state([2, 8]);
  const data = { x: [1, 3, 5, 7, 9], y: [2, 4, 1, 5, 3] };
</script>

<InputContext>
  <Slider name="window" min={0} max={10} bind:value={window} />
  <Plot {data} height={300} axes2d x={{ domain: window }}>
    <Points x="x" y="y" size={12}  />
  </Plot>
</InputContext>
