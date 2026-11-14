const n=`<script>
  import { Plot, Frame, Points } from "$lib";
  let { plot = $bindable() } = $props();
  const data = { x: [0, 1, 2, 3, 4], y: [2, 0, 3, 1, 4], z: [0, 3, 1, 4, 2] };
<\/script>

<Plot bind:this={plot} {data} type="3d" responsive height={420} overview>
  <Frame
    x={{ domain: [0, 4], label: "X" }}
    y={{ domain: [0, 4], label: "Y" }}
    z={{ domain: [0, 4], label: "Z" }}
  >
    <Points x="x" y="y" z="z" fill="z" size={5} />
  </Frame>
</Plot>
`;export{n as default};
