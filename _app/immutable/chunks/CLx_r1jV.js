const n=`<script>
  import { Plot, Points } from "$lib";
  const data = {
    length: [4.9, 5.1, 5.8, 6.2, 6.7],
    width: [3.0, 3.5, 2.7, 3.0, 3.1],
    species: ["A", "A", "B", "B", "B"],
  };
  let { plot = $bindable() } = $props();
<\/script>

<Plot bind:this={plot} {data} responsive height={400} axes2d legend>
  <Points
    x="length"
    y="width"
    fill="species"
    size={4}
    label="Observations"
  />
</Plot>
`;export{n as default};
