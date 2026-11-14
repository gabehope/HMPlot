const t=`<script>
  import { Plot, Text3D } from "hmplot";
<\/script>

<Plot type="3d" height={300} axes3d>
  <Text3D text="Hello" position={[0, 0.4, 0]} size={10} />
  <Text3D text={"e^{i\\\\pi} + 1 = 0"} tex position={[0, -0.4, 0]} size={10} />
</Plot>
`;export{t as default};
