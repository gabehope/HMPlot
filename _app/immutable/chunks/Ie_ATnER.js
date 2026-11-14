const t=`<script>
  import { Plot, Pivot, Points, sum } from "hmplot";
  const data = {
    shape: ["a", "a", "b", "b", "c", "c"],
    measure: ["width", "height", "width", "height", "width", "height"],
    value: [1, 2, 3, 1, 2, 4],
  };
<\/script>

<Plot {data} height={300} axes2d>
  <Pivot field="measure" value={sum("value")} by="shape">
    <Points x="width" y="height" />
  </Pivot>
</Plot>
`;export{t as default};
