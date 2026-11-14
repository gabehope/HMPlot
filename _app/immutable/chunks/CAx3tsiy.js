const t=`<script>
  import { Facet, Plot, Points } from "hmplot";
  const data = {"x":[1,2,3,4,5,6],"y":[2,4,3,6,5,7],"group":["A","A","A","B","B","B"],"score":[10,25,40,60,75,95]};
<\/script>

<Facet {data} column="group" wrap={2}>
  <Plot height={280} axes2d>
    <Points x="x" y="y" fill="group" size={6} />
  </Plot>
</Facet>
`;export{t as default};
