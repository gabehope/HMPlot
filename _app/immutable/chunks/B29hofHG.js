const t=`<script>
  import { Data, Facet, Plot, Points } from "hmplot";

  // 40 observations of three measurements in two groups. Facet pairs draws every pair of fields
  // (cells mount as they come into view), with one domain per field on x and y; Shift-drag in a
  // cell to brush its two fields, and the brushed rows stay lit in every cell.
  const data = Array.from({ length: 40 }, (_, i) => ({
    length: i / 10,
    width: Math.sin(i * 0.4),
    height: Math.cos(i * 0.23) + i * 0.04,
    group: i % 2 ? "A" : "B",
  }));
<\/script>

<Data value={data}>
  <Facet pairs={["length", "width", "height"]} link="grid">
    <Plot height={240} axes2d>
      <Points x="x" y="y" fill="group" size={4} brush respond="brushed" />
    </Plot>
  </Facet>
</Data>
`;export{t as default};
