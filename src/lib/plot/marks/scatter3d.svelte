<script lang="ts">
  import { useViewServices } from "../utils/viewServices.js";
  import { markComponent } from "../utils/markComponent.svelte.js";
  import { updateFields } from "../utils/data.js";
  import { trackPreparation } from '../rendering/viewSettlement.js';
  import { T, useThrelte } from "@threlte/core";
  const { renderer, invalidate } = useThrelte();
  const viewServices = useViewServices();
  import { Points3D } from "../objects/scatter3d.js";
  import {
    configureMarkOptions,
    ensureScatter3DOptions,
    ensurePointOptions,
  } from "../objects/defaultOptions.js";

  import type { Points3DProps } from "../publicTypes.js";
  let {
    categoryColor = undefined,
    position = undefined,
    size = 4,
    fill = "#00ff00",
    name = undefined,
    options = undefined,
    _interactionOpacity = undefined,
    ...others
  }: Points3DProps & Record<string, any> = $props();

  const component = markComponent("Points 3D", {
    name: () => name,
    setup: (parent) => [...ensureScatter3DOptions(parent), ...ensurePointOptions(parent)],
    create: (local) => {
      configureMarkOptions(local, "scatter3d");
      return new Points3D(local, viewServices, invalidate);
    },
    display: (defaults) => (options === undefined ? defaults : options),
    populate: () => others,
  });

  const mark = component.mark;

  $effect(() => {
    mark.fields.get("position")._stash = { zindex: 0 };
    mark.setCategoryColor(categoryColor !== undefined);
    trackPreparation(viewServices, updateFields(mark, { position, size, fill, ...(_interactionOpacity===undefined?{}:{interactionOpacity:_interactionOpacity}), ...(categoryColor===undefined?{}:{categoryColor}) }));
  });

  export const getLegendSource = () => mark.guideHandle;
  export const getMark = () => mark;
</script>

<T is={mark} {...component.events} />
