const o=`<script>
  import { Plot, Line, Points } from "hmplot";
  const data = {"x":[1,2,3,4,5,6],"y":[2,4,3,6,5,7],"group":["A","A","A","B","B","B"],"score":[10,25,40,60,75,95]};
<\/script>

<Plot {data} height={340} axes2d background="white">
  <Line x="x" y="y" color="#547ba2" />
  <Points x="x" y="y" fill="#547ba2" />
</Plot>
`;export{o as default};
