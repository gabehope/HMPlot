# Using the plotting library

The package name is currently **hmplot**, matching this repository. It works
with Svelte 5 and SvelteKit. The demo site remains separate from the library.
The following workflow builds and installs the package from this checkout. It does not depend on registry publication.

## Build and install locally

In this repository:

```sh
npm ci
npm run package
mkdir -p artifacts
npm pack --pack-destination artifacts
```

In the consuming project:

```sh
npm install /absolute/path/to/HMPlot/artifacts/hmplot-0.1.0.tgz
```

Modern npm installs the declared peers automatically. The tested renderer
combination requires Three **0.183.2**, Threlte core **8.5.0**, Threlte extras
**9.9.0**, and Svelte **^5.40.0**. If your app already uses these packages, align
their versions: duplicate Three instances can break shared GPU devices and
buffers. Run `npm ls svelte three @threlte/core` to inspect. jax-js is not a peer:
hmplot bundles its own (see "JAX input arrays" below).

Rebuild/repack and reinstall the tarball after library changes. A workspace
dependency is also possible: point it at this repository and run
`npm run package -- --watch` while developing.

## Basic use

```svelte
<script>
  import { Plot, Points, Text3D } from "hmplot";
</script>

<Plot name="Results" width={600} height={400} axes2d>
  <Points
    name="Samples"
    position={[[-0.5, -0.3], [0.2, 0.7], [0.6, 0.1]]}
    fill="steelblue"
    size={6}
  />
  <Text3D text="My results" position={[0, 0.8]} font="optimer" />
</Plot>
```

Public exports include `Plot`, `Heatmap`, `Points`, `Points3D`,
`Segments`, `Line`, `Surface`, `Arrows3D`, `Text`, `Text3D` and `initializePlot`.
Chart templates such as `Arrows` come from `hmplot/charts`; statistical templates such as `Bin`
come from `hmplot/stats`. Custom option field types
such as `ScalarType` and `ColorType` are exported from `hmplot/types`.

For detailed mark inputs and settings, see the package README.

## Browser and build requirements

Rendering requires WebGPU, normally through HTTPS or localhost. Unsupported
devices display the existing error state. There is no WebGL fallback.

Importing the library does not initialize the GPU. Plot starts initialization on
mount, sharing one JAX/Three device across plots. SvelteKit can render the loading
placeholder on the server; you do not need to disable SSR for the page.

For a plain Svelte/Vite app, use the normal Svelte plugin and a modern build target:

```js
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  build: { target: "esnext" },
});
```

Add TypeScript preprocessing for Threlte's dependency components in `svelte.config.js`:

```js
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
export default { preprocess: vitePreprocess({ script: true }) };
```

For SvelteKit, keep your adapter configuration, add this `preprocess` option,
keep `sveltekit()` as the Vite plugin, and set the same build target.
This accommodates modern syntax in the renderer dependencies. No app aliases,
copied assets, or global stylesheet imports are required. Font and TeX modules
load through the consuming app's bundler.

## JAX input arrays

JavaScript arrays need no setup. hmplot bundles its own jax-js: jax-js 0.1.25
with patches that keep GPU programs from recompiling for every new array length or
value (`vendor/jax-js/PATCHES.md` in the repository). Create JAX arrays with it,
from `hmplot/jax`, after initializing the shared WebGPU backend, in the
browser:

```js
import { initializePlot } from "hmplot";
import { numpy as np } from "hmplot/jax";

await initializePlot();
const points = np.array([
  [0, 0],
  [0.5, 0.5],
]);
```

Call this from `onMount` or a browser event, not during SSR. Dispose arrays you
own when finished; marks retain inputs while uploads are pending. Initialization
selects WebGPU as JAX's default backend, so applications using JAX independently
should account for this shared setting.

### Apps that use jax-js themselves

A JAX array belongs to the jax-js copy that made it, and each copy has its own GPU
device. An app that imports `@jax-js/jax` itself has a second copy: hmplot
copies that copy's arrays through the CPU (once per array, blocking while it reads
the array back) and warns once. That suits data that doesn't change every frame.
To make the app's `@jax-js/jax` hmplot's instead, so its arrays pass straight
in, add the Vite plugin:

