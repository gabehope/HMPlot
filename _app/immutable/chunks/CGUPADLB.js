const o=`<script>
  import { Plot, Points, continuous, normalization } from "hmplot";
  const data = {"x":[1,2,3,4,5,6],"y":[2,4,3,6,5,7],"group":["A","A","A","B","B","B"],"score":[10,25,40,60,75,95]};
  const norm = normalization({ domain: [0, 100] });
  // A custom colormap: a list of colors, interpolated in Lab (a name such as "Viridis" works too).
  const colors = continuous({ normalization: norm, colormap: ["#fdd49e", "#ef6548", "#7f0000"] });
  const sizes = continuous({ normalization: norm, range: [8, 22] });
<\/script>

<Plot {data} height={340} axes2d>
  <Points x="x" y="y" fill="score" size="score"
    fillScale={colors} sizeScale={sizes} />
</Plot>
`;export{o as default};
