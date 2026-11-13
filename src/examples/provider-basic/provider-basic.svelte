<script>
  import { Plot, Points, Provider } from "hmplot";
</script>

<!-- Palmer penguins, from vega-datasets on a CDN that allows any page to fetch it. -->
<Provider url="https://cdn.jsdelivr.net/npm/vega-datasets@2/data/penguins.json" format="json">
  <Plot height={300} axes2d>
    <Points x="Beak Length (mm)" y="Beak Depth (mm)" />
  </Plot>
</Provider>
