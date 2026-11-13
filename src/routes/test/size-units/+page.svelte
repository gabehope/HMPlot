<script>
  // Stage 18.3: point size units. Each plot draws one point; the spec measures its width
  // in a PNG export before and after a wheel zoom. TODO 64: Arrows3D, a straight and a curved
  // one in 2D and in 3D (in world units alike). TODO 73.1: a literal size is a diameter in CSS
  // pixels, as a column through sizeScale's range is ("mapped": 1 of [0, 2] onto [10, 30] is 20).
  import { onMount } from "svelte";
  import { Plot, Points, Arrows3D, continuous } from "$lib/index";
  let plots = $state({});
  onMount(() => { window.sizeFixture = { get plots() { return plots; } }; return () => { delete window.sizeFixture; }; });
  const one = { x: [50], y: [50], s: [1] };
</script>
{#each [["px", { sizeUnits: "px", size: 20 }], ["data", { sizeUnits: "data", size: 10 }], ["default", { size: 20 }],
  ["mapped", { size: "s", sizeScale: continuous({ domain: [0, 2], range: [10, 30] }) }]] as [key, props]}
  <h3>Points {key}</h3>
  <Plot bind:this={plots[key]} data={one} width={400} height={400} axes2d={false} toneMapping={0} x={{ domain: [0, 100] }} y={{ domain: [0, 100] }}>
    <Points x="x" y="y" fill="#e0301e" {...props} />
  </Plot>
{/each}
{#each [["straight", "2d"], ["curved", "2d"], ["straight3d", "3d"], ["curved3d", "3d"]] as [key, type]}
  <h3>Arrows3D {key}</h3>
  <Plot bind:this={plots[key]} {type} width={400} height={400} axes2d={false} toneMapping={0}
    x={{ domain: [0, 100] }} y={{ domain: [0, 100] }} z={{ domain: [0, 100] }}>
    <Arrows3D start={[[50, 10, 50]]} end={[[50, 90, 50]]} width={12} headWidth={12} headLength={10} color="#e0301e"
      {...(key.startsWith("curved") ? { curve: "quadratic", control1: [[50, 50, 50]] } : {})} />
  </Plot>
{/each}
