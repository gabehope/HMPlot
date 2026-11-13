<script>
  import { onMount } from "svelte";
  import { Plot, Points } from "$lib";
  import { PortableTemplate } from "$lib/templates";
  import trend from "./trend.hmplot.json";
  import computed from "./compute.hmplot.json";

  const data = { day: [0, 1, 2], value: [0, 1, 2], other: [2, 1, 0] };
  let plot, secondY = $state("other"), clicks = $state(0);
  onMount(() => {
    window.portableTemplate = { get plot() { return plot; }, setSecondY(value) { secondY = value; }, get clicks() { return clicks; } };
  });
</script>

<Plot bind:this={plot} {data} width={480} height={320} axes2d settings={{ showTrigger: false }}>
  <PortableTemplate definition={trend} params={{ x: "day", y: "value" }}
    events={{ series: { click: () => clicks++ } }}>
    <Points x="day" y="value" fill="#13bd4e" size={12} />
  </PortableTemplate>
  <PortableTemplate definition={trend} params={{ x: "day", y: secondY, color: "#d34b37" }} />
  <PortableTemplate definition={computed} params={{ scale: 1 }} />
</Plot>
