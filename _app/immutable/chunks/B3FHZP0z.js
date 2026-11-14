const t=`<script>
  import { Data, Filter, Plot, Points, Sort, TableView } from "hmplot";
  const cars = { model: ["Civic", "Corolla", "Golf", "Model 3", "Prius", "Mustang"],
    mpg: [36, 34, 31, 132, 52, 18], weight: [1250, 1300, 1350, 1610, 1380, 1700] };
<\/script>

<Data value={cars}>
  <Plot height={260} axes2d>
    <Points x="weight" y="mpg" brush />
  </Plot>
  <Filter where="@brushed" inactive="all">
    <Sort by="mpg" order="desc">
      <TableView columns={["model", { field: "mpg", format: ".0f" }]} limit={5} title="Most efficient" />
    </Sort>
  </Filter>
</Data>
`;export{t as default};
