<script>
  import { Plot, Frame, Points } from "$lib/index";
  let polar = $state(), globe = $state(), warped = $state(), largePolar = $state();
  $effect(() => {
    window.stage14LocalSize = { get polar() { return polar; }, get globe() { return globe; },
      get warped() { return warped; }, get largePolar() { return largePolar; } };
    return () => { delete window.stage14LocalSize; };
  });
</script>

<Plot bind:this={polar} coordinates="polar" angleUnit="degrees" baseRadius={0}
  radialScale={1} axes2d={false} width={500} height={500}
  x={{ domain: [0, 360] }} y={{ domain: [0, 2.5] }}>
  <Points position={[[0, 0]]} size={12} sizeUnits="data" fill="#d02b27" />
  <Points position={[[0, 0.9]]} size={12} sizeUnits="data" fill="#20aa42" />
  <Points position={[[0, 1.8]]} size={12} sizeUnits="data" fill="#2468c0" />
</Plot>

<Plot bind:this={largePolar} coordinates="polar" angleUnit="degrees" baseRadius={0}
  radialScale={1} axes2d={false} width={500} height={500}
  x={{ domain: [999820, 1000180] }} y={{ domain: [0, 2.5] }}>
  <Points position={[[1000000, 0.9]]} size={12} sizeUnits="data" fill="#20aa42" />
</Plot>

<Plot bind:this={warped} axes2d={false} width={500} height={500}>
  <Frame coordinates="polar" angleUnit="degrees" baseRadius={0}
    x={{ domain: [0, 360], visible: false }} y={{ domain: [0, 2.2], visible: false }}>
    <Frame coordinates="cartesian"
      x={{ domain: [0, 1], range: [0, 90], visible: false }}
      y={{ domain: [0, 2], range: [0, 2], visible: false }}>
      <Points position={[[0.5, 0.8]]} size={0.15} sizeUnits="data" fill="#20aa42" />
      <Points position={[[0.5, 1.6]]} size={0.15} sizeUnits="data" fill="#2468c0" />
    </Frame>
  </Frame>
</Plot>

<Plot bind:this={globe} coordinates="spherical" projection="orthographic"
  axes2d={false} width={500} height={500}>
  <Points position={[[0, 0]]} size={12} sizeUnits="data" fill="#20aa42" />
  <Points position={[[0, 60]]} size={12} sizeUnits="data" fill="#2468c0" />
  <Points position={[[0, 90]]} size={12} sizeUnits="data" fill="#d02b27" />
</Plot>
