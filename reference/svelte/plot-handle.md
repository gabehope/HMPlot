# PlotHandle

What a bound Plot offers code: fit, settle, selections, the camera, the animation clock and exports.

## Example

```svelte
<script>
  let plot = $state();
  $effect(() => { plot?.whenSettled().then(() => plot.fit()); });
</script>

<Plot bind:this={plot}>…</Plot>
```

## Members

- `getFrames` (`() => FrameHandle[]`): Required.
- `getDescription` (`() => string`): The plot's description as screen readers get it (description=, then the generated summary), updated when the plot settles after a change. Required.
- `getTitle` (`() => string`): The plot's title as shown ("" without one). Required.
- `subscribeDescription` (`(listener: (text: string) => void) => () => void`): Called with the description whenever it changes, and once at once; returns a function that stops it. Required.
- `getSelection` (`() => SelectionResource`): Required.
- `getBrush` (`() => SelectionResource`): Required.
- `clearBrush` (`() => void`): Required.
- `getHover` (`() => SelectionResource`): Required.
- `getOffsets` (`() => OffsetLayer`): The table's offsets (dragging). Required.
- `resetOffsets` (`(columns?: string | string[] | undefined) => void`): Clear the table's offsets in `columns` (every column when omitted). Required.
- `applyOffsets` (`() => Record<string, unknown> | Record<string, unknown>[]`): The table as given, with each column that has offsets replaced by its moved values. Required.
- `openSettings` (`(anchorElement?: unknown) => void`): Required.
- `closeSettings` (`() => void`): Required.
- `beginUpdate` (`() => () => Promise<void>`): Required.
- `whenSettled` (`() => Promise<void>`): Resolves once the changes made before the call are drawn; later changes are not waited for. Required.
- `whenAnimationsFinished` (`() => Promise<void>`): Required.
- `exportPNG` (`(options?: { scale?: number | undefined; } | undefined) => Promise<Blob>`): Required.
- `exportSVG` (`(options?: DocumentExportOptions | undefined) => Promise<DocumentExportResult>`): Required.
- `exportPDF` (`(options?: DocumentExportOptions | undefined) => Promise<DocumentExportResult>`): Required.
- `exportVideo` (`(options: { duration: number; fps?: number | undefined; start?: number | undefined; scale?: number | undefined; }) => Promise<Blob>`): The animation as an MP4 (H.264, else VP9) encoded in the browser with WebCodecs: one PNG export per frame at a frozen clock time from `start` for `duration` ms; the clock is restored afterwards. Loads hmplot/video on first use. Required.
- `getRenderError` (`() => string`): Required.
- `setViewport` (`(viewport: Partial<Viewport2D>, axes?: "xy" | "x" | "y" | undefined) => Promise<void>`): Resolves once the viewport is applied, like setCamera. Required.
- `getViewport` (`() => Viewport2D`): Required.
- `getCamera` (`() => CameraState`): The 3D camera state, or undefined for a 2D plot. Required.
- `setCamera` (`(camera: Partial<Omit<CameraState, "mode">>, options?: { animate?: boolean | undefined; } | undefined) => Promise<void>`): Merge a partial 3D camera state; {animate: true} eases over the plot's animationDuration. Required.
- `getAnimationTime` (`() => number`): The clock in milliseconds, shared by the Plots of its scope (an InputContext, a Scene, a standalone Facet or a Simulate; else the Plot's own): 0 when the scope starts, advanced by the frame time while anything in it animates, still while frozen. `@time` and every transition read it. Required.
- `getAnimationTimeFrozen` (`() => boolean`): Whether setAnimationTime froze the clock. Required.
- `setAnimationTime` (`(time: number | null, options?: { freeze?: boolean | undefined; } | undefined) => Promise<void>`): Set the clock of the Plot's scope. With freeze (default) it stops there until setAnimationTime(null) resumes it, so exports capture that moment: transitions and Required.
- `fit` (`() => void`): Reset the view: 2D returns to the full domain; 3D recomputes the camera position. Required.
- `holdAnimations` (`() => () => void`): Required.
- `subscribeSettings` (`(listener: (values: Record<string, unknown>) => void) => () => void`): Required.
- `getScreenMapping` (`() => ScreenMapping | null`): The last completed draw's mapping; null before drawing, after disposal or for unsupported coordinates. Required.
- `subscribeScreenMapping` (`(listener: (mapping: ScreenMapping | null) => void) => () => void`): Receives the current mapping immediately and changes after completed draws. Returns an unsubscribe function. Required.

## Get a handle

In Svelte, use `bind:this={plot}` on Plot. The member table describes that JavaScript handle.
Wait for `whenSettled()` before reading a newly updated plot or exporting it; use
`whenAnimationsFinished()` when the final transition state is required.

## Python members

In Python the node itself is the handle: keep the context manager's result,
`with hm.Plot(...) as plot:`. Its members are of three kinds.

- **sync** members run at once and need no browser. They change the scene, which every view of
  it then shows: a displayed notebook view, or a later standalone export.
- **await** members are coroutines that ask a *displayed* view. They need the plot shown in a
  notebook (JupyterLab, Notebook 7 or VS Code, in a browser with WebGPU) and `await` in a running
  event loop, as a notebook cell's top level has. Without a displayed view they raise
  `hm.SceneError` with code `bridge.missing_view`; with several views of one scene, pass
  `view=`, one of the scene's `views`. Each waits at most `timeout` seconds (default 60), then
  raises `SceneError` with code `bridge.timeout`.
- **property** and **attribute** members are read in Python. A property the browser reports
  (`description`) is `None` until a view has shown the plot.

These are the members of every node (a transform's, a mark's, a Facet's), and `description`
is a Plot's own. Python does not use the JavaScript names in the table above.

| Member | Kind | What it does |
|---|---|---|
| `id` | attribute | The node's id in the scene: a string. |
| `kind` | attribute | The component's name, `"Plot"`. |
| `props` | attribute | The props as the scene sends them, camelCase; change them with `update`. |
| `children` | attribute | The child nodes, in draw order. |
| `parent` | attribute | The node that contains this one, or `None`. |
| `description` | property | The description screen readers get (`description=`, else the generated summary), synced from the browser after the plot settles; `None` before a view has shown it. |
| `update(**props)` | sync | Set props, snake_case keywords checked as the constructor checks them, and redraw every view. Returns the node. |
| `add(*children)` | sync | Append components; one already here moves to the end (child order is draw order), one in another container is an error. Returns the node. |
| `remove(child)` | sync | Detach a child; returns it. |
| `clear()` | sync | Remove every child. Returns the node. |
| `batch_update()` | sync | A context manager, `with plot.batch_update():`. The changes inside it reach the views as one update, and none of them stays if the block raises. |
| `on_event(event, callback)` | sync | Call `callback(event)` when a view reports `event`: click, dblclick, pointermove, pointerenter, pointerleave, contextmenu, camerachange, viewportchange, drag or dragend. Returns the callback. Events come only from displayed views. |
| `on_click(callback)` | sync | `on_event("click", callback)`. |
| `on_hover(callback)` | sync | `on_event("pointermove", callback)`. |
| `selection` | property | The selection of the plot's data (`data=`, or the nearest Data above): a [SelectionResource](selection) to read and set. A node without data raises `RuntimeError`. |
| `brush` | property | The data's brush, a SelectionResource. |
| `hover` | property | The data's hover state, a SelectionResource. |
| `nearby` | property | The data's nearby rows, a SelectionResource. |
| `nearest` | property | The data's nearest row, a SelectionResource. |
| `endpoint(name=None, *, at=None)` | sync | This node as an endpoint for `hm.connect`: a mark with an attachment `at`, or the mark `name` that an embedded Facet or a Partition repeats. See [connect](connect). |
| `when_settled(*, view=None, timeout=60)` | await | Returns once the view has drawn every change made before the call, loads in flight included. |
| `when_animations_finished(*, view=None, timeout=60)` | await | Returns once the view's transitions have finished. |
| `fit(*, view=None, timeout=60)` | await | Reset the view: a 2D plot to its full domain, a 3D one to a new camera. |
| `get_camera(*, view=None, timeout=60)` | await | The 3D camera: a dict of position, target, up, fov, near, far, zoom and mode. |
| `set_camera(state=None, *, animate=False, view=None, timeout=60, **fields)` | await | Merge a partial camera (a dict, or keywords: position, target, up, fov, near, far, zoom), easing there with `animate=True`; returns the camera. |
| `get_viewport(*, view=None, timeout=60)` | await | The 2D viewport: x, y, zoom, zoomX and zoomY, and an orthographic globe's center. |
| `set_viewport(state=None, *, view=None, timeout=60, **fields)` | await | Merge a partial viewport (x, y, zoom, zoom_x, zoom_y, center) and return the result. |
| `get_time(*, view=None, timeout=60)` | await | The scene's animation clock, in milliseconds. |
| `set_time(time, *, freeze=True, view=None, timeout=60)` | await | Set the clock (milliseconds), frozen there until `set_time(None)` unless `freeze=False`; returns the clock. |
| `export_png(path=None, *, scale=2, view=None, timeout=60)` | await | This view as PNG bytes, `scale` pixels per CSS pixel, also written to `path` when given. |
| `export_svg(path=None, **options)` | await | This view as SVG bytes. The options are [DocumentExportOptions](document-export-options) in snake_case (width, height, mode, raster_dpi, text, primitive_budget) with view and timeout. |
| `export_pdf(path=None, **options)` | await | The SVG export printed to PDF in a private headless Chrome; bytes. |
| `export_html(path=None, *, snapshot='svg', page=True, view=None, timeout=60, **options)` | await | A standalone page of the scene and this view's camera, showing a snapshot first (`"svg"`, `"png"` or `False`); bytes. `page=` lays the page out: a 24 px margin and the content at most 960 px wide by default, `{"max_width": ..., "margin": ...}` in pixels, or `False` for a bare page. A page over the 10 MiB a notebook can send to the kernel is exported headlessly instead, as `hm.export_html` does, with a warning. Other options are an error. |
| `export_mp4(path, *, duration, fps=30, start=0, scale=2, encoder='ffmpeg', view=None, timeout=60)` | await | The @time animation as an MP4 at `path`: a PNG per frame at a frozen clock, encoded by ffmpeg or, with `encoder="browser"`, by the view's WebCodecs. The clock is restored. Returns the path. |
| `groups(*, view=None, timeout=60)` | await | A Partition's mounted groups: key, values, label and mark labels; other nodes raise. |
| `action(action, *, view=None, timeout=60)` | await | Run an action the node has, such as Force's `"reset"` or a Provider's `"refresh"`. |

## Without a notebook

A script exports with module functions instead. They are synchronous, need no displayed view,
and draw the scene in a private headless Chrome (an installed Chrome, Edge or Chromium, else one
downloaded once; see docs/DOCUMENT-EXPORT.md). Each returns what the matching `await` member
returns, and writes `path` when given. From async code, `hm.export_png_async` and the other
`_async` functions run them in a thread.

| Function | Kind | What it does |
|---|---|---|
| `hm.export_png(target, path=None, **options)` | sync | PNG bytes; options `scale` (default 2), and `cells=True` for a Facet's cells one by one. |
| `hm.export_svg(target, path=None, **options)` | sync | SVG bytes, with the DocumentExportOptions in snake_case. |
| `hm.export_pdf(target, path=None, **options)` | sync | PDF bytes, printed from the SVG export. |
| `hm.export_html(target, path=None, **options)` | sync | A page, with its snapshot drawn in the headless Chrome (`snapshot="svg"`, `"png"` or `False`), laid out by `page=` as above. |
| `hm.export_mp4(target, path, *, duration, fps=30, start=0, scale=2, encoder='ffmpeg')` | sync | The @time animation as an MP4; returns the path. |
| `hm.ExportSession()` | sync | `with hm.ExportSession() as session:` reuses one browser for several exports: `session.png`, `session.svg`, `session.pdf`, `session.html` and `session.mp4` take the functions' arguments, and `session.set_time`, `session.get_viewport` and `session.set_viewport` set a plot up first. |

SVG and PDF keep axes, text, legends and most 2D marks as vector shapes and draw the rest as
images at `raster_dpi`; [what is not exported as vector](/HMPlot/docs/export.md) lists what.

## Related examples

- [Linked views & minimap](/HMPlot/examples/linked.md)
