# SVG and PDF export

Plots, Views, Facets, notebook scenes, and standalone Python scenes support SVG
export, and Python makes PDFs from it. The default `auto` mode keeps 2D marks (in a 3D view too, sorted by depth),
axes, labels and legends (colorbars as gradients) as vector primitives and places
what has no vector form in transparent PNG fallback layers ("What is not vector",
below).

```js
const { blob, report } = await plot.exportSVG({
  width: "160mm",
  mode: "auto",
  rasterDpi: 300,
});
```

PDFs come from Python: it exports the SVG and prints it in headless Chromium, whose
PDF is vector, keeps text as text and embeds the fonts it prints with (a live
notebook view prints in a private headless Chrome too). The browser's export menu offers PNG, SVG and HTML. The handles'
`exportPDF()` still converts in the browser (svg2pdf), which mishandles some SVG,
so it is not offered there; prefer Python for PDFs.

```python
pdf = await plot.export_pdf("figure.pdf", width="160mm", raster_dpi=300)

# Outside a notebook; one browser can be reused for a batch.
with hm.ExportSession() as export:
    export.pdf(scene, "dashboard.pdf", width="7in")
    export.svg(scene, "dashboard.svg", mode="auto")
```

## The export browser

`pip install hmplot` is all the standalone exports need (PNG, SVG, PDF, HTML with its snapshot,
and MP4). They draw in a private headless Chrome, which hmplot finds in this order:

1. the executable named by `HMPLOT_CHROME`;
2. an installed Google Chrome, Microsoft Edge or Chromium;
3. a Chrome for Testing that hmplot downloaded earlier, in the user cache
   (`~/Library/Caches/hmplot` on macOS, `~/.cache/hmplot` on Linux,
   `%LOCALAPPDATA%\hmplot` on Windows).

With none of them, the first export downloads Chrome for Testing into the cache (about 150 MB,
350 MB unpacked), once, and says so. To do it ahead of time, for a Docker image or a machine
that will be offline:

```sh
hmplot install-chrome          # or, in Python: hm.install_chrome()
```

`HMPLOT_NO_DOWNLOAD=1` turns the automatic download off; an export with no browser then fails
with a message saying what to install.

- **No GPU** (servers, Docker, CI): WebGPU falls back to Chrome's software adapter,
  SwiftShader. The output is the same; large plots take longer. A setup is used once a WebGPU
  canvas has drawn a few frames in it. An adapter alone is not enough: without a GPU, Chrome
  composites in software, and then a WebGPU canvas loses its device on its first frame (Linux)
  or WebGPU offers no adapter at all (Windows). SwiftShader's setup has Chrome composite on
  SwiftShader's Vulkan on Linux and on Microsoft's software Direct3D (WARP) on Windows, which
  works on GitHub's runners (Chrome 154). When neither setup draws, the error says how each
  failed, with Chrome's flags and the GPU lines of its log; an export that loses its GPU device
  later says the same.
- **Slim Linux images** need Chrome's libraries. On Debian or Ubuntu the distribution's
  Chromium brings them: `apt-get install -y chromium` (then hmplot finds it and downloads
  nothing). Running as root, as Docker does by default, Chrome runs without its sandbox.
- **Ubuntu 23.10 and later** restrict, with AppArmor, the unprivileged user namespaces Chrome's
  sandbox needs, and Chrome for Testing has no AppArmor profile that allows them: it quits with
  "No usable sandbox!", and the export's error says so. Install Google Chrome from its `.deb`
  package (its profile lets the sandbox start; hmplot finds `google-chrome` before Chrome for
  Testing), or set `HMPLOT_CHROME_NO_SANDBOX=1` to run Chrome without its sandbox. hmplot never
  turns the sandbox off on its own (as root Chrome refuses it, so there it is off): without it, a
  page that exploits a bug in Chrome's renderer runs with your user's rights, and the export
  browser loads whatever remote URLs the scene names.
