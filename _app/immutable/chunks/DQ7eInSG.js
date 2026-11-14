const t=`<script>
  import { Plot, Points } from "hmplot";

  // 2,000 points on a noisy spiral; Shift-drag to brush them.
  const t = Array.from({ length: 2000 }, (_, i) => i / 100);
  const data = {
    x: t.map((v, i) => v * Math.cos(v) + Math.sin(i * 12.9898) * 0.6),
    y: t.map((v, i) => v * Math.sin(v) + Math.cos(i * 78.233) * 0.6),
    t,
  };
<\/script>

<Plot {data} axes2d height={380}>
  <Points x="x" y="y" fill="t" size={2} brush />
</Plot>
`;export{t as default};
