const n=`<script>
  import { Plot, Sample, Points } from "hmplot";
  const data = {
    x: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    y: [4, 7, 2, 9, 5, 3, 8, 6, 1, 10],
  };
<\/script>

<Plot {data} height={300} axes2d>
  <Sample size={5}>
    <Points x="x" y="y" />
  </Sample>
</Plot>
`;export{n as default};
