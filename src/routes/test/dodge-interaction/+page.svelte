<script>
  import { onMount } from "svelte";
  import { Plot, Dodge, Interaction, Points } from "$lib/index";
  const data = { x: [6, 6, 6], y: [5, 5, 5] };
  const common = {
    width: 320,
    height: 240,
    responsive: false,
    axes2d: false,
    background: "white",
    x: { domain: [0, 10] },
    y: { domain: [0, 10] },
  };
  const plots = $state({});
  onMount(() => {
    window.dodgeInteraction = plots;
    return () => delete window.dodgeInteraction;
  });
</script>

<Plot bind:this={plots.dodge} {...common} {data}>
  <!-- axis="auto" (along y for a numeric x), the Points taking the offsets without dy. -->
  <Dodge x="x" as="lift" padding={10}
    ><Points x="x" y="y" size={6} fill="#e4572e" /></Dodge
  >
</Plot>
<Plot bind:this={plots.inner} {...common} {data}>
  <Dodge x="x" axis="y" as="lift" padding={10}
    ><Interaction
      ><Points x="x" y="y" dy="lift" size={6} fill="#e4572e" /></Interaction
    ></Dodge
  >
</Plot>
