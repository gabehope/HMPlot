const t=`<script>
  import { Plot, Arrows3D } from "hmplot";
  const start = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const end = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
<\/script>

<Plot type="3d" height={300} axes3d autoBounds>
  <Arrows3D {start} {end} width={1} />
</Plot>
`;export{t as default};
