const n=`<script>
  import { Plot, Slice, Points } from "hmplot";
  const data = {
    id: ["a", "a", "a", "b", "b", "b"],
    time: [0, 1, 2, 0, 1, 2],
    x: [1, 2, 4, 3, 2, 1],
    y: [1, 3, 2, 4, 3, 1],
  };
<\/script>

<Plot {data} height={300} axes2d>
  <Slice field="time" at={1.5} by="id">
    <Points x="x" y="y" />
  </Slice>
</Plot>
`;export{n as default};
