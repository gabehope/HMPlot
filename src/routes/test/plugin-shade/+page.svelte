<script>
  // TODO 138.3: a plugin's shade on marks. The docs' hatch stripes two blue points; `rim` reads
  // normals (an error on Points, drawn on Points3D); `wide` (?wide, alone: its pipeline is invalid
  // on the page's device) passes 16 values of its own between the stages, past what a shader may
  // (limit.varyings, naming the mark).
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { Plot, Points, Points3D, definePlugin, registerPlugin } from "$lib/index";

  registerPlugin(definePlugin({
    name: "hatch",
    apiVersion: 1,
    setup(hm) {
      const { fract, mix, step, vec4, float } = hm.tsl;
      // The docs' hatch (reference/plugins.svx): diagonal stripes of `ink`, `spacing` pixels apart.
      hm.shade("hatch", {
        parameters: {
          spacing: { type: "number", default: 8, min: 2 },
          width: { type: "number", default: 0.5, min: 0, max: 1 },
          ink: { type: "color", default: "#000000" },
        },
        shade({ color, screenCoordinate, params }) {
          const along = fract(screenCoordinate.x.add(screenCoordinate.y).div(params.spacing));
          return vec4(mix(color.rgb, params.ink, step(along, params.width)), color.a);
        },
      });
      // A rim light: brighter where the surface turns away from the camera.
      hm.shade("rim", {
        shade({ color, normalView }) {
          const rim = float(1).sub(normalView.z.abs()).pow(2);
          return vec4(color.rgb.add(rim), color.a);
        },
      });
      hm.shade("wide", {
        shade({ color }) {
          let sum = float(0);
          for (let i = 1; i <= 16; i++) sum = sum.add(hm.tsl.positionLocal.x.mul(i).toVarying(`vWide${i}`));
          return vec4(color.rgb.add(sum.mul(0)), color.a);
        },
      });
    },
  }));

  let plots = $state({}), marks = $state({});
  let spacing = $state(8), ink = $state("#ff0000"), shaded = $state(true);
  const common = { width: 300, height: 200, responsive: false, toneMapping: 0, axes2d: false, background: "#ffffff",
    x: { domain: [0, 10] }, y: { domain: [0, 10] } };
  onMount(() => {
    window.pluginShade = {
      get plots() { return plots; },
      get marks() { return marks; },
      set: (values) => { spacing = values.spacing ?? spacing; ink = values.ink ?? ink; shaded = values.shaded ?? shaded; },
    };
    return () => { delete window.pluginShade; };
  });
</script>

{#if page.url.searchParams.has("wide")}
<Plot bind:this={plots.wide} {...common}>
  <Points x={[5]} y={[5]} size={40} fill="#2060ff" shade={{ kind: "wide" }} />
</Plot>
{:else}
<Plot bind:this={plots.hatch} {...common}>
  <Points bind:this={marks.hatch} x={[2.5, 7.5]} y={[5, 5]} size={60} fill="#2060ff" select
    shade={shaded ? { kind: "hatch", spacing, ink } : null} />
</Plot>
<Plot bind:this={plots.rim} {...common}>
  <Points x={[5]} y={[5]} size={40} fill="#2060ff" shade={{ kind: "rim" }} />
</Plot>
<Plot bind:this={plots.hatch3d} {...common} type="3d" z={{ domain: [0, 10] }}>
  <Points x={[5]} y={[5]} z={[5]} size={40} fill="#2060ff" shade={{ kind: "hatch" }} />
</Plot>
<Plot bind:this={plots.rim3d} {...common} type="3d" z={{ domain: [0, 10] }}>
  <Points3D x={[5]} y={[5]} z={[5]} size={3} fill="#2060ff" shade={{ kind: "rim" }} />
</Plot>
{/if}
