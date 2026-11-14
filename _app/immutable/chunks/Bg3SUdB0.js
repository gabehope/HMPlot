const t=`<script>
  import { Data, Plot, Points } from "hmplot";
  const data = { x: [1, 2, 3, 4], y: [3, 1, 4, 2] };
<\/script>

<Data value={data}>
  <Plot height={300} axes2d>
    <Points x="x" y="y" />
  </Plot>
</Data>
`;export{t as default};