```js
// vite.config.js
import { hmplotJax } from "hmplot/vite";

export default defineConfig({ plugins: [hmplotJax(), sveltekit()] });
```

In TypeScript, give `@jax-js/jax` hmplot's types too (the two copies' classes
are separate types):

```json
{ "compilerOptions": { "paths": { "@jax-js/jax": ["./node_modules/hmplot/dist/jax.d.ts"] } } }
```

The app's own jax-js code then runs hmplot's jax-js version, whose API is
upstream jax-js 0.1.25's. With another bundler, alias `@jax-js/jax` to
`hmplot/jax`.

## Host-owned settings trigger

```svelte
<script>
  import { Plot, Points } from "hmplot";
  let plot;
</script>

<button onclick={(event) => plot.openSettings(event.currentTarget)}>
  Chart settings
</button>
<Plot bind:this={plot} settings={{ showTrigger: false }}>
  <Points position={[[0, 0]]} />
</Plot>
```

`showTrigger: false` hides the corner buttons; the plot's context menu still offers settings
and export. Add `showExport: false` to leave export out of the menu too, or `menu: false` to
turn the menu off (docs/NOTES.md lists the flags).

## Writing a pattern

A *pattern* is a composition of existing components packaged as one: a Lollipop is a stem and a
head, a Histogram a Bin and bars. Inside the library and in Python a pattern is a *template*
(TODO 130): a tree of components with parameters, which a host expands. There are four ways to
write a pattern, the first three of them templates:

- **A built-in template**, such as Bar, Histogram or Pie (`src/lib/compound/*.js`): a definition
  of data alone, with its options declared in its `signature`. All of the library's former
  compound marks are templates, and none is left as a hand-written compound (TODO 130.5).
- **A chart**, such as Dumbbell (`src/lib/charts/*.js`): a template over public components only,
  defined in one file ("Writing a chart" below).
- **A Python template** (`hm.Template` or `@hm.template`), which can be exported as a portable
  `.hmplot.json` file and used from Svelte through `PortableTemplate` (python/README.md
  "Templates", docs/PORTABLE-TEMPLATES.md).
- **A Svelte component of your own** over the `composition` surface, below, when you write the
  pattern outside the library.

The built-in templates are exported from `hmplot/charts` (`hm.charts` in Python). The
`hmplot/compound` compatibility subpath also exports the
authoring surface they are built from:

```js
import { Lollipop, composition } from "hmplot/compound";
```

`composition` is the complete set of internals a pattern written in Svelte may use. Everything
else in the library is private and may change without notice.

