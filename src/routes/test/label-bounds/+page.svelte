<script>
  import { Plot, Frame, Facet, Points, Text } from "$lib/index";
  import { onMount } from "svelte";
  const scene = new URLSearchParams(typeof location === "undefined" ? "" : location.search).get("case") ?? "root";
  const plots = $state({}), marks = $state({});
  let width = $state(480), height = $state(320), size = $state(24), dx = $state(0), dy = $state(-24),
    align = $state("center"), box = $state(false), explicit = $state(false), inverted = $state(false),
    masked = $state(true), labels = $state(true), transform = $state("linear");
  const data = { x:[1,100], y:[1,100], name:["Wide lower label", "Wide upper label"] };
  const axis = $derived({ ...(explicit ? {domain:[1,100]} : {}), invert:inverted, transform, grid:"off" });
  onMount(() => {
    window.labelBounds = { plots, marks, set(values) {
      if ("width" in values) width=values.width;
      if ("height" in values) height=values.height;
      if ("size" in values) size=values.size;
      if ("dx" in values) dx=values.dx;
      if ("dy" in values) dy=values.dy;
      if ("align" in values) align=values.align;
      if ("box" in values) box=values.box;
      if ("explicit" in values) explicit=values.explicit;
      if ("inverted" in values) inverted=values.inverted;
      if ("masked" in values) masked=values.masked;
      if ("labels" in values) labels=values.labels;
      if ("transform" in values) transform=values.transform;
    }, async settle() { await Promise.all(Object.values(plots).map(plot => plot.whenSettled())); } };
    return () => { delete window.labelBounds; };
  });
</script>

<!-- Pinned margins: the labels' domains are fitted to the area's pixels, compared across steps. -->
<Plot bind:this={plots.root} data={scene === "facet" ? {group:["A","A","B","B"],x:[1,100,1,100],y:[1,100,1,100],name:[...data.name,...data.name]} : data}
  {width} {height} axisMarginLeft={80} axisMarginRight={24} axisMarginTop={24} axisMarginBottom={64} responsive={false} toneMapping={0} background="transparent" axisMask={scene === "placed" ? false : masked}
  x={scene === "nested" || scene === "placed" ? {domain:[0,10],grid:"off"} : scene === "facet" ? {grid:"off"} : axis}
  y={scene === "nested" || scene === "placed" ? {domain:[0,10],grid:"off"} : scene === "facet" ? {grid:"off"} : axis}>
  {#snippet content()}
    {#if scene !== "cache"}<Points x="x" y="y" size={5} fill="#e88828" legend={false}/>{/if}
    {#if labels}<Text bind:this={marks.text} x="x" y="y" text="name" color="#9d13b5" legend={false}
      {size} {dx} {dy} {align} box={box ? {padding:8,fill:"#df9aee",outlineWidth:2} : false} leader={box}/>{/if}
  {/snippet}
  {#if scene === "nested"}
    <Frame x={{domain:"auto",range:[1,9],...axis}} y={{domain:"auto",range:[1,9],...axis}} axisMask={masked}>
      {@render content()}
    </Frame>
  {:else if scene === "placed"}
    <Frame x={{domain:"auto",...axis}} y={{domain:"auto",...axis}} axisMask={masked}
      placement={{anchor:[5,5],size:[340,190],rotation:[0,0,25]}}>
      {@render content()}
    </Frame>
  {:else if scene === "facet"}
    <Facet column="group">{@render content()}</Facet>
  {:else}
    {@render content()}
  {/if}
</Plot>
