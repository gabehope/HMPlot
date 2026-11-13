<script>
  import { Plot, Group, sum } from "hmplot";
import { Bar } from "hmplot/charts";
  const data = {
    fruit: ["apple", "pear", "apple", "plum", "pear", "apple"],
    amount: [3, 5, 2, 4, 1, 6],
  };
</script>

<Plot {data} height={300} axes2d>
  <Group by="fruit" columns={{ total: sum("amount") }}>
    <Bar x="fruit" y="total" />
  </Group>
</Plot>
