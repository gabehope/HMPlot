const t=`<script>
  import { Plot, VectorTile } from "hmplot";
<\/script>

<Plot coordinates="spherical" projection="mercator" toneMapping={0} height={300}>
  <VectorTile tile={[14, 9014, 4818]} live={false} />
</Plot>
`;export{t as default};
