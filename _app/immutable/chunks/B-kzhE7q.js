const e=`<script>
  import { untrack } from "svelte";
  import { Data, Plot, Image, gridTable } from "$lib";
  let { onready = () => {} } = $props();
  let plot = $state();
  $effect(() => { if (plot) untrack(() => onready(plot)); });
  // A made-up satellite scene: three bands' reflectances (0-255) on a 160 x 120 grid of 30 m
  // pixels, water in a river valley, fields and forest on the slopes.
  const y = Array.from({ length: 120 }, (_, i) => i * 30), x = Array.from({ length: 160 }, (_, i) => i * 30);
  const [red, green, blue] = [0, 1, 2].map(() => new Uint8Array(x.length * y.length));
  let at = 0;
  for (const row of y) for (const column of x) {
    const valley = Math.abs(row - 1800 - 500 * Math.sin(column / 900)), field = (Math.floor(column / 600) + Math.floor(row / 450)) % 3;
    const [r, g, b] = valley < 120 ? [30, 70, 120] : valley < 700 ? [[120, 150, 80], [170, 160, 110], [90, 120, 60]][field] : [50, 90, 45];
    const noise = Math.sin(column * 0.13) * Math.cos(row * 0.11) * 12;
    red[at] = r + noise; green[at] = g + noise; blue[at] = b + noise / 2; at++;
  }
  const scene = gridTable({ dims: { y, x }, columns: { B04: red, B03: green, B02: blue } });
<\/script>

<p>
  An Image's color is fill, as every mark's RGB channel is: here three band columns of a grid table
  (red, green and blue, integers 0-255) are the image. The grid's coordinates place it, in meters.
</p>
<Data value={scene}>
  <Plot bind:this={plot} responsive height={380} axes2d x={{ label: "easting (m)" }} y={{ label: "northing (m)" }}>
    <Image fill={{ r: "B04", g: "B03", b: "B02" }} />
  </Plot>
</Data>
`;export{e as default};
