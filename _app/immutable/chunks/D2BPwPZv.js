const t=`<script>
  import { Filter, InputContext, Select, Plot, Points, col, input, is_in } from "hmplot";
  const data = { x: [1, 2, 3, 4, 5, 6], y: [3, 1, 4, 1, 5, 2], group: ["a", "b", "c", "a", "b", "c"] };
<\/script>

<InputContext>
  <Select multiple name="groups" options={["a", "b", "c"]} value={["a", "b"]} />
  <Plot {data} height={300} axes2d>
    <Filter where={is_in(col("group"), input("groups"))}>
      <Points x="x" y="y" />
    </Filter>
  </Plot>
</InputContext>
`;export{t as default};
