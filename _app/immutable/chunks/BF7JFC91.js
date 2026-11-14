const t=`<script>
  import { Plot, Points } from "hmplot";
  const data = { x: [1, 2, 3], y: [2, 1, 4] };
<\/script>
<Plot {data}>
  <Points x="x" y="y" />
</Plot>
`;export{t as default};
