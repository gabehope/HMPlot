# Plot overview

HMPlot exports `Minimap`, a separate Svelte component linked to a mounted
plot handle. It shares the plot's scene and GPU data; do not repeat its marks.

```svelte
<script lang="ts">
  import { Plot, Minimap, Heatmap, type PlotHandle } from 'hmplot';
  let plot = $state<PlotHandle>();
  // values is a caller-owned JAX array, initialized after initializePlot().
  let { values } = $props();
</script>

<Plot bind:this={plot}>
  <Heatmap fill={values} />
</Plot>
<Minimap for={plot} width={180} height={120} />
```

Alternatively use `<Plot overview={true}>`, or enable **Overview** in inherited
plot settings. Default is off. The embedded overview is 160×110px in 2D and
96×96px in 3D; it shrinks in small plots and leaves Settings accessible.
The external component defaults to 180×120px and can be placed anywhere.
An undefined/unmounted source is safe. The only new plot-handle method,
`getMinimapSource()`, returns an opaque source; scenes and renderer resources
are not part of the public interface.

## Navigation

In 2D the overview fits the full configured `x.range`/`y.range` world plane with
letterboxing. Marks already apply their numeric/log/datetime transforms, so the
viewport rectangle has the same mapping as the plot. The overview mirrors the
source's current marks; it does not request more application data when the main
plot pans. Axes, grids, tooltips, and navigation decorations are omitted.

Drag the gray rectangle, or click outside it to recenter. Zoom is unchanged.
Movement is constrained to the full domain; oversized visible extents are centered
and locked along that axis. External out-of-domain views are clipped in the
overview without moving the main camera just because the overview mounted.
Arrow keys move 2% of the domain (Shift: 10%). Escape or pointer cancellation
restores the view at the start of a drag. Touch uses pointer capture.

In 3D the overview becomes a navigation gadget. Click or keyboard-activate one of
six signed axes to align the camera; drag or use arrows to orbit. Target and
distance are preserved. Each mode retains its camera when switching. The ordinary
orientation indicator is suppressed while an overview is attached.

## Rendering and ownership

The original scene is drawn into a multisampled overview target using another
camera. A second small target performs the same tone/color/alpha conversion as the
main plot. A presentation-only WebGPU canvas samples this texture on the same GPU
device. No mark buffers or JAX arrays are duplicated or read back to the CPU.

Overview draws run after completed main frames, under the same update gate.
Data/appearance/size changes refresh the image; camera-only changes update the
rectangle without redrawing the scene. Presentation progress uniforms are tracked.
`getDiagnostics().overview` exposes attached client count, owned render-target
count, and overview draw count for checks. Unmounting, detaching, and switching to
3D dispose the overview targets. Plot PNG exports continue excluding navigation.
