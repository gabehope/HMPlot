<script>
  import { Data, Interaction, Plot, Points, Filter, selection } from "hmplot";
  const data = { x: [1, 2, 3, 4], y: [3, 1, 4, 2] };
  // Clicked points join the selection; Interaction names it @focus, a column the Filter reads.
  const focus = selection();
</script>

<Data value={data}>
  <Interaction columns={{ "@focus": focus }}>
    <Plot height={300} axes2d>
      <Points x="x" y="y" select={focus} size={4} />
      <!-- The Interaction names the selection's column: a Filter reads it. -->
      <Filter where="@focus" inactive="none">
        <Points x="x" y="y" size={8} fill="#e0245e" />
      </Filter>
    </Plot>
  </Interaction>
</Data>
