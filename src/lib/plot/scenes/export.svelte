<script>
  import { useViewServices } from "../utils/viewServices.js";
  import { animationClock, holdAnimation } from "../utils/animation.js";
  import { exportDocument } from "../utils/documentExport.js";
  import { exportPixels } from "../utils/exportPixels.js";
  import { embedDefaultFont } from "../utils/defaultFont.js";
  import { limitError } from "../utils/limits.js";
  import { useThrelte } from "@threlte/core";
  import { RenderTarget, UnsignedByteType } from "three/webgpu";
  import { onMount } from "svelte";
  // `label`: the plot's name for the export report's messages (its title, else its name).
  let { register, overlay, label = () => "The plot" } = $props();
  const { renderer, scene, camera } = useThrelte();
  const viewServices = useViewServices();
  let pending = false;
  onMount(() => {
    const exportPNG = async (scale = 1, includeOverlays = true, includeBackground = true) => {
      if (!Number.isFinite(scale) || scale < 0.1 || scale > 10)
        throw Error("PNG scale must be between 0.1 and 10.");
      if (pending) throw Error("An export is already in progress.");
      pending = true;
      const width = Math.max(1, Math.round(renderer.domElement.width * scale));
      const height = Math.max(1, Math.round(renderer.domElement.height * scale));
      const limits = renderer.backend.device.limits;
      const hint = "Reduce the export scale.";
      if (Math.max(width, height) > limits.maxTextureDimension2D) {
        pending = false; throw limitError("texture", { what: "a PNG export's side", count: Math.max(width, height), limit: limits.maxTextureDimension2D, hint });
      }
      // The readback holds 48 bytes a pixel.
      if (width * height * 48 > limits.maxBufferSize) {
        pending = false; throw limitError("exportPixels", { component: "Plot", what: "a PNG export", count: width * height, limit: Math.floor(limits.maxBufferSize / 48) });
      }
      const target = new RenderTarget(width, height, { type: UnsignedByteType, depthBuffer: false });
      const release = holdAnimation(viewServices);
      try {
        await animationClock(renderer).busy;
        const render = viewServices.export.render.current;
        if (!render) throw Error('Plot is not ready for export.');
        await render(target, scale);
        const bytes = await exportPixels(renderer, target.texture, width, height);
        const copy = document.createElement("canvas");
        copy.width = width; copy.height = height;
        const context = copy.getContext("2d");
        // Readback removes row padding and owns its staging-buffer cleanup.
        context.putImageData(new ImageData(bytes, width, height), 0, 0);
        const background = getComputedStyle(
          renderer.domElement.closest(".canvas") ?? renderer.domElement.parentElement,
        ).backgroundColor;
        if (includeBackground && background && background !== "transparent" && background !== "rgba(0, 0, 0, 0)") {
          context.save();
          context.globalCompositeOperation = "destination-over";
          context.fillStyle = background;
          context.fillRect(0, 0, width, height);
          context.restore();
        }
        const overlays = includeOverlays ? overlay?.() : [];
        for (const source of (Array.isArray(overlays)?overlays:overlays?[overlays]:[])) {
          const clone = source.cloneNode(true);
          const originals = [source, ...source.querySelectorAll("*")],
            copies = [clone, ...clone.querySelectorAll("*")];
          for (let i = 0; i < copies.length; i++) {
            const style = getComputedStyle(originals[i]);
            for (const key of [
              "font",
              "font-size",
              "font-family",
              "font-weight",
              "fill",
              "stroke",
              "stroke-width",
              "paint-order",
              "color",
              "opacity",
            ])
              copies[i].style.setProperty(key, style.getPropertyValue(key));
          }
          clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
          clone.style.position = "static";
          await embedDefaultFont(clone);
          const url = URL.createObjectURL(
            new Blob([new XMLSerializer().serializeToString(clone)], {
              type: "image/svg+xml",
            }),
          );
          try {
            const image = new Image();
            image.src = url;
            await image.decode();
            context.drawImage(image, 0, 0, copy.width, copy.height);
          } finally {
            URL.revokeObjectURL(url);
          }
        }
        return await new Promise((resolve, reject) =>
          copy.toBlob(
            (b) => (b ? resolve(b) : reject(Error("PNG encoding failed."))),
            "image/png",
          ),
        );
      } finally {
        release();
        target.dispose();
        pending = false;
      }
    };
    const documentContext = () => ({
      scene: viewServices.picking.scene.current ?? scene,
      camera: viewServices.picking.camera.current?.() ?? camera.current,
      // Document export composes axes as SVG. Keeping them out of this
      // fallback layer prevents doubled/blurred labels in hybrid output.
      exportImage: (scale) => exportPNG(scale, false, false),
      // Sky, fog and glow (TODO 37.7): a plot that shows one exports as one raster.
      effects: () => viewServices.export.effects.current?.() ?? [],
      overlays: overlay,
      label: label(),
      logicalWidth: renderer.domElement.clientWidth || renderer.domElement.width,
      logicalHeight: renderer.domElement.clientHeight || renderer.domElement.height,
      background: getComputedStyle(
        renderer.domElement.closest(".canvas") ?? renderer.domElement.parentElement,
      ).backgroundColor,
    });
    return register({
      png: (scale) => exportPNG(scale, true),
      svg: (options = {}) => exportDocument("svg", documentContext(), options),
      pdf: (options = {}) => exportDocument("pdf", documentContext(), options),
    });
  });
</script>