- **Linux on ARM64** has no Chrome for Testing build: install the distribution's `chromium`.
- **MP4** comes from ffmpeg in the `imageio-ffmpeg` package, a dependency, with the frames piped
  to it; nothing needs to be on PATH. `export_mp4(..., encoder="browser")` encodes in the browser
  instead (below).

No development server, notebook or CDN is used during export. A short-lived loopback server
serves the wheel's bundled frontend to the headless Chrome, so WebGPU and workers have a secure
origin, and hmplot drives it over Chrome's DevTools protocol (hmplot/chrome.py; no Playwright).

What the export browser is allowed to do (SECURITY.md has the summary):

- It runs with `--enable-unsafe-webgpu` (WebGPU where Chrome would not otherwise offer it, such
  as Linux), and on machines without a usable GPU with SwiftShader's software adapter
  (`--use-webgpu-adapter=swiftshader --enable-unsafe-swiftshader`, plus software Vulkan or WARP
  compositing on Linux and Windows). These flags expose more of Chrome's GPU code to the page.
- It loads the remote URLs the scene names, as the notebook's browser would: vector tiles,
  images, Providers' URLs. An export of a scene you did not write fetches what that scene says.
- Its sandbox is on, except as root on Linux and with `HMPLOT_CHROME_NO_SANDBOX=1` (above).
- The loopback server listens on 127.0.0.1 only, and answers only under a random per-session
  path (a token in its URL): another user or process on the machine that finds its port gets
  404s. Chrome's DevTools port (`--remote-debugging-port=0`, a random port on 127.0.0.1) has no
  token: while an export runs, a process of any user on the same machine that finds the port
  could drive that browser. Its port is written only into Chrome's private temporary profile
  (readable by your user alone); nothing outside the machine can reach either port.

## Video in the browser

A Plot's handle encodes its animation in the browser with WebCodecs, as an MP4 (H.264 where the
browser has it, as Chrome does, else VP9):

```js
const blob = await plot.exportVideo({ duration: 3000, fps: 30, scale: 2 });
```

Each frame is the plot's PNG export at a frozen clock time, from `start` for `duration`
milliseconds; the clock returns to its time and frozen state afterwards. The encoder and its
small MP4 writer live in `hmplot/video`, loaded on the first call, so a page that never exports
video does not carry them. From Python, `export_mp4(..., encoder="browser")` uses it in the
notebook view or the export browser, without ffmpeg.

## Vector and raster policy

The current vector backend covers Cartesian 2D point symbols, straight lines
and segments, Lines and Segments with any curve (step corners, or Bézier controls in
data space: a `basis` Line's rows are its B-spline's cubic Béziers), solid Arrows3D
(a shaft and, at a visible true end, a head along the final chord, sized in world units
as the GPU sizes them, straight or curved: each piece's tube and the cone outlined in
world space and projected, one filled path per arrow), billboard arrows (a flat-ended
shaft that stops at the head's base, as the GPU draws it; curved ones with the head
along the final chord), areas and ribbons, error bars, labels, flat
Rect/Bar/Histogram and Prism footprints, root and placed 2D polar Rect sectors, axis rules, axes,
root and anchored 2D polar Lines, root 2D orthographic Lines with angular or
great-circle interpolation, Lines and Segments with a curve on any 2D map, straight
Lines and Segments inside nested polar,
spherical or log/sqrt Frames, Area outlines, error bars, and Rect
patches and polar sectors in polar or nested Frames, 2D polar point symbols, 2D orthographic point
symbols, screen-facing Labels in those 2D frames, connectors (Lines, Segments and Arrows
drawn by `connections`, from their endpoints as the GPU gathers them, displaced by the
pixel offsets Dodge and Swarm give points), and legends (colorbars as linear
gradients through 24 samples of the colormap, stepped when it is quantized).
Eligible polar Lines, orthographic Lines, nested paths and Rect sector
boundaries subdivide to the export size and count each chord against
`primitiveBudget`. A nested path evaluates the same packed coordinate table as
the GPU refinement pass, so it is cut at the same horizon, seam and invalid
radius. An error bar cut there loses its cap at the cut; a cap at a true end
stands across the path's local tangent. A band, Rect or sector cut by an
orthographic horizon exports its visible edges joined by arcs of the limb
(when every operation after the orthographic one is affine); each arc runs
the way that stays inside the fill. One that a map's seam crosses once exports
as two pieces, one on each side of the seam, as the GPU cuts it. One whose outline
an invalid radius cuts (a Mercator map past its latitude limit), or a seam crosses
more than once, rasterizes in auto mode, with the reason in the report, and is refused
in strict vector mode. Generated GeoJSON boundaries remain vector in Cartesian 2D, on a root
orthographic globe and in a nested map with affine ancestors, where each
worker segment is cut at the horizon, and consecutive segments join into one
polyline; polygon fills use the raster layer.

