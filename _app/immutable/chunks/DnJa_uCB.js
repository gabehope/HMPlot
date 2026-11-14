const t=`<script>
  import { Plot, Points, Title } from "hmplot";
  const data = { x: [1, 2, 3, 4], y: [3, 1, 4, 2] };
<\/script>

<Title text="Four measurements" />
<Plot {data} height={300} axes2d>
  <Points x="x" y="y" />
</Plot>
`;export{t as default};
