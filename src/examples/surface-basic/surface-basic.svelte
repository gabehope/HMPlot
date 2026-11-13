<script>
  import { Plot, Surface } from "hmplot";
  // A smooth bump on a 41 x 41 grid: a Surface draws the grid it is given, one vertex per value.
  const n = 41;
  const height = Array.from({ length: n }, (_, j) =>
    Array.from({ length: n }, (_, i) => {
      const x = (2 * i) / (n - 1) - 1, y = (2 * j) / (n - 1) - 1;
      return Math.exp(-3 * (x * x + y * y));
    }),
  );
</script>

<Plot type="3d" height={300} axes3d>
  <Surface {height} />
</Plot>
