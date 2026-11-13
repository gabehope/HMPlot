<script lang="ts">
  import { useViewServices } from "../utils/viewServices.js";
  import { setOutlineColors } from "../objects/outlines.js";
  import { updateFields } from "../utils/data.js";
  import { trackPreparation } from '../rendering/viewSettlement.js';
  import { T, useThrelte } from "@threlte/core";
  const { renderer, invalidate } = useThrelte();
  const viewServices = useViewServices();
  import { markComponent } from "../utils/markComponent.svelte.js";
  import { ScatterSprite } from "../objects/scatter.js";
  import {
    configureMarkOptions,
    ensureScatterSpriteOptions,
  } from "../objects/defaultOptions.js";

  import type { PointsProps } from "../publicTypes.js";
  let {
    dx = 0,
    dy = 0,
    categoryColor = undefined,
    outlineWidth = undefined,
    outlineOpacity = undefined,
    categoryOutline = undefined,
    position = undefined,
    symbolCode = undefined,
    size = 6,
    fill = "#00ff00",
    name = undefined,
    zindex = 0,
    options = undefined,
    _interactionOpacity = undefined,
    ...others
  }: PointsProps & Record<string, any> = $props();

  const component = markComponent("Sprites", {
    name: () => name,
    setup: (parent) => ensureScatterSpriteOptions(parent),
    create: (local) => {
      // Flat symbols are specified in screen pixels in both 2D and 3D.
      local.set("sizeAttenuation", false);
      configureMarkOptions(local, "sprite");
      return new ScatterSprite(local, viewServices, invalidate);
    },
    display: (defaults) => (options === undefined ? defaults : options),
    populate: () => ({ ...others, ...(typeof outlineWidth === "number" ? { outlineWidth } : {}),
      ...(typeof outlineOpacity === "number" ? { outlineOpacity } : {}) }),
  });
  const mark = component.mark;

  $effect(() => {
    mark.fields.get("position")._stash = { zindex: zindex };
    if (mark.symbolCodeActive !== (symbolCode !== undefined)) {
      mark.symbolCodeActive = symbolCode !== undefined;
      mark.build();
    }
    mark.setCategoryColor(categoryColor !== undefined);
    setOutlineColors(mark, categoryOutline !== undefined);
    // fill="transparent": a hollow point that draws its outline alone (TODO 64).
    if ((mark.fillTransparent ?? false) !== (fill === "transparent")) {
      mark.fillTransparent = fill === "transparent";
      mark.build();
    }
    if (mark.categoryOutlineActive !== (categoryOutline !== undefined)) {
      mark.categoryOutlineActive = categoryOutline !== undefined;
      mark.build();
    }
    // A new size may cross the size above which the points blend their edges (ScatterSprite).
    trackPreparation(viewServices, Promise.resolve(updateFields(mark, {
      outlineWidth: outlineWidth ?? component.local.get("outlineWidth"),
      outlineOpacity: outlineOpacity ?? component.local.get("outlineOpacity"),
      position,
      size,
      fill,
      dx,
      dy,
      ...(_interactionOpacity === undefined ? {} : { interactionOpacity: _interactionOpacity }),
      ...(categoryColor === undefined ? {} : { categoryColor }),
      ...(categoryOutline === undefined ? {} : { categoryOutline }),
      ...(symbolCode === undefined ? {} : { symbolCode }),
    })).then((result) => { mark.refreshBlend(); return result; }));
  });

  export const getLegendSource = () => mark.guideHandle;
  export const getMark = () => mark;
</script>

<T is={mark} {...component.events} />
