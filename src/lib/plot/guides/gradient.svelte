<script>
  import { onDestroy } from "svelte";
  import { reportDataError } from "../utils/dataErrors.js";
  import {
    Scene,
    Mesh,
    PlaneGeometry,
    MeshBasicNodeMaterial,
  } from "three/webgpu";
  import { uv, uniform } from "three/tsl";
  import { applyColorMapNode } from "../../threeExtensions/materials/materials.js";
  import { MinimapGPU } from "../utils/minimapGPU.js";
  import { fitOverview } from "../utils/minimapMath.js";
  import { exportPixels } from "../utils/exportPixels.js";
  import { colormapAt } from "../../threeExtensions/materials/colormaps.js";
  import { colormapStops, colormapColor } from "../utils/colormap.js";
  let {
    mark,
    vertical = false,
    width = 24,
    height = 160,
    revision = 0,
    flatValue = undefined,
  } = $props();
  let canvas = $state(),
    gpu,
    mesh,
    lastKey,
    owner;
  // This colorbar's error on its plot, cleared when it next draws or unmounts (TODO 32.5).
  const errorOwner = {};
  let reportedTo = null;
  function dispose() {
    gpu?.dispose();
    mesh?.geometry.dispose();
    mesh?.material.dispose();
    gpu = mesh = null;
  }
  $effect(() => {
    revision;
    const current = mark;
    if (!canvas || !current) return;
    const o = current.options,
      cmap = o.getTransformed("cmapIndex"),
      levels = o.get("levels"),
      range = o.get("valueRange") ?? [0, 1],
      quantize = o.get("quantize");
    const key = JSON.stringify([
      cmap,
      levels,
      range,
      quantize,
      flatValue,
      vertical,
      width,
      height,
    ]);
    if (owner && owner !== current) {
      dispose();
      lastKey = null;
    }
    owner = current;
    if (key === lastKey) return;
    let active = true;
    Promise.resolve(current.manager.chain)
      .then(() => {
        if (!active || current.isDisposed) return;
        if (!gpu) {
          gpu = new MinimapGPU(current.renderer, canvas);
          mesh = new Mesh(new PlaneGeometry(2, 2), new MeshBasicNodeMaterial());
          gpu.legendScene = new Scene();
          gpu.legendScene.add(mesh);
        }
        const node = (
          flatValue === undefined
            ? vertical
              ? uv().y
              : uv().x
            : uniform(flatValue)
        )
          .mul(range[1] - range[0])
          .add(range[0]);
        mesh.material.colorNode = applyColorMapNode({
          valueNode: node,
          cmapIndexNode: uniform(cmap),
          levelsNode: uniform(levels),
          quantize,
        });
        mesh.material.needsUpdate = true;
        lastKey = key;
        gpu.render(
          gpu.legendScene,
          fitOverview(width, height, [-1, 1], [-1, 1], true),
          1,
          null,
        );
        reportDataError(current.view, errorOwner, "");
        reportedTo = current.view;
      })
      .catch((e) => {
        if (active && !current.isDisposed)
          reportDataError((reportedTo = current.view), errorOwner, `Colorbar: ${e.message}`);
      });
    return () => {
      active = false;
    };
  });
  $effect(() => {
    if (!canvas) return;
    canvas.guidePNG = async () => {
      if (!gpu) return null;
      const w = gpu.colorTarget.width,
        h = gpu.colorTarget.height,
        bytes = await exportPixels(
          mark.renderer,
          gpu.colorTarget.texture,
          w,
          h,
        );
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d").putImageData(new ImageData(bytes, w, h), 0, 0);
      return c.toDataURL();
    };
    // Documents draw colorbars as vector gradients from the same colormap samples.
    canvas.guideGradient = () => {
      const o = mark?.options;
      if (!o) return null;
      const name = colormapAt(o.getTransformed("cmapIndex")),
        config = { range: o.get("valueRange") ?? [0, 1], quantize: !!o.get("quantize"), levels: o.get("levels") ?? 10 };
      const stops = flatValue === undefined ? colormapStops(name, config)
        : [{ offset: 0, color: colormapColor(name, flatValue, config) }, { offset: 1, color: colormapColor(name, flatValue, config) }];
      return { vertical, stops };
    };
    return () => {
      delete canvas.guidePNG;
      delete canvas.guideGradient;
    };
  });
  onDestroy(() => {
    dispose();
    reportDataError(reportedTo, errorOwner, "");
  });
</script>

<canvas
  bind:this={canvas}
  style:width={`${width}px`}
  style:height={`${height}px`}
  aria-hidden="true"
></canvas>
