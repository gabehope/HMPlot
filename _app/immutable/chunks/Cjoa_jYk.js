const t=`<script>
  import { Plot, Interpolate, Heatmap } from "hmplot";
  const data = {
    x: [0, 1, 2, 0, 1, 2, 0.5, 1.5],
    y: [0, 0, 0, 2, 2, 2, 1, 1],
    temperature: [10, 12, 15, 11, 14, 18, 13, 16],
  };
<\/script>

<Plot {data} height={300} axes2d>
  <Interpolate x="x" y="y" values={["temperature"]}>
    <Heatmap fill="temperature" />
  </Interpolate>
</Plot>
`;export{t as default};
