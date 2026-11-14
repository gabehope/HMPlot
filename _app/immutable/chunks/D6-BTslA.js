const t=`<script>
  import { Plot, Frame, Points, Html } from "hmplot";
  let count = $state(0);
<\/script>

<Plot height={300}>
  <Frame x={{ domain: [0, 10] }} y={{ domain: [0, 10] }}>
    <Points x={4} y={6} size={12} />
    <Html x={4} y={6} dx={12} dy={-12}>
      <button onclick={() => count++}>Details opened {count} times</button>
    </Html>
  </Frame>
</Plot>
`;export{t as default};
