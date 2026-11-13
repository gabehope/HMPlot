<script>
  import {
    Plot,
    Frame,
    Points,
    categorical,
    datetimeCoordinates,
  } from "$lib";
  let { plot = $bindable() } = $props();
  const { values: coordinates, origin } = datetimeCoordinates([
    Date.UTC(2026, 0, 1),
    Date.UTC(2026, 0, 2),
    Date.UTC(2026, 0, 3),
  ]);
  const data = {
    time: coordinates,
    group: ["Control", "Treatment", "Control"],
  };
  const groups = categorical({ domain: ["Control", "Treatment"] });
</script>

<Plot bind:this={plot} {data} height={400} responsive>
  <Frame
    x={{ type: "datetime", origin, format: "%b %d", label: "Date" }}
    y={{ scale: groups, label: "Group" }}
  >
    <Points x="time" y="group" fill="group" size={5} />
  </Frame>
</Plot>