| Export | Use |
|---|---|
| `Transform` | Run a named transform (Bin, BoxStats, BarGeometry, PieGeometry, ...) around children |
| `DataBoundary` | Accept a `data=` prop by wrapping children in a data scope |
| `ThemeDefaults` | Apply the theme's defaults for this mark kind; `only=`/`except=` route theme keys to one part |
| `Undescribed` | Leave a helper part out of the Plot's description: one that draws nothing a reader sees, such as Histogram's brush carrier |
| `getOptionsContext`, `setOptionsContext` | Own a settings scope so the mark's options appear in the pane |
| `DATA_CONTEXT`, `categoryColumn`, `categoryField` | Read the enclosing data scope, for example to find the categorical axis. `categoryField(scope, field)` asks whether a field is categorical without copying a Filter's kept rows (prefer it in a check that runs on every update) |
| `axisCategory` | `axisCategory(getOptionsContext(), "x")`: the frame's categorical scale on that axis (its `domain` is the axis order, `subscribe` reports changes), or `null`; a transform that declares `categoryAxis` (BoxStats, a violin's Density) reads it itself |
| `IntegerType`, `SelectType`, `FieldType` | Declare option types for settings |
| `minimum`, `maximum`, `greater` | Expression builders, to derive a channel from another (a sorted interval) or a Filter's condition |
| `isAnimate` | Recognize an `animate()` descriptor, to unwrap it for a part you derive |
| `ENDPOINT_COMPOUND_CONTEXT`, `endpointDescriptor` | Make the mark a connection endpoint: the context registers its primitive under the mark's name, and `endpoint({at})` returns `endpointDescriptor({handle, at, kind})` |
| `AXIS_NAMES_CONTEXT`, `channelTitle` | Title the axes by the user's columns rather than your internal ones: `setContext(AXIS_NAMES_CONTEXT, () => ({x: channelTitle(scope, x), y: channelTitle(scope, y)}))`, with `scope` the Data scope around the mark (`getContext(DATA_CONTEXT).read()`); every primitive inside votes with these |
| `MAPPING_CONTEXT` | Read the enclosing Mappings' layers where your parts can't take them themselves: `getContext(MAPPING_CONTEXT)?.read()` is the list of layers, outermost first (ErrorBars fills its x, y and bounds from them to compose its ends) |
| `INPUT_CONTEXT`, `InputPending`, `resolveInput` | Resolve input reads in a prop the mark reads itself (the ones it passes to primitives are resolved there): `resolveInput(bins, getContext(INPUT_CONTEXT), "MyMark.bins")` returns the input's value; while that input still reads the data it throws `InputPending`, so keep the last value |
| `Rect`, `Area`, `Points`, `Anchor`, `Prism`, `ErrorBars`, `Segments`, `Line`, `Text` | Data-bound marks: they resolve column names against the enclosing scope (ErrorBars is a template over Segments with bar caps) |
| `Frame`, `VIEW_CONTEXT` | A frame of the mark's own, and the view it draws in (`getContext(VIEW_CONTEXT)`: `width()` and `height()` in CSS pixels, `frame()` the visible world box). Pie places a polar `Frame` in a Cartesian frame and sizes it from the view |
| `Density`, `Dodge`, `Regression`, `Contour`, `Filter` | Public transforms the built-in templates wrap (Violin, Swarm, Smooth, DensityContour, DensityBands; Ecdf wraps the internal `ECDF` kind through `Transform`) |
| `DODGE_AXIS_CONTEXT` | Your own rule for the axis a `Dodge` inside moves points along: `setContext(DODGE_AXIS_CONTEXT, (scope) => "x" or "y")`. The Dodge calls it with its data as it lays out, in place of `axis`, so an error it throws is the mark's and clears with the next good update (Swarm: across its one categorical position) |
| `Polygon` | Filled polygons, a core primitive: vertex rows grouped by `series`, or the triangle rows Contour, Voronoi and Hull make (with no x or y). DensityBands draws its bands with it |
| `planeRule` | `planeRule(kind, dimension, () => value)` during initialization: `drawn` is false in a 3D Cartesian view, where x = c is a plane, and the view gets an error naming `kind` (none for a rule at the pointer, which is missing there); it follows the view between 2D and 3D. Draw your rule `{#if guard.drawn}` (RuleX, RuleY, Crosshair) |
| `framePointer` | `framePointer()` during initialization: the pointer in the enclosing frame (`x`, `y`: NaN off the frame, a category over a band axis), its `visible` domain, `curved` (polar or spherical) and `readout(axis)`, the value as text. It updates once per animation frame with a move and never at rest; Crosshair's readouts use it |

A lollipop in its simplest form is a stem and a head. This is the external form, as a
project outside the library writes it (it is also the fixture at
`src/routes/test/lollipop/CustomLollipop.svelte`, which the browser suite renders):

```svelte
<script lang="ts">
  import { composition } from "hmplot/compound";
  const { ErrorBars, Points, ThemeDefaults, minimum, maximum } = composition;
  let { x, y, baseline = 0, stemColor = "#8a949e", stemWidth = 1.5, size = 5, name, ...props } = $props();
  let head = $state<any>();
  export const getLegendSource = () => head?.getLegendSource();
  export const getMark = () => head?.getMark();
</script>

<ThemeDefaults kind="Lollipop">
  <ErrorBars name={name ? `${name} stems` : undefined} {x} {y}
    lower={minimum(baseline, y)} upper={maximum(baseline, y)} color={stemColor} width={stemWidth}
    capSize={0} legend={false} visible={props.visible} opacity={props.opacity} />
  <Points bind:this={head} {name} {x} {y} {size} {...props} />
</ThemeDefaults>
```

Three conventions matter. Forward the remaining props (`{...props}`) to the mark that should
carry color, size, and interaction, and re-export `getLegendSource` and `getMark` from it, so
legends, picking, and tests treat the pattern like any other mark. Give secondary marks
`legend={false}` so they do not add their own legend entries, and pass them the props that
describe the mark as a whole (`visible`, `opacity`). Derive channels with expressions rather
than reading the data yourself: the stem above sorts its ends with `minimum`/`maximum` because
ErrorBars drops a reversed interval, and a value below the baseline would otherwise lose its
stem.

