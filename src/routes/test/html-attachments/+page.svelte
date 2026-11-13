<script>
  import { onMount } from "svelte";
  import { Plot, Frame, Data, Points, Html } from "$lib/index";
  import { inspect } from "$lib/check";
  let plot = $state(),
    frame = $state(),
    x = $state(5),
    count = $state(0),
    shown = $state(true);
  let upper = $state(10),
    width = $state(600);
  let invalid = $state(false);
  let ownData = $state(false);
  let animate = $state(false),
    mounted = $state(true),
    keys = $state([]);
  onMount(() => {
    window.htmlTest = {
      get plot() {
        return plot;
      },
      get frame() {
        return frame;
      },
      inspect,
      move: (value) => (x = value),
      domain: (value) => (upper = value),
      resize: (value) => (width = value),
      remove: () => (shown = false),
      remount: () => (ownData = !ownData),
      invalid: (value) => (invalid = value),
      animate: () => (animate = true),
      keys: (value) => (keys = value),
      unmount: () => (mounted = false),
    };
    return () => delete window.htmlTest;
  });
</script>

<input aria-label="Outside plot" />
{#if mounted}<Plot
    bind:this={plot}
    data={ownData ? { value: [1] } : undefined}
    {width}
    height={400}
    responsive={false}
    x={{ domain: [0, 10] }}
    y={{ domain: [0, 10] }}
  >
    <Frame
      bind:this={frame}
      x={{ domain: [0, upper], range: [2, 8] }}
      y={{ domain: [0, 10], range: [2, 8] }}
      axisMask
      animateBounds={animate}
      boundsDuration={500}
    >
      <Points {x} y={5} size={14} fill="#f00000" />
      {#if invalid}<Data value={{ value: [] }}><Points x="value" y={1} /></Data
        >{/if}
      {#if shown}<Html {x} y={5} dx={10} dy={10}>
          <button onclick={() => count++}>Attached {count}</button>
        </Html>{/if}
      {#each keys as key (key)}
        <Html x={3} y={key === "A" ? 3 : 7}><button>Key {key}</button></Html>
      {/each}
    </Frame>
  </Plot>{/if}
