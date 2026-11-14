const n=`<script>
  import { Plot, GeoJSON } from "hmplot";
  const polygon = (value, ring) => ({
    type: "Feature",
    properties: { value },
    geometry: { type: "Polygon", coordinates: [ring] },
  });
  const regions = {
    type: "FeatureCollection",
    features: [
      polygon(1, [[-120, 20], [-70, 20], [-70, 55], [-120, 55], [-120, 20]]),
      polygon(2, [[-10, 35], [40, 35], [40, 65], [-10, 65], [-10, 35]]),
      polygon(3, [[110, -40], [155, -40], [130, -10], [110, -40]]),
    ],
  };
<\/script>

<Plot coordinates="spherical" projection="mercator" height={300}>
  <GeoJSON data={regions} fill="value" />
</Plot>
`;export{n as default};
