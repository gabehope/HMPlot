<script>
  import { useThrelte } from '@threlte/core';
  import { onMount } from 'svelte';
  import { rendererActivityChanged } from '../rendering/viewSettlement.js';
  import { animationClock } from '../utils/animation.js';
  import { useViewServices } from '../utils/viewServices.js';
  let { register } = $props();
  const { renderStage, invalidate, renderer } = useThrelte();
  const view = useViewServices();
  onMount(() => register({
    hold: () => { view.lifecycle.renderHeld = true; rendererActivityChanged(view); renderStage.stop(); },
    release: () => { view.lifecycle.renderHeld = false; renderStage.start(); invalidate(); animationClock(renderer).schedule(); }
  }));
</script>
