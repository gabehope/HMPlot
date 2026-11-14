const a=`<script>
  import { Plot, Shift, Line } from "hmplot";
  const data = { day: [0, 1, 2, 3, 4], value: [2, 4, 3, 6, 5] };
<\/script>
<Plot {data} height={300} x={{ label: "Day" }} y={{ label: "Value" }}>
  <Shift field="day" interval={1}>
    <Line x="original" y="value" color="#2468a0" name="original" />
    <Line x="shifted" y="value" color="#d34b37" name="shifted" />
  </Shift>
</Plot>
`;export{a as default};
