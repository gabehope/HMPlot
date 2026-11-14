const t=`<script>
  import { Plot, Fold, Points } from "hmplot";
  const data = { name: ["a", "b", "c"], before: [1, 3, 2], after: [2, 4, 1] };
<\/script>

<Plot {data} height={300} axes2d>
  <Fold fields={["before", "after"]}>
    <Points x="key" y="value" />
  </Fold>
</Plot>
`;export{t as default};
