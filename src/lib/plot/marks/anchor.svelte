<script lang="ts">
  import { useViewServices } from "../utils/viewServices.js";
  import { markComponent } from "../utils/markComponent.svelte.js";
  import { updateFields } from "../utils/data.js";
  import { trackPreparation } from '../rendering/viewSettlement.js';
  import { useThrelte } from "@threlte/core";
  import { Anchor } from "../objects/anchor.js";
  import { ensureAnchorOptions } from "../objects/defaultOptions.js";

  // The raw Anchor: positions only. Appearance props a Mapping or theme might pass are ignored.
  let {
    position = undefined,
    name = undefined,
    options = undefined,
    ...others
  }: { position?: any; name?: string; options?: string[]; [key: string]: any } = $props();
  const { renderer, invalidate } = useThrelte();
  const viewServices = useViewServices();
  // A settings-tree node like every mark's, labelled by name or "Anchor N". Animation settings
  // (and a keyed lifecycle's staging frames) arrive as props and pass through.
  const { mark } = markComponent("Anchor", {
    name: () => name,
    setup: (parent) => ensureAnchorOptions(parent),
    create: (local) => new Anchor(local, viewServices, invalidate),
    display: (defaults) => (options === undefined ? defaults : options),
    populate: () => others,
  });
  $effect(() => {
    trackPreparation(viewServices, updateFields(mark, { position }));
  });
  export const getMark = () => mark;
  export const getLegendSource = () => undefined;
</script>
