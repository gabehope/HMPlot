<script lang="ts">
  // A copy of the hand-written Callout before it became a template (TODO 130.3), for parity.
  // A callout (TODO 46): text a fixed number of pixels (dx, dy) from its point, in a box, with a
  // leader line from the point to the box's nearest edge: a Text with a box and a leader. It
  // draws a callout per row when x, y, text, dx or dy read columns, else one
  // (rows="auto"). Its defaults follow the template's since TODO 134.29: no box, a halo.
  import { Text, ThemeDefaults } from "$lib/plot/composition.js";
  import type { CalloutProps } from "$lib/plot/publicTypes.js";
  let { x = undefined, y = undefined, text = undefined, dx = 24, dy = -24, box = false, leader = true, align = "auto",
    color = undefined, size = undefined, ...props }: CalloutProps = $props();
  // align="auto": each row's text sits on the side of the point it is offset to.
  const label = $derived({ x, y, text, dx, dy, align, box, leader, _halo: true, legend: false, rows: "auto" as const, ...props });
</script>

<ThemeDefaults kind="Callout" defaults={{ color: "#30343b", size: 12 }} values={{ color, size }} only={["color", "size", "opacity", "font"]}>
  <Text {...label} />
</ThemeDefaults>