Colors are evaluated on the host as the shader evaluates them (TODO 70): a category's
color, or a number through the mark's scale (domain, transform, midpoint, range) and its
colormap, read as the GPU reads its colormap texture (the nearest of 512 samples in the
colormap's own interpolation space, quantized levels at their midpoints). A value the scale
leaves out (a zero under log) is left out of the export too. Each primitive gets its own
fill or stroke, so a Line colored per row exports as runs of one color that meet at shared
vertices; Lines join with SVG's miter join at the GPU's miter limit (4), and where a Line's
color changes at a vertex the miter is split along its bisector, as the GPU splits it.

Dashes (`dash` on Line, Segments, RuleX, RuleY and Routes) are `stroke-dasharray`, and a
dash pattern in PDF. The GPU measures a dash in CSS pixels along the drawn path (TODO 73.2):
a connected Line's distance along its path on screen (a prefix sum on the GPU for each camera,
starting over where the path breaks), a refined path's along its pieces, a Segments row's from
its own start; zooming and frame chains keep a dash's length. The export follows it: a run is
one path with the pattern as its dash array, its phase in `stroke-dashoffset` (svg2pdf, which
reads offsets as whole numbers, gets an equivalent pattern that starts at 0).

Curve refinement follows the output size. `subdivisionTolerance` is in
output pixels, so an export at a larger `width` or `height` subdivides curved
paths, bands and outlines further, up to 8 times the logical resolution.

A root equirectangular, Mercator or equal-area map repeats across the
antimeridian. Its points, labels, Lines, Segments, Arrows3D, Arrows and GeoJSON
boundaries, and those of any frame on it such as a chart, export once per wrap
tile the export camera shows, as the GPU draws them. Each tile is a group translated by one longitude period. Paths refine
through the same unwrapped operation table as the GPU, so a path that
crosses the seam continues into the next tile.

Raster fallback captures the completed GPU frame at `rasterDpi`; it does not
rerun data computation or mutate the live camera.

Use `mode: "vector"` to reject a figure containing unsupported content, or
`mode: "raster"` to place the complete plot in one raster layer. The returned
report lists each mark's outcome, raster layers and effective DPI, warnings,
and the vector primitive count. `primitiveBudget` defaults to 100,000 and
causes oversized marks to rasterize in auto mode or fail in strict mode.

Axes, guide text, Text marks and callouts, a plot's title, subtitle and caption, and Title
blocks remain searchable text in ordinary exports; a Markdown block exports as an image of how it
looks (a raster layer at `rasterDpi`), and strict vector mode refuses it.
Converting text to outlines is not implemented (`text: "outlines"` keeps the
text and says so in the report).

### What is not vector

