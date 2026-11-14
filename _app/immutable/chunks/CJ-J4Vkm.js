const n=`<script>
  import { Plot, Points, Anchor, connect } from "hmplot";
import { Arrows } from "hmplot/charts";
  const data = { name: ["a", "b", "c"], before: [1, 2, 1.5], after: [3, 2.5, 4] };
  let points = $state(), anchor = $state();
<\/script>

<Plot {data} height={300} axes2d>
  <Points bind:this={points} x="before" y="name" />
  <Anchor bind:this={anchor} x="after" y="name" />
  <Arrows connections={connect(points, anchor)} />
</Plot>
`;export{n as default};
