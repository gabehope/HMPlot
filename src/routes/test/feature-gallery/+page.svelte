<script>
  // Internal rendering/settings fixture; public examples live under /examples.
  import { onMount } from "svelte";
  import Plot from "$lib/plot/plot.svelte";
  import Scatter from "$lib/plot/marks/scatterPoints.svelte";
  import Line from "$lib/plot/marks/line.svelte";
  import Segments from "$lib/plot/marks/segments.svelte";
  import Surface from "$lib/plot/marks/surface.svelte";
  import Arrows3D from "$lib/plot/marks/arrows.svelte";
  import Text3D from "$lib/plot/marks/text.svelte";
  import { T } from "@threlte/core";
  let hits = $state(0),
    hover = $state("none");
  let first = $state(),
    external = $state(),
    picking = $state(),
    visible = $state(true),
    scene = $state("3d");
  onMount(() => {
    if (import.meta.env.DEV)
      window.__galleryTest = {
        pick: () => picking.getDiagnostics(),
        getDiagnostics: () => first?.getDiagnostics(),
        whenSettled: () => first?.whenSettled(),
      };
    return () => delete window.__galleryTest;
  });
  const grid = Array.from({ length: 20 }, (_, j) =>
    Array.from(
      { length: 20 },
      (_, i) => Math.sin(i / 3) * Math.cos(j / 3) * 0.4,
    ),
  );
</script>

<svelte:head
  ><title>Plot feature gallery</title><link
    rel="icon"
    href="data:,"
  /></svelte:head
>
<aside>Host application sidebar<br /><a href="/">← Plot studio</a></aside>
<main>
  <h1>Feature gallery</h1>
  <nav>
    <button bind:this={external} onclick={() => first.openSettings(external)}
      >Open geometry settings</button
    ><button onclick={() => (visible = !visible)}>Toggle plots</button>
  </nav>
  {#if visible}
    <div class="grid">
      <div class="clipped">
        <Plot
          name="Geometry"
          bind:type={scene}
          width={520}
          height={420}
          bind:this={first}
        >
          <T.DirectionalLight
            position={[40, 60, 100]}
            intensity={2}
          /><T.AmbientLight intensity={0.5} />
          <Surface
            name="Grid surface"
            height={grid}
            lit
            xrange={[-40, 0]}
            yrange={[-30, 10]}
            zrange={[-10, 10]}
          />
          <Surface
            name="Triangle mesh"
            position={[
              [0, 0, 0],
              [0.7, 0, 0],
              [0.4, 0.7, 0.4],
            ]}
            indices={[[0, 1, 2]]}
            fill="orange"
            lit
          />
          <Arrows3D
            name="Arrow field"
            start={[
              [-0.6, -0.6, 0],
              [0, -0.6, 0],
              [0.6, -0.6, 0],
            ]}
            end={[
              [-0.2, -0.2, 0.3],
              [0.1, 0, 0],
              [0.7, -0.3, 0.2],
            ]}
            color="#d75872"
            lit
          />
        </Plot>
      </div>
      <Plot name="Lines and labels" type="2d" width={520} height={420}>
        <Line
          name="Dashed line"
          position={[
            [-0.8, -0.5],
            [-0.2, 0.3],
            [0.2, -0.2],
            [0.8, 0.5],
          ]}
          color="#6976d6"
          width={0.3}
          dashed
          dashSize={3}
          gapSize={2}
        />
        <Segments
          name="Bezier link"
          start={[[-0.8, 0.6]]}
          end={[[0.8, 0.6]]}
          control1={[[-0.4, -0.6]]}
          control2={[[0.4, -0.6]]}
          color="#27a59b"
          width={0.2}
        />
        <Scatter
          name="Points"
          position={[
            [-0.7, -0.4],
            [0.5, 0.3],
          ]}
          fill="#e6a144"
          size={10}
        />
        <Text3D name="Title" text="Scene labels" position={[0, 0.6]} size={5} />
        <Text3D tex
          name="Formula"
          text={"\\frac{1}{x^2+1}"}
          position={[0, -0.6]}
          size={5}
        />
      </Plot>
      <Plot
        bind:this={picking}
        name="Picking"
        type="2d"
        width={300}
        height={250}
      >
        <Scatter
          name="Pick target"
          position={[[0, 0, 0]]}
          size={80}
          fill="#f19940"
          transparent
          opacity={0.6}
          onclick={() => hits++}
          onpointerover={() => (hover = "point")}
          onpointerout={() => (hover = "none")}
        />
      </Plot>
      <output aria-label="Picking result">Clicks: {hits}; Hover: {hover}</output
      >
    </div>
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    font: 14px system-ui;
    background: #f3f4f8;
    color: #2d354a;
  }
  aside {
    position: fixed;
    inset: 0 auto 0 0;
    width: 150px;
    padding: 20px;
    background: #222c45;
    color: white;
    line-height: 2;
  }
  a {
    color: #b3c0ec;
  }
  main {
    margin-left: 210px;
    padding: 20px;
  }
  h1 {
    font-size: 24px;
  }
  nav {
    display: flex;
    gap: 12px;
    margin-bottom: 20px;
  }
  button {
    padding: 8px;
    border: 1px solid #ccd1df;
    border-radius: 6px;
    background: white;
    cursor: pointer;
  }
  .grid {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
  }
  .clipped {
    overflow: hidden;
    border-radius: 12px;
  }
  @media (max-width: 650px) {
    aside {
      display: none;
    }
    main {
      margin: 0;
      padding: 10px;
    }
    .grid {
      overflow-x: auto;
    }
    nav {
      flex-wrap: wrap;
    }
  }
</style>