In `auto` mode each item below is drawn into a transparent PNG layer at
`rasterDpi`, in its place in the drawing order (consecutive raster marks share a
layer), and the report's `markOutcomes` lists it as `raster`; `mode: "vector"`
refuses the export and names it. This list follows the code
(`vectorCandidate` and `vectorMark` in src/lib/plot/utils/vectorExport.js,
`buildPlotDocument` in documentExport.js, and the parts' own `exportSVG`), and
was checked by exporting every reference example and targeted configurations
(2026-10-01); what TODO 70 made vector has a case each in /test/vector-export, whose
SVG tests/browser/document-export.spec.js compares with its PNG. The docs' export guide (src/routes/content/guide/export.svx) has
the same list for users, and each component's reference page carries an
"SVG and PDF export" note.

Always an image:

- Heatmap, with the marks drawn into its texture; Image; Surface: per-pixel data or
  lit shading (their objects have no exporter).
- Points3D in every view, and Text3D (TeX included), a plain mesh.
- GeoJSON's polygon fills and VectorTile's areas (`geo-faces`). A live
  VectorTile (the default in a 2D view) draws its lines as an image too; its
  place names stay text.
- A Markdown block (a DOM capture of how it looks) and a 2D Minimap (its GPU
  canvas), each its own part of a scene export.

The whole plot as one image (TODO 37.7, 138.3): a Plot's sky or fog effect, a plugin's
effect, a mark's `glow` or a Frame's `atmosphere` is composited over the whole scene, so
`buildPlotDocument` turns `auto` into `raster` for that plot when
the view's export effects (installed by scenes/interactive.svelte) name one, with a warning,
and `vector` throws naming it. All of the plot's marks are then one image with
the effect; its axes, titles and legends stay vector, and other plots in the
same scene export as before. A bloom effect alone changes nothing.

An image in some cases, each for a reason a vector cannot carry:

- Every mark of a 3D view (a 3D Plot or Frame) that holds a mark with no vector form there
  (`view3DIssue`): a 3D mark (Points3D, Arrows3D, Text3D, Surface, a Prism, flat or not, a
  Rect extruded from `z0` to `z1`), a Heatmap or Image, a lit mark, additive or subtractive blending, a mark
  on a surface, or a globe or polar frame (a 3D globe's background sphere occludes its marks).
  An image and depth-sorted vectors cannot hide one another correctly, so the whole view is
  one image (all or nothing), with a warning naming the mark and its reason; `vector` throws
  with the same names. Any other 3D view is vector ("2D marks in a 3D view", below). The axis
  overlays stay vector, and so does a 2D orthographic globe.
- A Prism extruded along x or y: a 2D view sees its side, not a footprint.
- `blend: "additive"` or `"subtractive"`, with a warning: PDF has no additive blend mode, and
  SVG's `plus-lighter` is not honored by Illustrator, Inkscape or SVG-to-PDF converters.
  Screen and multiply become `mix-blend-mode`.
- More pieces than `primitiveBudget`, with a warning: a deliberate size guard (raise it to
  keep a large mark vector).
- A band, Rect or sector cut by an invalid radius (a Mercator map past its latitude
  limit) or crossed by a map's seam more than once, with the reason.

### 2D marks in a 3D view

A 3D view whose marks are all 2D marks (TODO 70.6: flat Points symbols, Text, Line, Segments,
GeoJSON boundaries, Arrows, ErrorBars, Area, flat Rects, Histograms, Bars and BoxPlot
boxes, Polygon; unlit and in a Cartesian chain, log and sqrt axes included) exports as vectors.
Bars and BoxPlot boxes draw through a flat Prism object, which namedMark tags with its compound
(`compoundKind`); a Prism mark written as such is a 3D mark, flat (`z0` = `z1`) or not. A view
like that exports as vectors,
`view3DVectors` in vectorExport.js, the way matplotlib's mplot3d draws:

- **Projection.** Each primitive goes through the frame chain to world space and through the
  export camera's matrices (the GPU's; perspective or orthographic) to SVG pixels. Points and
  text keep their CSS-pixel sizes (the GPU draws them without perspective attenuation; a point
  in data units spans the projection's x scale, as `pixelsPerDataUnit` gives it in 3D), strokes
  their pixel widths, dashes their pixel pattern along the path on the page; a point's pixel offset
  moves it along world x and y, as `applyPixelOffset` does. Curves and log or sqrt axes refine
  in data space to the screen tolerance.
- **Near and far planes.** Strokes are cut where they cross the camera's near or far plane (a
  Line ends flat there, as the line material trims it); fills are clipped to them; points and
  labels outside them are left out, and so is what lies wholly outside the view.
- **Painter's order.** Strokes are cut into pieces of at most 8 CSS pixels and fills into
  triangles of at most 16 (both doubled until they fit `primitiveBudget`), so a line passing in
  front of another orders piece by piece. Where two primitives overlap on screen they are
  compared where they meet (strokes at their crossing; a stroke against a point or a fill along
  its part in the overlap; a fill's depth there from its plane) and drawn in a topological order,
  the farthest ready one first; a cycle (primitives that intersect) is broken at its farthest.
  Primitives on one plane (every mark without z lies on the plane z = 0) tie and keep the GPU's
  drawing order: opaque marks, then translucent ones, as three.js draws them. Consecutive pieces
  of a stroke or fill join into one path wherever nothing drawn after it overlaps them, so a
  line keeps its miter joins and a fill has no seams except where another mark passes between
  its pieces; there an opaque stroke ends round (no seam) and a translucent one flat with its
  half of the miter.
- **Approximate.** One depth per piece cannot be right where primitives intersect or cross
  within a piece's length: the report warns, naming the plot, on every 3D view exported as
  vectors.

Checked (document-export.spec.js, the `-3d` cases of /test/vector-export): SVG against PNG as
the 2D cases are, and, for occlusion, pixel by pixel: of the pixels both draw saturated, under
1.5% may differ in hue (0.06-0.6% measured; drawn in the marks' order instead, 2.6-23%). A 3D
view with 40,000 points and a line through them exports in about 3 seconds (84,000 primitives,
13 MB).

Known gaps of 3D views:

- On screen, Text in a 3D view does not hide other Text by depth (labels draw without depth
  writes, in order); the export sorts labels by depth.
- Translucent marks blend in the GPU's linear color space and in sRGB in SVG, so where two
  translucent fills overlap the blended color differs slightly (as in 2D).
- Overlapping fills on one plane z-fight on the GPU; the export draws them in drawing order.
- There is no orthographic 3D camera yet (TODO 9C); the orthographic projection is checked by
  a unit test.

Left out of every static export: inputs (a scene export takes only
the parts that export themselves: Plots, Facets, Titles, Markdown, external
Legends and 2D Minimaps), a Crosshair (it draws nothing without a pointer), a
Plot's `overview` gadget, and a Minimap of a 3D plot (the report's warnings say so).
Messages and the report name marks by their component (`Points`, `VectorTile`), never by
their class, which the bundles minify.

Known gaps, where the vector output differs from the screen:

- A mark sampled by `maxInstances` exports every row, not the sample on screen
  (`mark.sampling` has no `active` flag, so `vectorCandidate` never sees it), up
  to `primitiveBudget`; over the budget the raster layer shows the sample.
- A fill across a map's seam exports its two pieces, but the screen differs: a Rect
  across the seam of a map inset in a Cartesian plot draws a bar across the map, and on a
  root equal-earth (or other joint) map a fill drops its piece past the seam.
- Where a Line turns back on itself past the miter limit, the GPU's bevel narrows the
  segment; SVG's bevel keeps the stroke's full width.

## HTML exports

`await scene.export_html("scene.html")` (or a Plot's, and the settings pane's "Export HTML")
writes a self-contained page: the scene's state, its data and the standalone runtime. A page holds
its target and the resources it uses; a target that refers to a component outside it (a Legend
for a mark in another Plot) is refused in both runtimes: export the Scene that holds both. The page
shows a snapshot of the scene first, labeled "Static preview" in its top right corner (in the
plot's colors, with a pulsing dot while the interactive view loads), then fades it out over the
interactive view once every plot has drawn (at once under `prefers-reduced-motion`). Without
WebGPU, or if the interactive view fails to start, the snapshot stays and its label loses its
dot; without WebGPU the label reads "Static · no WebGPU" (a screen reader hears "Static preview:
this browser has no WebGPU"). The label belongs to the page, not to the snapshot's SVG. The
snapshot shows the scene as exported (its camera, input values, selection and animation time);
inputs are left out, as in every static export.

`snapshot="svg"` (the default) places the scene's SVG export in the page: vector, with searchable
text in the bundled font, and images where an SVG export has them ("What is not vector"). `snapshot="png"`
places a PNG instead, a smaller page for very dense plots (an SVG snapshot over 5 MB warns and
suggests it); `snapshot=False` leaves it out. The export report lists the snapshot's kind and size.

The page has a modest layout of its own (TODO 132.6): a 24 px margin (12 px on a screen under
600 px wide) and its content centered at most 960 px wide, so a wide monitor does not stretch the
plots edge to edge; a plot without a width fills that content width, and the snapshot is drawn at
it. A Plot with a fixed `width` wider than the maximum widens the page to it rather than being
clipped. With `max_width=None`, `hm.export_html()` draws the snapshot 1200 px wide and the page
scales it to the screen. Its title is the scene's first title (a Title's text or a Plot's `title`). `page=` sets the
layout: `page={"max_width": 1200, "margin": 16}` in CSS pixels (`max_width=None` for no maximum),
or `page=False` for a bare page with neither. It is an export option, not a theme, and no other
export (PNG, SVG, PDF, a notebook's display) has a page. The settings pane's "Export HTML" uses the
default; in JavaScript the option is `exportHTML(target, { page: { maxWidth, margin } })`.

```python
await scene.export_html("scene.html")                 # from the displayed view
hm.export_html(scene, "scene.html", snapshot="png")    # no notebook: drawn in the export browser
hm.export_html(scene, "wide.html", page={"max_width": 1400})  # or page=False: a bare page
```

`hm.export_html()` has no view to capture, so it draws the scene in the export session's private
headless Chromium (as `hm.export_svg()` does) and embeds that snapshot, with the loaded results of
Providers and VectorTiles. With no browser to draw in (see "The export browser") it writes
the page without a snapshot and warns.

In a notebook the page comes from the view to the kernel as one message (without the runtime,
which Python adds), and Jupyter's server closes the connection on a message over 10 MiB (its
`websocket_max_message_size`), ending the session. So a larger page is exported headlessly
instead, as `hm.export_html()` exports it, with a warning: Python counts the scene's data before
asking the view, and the view sends no page over the limit (a dense plot's SVG snapshot can pass
it alone: 95,000 points make one of 9 MB). That page starts from the scene as Python has it, at
the plots' own viewports and cameras, not where the view was panned, and without the settings
pane's edits. Its snapshot needs the export browser: with none, the export fails, naming both
limits; install one, export a smaller scene, or pass `snapshot=False`, which needs no browser.

## Notebooks without WebGPU

A notebook displays a scene as a widget that draws in the notebook's browser. Where that browser
has no WebGPU, the widget asks the kernel for a static image and shows it in the plot's place,
read-only, with the note "Static image: this browser has no WebGPU" and the image's title and
description (the plots' generated descriptions) as its alt text. The kernel draws it as
`hm.export_svg(scene)` does, in a private headless Chrome ("The export browser"), on a page as
wide as the view, so the plots lay out as they would on screen; a scene with several plots is one
image. After each update it draws the newest revision again (updates within a quarter second
draw once). One Chrome serves every view and closes after a minute without a request.

The display never downloads Chrome for Testing: with no browser to draw in, the view shows the
WebGPU error and what to install (`hmplot install-chrome`, or `HMPLOT_CHROME`). A GPU device lost
during a session is a different error and shows no image: the browser has WebGPU, and reloading
the page brings the interactive view back.

Static notebook viewers (GitHub, nbviewer, notebooks exported to HTML or PDF) run no widget and
show nothing for a scene. With `HMPLOT_NOTEBOOK_SVG=1` in the kernel's environment, each display's
output also carries the scene's SVG, drawn 800 pixels wide (about a notebook's output column):
Jupyter shows the widget, and those viewers the SVG. It is off by default because each display
then draws the scene headlessly, which takes a second or more, and a dense plot's SVG makes the
notebook file larger. Like the exports, it downloads Chrome for Testing when no browser is
installed; when it cannot draw, the output is the widget alone, with a warning.

```python
%env HMPLOT_NOTEBOOK_SVG=1
```

Both images rasterize what an SVG export rasterizes ("What is not vector"), at 192 dpi (twice a
screen's pixels), and leave out inputs and the settings pane, as every static export does.

## Fonts

Plot text (axes, legends, colorbar ramps, Text marks, scene and facet titles)
uses Source Sans 3 unless a theme or option names another font. The library
bundles it (Adobe's static TTFs, unmodified, in four styles, under the SIL Open
Font License, which ships beside them as `LICENSE.md`; the Python wheel inlines
them in its bundles, with `SourceSans3-LICENSE.md`). Plots load its regular face
before they lay out text, so the screen, SVG and PDF measure text alike.

A PDF's fonts are planned the same way in both paths, and the report says what
was done with each stack. Python's PDFs (printed by Chromium) embed every font,
Helvetica, Times and Courier included, and fall back glyph by glyph; the "Embedded"
column below is the browser's `exportPDF()`:

| The text's font stack | PDF font | Embedded (`exportPDF()`) |
| --- | --- | --- |
| Source Sans 3 first (the default and the built-in themes that used `system-ui`) | Source Sans 3 | yes, a subset of the glyphs used |
| A sans-serif stack of fonts the PDF has no copy of (`Inter, system-ui, sans-serif`) | Source Sans 3 | yes |
| A stack with no generic family (`"Roboto"`): treated as sans-serif | Source Sans 3 | yes |
| Arial, Helvetica or Verdana first | Helvetica | no |
| A serif, cursive or fantasy stack (`Georgia, serif`) | Times | no |
| A monospace stack | Courier | no |

The first family the PDF can print wins, as in the browser: `"Futura", Arial,
sans-serif` prints in Helvetica. Only the styles the text uses are embedded
(regular, italic, bold, bold italic; weights of 600 and above print bold), each
named with a subset tag (`ABCDEF+SourceSans3-Regular`). SVG exports name fonts
by family as the page does; a stack without a generic family gains
`sans-serif` on screen and in both formats, so a missing font falls back to a
sans-serif face rather than a serif one.

The report lists the PDF's fonts (`report.fonts`: family, style, whether it is
embedded, and, from `exportPDF()`, the embedded name) and warns about each substitution
(`Font substitution: Inter → Source Sans 3 (embedded).`), each font left
unembedded, and characters a font cannot print:

- The standard PDF fonts (Helvetica, Times, Courier) print only the
  Windows-1252 characters. A minus sign (U+2212, which tick labels use for
  negative numbers) prints as a hyphen; text with any other character outside
  that set (Greek letters, arrows, primes) prints in the embedded Source Sans 3.
- Source Sans 3 covers Latin, Greek and Cyrillic, the degree, plus-minus,
  multiplication, minus, micro, prime and arrow signs, superscript and subscript
  digits. A character it lacks (℃, ★) prints in another font in Python's PDFs
  (Chromium falls back per glyph); `exportPDF()` leaves it out.

Journals that check fonts (IEEE's PDF eXpress among them) reject fonts that are
not embedded. To embed every font, use the default font or a theme on it: the
built-in `minimal`, `presentation`, `colorblind`, `dark`, `pastel`, `graph`,
`sea`, `sunset`, `notebook` and `observable` themes start with it, and
`ghibli`, `yellowGlow`, `vaporwave` and `bauhaus` print in it. Themes on Arial,
serif or monospace stacks print in unembedded standard fonts, and the report
says so.
Fonts of your own are not embedded yet, and SVG exports do not embed fonts.
