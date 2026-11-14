const n=`<script>
  import { Checkbox, InputContext, Line, Plot, Points, input } from "hmplot";
  const data = { x: [1, 2, 3, 4], y: [3, 1, 4, 2] };
<\/script>

<InputContext>
  <Checkbox name="line" />
  <Plot {data} height={300} axes2d>
    <Points x="x" y="y" />
    <Line x="x" y="y" visible={input("line")} />
  </Plot>
</InputContext>
`;export{n as default};
