<script>
  import { Plot, Points } from "$lib/index";
  let plot = $state();
  $effect(() => {
    window.stage14OrthographicGuides = { get plot() { return plot; } };
    return () => { delete window.stage14OrthographicGuides; };
  });
</script>

<Plot bind:this={plot} coordinates="spherical" projection="orthographic"
  angleUnit="custom" anglePeriod={24} axes2d width={440} height={440}
  x={{ step: 3, minor: true, minorStep: 1.5 }} y={{ step: 2 }}
  rules={[{ axis: "x", value: 3, label: "Meridian", color: "#a1423b", width: 2, dash: [5, 3] },
    { axis: "y", value: 2, label: "Parallel", color: "#3b60a1", width: 2 }]}>
  <Points position={[[0, 0]]} size={5} fill="#2468a0" />
</Plot>
