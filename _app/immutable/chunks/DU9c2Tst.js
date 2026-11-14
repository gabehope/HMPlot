const t=`<script>
  import { DateTimeInput, InputContext, Plot, Points, input } from "hmplot";
  const data = { x: [1, 3, 5, 7, 9], y: [2, 4, 1, 5, 3] };
<\/script>

<InputContext>
  <DateTimeInput name="cutoff" value={new Date("2024-06-01T12:00:00Z")} timezone="UTC" />
  <Plot {data} height={300} axes2d title={"Cutoff: {$cutoff}"}>
    <Points x="x" y="y" size={12}  />
  </Plot>
</InputContext>
`;export{t as default};
