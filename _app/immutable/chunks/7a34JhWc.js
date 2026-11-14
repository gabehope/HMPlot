const t=`<script>
  import { Plot, Join, Points } from "hmplot";
  const data = { station: ["A", "B", "C", "A", "B", "C"], temperature: [12, 15, 9, 14, 16, 10] };
  const stations = { station: ["A", "B", "C"], altitude: [200, 50, 900] };
<\/script>

<Plot {data} height={300} axes2d>
  <Join data={stations} on="station">
    <Points x="altitude" y="temperature" />
  </Join>
</Plot>
`;export{t as default};
