const n=`<script>
  import { Plot, Line } from "hmplot";
import { Window } from "hmplot/stats";
  const data = { x: [1, 2, 3, 4, 5, 6, 7, 8], y: [2, 5, 3, 6, 4, 7, 5, 8] };
<\/script>

<Plot {data} height={300} axes2d>
  <Window field="y" size={3}>
    <Line x="x" y="smoothed" />
  </Window>
</Plot>
`;export{n as default};
