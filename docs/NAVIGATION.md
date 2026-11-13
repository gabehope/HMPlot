# Display scaling, sampled overviews, and independent zoom

The repository-local HMPlot package owns these features. No application-side renderer or JAX-array readback is used.

```svelte
<script>
  import { Plot, Minimap, Points, Line, zoomViewport } from 'hmplot';
  let plot = $state();
  let viewport = $state({ x: 0.5, y: 0.5, zoom: 1 });
</script>

<Plot bind:this={plot} {viewport} onviewportchange={(v) => viewport = v}
  axes2d zoomAxis="xy" axisMarginZoom
  overview overviewScale={0.35} overviewMaxInstances={1000}>
  <Points position={points} size={4} />
  <Line position={path} width={2} maxInstances={null} />
</Plot>

<!-- Alternatively, disable the embedded overview and place it externally. -->
<Minimap for={plot} displayScale={0.35} maxInstances={1000} />
<button onclick={() => viewport = zoomViewport(viewport, 1.2)}>Zoom in</button>
<button onclick={() => viewport = { x: 0.5, y: 0.5, zoom: 1 }}>Fit</button>
```

## Display and draw limits

A mark's size and width are its size on screen; the overview draws the marks smaller. The Minimap's (and the Plot's `overviewScale`) multiplier scales mapped point diameters, stroke widths, dashes and gaps, arrowheads and text sizes. Relative inward point outlines scale with the glyph once. Coordinate-sized meshes, images, heatmaps and surfaces keep their geometry.

The overview applies its own **display multiplier (0.35 by default)** to the resolved mark value through render-local state. Resizing and camera movement never change that multiplier. Source settings, normal rendering, and PNG export keep their own scale.

`maxInstances` is a draw limit, independent of `maxElements` buffer capacity. Main marks default to unlimited (`null`); overviews default to 1,000 per mark. A smaller mark limit wins. Heatmaps, images, and continuous surfaces are not sampled.

Points and independent segments use a seeded skip-based reservoir of index metadata. Connected lines use GPU index selection: preserve each selected path's endpoints, allocate segments proportionally after reserving one per path, choose paths deterministically when necessary, and sort sampled interior vertices before reconnecting. NaN-separated paths never acquire artificial connecting edges. Replacement segment styling comes from its original starting segment. Joins and the current surface-attached transition endpoint are reconstructed on the GPU; a sampled Line's dashes start over at each drawn segment (its screen-space dash distances are the full path's, TODO 73.2).

The selections depend on topology/count, not the camera or styling. Append updates reproduce the same reservoir as a single update to the same count. Allocation grows geometrically with the sample budget. Attribute gathers use bounded packed GPU storage; source attributes are reused and are never downloaded or fully duplicated for the overview. Related updates remain under the existing plot update gate.

## Inverted axes

`x={{ invert: true }}` (Python `x={"invert": True}`) flips an axis direction on screen: y runs top-to-bottom, x right-to-left, z near-to-far. Inversion is a reversed output range rather than a reversed domain, so `"auto"` domains, log and sqrt transforms, wheel zoom, panning, strip brushing, nearby picking, and tick generation are unchanged — they map through the same scale. The settings pane exposes it as an Invert checkbox beside the axis transform.

## Viewports

`zoomAxis` is `"xy"`, `"x"`, or `"y"`. Wheel/trackpad and pinch use this setting inside the plot. With visible axes and `axisMarginZoom=true`, the bottom axis margin zooms X and the left margin zooms Y; their shared corner follows `zoomAxis`. A pinch chooses dimensions at its initial midpoint. Pan and overview navigation remain two-dimensional.

Viewport callbacks emit `{ x, y, zoom, zoomX, zoomY }`. `zoom` is the geometric mean for legacy consumers. On input, each omitted axis factor falls back to `zoom`. When changing an already independent viewport, use `zoomViewport()` or update its axis factors explicitly; changing only `zoom` does not override supplied `zoomX`/`zoomY`. Fit clears both factors. Both-axis zoom retains their ratio at the minimum limit.

For a 2D spherical orthographic root, viewport state also contains
`center: [longitude, latitude]`, in that frame's angle units. The initial
center is `[0, 0]` unless `projectionCenter` or `viewport.center` supplies
another value. Dragging rotates the sphere without rolling the view;
`getViewport()` and `onviewportchange` report the current center. The disk
stays centered at `x = y = 0.5`, and `zoomX` and `zoomY` must agree. Wheel zoom
changes the common scale; a two-finger pinch changes that scale while movement
of its midpoint rotates the sphere. Drag, wheel and pinch anchors use the globe
surface (`z = 0`, radius `baseRadius`), independently of the radial extent used
to fit the camera. A grabbed surface point follows the pointer or pinch midpoint
while a north-up rotation can put it there. Outside that reachable region, a drag
continues rotating and stops at the poles; the view never rolls to follow it.
The former `pole` option is removed.
In Python, `await plot.get_viewport()` and
`await plot.set_viewport(center=[longitude, latitude])` read and update the
same browser-local state. A registered `viewportchange` callback receives
`event.viewport`, including `center` for an orthographic root.
For a remote script using one headless browser across exports, call
`session.set_viewport(plot, center=[longitude, latitude])` and
`session.get_viewport(plot)` inside `with hm.ExportSession() as session:`.
An attached minimap redraws the same visible hemisphere when this center
changes. Clicking outside its viewport rectangle or dragging it chooses a
geographic center from the disk; the captured orientation keeps a drag stable
across pointer events. Clicks outside the spherical disk have no effect.
When `axes2d` is enabled, longitude and latitude guides curve across the
visible hemisphere and rotate with `center`. Their ticks use the owning frame's
angle units; `x.step` and `y.step` set explicit longitude and latitude spacing.
Hidden portions stop at the horizon. These guides are included as paths and
text in PNG and vector document exports.

Camera frustum extents drive picking, axes, and overview rectangles. Network plots share both factors; diffusion spatial fields and scalar timeline coordinates use the appropriate factor. 3D navigation is described under 3D cameras below.

## 3D cameras

`cameraMode="orbit"` (the default) rotates around a target with the usual orbit gestures.
`cameraMode="flyover"` moves through the scene like a map app: the ground plane is the plane
through the origin perpendicular to the up axis: x-y for the default Z-up `type="3d"`,
x-z for `type="3d-y-up"`. `cameraUp` overrides either preset; `setCamera({up})` also
changes the current navigation orientation. Data coordinates keep their meaning.

| Input | Flyover action |
|---|---|
| Drag | Moves the ground under the cursor: the ground point grabbed on press stays under the pointer for the whole drag. Height and orientation do not change. Grabs near or above the horizon are capped at 20 camera heights (at most 0.9 of the far plane), so a drag that crosses the horizon does not jump |
| Right-drag, or Alt+drag | Look around (yaw and pitch about the up axis) |
| Wheel / trackpad pinch | Zoom toward the point under the cursor along the cursor ray, sky included: scroll up (or spread two fingers on the trackpad) approaches it and descends toward the ground, scroll down (or pinch the fingers together) backs away, like 2D zoom. Each event is at most a factor of 2 and stops at 4 near planes (or 0.1% of the scene size) from the point, or at half the far plane |
| Touch | One finger drags like the mouse. Two fingers pinch: the ground point under their midpoint follows it and grows with their spread (spreading approaches it, pinching backs away, with the wheel's limits); lifting one finger carries on as a one-finger drag |
| W / A / S / D | Travel forward, left, back, right (level with the up axis); speed follows the height above the ground |
| Q / E | Move down / up |
| Shift | Three times faster for the wheel and keys while held |

`flySpeed` (default 1, range 0.1-10, settings pane "Fly speed") multiplies the wheel zoom and
key travel. Neither it nor Shift changes the drag or a touch pinch, which follow the pointer and
the fingers. Movement keys are ignored while Cmd, Ctrl, or Alt is held, so Cmd+S saves the notebook.
Spherical globe views (`coordinates="spherical"` without `sphericalView="projected"`) have no
ground plane: there the drag pans at a fixed rate along the plane perpendicular to up and the
wheel and a touch pinch move along the view direction.

After a zoom or a look, the target is re-seated on the ground (or at the horizon cap) along
the centre of the screen, so `getCamera().target` and `oncamerachange` report the ground point
at the centre of the view, and switching to orbit orbits around it. Switching modes keeps the
camera position and target. Flyover stops the view about 10 degrees short of straight down or
up, whether it comes from a look, `setCamera`, or the 3D minimap, so the up axis keeps defining
the ground: in flyover the minimap's axis buttons keep the up axis, and its top-down button looks
down at the same target at that limit.

Camera props apply to both modes: `cameraPosition`, `cameraTarget`, and `cameraUp` (world-unit
arrays) set the initial camera, and changing them later moves it; `cameraFov` (degrees, default
50), `cameraNear`, and `cameraFar` set the lens and are also settings in the pane (Plot → View);
clearing a near/far field returns it to the scene-derived value. Without them the camera starts
at a scene-sized default, or where it was left for the same coordinates and props: navigating,
switching to 2D and back, or a facet cell remounting after scrolling offscreen keeps the view
as long as the camera props did not change. Invalid values (near ≤ 0, far ≤ near, fov outside
0-180, a zero up vector, a vector that is not three finite numbers) show as the plot's render
error and leave the camera as it was; `setCamera` rejects them.
`oncamerachange` reports `{position, target, up, fov, near, far, zoom, mode}` at most once per
frame after the camera moves (Python: `on_event("camerachange")`, with the state in
`event.camera`; `event.target` is the Plot node).

Handles: `getCamera()` returns that state; `setCamera(partial, {animate})` merges a partial state
and, with `animate: true`, eases over the plot's `animationDuration` with its `animationEasing`
(`animationDuration=0` snaps); the `up` vector rotates and the position swings about the target
rather than cutting through it. A pending animated move settles early (resolved) when another
`setCamera` call or user input takes over, and is rejected with "camera transition interrupted"
when the plot unmounts. `fit()` resets the camera (explicit camera props win, otherwise the
scene-sized default) and its zoom. Python: `await plot.get_camera()` and
`await plot.set_camera(position=[...], animate=True)`; `camera_position`, `camera_target`, and
`camera_up` accept lists, tuples, or NumPy arrays of three numbers.

Each Facet cell keeps its own 3D camera; camera props give every cell the same starting state,
with no linking. Python `set_camera` on a Plot repeated in Facet cells moves every cell, and
`get_camera` reports the first mounted cell. Orthographic 3D projection is not available yet.

## Verification

Focused unit and browser checks cover deterministic sampling, path budgets and endpoints, fixed pixel scaling including zero, axis-margin wheel zoom, pinch, cancellation, mode switching, source-buffer preservation, held updates, export, surface dragging, and Network initialization. GPU buffer readbacks in sampling assertions are test-only.

Archive provenance and reconstruction checksums are in `vendor/navigation.json`; `vendor/navigation.patch` applies to the unchanged 1.0.19 snapshot. The sibling HMPlot working tree is preserved.

### Rectangular fit in 1.1.1

The fitted domain, axis margins, and independent camera factors now share one
layout. `aspect="auto"` uses the complete rectangular drawing region; choose
`aspect="equal"` to keep one data unit the same length on x and y (TODO 67.3: it kept world
units equal, which the bounds stretch onto a 100 x 100 box, so a Cartesian plot's data units
were not). In **Plot settings → Rendering → Aspect ratio**, these choices are labeled
**Fill plot** and **Preserve proportions**. The latter keeps circles round and squares square
as the container changes size, leaving space around the fitted domain when needed. Switching modes updates
the camera and minimap without rebuilding mark data. The default remains Fill plot. Pan clamps follow configured
ranges. Positive controlled zoom values below one are supported, while gesture
zoom stops at Fit. This replaces the earlier hard-coded 100×100 navigation box.
