const e=`<script>
  import { Plot, Points, Legend, Theme, themes } from "hmplot";
  const data = {"x":[1,2,3,4,5,6],"y":[2,4,3,6,5,7],"group":["A","A","A","B","B","B"],"score":[10,25,40,60,75,95]};
  let points = $state();
<\/script>

<Theme value={themes.paper}>
  <Plot {data} height={340} axes2d>
    <Points bind:this={points} x="x" y="y" fill="group" shape="group" size="score" />
    <Legend for={points} channel="fill" label="Group" />
    <Legend for={points} channel="size" label="Score" position="right" />
  </Plot>
</Theme>
`;export{e as default};
