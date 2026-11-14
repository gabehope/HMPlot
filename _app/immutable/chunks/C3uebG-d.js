const t=`<script>
  import { Plot } from "hmplot";
  import { BulletChart } from "hmplot/charts";
  const data = { metric: ["Revenue", "Renewals"], actual: [65, 82], goal: [80, 90],
    poor: [50, 60], fair: [70, 80], good: [100, 100] };
<\/script>

<Plot {data} height={250} axes2d x={{ label: "Percent of plan" }}>
  <BulletChart x="actual" y="metric" target="goal" fields={["poor", "fair", "good"]}
    tick={{ fill: "#20252b" }} />
</Plot>
`;export{t as default};
