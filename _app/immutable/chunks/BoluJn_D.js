const t=`<script>
  import { Plot, Prism } from "hmplot";
  const data = { x: [0, 2, 0, 2], y: [0, 0, 2, 2], value: [1, 3, 2, 4] };
<\/script>

<Plot {data} type="3d" height={300} axes3d>
  <Prism x="x" y="y" z0={0} z1="value" />
</Plot>
`;export{t as default};
