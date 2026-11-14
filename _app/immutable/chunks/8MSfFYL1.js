const t=`<script>
  import { Plot, Calculate, Points, add, col } from "hmplot";
  const data = { x: [1, 2, 3, 4], y: [3, 1, 4, 2] };
<\/script>

<Plot {data} height={300} axes2d>
  <Calculate columns={{ total: add(col.x, col.y) }}>
    <Points x="x" y="total" />
  </Calculate>
</Plot>
`;export{t as default};
