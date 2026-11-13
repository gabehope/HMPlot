<script lang="ts">
  import { composition } from "$lib/compound";
  const { ErrorBars, Points, ThemeDefaults, minimum, maximum } = composition;
  let { x, y, baseline = 0, stemColor = "#8a949e", stemWidth = 1.5, size = 5, name, ...props } = $props();
  let head = $state<any>();
  export const getLegendSource = () => head?.getLegendSource();
  export const getMark = () => head?.getMark();
</script>

<ThemeDefaults kind="Lollipop">
  <ErrorBars name={name ? `${name} stems` : undefined} {x} {y}
    lower={minimum(baseline, y)} upper={maximum(baseline, y)} color={stemColor} width={stemWidth}
    capSize={0} legend={false} visible={props.visible} opacity={props.opacity} />
  <Points bind:this={head} {name} {x} {y} {size} {...props} />
</ThemeDefaults>