The library's Lollipop is a template since TODO 130.3 (`src/lib/compound/lollipop.js`): a
BarGeometry places each row's base and tip, a Segments draws the stem between them and Points
the head at the tip, and its wrapper adds orientation detection with `categoryField` (a
categorical `y` lays the stems along x; two numeric axes are a vertical stem plot), an
`animate()` on the value moved onto the heads' tips, and the props the stems share with the
heads (`visible`, `opacity`, `respond`, `identity`, `enterEffect`/`exitEffect`, the animation
props). Two `ThemeDefaults` nodes route `theme.marks.Lollipop.color` and `.width` to the stems
and `.size` to the heads, and its named part `stem` takes the stems' own props as one object
(`stem={{ color: "gray", dash: [2, 2] }}`).

Inside the library, each built-in template is a definition of data alone, which an internal
host expands with no code per mark. Ecdf shows the parts:
`src/lib/compound/ecdf.js` names its parts (`Transform kind="ECDF"`, then `Line`), routes its
parameters to them with `param("by")`, computes the ones that depend on others
(`color: where(isMissing(param("by")), null, coalesce(param("color"), param("by")))`), and sends
every other prop to the Line with `rest()`; `ecdf.svelte` only hands the host its parts. Bar
(`src/lib/compound/bar.js`) adds what a definition declares beyond its tree: `prop("fill")` reads
a prop that still goes to the Prism (its stacking series), `forbid` refuses `width` with the
error that names `bandFraction`, and `endpoint` makes the Prism the Bar's connection endpoint,
with its `value` and `baseline` ends declared by form. Each definition's `signature` declares
its options as the options table writes them, `option(type, doc, extra)` for its own and
`refine({...})` for a shared one it gives a default or a doc of its own; the generator writes its
options-table entry, its TypeScript props and its Python signature from it, so the template is
declared once.

A pattern does not need to handle groups itself. `Violin`, `BoxPlot`, and `Swarm` draw one
shape per category because their transforms group internally, but the same shapes can be written
as `Partition` plus primitives: put `<Partition by="species">` around the transform and marks and
each group draws its own, in the parent's frame and on the parent's scales. Prefer that when the
per-group shape is something the library does not provide.

To publish a built-in template from the library:

- add it to `src/lib/compound/index.ts` and `src/lib/index.ts`, and declare its options in its
  definition's `signature` (TODO 130.5): the generator writes its options-table entry (a mark,
  so `registry.json` lists it in `marks`, where Python's `core.DISPLAYABLE_MARKS` reads it) and
  its props type from it; add the type to the generated types `publicTypes.ts` re-exports, and
  to `src/lib/compound/index.ts`'s type exports;
- list it in `src/lib/templates/builtins.js`: its `theme.kind` is a kind `theme.marks` accepts and its `endpoint` makes it a
  connection endpoint; the regenerated `registry.json` carries the theme kinds to Python as
  `themeKinds`;
- add it to the `COMPOUND` list in `tests/unit/compound-move.test.js`, write its
  `reviewedReference.js` entry and reference page, a gallery example, a browser spec, and a
  numbered Python notebook.

Outside the library, write the same component in your own project and import `composition`
from `hmplot/compound`; that surface is experimental and may change between minor
releases. Note that `theme.marks` rejects kinds it does not know, so an outside mark cannot be
themed under its own name: give its `ThemeDefaults` an existing kind, or pass explicit props.

