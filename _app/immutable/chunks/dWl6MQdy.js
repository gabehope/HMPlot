const n=`<script>
  import { Plot, Frame, Points, Anchor, connect } from "hmplot";
import { Arrows } from "hmplot/charts";
  const data = {"x":[1,2,3,4,5,6],"y":[2,4,3,6,5,7],"x2":[1.6,2.7,3.5,4.8,5.3,6.6],"y2":[3.1,4.6,4.2,6.5,6.4,7.8],"group":["A","A","A","B","B","B"]};
  let first = $state(), second = $state();
<\/script>

<Plot {data} height={340}>
  <Frame x={{ label: "Measurement X" }} y={{ label: "Measurement Y" }}>
    <Points bind:this={first} x="x" y="y" fill="group" />
    <Anchor bind:this={second} x="x2" y="y2" />
    <Arrows connections={connect(first, second)} color="group" />
  </Frame>
</Plot>
`;export{n as default};
