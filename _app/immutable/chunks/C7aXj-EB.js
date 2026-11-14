const o=`<script>
  import { Plot, Area, Line, Points } from "hmplot";
  const data = {"x":[1,2,3,4,5,6],"y":[2,4,3,6,5,7],"group":["A","A","A","B","B","B"],"score":[10,25,40,60,75,95],"lower":[1.2,3.2,2.2,5.2,4.2,6.2],"upper":[2.8,4.8,3.8,6.8,5.8,7.8]};
<\/script>

<Plot {data} height={340} axes2d>
  <Area x="x" lower="lower" upper="upper" fill="#547ba2" opacity={0.2} />
  <Line x="x" y="y" color="#315878" width={2} />
  <Points x="x" y="y" fill="#315878" size={4} />
</Plot>
`;export{o as default};
