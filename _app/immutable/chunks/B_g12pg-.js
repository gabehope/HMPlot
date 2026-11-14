const t=`<script>
  import { InputContext, Plot, Points, Slider, input } from "hmplot";
  const data = { x: [1, 2, 3, 4], y: [3, 1, 4, 2] };
<\/script>

<InputContext>
  <Slider name="size" min={1} max={10} value={4} />
  <Plot {data} height={300} axes2d>
    <Points x="x" y="y" size={input("size")} />
  </Plot>
</InputContext>
`;export{t as default};
