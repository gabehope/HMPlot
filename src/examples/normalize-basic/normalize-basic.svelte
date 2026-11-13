<script>
  import { Plot, Line } from "hmplot";
import { Normalize } from "hmplot/stats";
  const data = {
    day: [1, 2, 3, 4, 1, 2, 3, 4],
    stock: ["A", "A", "A", "A", "B", "B", "B", "B"],
    price: [10, 12, 11, 14, 50, 52, 57, 60],
  };
</script>

<Plot {data} height={300} axes2d>
  <Normalize field="price" method="first" by="stock">
    <Line x="day" y="normalized" series="stock" />
  </Normalize>
</Plot>
