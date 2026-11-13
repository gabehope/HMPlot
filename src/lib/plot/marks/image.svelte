<script lang="ts">
  import Heatmap from './heatmap.svelte';
  import type { ImageProps } from '../publicTypes.js';
  // `lit` shades the image with the Plot's lights (a textured planet); by default it shows its
  // exact colors.
  let { data, name = 'Image', lit = false, ...props }: ImageProps & { data?: any } = $props();
  let mark=$state<any>();
  export const getLegendSource=()=>mark?.getLegendSource();
  export const getMark=()=>mark?.getMark();
</script>
<Heatmap bind:this={mark} {...props} {name} fill={data} image normalization="none" {lit} transparent={true} />
