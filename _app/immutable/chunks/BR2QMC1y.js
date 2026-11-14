const o=`<script>
  import { Plot, Line, Points } from "hmplot";
  const data = {"hour":[0,3,6,9,12,15,18,21,24],"activity":[1,0.6,1.4,2.4,2.8,2.5,2.2,1.6,1]};
<\/script>

<Plot {data} coordinates="polar" angleUnit="custom" anglePeriod={24}
  x={{domain:[0,24]}} y={{domain:[0,3]}} height={340} axes2d>
  <Line x="hour" y="activity" color="#547ba2" />
  <Points x="hour" y="activity" size={5} />
</Plot>
`;export{o as default};
