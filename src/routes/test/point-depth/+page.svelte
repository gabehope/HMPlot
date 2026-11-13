<script>
  import { onMount } from "svelte";
  import { Plot, Points, Points3D, categorical } from "$lib/index";
  const data = { id: [0, 1], x: [0, 0], y: [0, 0], z: [0.6, -0.6], group: ["near", "far"] };
  let plots = $state({}), marks = $state({}), depthWrite = $state(true);
  onMount(() => {
    window.pointDepth = {
      get plots() { return plots; }, get marks() { return marks; },
      set: (value) => { depthWrite = value; },
    };
    return () => { delete window.pointDepth; };
  });
</script>

{#each ["Points", "Points3D"] as kind}
  <section data-point-kind={kind}>
    <Plot bind:this={plots[kind]} {data} key="id" type="3d-y-up" width={300} height={260}
      legend={false} axes2d={false} axes3d={false} toneMapping={0} animation={false}
      x={{ domain: [-1, 1] }} y={{ domain: [-1, 1] }} z={{ domain: [-1, 1] }}
      cameraPosition={[0, 0, 190]} cameraTarget={[0, 0, 0]}>
      {#if kind === "Points"}
        <Points bind:this={marks[kind]} x="x" y="y" z="z" size={70} fill="group"
          fillScale={categorical({ domain: ["near", "far"], range: ["#ff0000", "#0000ff"] })}
          {depthWrite} outlineWidth={0} select={true} respond={false} />
      {:else}
        <Points3D bind:this={marks[kind]} x="x" y="y" z="z" size={35} shape="cube" fill="group"
          fillScale={categorical({ domain: ["near", "far"], range: ["#ff0000", "#0000ff"] })}
          {depthWrite} select={true} respond={false} />
      {/if}
    </Plot>
  </section>
{/each}
