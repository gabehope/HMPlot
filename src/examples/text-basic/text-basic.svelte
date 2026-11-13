<script>
  import { Plot, Text } from "hmplot";
  const data = { x: [1, 2, 3], y: [2, 3, 1], word: ["one", "two", "three"] };
</script>

<Plot {data} height={300} axes2d>
  <Text x="x" y="y" text="word" />
</Plot>
