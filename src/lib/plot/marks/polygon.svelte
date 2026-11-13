<script lang="ts">
  import { useViewServices } from "../utils/viewServices.js";
  import { ensureOutlineOptions, setOutlineColors } from "../objects/outlines.js";
  import { markComponent } from "../utils/markComponent.svelte.js";
  import { updateFields } from "../utils/data.js";
  import { trackPreparation } from '../rendering/viewSettlement.js';
  import { T, useThrelte } from "@threlte/core";
  import { Triangles } from "../objects/triangles.js";
  import { ensurePolygonOptions } from "../objects/defaultOptions.js";
  const { renderer, invalidate } = useThrelte();
  const viewServices = useViewServices();
  // Polygon's primitive (TODO 47.4): a filled triangle per row, its corners start, end and
  // control1 (as Segments' positional channels, so axes, domains and picking treat them alike).
  let {
    start = undefined,
    end = undefined,
    control1 = undefined,
    edges = 0,
    fill = "#547ba2",
    categoryColor = undefined,
    categoryOutline = undefined,
    outlineWidth = undefined,
    outlineOpacity = undefined,
    name = undefined,
    options = undefined,
    _interactionOpacity = undefined,
    ...others
  }: any = $props();
  const component = markComponent("Polygon", {
    name: () => name,
    setup: (parent) => ensurePolygonOptions(parent),
    create: (local) => { ensureOutlineOptions(local); return new Triangles(local, viewServices, invalidate); },
    display: (defaults) => (options === undefined ? defaults : options),
    populate: () => ({ ...others, ...(typeof outlineWidth === "number" ? { outlineWidth } : {}),
      ...(typeof outlineOpacity === "number" ? { outlineOpacity } : {}) }),
  });
  const mark = component.mark;
  $effect(() => {
    mark.setCategoryColor(categoryColor !== undefined);
    setOutlineColors(mark, categoryOutline !== undefined);
    trackPreparation(viewServices, updateFields(mark, {
      outlineWidth: outlineWidth ?? component.local.get("outlineWidth"),
      outlineOpacity: outlineOpacity ?? component.local.get("outlineOpacity"),
      ...(categoryOutline === undefined ? {} : { categoryOutline }),
      position: start, cornerB: end, cornerC: control1, edges, fill,
      ...(categoryColor === undefined ? {} : { categoryColor }),
      ...(_interactionOpacity === undefined ? {} : { interactionOpacity: _interactionOpacity }),
    }, "position"));
  });
  export const getLegendSource = () => mark.guideHandle;
  export const getMark = () => mark;
</script>

<T is={mark} {...component.events} />
