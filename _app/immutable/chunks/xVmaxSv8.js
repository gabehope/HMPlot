const n=`<script>
  import { autoType, csvParse } from "d3";
  import { Legend, Plot, Points } from "hmplot";
  import csv from "./penguins.csv?raw";

  // Palmer penguins (CC0): https://allisonhorst.github.io/palmerpenguins/
  // Two penguins have no bill measurements: skip them.
  const penguins = csvParse(csv, autoType)
    .filter((p) => p.bill_length_mm !== null && p.bill_depth_mm !== null);
<\/script>

<Plot data={penguins} height={420} axes2d
  x={{ label: "Bill length (mm)", grid: "major" }} y={{ label: "Bill depth (mm)", grid: "major" }}>
  <Points x="bill_length_mm" y="bill_depth_mm" fill="species" opacity={0.75} />
  <Legend channel="fill" />
</Plot>
`;export{n as default};
