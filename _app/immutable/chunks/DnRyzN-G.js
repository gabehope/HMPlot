const t=`<script>
  import { Plot, Calculate, Rect, col, subtract, divide, mean, std } from "hmplot";
import { Bin } from "hmplot/stats";
  const data = {"x":[1,2,3,4,5,6],"y":[2,4,3,6,5,7],"group":["A","A","A","B","B","B"],"score":[10,25,40,60,75,95]};
<\/script>

<Plot {data} height={340} axes2d>
  <Calculate columns={{ z: divide(subtract(col("score"), mean("score")), std("score")) }}>
    <Bin x="z" bins={5}>
      <Rect x0="x0" x1="x1" y0={0} y1="count" fill="#547ba2" />
    </Bin>
  </Calculate>
</Plot>
`;export{t as default};
