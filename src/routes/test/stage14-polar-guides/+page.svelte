<script>
  import { Plot, Points } from "$lib/index";
  let plot = $state(), period = $state(24);
  $effect(() => {
    window.stage14PolarGuides = { get plot() { return plot; }, setPeriod(value) { period = value; } };
    return () => { delete window.stage14PolarGuides; };
  });
</script>

<Plot bind:this={plot} coordinates="polar" angleUnit="custom" anglePeriod={period}
  axes2d width={400} height={400} x={{ domain: [0, 24], step: 6 }}
  y={{ domain: [0, 3], step: 1 }}
  rules={[{ axis: "x", value: 6, label: "Quarter", color: "#a1423b", width: 2, dash: [5, 3] },
    { axis: "y", value: 2, label: "Orbit", color: "#3b60a1", width: 2 }]}>
  <Points position={[[0, 1]]} size={5} fill="#2468a0" />
</Plot>
