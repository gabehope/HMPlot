const t=`<script>
  import { Plot, Rect } from "hmplot";
  const data = { x0: [0, 2, 4], x1: [1, 3, 5], y0: [0, 1, 0], y1: [2, 3, 1] };
<\/script>

<Plot {data} height={300} axes2d>
  <Rect x0="x0" x1="x1" y0="y0" y1="y1" />
</Plot>
`;export{t as default};
