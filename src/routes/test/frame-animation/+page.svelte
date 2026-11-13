<script>
  import { Plot, Frame, Points } from "$lib/index";
  let plot = $state(), frame = $state(), inherited = $state(), points = $state();
  let config = $state({ maximum: 100, range: [10, 40], yMaximum: 10 });
  let enabled = $state(true), shown = $state(true), picked = $state(0);
  $effect(() => {
    if (!plot) return;
    window.frameAnimation = { plot, frame, inherited, points,
      change: next => config = { ...config, ...next }, enable: value => enabled = value,
      show: value => shown = value, picks: () => picked };
    return () => { delete window.frameAnimation; };
  });
</script>
<Plot bind:this={plot} width={600} height={420} data={{ x: [10], y: [5] }} axes2d
  x={{ domain: [0, 100] }} y={{ domain: [0, 100] }}>
  <Points x={99} y={99} size={1} fill="#888888" />
  {#if shown}
    <Frame bind:this={frame} name="Animated inset" animateBounds={enabled} boundsDuration={700} boundsEasing="linear"
      x={{ domain: [1, config.maximum], transform: "log", range: config.range }}
      y={{ domain: [0, config.yMaximum], range: [10, 90] }}>
      <Points bind:this={points} x="x" y="y" fill="#2358ca" size={12} onclick={() => picked++} />
      <Frame bind:this={inherited} name="Inherited dimensions">
        <Points x={5} y={4} fill="#d43735" size={6} />
      </Frame>
    </Frame>
  {/if}
</Plot>