Python writes a pattern as a template (`hm.Template` or `@hm.template`, with `hm.slot()`
where the caller's children go, the counterpart of `{@render children()}`). See
python/README.md, "Templates".

## Writing a chart

A *chart* (TODO 130.4) is one file in `src/lib/charts/`: a template over public components whose
parameters declare their options. Charts are exported from `hmplot/charts` in Svelte and
`hm.charts` in Python. Dumbbell is the first generated definition:

```js
import { defineChart, node, option, param, rest } from "../templates/define.js";

export default defineChart({
  kind: "Dumbbell",
  summary: "Two values per category, as points joined by a stem: before and after, or two groups.",
  use: ["mark", "markSettings", "detail", "transparent"],   // the options table's shared sets
  omit: ["x", "fill", ...],                                  // ... less what the chart sets itself
  params: {
    y: option("channel", "The categories along y, one dumbbell each.", { input: true }),
    x0: option("column", "The column of each dumbbell's first value.", { input: true }),
    ...
  },
  root: node("Mapping", {}, [ ... node("Points", { ..., ...rest() }) ]),
});
```

`option(type, doc, extra)` takes the options table's type names and its other keys (`default`,
`units`, `input`, ...). `required: true` makes leaving the option out an error that names the
chart and the option ("Dumbbell needs x1: ..."). A Python-only option (`languages: "python"`,
such as a mark's `data`) is Python's to handle and is not a parameter of the template. Props the
caller gives that are not parameters reach the main part through `rest()`; another part takes one
with `prop("opacity")` (Dumbbell's stems follow its opacity, selection and animation this way). `npm run check:python-signatures` (or `node
scripts/generate-python-signatures.mjs` to write them) derives the rest from the file: the
options entry (`src/lib/scene/options.charts.json`), the TypeScript props and Svelte component
(`src/lib/charts/generated/`), the component loader, the package export, the Python signature and
stub, and the reference page's prose. Edit the definition, never those outputs.

The boundary is checked (tests/unit/chart-boundary.test.js): a chart imports only
`../templates/define.js` and mounts only public registry components, and nothing in the library
imports a chart but the package's exports and the component loaders. A chart that needs something
the core lacks waits for a core change justified on its own. A part the caller styles is a named
part (`parts: ["stem"]`, a node with `id: "stem"`), taking its props as one object.

A new chart is its definition, a gallery example (`src/examples/<id>-basic/`, in Python and
Svelte), its line in the `EXPECTED` marks of `tests/browser/charts.spec.js`, and its Python
fixture (`.venv/bin/python scripts/generate-chart-fixtures.py`). The spec draws the example from
Svelte and from Python and counts the marks in both exports.

## Accessibility

Each Plot describes itself to screen readers. Its section is named by its `title` (else its
name) and described by a summary generated from what it draws: the chart its marks make and the
columns they plot, the categories of a color legend (the first eight, then "and N more"), each
axis's range as its ticks write it (or its categories), and the number of rows. For example:
"Scatter plot of mass (g) against length (mm), colored by species (Adelie, Chinstrap, Gentoo). x
from 32 to 60, y from 2700 to 6300. 344 points." Chart components describe themselves
("Histogram of mass in 30 bins").

```svelte
<Plot title="Penguins" description="Body mass rises with bill length in every species.">
  <Points x="length" y="mass" fill="species" />
</Plot>
```

`description=` is read first and the generated summary follows; `describe={false}` keeps only
yours. The summary is written when the plot settles after a change of data or settings, never
per frame: a plot that animates or runs a Simulate is described at rest, and says it moves.
`plot.getDescription()` returns it and `subscribeDescription(fn)` follows it; in Python,
`plot.description` reads it once a view has shown the plot (as input values sync).

Exports carry it: an SVG's `<title>` and `<desc>`, a PDF's title and subject, and an HTML export's
page title (`<html lang="en">`, the first Title or plot title in it).

Not yet: keyboard navigation of rows, a data table view, and forced-colors or contrast modes. The
summary is in English.

## Validation and distribution

`npm run test:package` creates the tarball, installs it into an isolated plain
Svelte app, checks TypeScript usage, server rendering, and the production build,
then exercises Chrome/WebGPU rendering, settings, fonts, and remounts. It needs
Chrome and registry access to install the consumer dependencies.

The generated tarball is sufficient for private local use. To publish later,
choose an available package name or npm scope, update the version, verify the
tarball contents, and publish from an authorized npm account. This project does
not publish automatically; `prepack` only rebuilds the library.

### Scientific images and fixed scales

`Image` accepts float32 JAX arrays with shape `[height, width]`,
`[height, width, 1]`, `[height, width, 3]`, or `[height, width, 4]`.
RGB channels are sRGB values in `[0, 1]`; alpha is linear. Row zero is at the top.
Three- and four-channel images follow the RGB color rule: integer data (integer
GPU arrays, NumPy integer arrays from Python) is 0-255 and float data 0-1, and
values outside the range are an error rather than clamped. `Heatmap` maps one
value per cell through a colormap; giving it `[height, width, 3 or 4]` colors is an
error that points to `Image`.
Plots draw image colors faithfully by default (no tone mapping); `toneMapping={4}`
opts into ACES filmic. Uploads use the shared device's GPU
buffer-copy path. The input array remains owned by the caller.

`<Heatmap fillScale={continuous({ domain: [-1, 1] })}>` uses a fixed scalar scale;
`continuous({ domain: "symmetric" })` scales by the maximum absolute value. Without a domain the values' extent is
used.
Storage starts small and grows geometrically to accommodate actual data, bounded
by device storage-buffer limits. Capacity is reused for subsequent smaller data.

Optional plot overview and 3D camera navigation: see [MINIMAP.md](./MINIMAP.md).

## Built-in settings, navigation, and PNG export (1.1.1)

Every `Plot` includes its own inherited settings pane; it is not gallery UI.
`plot.openSettings(anchor)` opens it. Sections start closed, and the Search button
reveals the search field. Export PNG in this pane uses the same public
`await plot.exportPNG({ scale })` method (a PNG `Blob`). Export explicitly downloads
an owned GPU render target, including surface textures and enabled axis labels;
settings, minimaps, and orientation gadgets are excluded. Export scale changes
output resolution without changing the live canvas or camera.

Cartesian 2D plots now fit the full configured domain inside their axis margins.
`aspect="auto"` fills the rectangular drawing area; `aspect="equal"` keeps one data unit
the same length on x and y (in each axis's transformed units): the axis with room to spare
widens its automatic domain to fill the area, or, when you gave its domain, the area narrows
(letterboxes) so that domain is drawn as given, up to 45% of the plot on a side (TODO 136.14). Polar plots and spherical projections retain equal aspect.
Fit is `{x: .5, y: .5, zoom: 1}`; positive factors below one are accepted for
controlled views. Interactive zoom stops at the fitted extent. X/Y zoom and pan
clamping are independent and use the configured domain, not a fixed square.

```svelte
<Plot bind:this={plot} axes2d aspect="auto" overview overviewAxes={{x:true}}>
  <Line position={series} width={1.25} />
</Plot>
<!-- External placement instead of the embedded overview: -->
<Minimap for={plot} width={900} height={90} axes={{x:true,y:false}} />
```

`Minimap.axes` and `Plot.overviewAxes` accept `false` (default), `true`, or an X/Y
visibility object. They reuse source tick formats, transforms, and datetime
metadata; axes have their own reserved margins. The minimap follows the source
aspect choice and uses its full configured domain.

`axes3d` enables a fixed Cartesian extent box. `axes.z` configures Z tick
formatting. For X–Z heatmap surfaces, the box follows the surface's height mapping.
Its titles are the frame's axis titles, as in 2D: an explicit label, else the column
the marks plot (a surface over a Grid of `lon` and `lat` reads lon, lat and the
gridded field on the height axis); a surface over unnamed arrays has no titles
(it read X, Height and Y before). `axisTitles={false}` hides them. Spherical plots keep geographic
guides. The box is included in PNG exports.

## Long uniformly spaced series

The `/examples` gallery includes a GPU-generated signal with 100–1,000,000
observations, a lower minimap, and Adaptive detail / Every point controls. Its
full source is shown beside the example.

`<Line sampling="uniform-x" ...>` enables viewport-aware extrema reduction for
**finite, monotonically increasing, uniformly spaced X coordinates** and a linear
X transform. An automatic x domain works (its padding is allowed for); an explicit
one must be the first/last X values. All source
observations stay on the GPU; ordered minima/maxima are retained per screen bin.
Do not use this option for irregular spacing, missing values, or arbitrary paths.
`sampling="random"` (default) keeps ordinary full-detail rendering unless a draw
limit is set. The minimap has its independent default 1,000-segment limit.

Ordinary connected-line subsampling uses parallel path classification and
hierarchical scans, preserving path breaks. Serial scan blocks are bounded to
256 values; spherical paths retain their separate fixed safety budgets.

See [Animated updates](./ANIMATION.md) for inherited duration/easing controls, GPU data transitions, and synchronization APIs.

See [Legends and uncertainty marks](./GUIDES.md) for guide placement, scalar mappings, and Cartesian interval marks.

See [Named data and categorical plotting](DATA.md) for named columns, category scales, axes, and legends.

See [Facets, transforms, and columns](FACETS.md) for indexed data scopes, shared domains, GPU transformations, Rect, Prism, and swarms.

See [Inputs, Interpolate, Slice, and force-directed graphs](INPUTS.md) for sliders, selects and playback that drive transforms, and for interpolation and layout examples.

## Geographic maps

See [GeoJSON maps](./GEOJSON.md) for named feature properties, joins, projected and globe extrusions, and feature picking.

### Plots and coordinate frames

`Plot` owns the renderer, camera, navigation, and export. Direct marks use its
implicit coordinate frame. `data={table}` adds a Data scope and enables
positional domain inference; a nested `Data` replaces that scope.
`Facet data={table}` establishes data before partitioning. Use sibling Frames for
different coordinate domains in one Plot:

```svelte
<Plot data={measurements}>
  <Frame x={{domain: [0, 24], label: 'Hour'}} y={{domain: 'auto', label: 'Temperature'}}>
    <Line x="hour" y="temperature" />
  </Frame>
  <Frame x={{domain: [0, 24], visible: false}} y={{domain: 'auto', label: 'Rainfall', side: 'right'}}>
    <Line x="hour" y="rainfall" color="coral" />
  </Frame>
</Plot>
```

A Frame has its own dimension, and its own axis, only when it sets a `domain` (an interval, or
`"auto"` to infer it from its marks), `range`, `transform` or `scale`; a Frame that sets only
`label` or `side` inherits the Plot's dimension. The Plot's own axes show when marks plot in its
coordinates (directly in the Plot, or in a Frame that inherits one of its dimensions), so sibling
Frames that own both dimensions draw only their own axes.

`Frame` is the coordinate component; a Plot's own coordinate root is an ordinary Frame.
When a Plot has one top-level, unplaced Frame containing all plotted content,
that Frame becomes the root for navigation and brushing. Direct marks, sibling
Frames, or a Frame with parent-coordinate ranges or placement retain the
implicit root. Data and transform wrappers do not change this choice. A root
Frame that leaves a dimension to the Plot keeps the Plot's explicit domain
for it and shows its axis when the Plot shows 2D axes (`axes2d`).

Frame owns positional domains, transforms, output ranges and decorations. Its x/y/z
objects accept `domain`, `transform`, `range`, `scale` (categorical), `label`, `show`,
`side`, `type`, `origin`, `timezone`, `format`, `major`, `minor`, `step`,
`subdivisions`, `majorInterval`, `minorInterval`, and `grid`. Hiding decorations does
not disable the mapping. Explicit domains take precedence over inferred domains.
Spherical frames retain the geographic domain. Numeric `zScale` on a surface is
still relief amplitude, independent of the Z coordinate frame.

Shared camera movement affects every frame. Align twin frames using matching domains on
shared dimensions. Programmatic per-mark bounds/ranges/transforms remain supported;
their controls are intentionally absent from the mark settings menu.

`Minimap for={plot} axis={rainfallFrame}` selects its label frame; its default
is the active root. The overview renders every frame. Plot exports include all axes.

Facet's settings button (in its top right) controls partition fields, ordering, wrap, spacing, shared
or free domains, linked navigation, inherited appearance, per-definition Axes defaults,
and grid export. Cell overrides and camera memory survive virtualization.

### Histograms

```svelte
<Plot data={observations} axes2d>
  <Histogram x="value" bins={24} normalization="density" fill="#547ba2" />
</Plot>
```

Histogram composes Bin and Rect. Supply exactly one measured dimension: `x` for
vertical bars, `y` for horizontal bars. `bins` accepts a count (default 30) or edges.
The measured axis is titled by the binned column and the other by the normalization
(count, proportion or density), unless you label them.
`normalization` is `count` (default), `proportion`, or `density`; normalization uses
only finite observations included in the bins. Density also divides by each bin's
width. Empty bins remain present and the frequency axis includes zero. To let the
viewer change `bins` or `normalization`, read an input in it: `bins={input("bins")}`
with a Slider named `bins` ([Inputs](INPUTS.md)). Raw contributor counts and
aggregate picking identities remain available.
