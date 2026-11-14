const o=`<script>
  import { Plot, Line, categorical } from "hmplot";
  import { EndLabels } from "hmplot/charts";
  const data = {
    year: [2019, 2020, 2021, 2022, 2019, 2020, 2021, 2022, 2019, 2020, 2021, 2022],
    index: [100, 104, 111, 118, 100, 97, 103, 109, 100, 101, 99, 102],
    fund: ["Growth", "Growth", "Growth", "Growth", "Value", "Value", "Value", "Value", "Bonds", "Bonds", "Bonds", "Bonds"],
  };
  const colors = categorical({ domain: ["Growth", "Value", "Bonds"], range: ["#3477b4", "#df7253", "#52997a"] });
<\/script>

<Plot {data} height={260} legend={false}>
  <Line x="year" y="index" series="fund" color="fund" colorScale={colors} />
  <EndLabels x="year" y="index" series="fund" color="fund" colorScale={colors} />
</Plot>
`;export{o as default};
