const n=`<script>
  import { Line, Partition, Plot } from "hmplot";
  const data = {
    x: [1, 2, 3, 4, 1, 2, 3, 4],
    y: [3, 1, 4, 2, 2, 4, 1, 3],
    group: ["a", "a", "a", "a", "b", "b", "b", "b"],
  };
<\/script>

<Plot {data} height={300} axes2d>
  <Partition by="group">
    <Line x="x" y="y" />
  </Partition>
</Plot>
`;export{n as default};
