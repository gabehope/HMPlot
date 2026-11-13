<script>
  import { untrack, tick } from "svelte";
  import Content from "./axisOverlayContent.svelte";
  import { snapshotAxisOptions } from "../utils/snapshotAxisOptions.js";
  import { onViewContext } from "../utils/viewContext.js";
  import { trackPreparation } from '../rendering/viewSettlement.js';
  // `view`: the view's services (its frames publish the axes, and its picking pass redraws with
  // them); `renderer`, once the view has one.
  let { renderer, view, ...props } = $props();
  let displayed = $state.raw(null);
  let latest, dirty = true, finish;
  const changed = () => {
    dirty = true;
    if (renderer && view.lifecycle.drawable && !finish) {
      trackPreparation(view, new Promise(resolve => { finish = resolve; }), undefined, { draw: true });
    }
    view?.picking.context.current?.invalidate?.();
  };
  $effect(() => {
    latest = { ...props };
    // Layout props can flush after the canvas draw that changed their options.
    // Request the completed frame that will publish those last ticks and titles.
    untrack(changed);
  });
  $effect(() => {
    const active = renderer ? view.lifecycle : undefined, options = props.options;
    const stops = [options.on(changed), options.child("plot").on(changed), onViewContext(options, changed)];
    const publish = () => untrack(() => {
      if (!dirty || !latest) return;
      dirty = false;
      // Keep axes from the completed canvas frame during uploads and refinement.
      displayed = { ...latest, options: snapshotAxisOptions(options) };
      const done = finish; finish = undefined;
      if (done) tick().then(done);
    });
    if (active) active.frameCallbacks.add(publish);
    else publish();
    return () => {
      stops.forEach(stop => stop()); active?.frameCallbacks.delete(publish);
      finish?.(); finish = undefined;
    };
  });
</script>

{#if displayed}<Content {...displayed} />{/if}
