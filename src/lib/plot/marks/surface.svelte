<script lang="ts">
  import { useViewServices } from "../utils/viewServices.js";
  import { markComponent } from "../utils/markComponent.svelte.js";
  import { T, useThrelte } from "@threlte/core";
  import { ensureHeatmapOptions } from "../objects/defaultOptions.js";
  import { Surface as SurfaceObject } from "../objects/surface.js";
  import { readArrays } from "../utils/surfaceMesh.js";
  import type { MarkProps } from "../publicTypes.js";
  let {
    height = undefined,
    x = undefined,
    y = undefined,
    position = undefined,
    indices = undefined,
    fill = undefined,
    name = undefined,
    options = undefined,
    ...others
  }: MarkProps & Record<string, any> = $props();
  const { renderer, invalidate } = useThrelte();
  const viewServices = useViewServices();
  let version = 0;
  const component = markComponent("Surface", {
    name: () => name,
    setup: (parent) => ensureHeatmapOptions(parent),
    create: (local) => new SurfaceObject(local, viewServices, invalidate),
    display: (display) =>
      options ??
        display.filter(
          (k) =>
            ![
              "maxElements",
              "shape",
              "detail",
              "contour",
              "grid",
              "sizeAttenuation",
              "depthtest",
              "scaleTransform",
              "scaleBounds",
              "scaleRange",
            ].includes(k),
        ),
    populate: () => others,
    // A read still in flight is dropped.
    cleanup: () => version++,
  });
  const { mark, local } = component;
  $effect(() => {
    const id = ++version;
    if (local.get("coordinates") === "spherical") {
      mark.count = 0;
      invalidate();
      component.report(
        "Spherical surfaces require Heatmap or Image; the generic Surface mesh does not support spherical coordinates.");
      return;
    }
    readArrays({ height, x, y, position, indices, fill })
      .then((data) => {
        if (id !== version) return;
        mark.update(data);
        component.report();
      })
      .catch((error) => {
        if (id === version) {
          mark.count = 0;
          invalidate();
          component.report(error);
        }
      });
  });
  export const getLegendSource = () => mark.guideHandle;
  export const getMark = () => mark;
</script>

<T is={mark} {...component.events} />
