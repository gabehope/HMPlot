const t=`<script>
  import { Plot } from "hmplot";
  import { IntervalTimeline } from "hmplot/charts";
  const at = n => new Date(Date.UTC(2024, 9, 1 + n));
  const data = { task: ["Design", "Build", "Review"], start: [at(0), at(2), at(6)], end: [at(3), at(7), at(9)],
    milestone: [at(2), null, at(8)] };
<\/script>

<Plot {data} height={280} axes2d x={{ label: "Date", type: "datetime", origin: at(0) }}>
  <IntervalTimeline y="task" x0="start" x1="end" milestone="milestone"
    milestones={{ fill: "#20252b" }} />
</Plot>
`;export{t as default};
