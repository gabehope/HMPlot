<script>
  // Textured globes, a ring and a bare Frame placed in a 3D Cartesian scene (the solar system
  // example's parts), and a flat lit image. ?box=shown shows the bare Frame's axes.
  import { onMount, onDestroy } from "svelte";
  import { T } from "@threlte/core";
  import { numpy as np } from "@hmplot/jax";
  import { Plot, Frame, Heatmap, Image, Points, Text, initializePlot, continuous } from "$lib/index";

  const boxShown = typeof location !== "undefined" && new URLSearchParams(location.search).get("box") === "shown";
  let plot = $state(), textures = $state.raw(null), x = $state(-25), spin = $state(0);
  let grayLit = $state(true), light = $state([300, 0, 150]), atmosphere = $state(false), gray = $state();
  const FLAT = [[0, 0], [0, 0]];
  // Longitude runs across the columns (-180 to 180): the front hemisphere (|lon| < 90) is red,
  // the back blue.
  function hemispheres() {
    const w = 64, h = 32, values = new Float32Array(w * h * 3);
    for (let row = 0; row < h; row++) for (let col = 0; col < w; col++) {
      const lon = ((col + 0.5) / w) * 360 - 180;
      values.set(Math.abs(lon) < 90 ? [0.9, 0.1, 0.1] : [0.1, 0.2, 0.9], (row * w + col) * 3);
    }
    return np.array(values).reshape([h, w, 3]);
  }
  onMount(() => {
    window.placedGlobes = {
      get plot() { return plot; },
      move(value) { x = value; },
      turn(value) { spin = value; },
      setGrayLit(value) { grayLit = value; },
      moveLight(value) { light = value; },
      // The gray globe's atmosphere (TODO 37.6), and its Image (pickable: it has a click handler).
      setAtmosphere(value) { atmosphere = value; },
      get gray() { return gray; },
    };
    initializePlot().then(() => {
      textures = {
        hemispheres: hemispheres(),
        gray: np.array(new Float32Array(8 * 4 * 3).fill(0.8)).reshape([4, 8, 3]),
        yellow: np.array(new Float32Array(2 * 2 * 3).map((_, i) => [0.9, 0.8, 0.1][i % 3])).reshape([2, 2, 3]),
        // The ring: opaque green from radius 1 to 2 of the polar Frame's [0, 2].
        ring: np.array(new Float32Array(4 * 2 * 4).map((_, i) => [0.1, 0.8, 0.2, 1][i % 4])).reshape([4, 2, 4]),
      };
    });
    return () => { delete window.placedGlobes; };
  });
  onDestroy(() => {
    const arrays = Object.values(textures ?? {});
    Promise.resolve(plot?.whenSettled()).catch(() => {}).finally(() => arrays.forEach((a) => a.dispose()));
  });
</script>

{#if textures}
  <Plot bind:this={plot} type="3d" width={600} height={400} background="#000000" toneMapping={0}
    cameraPosition={[0, 0, 75]} cameraTarget={[0, 0, 0]} cameraUp={[0, 1, 0]}
    x={{ domain: [-50, 50], visible: false }} y={{ domain: [-50, 50], visible: false }} z={{ domain: [-50, 50], visible: false }}>
    <T.AmbientLight intensity={0.4} />
    <T.PointLight position={light} intensity={2.5} decay={0} />
    <!-- A lit textured globe that moves and spins: a lit Heatmap its Image child paints. -->
    <Frame name="Hemispheres" coordinates="spherical" x={{ domain: [-180, 180] }} y={{ domain: [-90, 90] }}
      placement={{ anchor: [x, 15, 0], size: [20, 20, 20], rotation: [0, spin, 0] }}>
      <Heatmap fill={FLAT} lit fillScale={continuous({ domain: [0, 1] })} textureResolution={[64, 32]}>
        <Image data={textures.hemispheres} />
      </Heatmap>
    </Frame>
    <!-- A uniform globe, a lit Image: its shading shows its normals. -->
    <Frame name="Gray" coordinates="spherical" x={{ domain: [-180, 180] }} y={{ domain: [-90, 90] }}
      placement={{ anchor: [25, 15, 0], size: [20, 20, 20] }} {atmosphere}>
      <Image bind:this={gray} data={textures.gray} lit={grayLit} onclick={() => {}} />
    </Frame>
    <!-- A flat lit Image facing the camera (+z): it fills its placed Frame. -->
    <Frame name="Flat" placement={{ anchor: [0, -20, 0], size: [16, 16, 16] }}
      x={{ domain: [-1, 1], visible: false }} y={{ domain: [-1, 1], visible: false }} z={{ domain: [-1, 1], visible: false }}>
      <Image data={textures.yellow} lit />
    </Frame>
    <!-- A ring from radius 1 to 2 in a polar Frame whose size, 20, is the ring's outer diameter. -->
    <Frame name="Ring" coordinates="polar" angleUnit="degrees" baseRadius={0}
      x={{ domain: [0, 360], visible: false }} y={{ domain: [0, 2], visible: false }} z={{ visible: false }}
      placement={{ anchor: [25, -20, 0], size: [20, 20, 20] }}>
      <Image data={textures.ring} xbounds={[0, 360]} ybounds={[1, 2]} />
    </Frame>
    <!-- A bare Frame (a point and a label): its box shows only with its axes. It moves with the
         globe above it. -->
    <Frame name="Bare" placement={{ anchor: [x, -20, 0], size: [20, 20, 20] }}
      x={{ domain: [-1, 1], visible: boxShown }} y={{ domain: [-1, 1], visible: boxShown }} z={{ domain: [-1, 1], visible: boxShown }}>
      <Points position={[[0, 0, 0]]} size={3} fill="#ff00ff" />
      <Text position={[[0, 0.4, 0]]} text={["Bare"]} size={12} color="#ff00ff" />
    </Frame>
  </Plot>
{/if}
