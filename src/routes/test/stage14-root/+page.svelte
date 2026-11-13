<script>
  import { flushSync } from "svelte";
  import { Plot, Frame, Points, Data } from "$lib/index";
  const data = { x: [10, 50, 90], y: [20, 50, 80] };
  let plot = $state(), root = $state(), points = $state();
  let outside = $state(false), sibling = $state(false), ranged = $state(false);
  let nestedOverride = $state(false), mounted = $state(true);
  $effect(() => {
    window.stage14Root = {
      get plot() { return plot; }, get root() { return root; }, get points() { return points; },
      outside(value) { outside = value; },
      unmountWithQueuedRoot() {
        flushSync(() => { outside = true; });
        flushSync(() => { mounted = false; });
      },
      supersedeRoot() {
        // Each synchronous flush queues its own publication task. The second
        // selection must cancel the first before either task can activate it.
        flushSync(() => { outside = true; });
        flushSync(() => { outside = false; });
      },
      sibling(value) { sibling = value; },
      ranged(value) { ranged = value; },
      nestedOverride(value) { nestedOverride = value; },
    };
    return () => { delete window.stage14Root; };
  });
</script>

{#if mounted}
<Plot bind:this={plot} {data} width={600} height={400} axes2d>
  <Data value={data}>
    <Frame bind:this={root} name="root" x={ranged ? { domain: [0, 100], range: [10, 90] } : { domain: [0, 100] }} y={{ domain: [0, 100] }}>
      <Points bind:this={points} x="x" y="y" size={6} fill="#2468a0" brush />
      <Frame name="nested" coordinates={nestedOverride ? "spherical" : undefined} y={{ domain: [0, 100] }}>
        <Points x="x" y="y" size={3} fill="#bb5522" />
      </Frame>
    </Frame>
  </Data>
  {#if outside}<Points x="x" y="y" size={4} fill="#2a8753" />{/if}
  {#if sibling}
    <Frame name="sibling" x={{ domain: [0, 100] }} y={{ domain: [0, 100] }}>
      <Points x="x" y="y" size={2.5} />
    </Frame>
  {/if}
</Plot>
{/if}
