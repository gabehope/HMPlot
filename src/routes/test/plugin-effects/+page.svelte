<script>
  // TODO 138.3: a plugin's effect. The docs' vignette darkens a white plot's edges; `late` names
  // an effect its plugin registers only when the spec asks (window.pluginEffects.registerLate).
  import { onMount } from "svelte";
  import { Plot, Rect, Data, definePlugin, registerPlugin } from "$lib/index";

  /** The docs' vignette (reference/plugins.svx), under `kind`. */
  const vignette = (kind) => definePlugin({
    name: kind,
    apiVersion: 1,
    setup(hm) {
      const { float, mix } = hm.tsl;
      hm.effect(kind, {
        stage: "display",
        parameters: {
          amount: { type: "number", default: 0.5, min: 0, max: 1 },
          color: { type: "color", default: "#000000" },
        },
        display({ rgb, alpha, uv, params }) {
          const edge = uv.sub(0.5).length().mul(1.4).pow(2).mul(params.amount).clamp(0, 1);
          const covered = mix(alpha, float(1), edge);
          return { rgb: mix(rgb.mul(alpha), params.color, edge).div(covered.max(1e-6)), alpha: covered };
        },
      });
    },
  });
  registerPlugin(vignette("vignette"));

  let plots = $state({});
  let amount = $state(0.5), color = $state("#000000");
  const full = { x0: [0], x1: [10], y0: [0], y1: [10] };
  onMount(() => {
    window.pluginEffects = {
      get plots() { return plots; },
      set: (values) => { amount = values.amount ?? amount; color = values.color ?? color; },
      registerLate: () => registerPlugin(vignette("late-vignette")),
    };
    return () => { delete window.pluginEffects; };
  });
</script>

{#each [["main", "vignette"], ["late", "late-vignette"]] as [name, kind]}
  <Plot bind:this={plots[name]} width={300} height={200} axes2d={false} toneMapping={0} background="#ffffff"
    x={{ domain: [0, 10] }} y={{ domain: [0, 10] }} effects={[{ kind, amount, color }]}>
    <Data value={full}><Rect x0="x0" x1="x1" y0="y0" y1="y1" fill="#ffffff" /></Data>
  </Plot>
{/each}
