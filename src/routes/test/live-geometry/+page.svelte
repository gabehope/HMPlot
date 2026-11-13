<script>
  import { onMount } from "svelte";
  import { Plot, Calculate, Filter, Rect, Text, tween, animate, add, multiply, literal, col, equal, categorical } from "$lib/index";
  let rows = $state.raw({ id: [0], value: [2], group: ["#d63c32"] });
  const timing = { duration: 1000, easing: "linear" };
  const colors = ["#d63c32", "#315dd8"];
  let target = $state(1), opacity = $state(1), title = $state("Original");
  let plot = $state(), rectangle = $state(), caption = $state();
  onMount(() => {
    window.liveGeometry = {
      get plot() { return plot; }, get rectangle() { return rectangle; }, get caption() { return caption; },
      move: () => { target = 3; opacity = 0.2; rows = { ...rows, group: ["#315dd8"] }; },
      reverse: () => { target = 1; opacity = 1; rows = { ...rows, group: ["#d63c32"] }; },
      rename: () => { title = "Changed"; },
    };
    return () => { delete window.liveGeometry; };
  });
</script>

<Plot bind:this={plot} data={rows} key="id" width={480} height={320}
  x={{ padding: 0 }} y={{ padding: 0 }} theme="minimal" legend={false}>
  <Calculate columns={{ moving: tween(multiply("value", target), timing), unused: tween(multiply("value", target + 5), timing) }}>
    <Rect bind:this={rectangle} x0="moving" x1={multiply("moving", 2)} y0={0} y1={1}
      fill={animate("group", timing)}
      fillScale={categorical({ domain: colors, range: colors })} opacity={animate(add(multiply("id", 0), opacity), timing)}
      tooltip={["moving"]} respond={false} />
    <Filter where={equal(col.id, 0)}>
      <Text bind:this={caption} x={0} y={0} text={literal(title)} size={14} respond={false}
        opacity={animate(add(multiply("id", 0), opacity), timing)} fill="#252b36" />
    </Filter>
  </Calculate>
</Plot>
