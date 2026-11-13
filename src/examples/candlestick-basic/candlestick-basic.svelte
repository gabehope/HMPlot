<script>
  import { Plot, Legend } from "hmplot";
  import { Candlestick } from "hmplot/charts";
  const data = {
    day: [1, 2, 3, 4, 5, 6, 7, 8],
    open: [100, 103, 101, 106, 104, 108, 107, 111],
    high: [105, 106, 107, 109, 110, 112, 113, 114],
    low: [98, 99, 100, 102, 101, 105, 104, 108],
    close: [103, 101, 106, 104, 108, 107, 111, 113],
  };
</script>

<Plot {data} height={300} axes2d>
  <Candlestick x="day" open="open" high="high" low="low" close="close" />
  <Legend />
</Plot>
