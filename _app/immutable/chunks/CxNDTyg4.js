const t=`<script>
  import { Button, InputContext, Plot, Points, Sample, input } from "hmplot";
  const data = { x: [1, 2, 3, 4, 5, 6, 7, 8], y: [3, 1, 4, 1, 5, 9, 2, 6] };
<\/script>

<!-- Each press adds one to the button's value, so the Sample draws with a new seed. -->
<InputContext>
  <Button name="draw" />
  <Plot {data} height={300} axes2d>
    <Sample size={4} seed={input("draw")}>
      <Points x="x" y="y" />
    </Sample>
  </Plot>
</InputContext>
`;export{t as default};
