# zoomViewport

A 2D viewport zoomed by a factor along x, y or both, never past the fitted view.

## Example

```svelte
<script>
  import { Plot, Points, zoomViewport } from "hmplot";
  let viewport = $state({ x: 0.5, y: 0.5, zoom: 1 });
</script>

<button onclick={() => (viewport = zoomViewport(viewport, 1.5))}>Zoom in</button>
<button onclick={() => (viewport = zoomViewport(viewport, 1 / 1.5, "x"))}>Zoom x out</button>
<Plot {viewport} onviewportchange={(v) => (viewport = v)} axes2d>…</Plot>
```

## Members

### Members

- `x` (`number`): Required.
- `y` (`number`): Required.
- `zoom` (`number`): Required.
- `zoomX` (`number`): The horizontal zoom factor, when x and y zoom apart (1 fits the domain).
- `zoomY` (`number`): The vertical zoom factor, when x and y zoom apart.
- `center` (`[number, number]`): Active root longitude and latitude in its angular units.

### Parameters

- `viewport` (`Viewport2D`): The current viewport: { x, y, zoom }, with zoomX and zoomY when the axes zoom apart (each defaults to zoom).
- `factor` (`number`): The zoom multiplier: above 1 zooms in, below 1 out. Finite and positive, else an error.
- `axis` (`"xy" | "x" | "y"`): Which axes zoom (default "xy"): one axis leaves the other's factor alone.
- `minimum` (`number`): The smallest zoom an axis may reach (default 1, the fitted view). With "xy" the factor is raised so neither axis passes it, keeping their ratio.
- `returns` (`Viewport2D`): A new viewport: the same center, the new zoomX and zoomY, and zoom their geometric mean (center kept for an orthographic globe).

## Usage

A 2D Plot's viewport is `{ x, y, zoom }`: the center in the plot's unit square (0.5 is the middle) and the zoom, 1 being the fitted view; `zoomX` and `zoomY` zoom the axes apart, and each defaults to `zoom`. Pass a viewport to Plot's `viewport` prop and follow the viewer's changes with `onviewportchange`, which reports the same fields. `zoomViewport` gives the next state for a button or a key: it multiplies the zoom along `axis`, never below the fitted view, and keeps the center. Changing `zoom` alone would leave an axis that has its own factor where it was.

The same object is what `getViewport()` and `setViewport()` on the [Plot handle](plot-handle) read and write; Python sets it with `await plot.set_viewport(...)`. An orthographic globe's viewport also has `center`, its longitude and latitude, which `zoomViewport` keeps. See docs/NAVIGATION.md for zooming one axis from its margin.

## Related examples

- [Linked views & minimap](/HMPlot/examples/linked.md)
- [Long time series](/HMPlot/examples/timeseries.md)
