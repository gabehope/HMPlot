<script>
  import { Plot, Frame, Points, Line } from "$lib/index";
  const params = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
  const scene = params.get("scene") ?? "cartesian";
  let plot = $state(), child = $state();
  // The child's data, and its range and domain (null: fit to its data).
  let points = $state([[1, 10], [3, 30]]);
  let xrange = $state([2, 6]), yrange = $state([2, 6]);
  let xdomain = $state(null), ydomain = $state(null);
  // The child draws its own axes, so its guides follow the same domain.
  const axis = (range, domain) => domain ? { range, domain } : { range };
  $effect(() => {
    window.stage14EmbeddedDomains = {
      get plot() { return plot; }, get child() { return child; }, scene,
      setPoints(value) { points = value; },
      setRange(x, y) { xrange = x; yrange = y; },
      setDomain(x, y) { xdomain = x; ydomain = y; },
    };
    return () => { delete window.stage14EmbeddedDomains; };
  });
</script>

{#if scene === "cartesian"}
  <!-- A ranged child in a Cartesian root, fitted to its own points. -->
  <Plot bind:this={plot} type="2d" width={400} height={400} axes2d={false}
    x={{ domain: [0, 10] }} y={{ domain: [0, 10] }}>
    <Frame bind:this={child} x={axis(xrange, xdomain)} y={axis(yrange, ydomain)}>
      <Points position={points} size={5} fill="#d02030" />
      <Line position={points} color="#2050d0" width={2} />
    </Frame>
  </Plot>
{:else if scene === "polar"}
  <!-- The same child in a polar root: x is the angle (period 24), y the radius. -->
  <Plot bind:this={plot} type="2d" width={400} height={400} axes2d={false}
    coordinates="polar" angleUnit="custom" anglePeriod={24}
    x={{ domain: [0, 24], visible: false }} y={{ domain: [0, 10], visible: false }}>
    <Frame bind:this={child} coordinates="cartesian" x={axis(xrange, xdomain)} y={axis(yrange, ydomain)}>
      <Points position={points} size={5} fill="#d02030" />
      <Line position={points} color="#2050d0" width={2} />
    </Frame>
  </Plot>
{:else if scene === "polar-show"}
  <Plot bind:this={plot} type="2d" width={400} height={400} axes2d={false}
    coordinates="polar" angleUnit="custom" anglePeriod={24}
    x={{ domain: [0, 24], visible: false }} y={{ domain: [0, 10], visible: false }}>
    <Frame bind:this={child} coordinates="cartesian" x={{ ...axis(xrange, xdomain), visible: true }} y={{ ...axis(yrange, ydomain), visible: true }}>
      <Points position={points} size={5} fill="#d02030" />
    </Frame>
  </Plot>
{:else if scene === "polar-axes"}
  <Plot bind:this={plot} type="2d" width={400} height={400}
    coordinates="polar" angleUnit="custom" anglePeriod={24}
    x={{ domain: [0, 24], visible: false }} y={{ domain: [0, 10], visible: false }}>
    <Frame bind:this={child} coordinates="cartesian" x={axis(xrange, xdomain)} y={axis(yrange, ydomain)}>
      <Points position={points} size={5} fill="#d02030" />
    </Frame>
  </Plot>
{/if}
