const t=`<script>
  import { Plot, Points } from "hmplot";
  const data = {"x":[1,2,3,4,5,6],"y":[2,4,3,6,5,7],"group":["A","A","A","B","B","B"],"score":[10,25,40,60,75,95]};
<\/script>

<Plot {data} height={340} axes2d>
  <Points x="x" y="y" size={4} />
</Plot>
`;export{t as default};
