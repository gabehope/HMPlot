<script>
  import { Plot, Image } from "hmplot";
  // Two rows of three RGB pixels, 0 to 1.
  const pixels = [
    [[0.9, 0.3, 0.2], [0.95, 0.75, 0.2], [0.3, 0.7, 0.4]],
    [[0.2, 0.5, 0.8], [0.5, 0.3, 0.7], [0.9, 0.9, 0.9]],
  ];
</script>

<Plot height={300}>
  <Image data={pixels} pixelated />
</Plot>
