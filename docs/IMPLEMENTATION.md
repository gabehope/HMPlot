# Implementation and validation

## Core ownership and updates (stages 78–85)

The checked boundaries are in `plot/utils/internalTypes.ts`, `effectiveFieldBinding.ts` and
`viewControllerTypes.ts`. `tsconfig.internal.json` checks the new TypeScript modules and selected
JavaScript boundaries strictly; repository-wide checking remains incremental. These contracts
describe the existing renderer, data and settling model, rather than a second runtime model.

| Owner | Owns | Borrows |
|---|---|---|
| Prepared entry (`prepareNamed`, `disposeOnce`/`own`) | Evaluated arrays, acquired columns (`acquireColumn`), retained scopes, grouped series, Dodge offsets, auxiliary columns, scale-contribution releases and a live write's newest scope (`replaceableRelease`) | Renderer fields, live scale resources and columns its scope lends |
| `BufferedField` | Queued input references, field buffers and their retirement | The caller's source array before retaining it for a queued write |
| Mark preparation coordinator | Request order, abort controllers, pending causes and unpublished-result cleanup | Publication and existing preparation tracking |
| Displayed-frame helper | Keyed transition orchestration and displayed-frame retirement | The accepted target entry and existing animation clock |
| Brush/tooltip controllers | Gesture state, timers, read generations, overlays and cancellation | Current frame, layout, renderer and mark-owned interaction rows |
| Export capture | Host capture results and temporary readback buffers | Live field bindings and arrays; it never disposes live storage |

Enrich unpublished prepared entries in place. Register a newly retained resource with `own()`
before the next operation that can fail or await. Disposal is idempotent; registering after disposal
releases immediately. Displayed entries retire through `preparedRetirement.js` after the Svelte
flush and renderer settlement, so queued consumers finish first. This does not retire renderer
buffer internals: `BufferedField` remains their single owner.

`markPreparation.js` has two publication policies. **Current request** rejects canceled or
superseded scale, series, Dodge and geometry work. **Newest completed result** allows canceled
readback-only work to publish until a newer result has published; continuously changing simulations
therefore keep completing frames. Synchronous preparation still publishes synchronously. Both
paths retain cause-based settling through `trackPreparation` and `publishWithCause`.

The accepted target (`current`) and displayed transition frame (`prepared`) remain distinct.
Request order, field-write versions and animation revisions protect different lifetimes and must
not be collapsed into one counter. Field writes return `applied`, `superseded`, `disposed` or
`failed`; `proceduralChannels.js` commits a change key only after an applied write whose entry is
still current. Failed writes can retry. Latest-value coalescing, scalar bindings, capacity policy
and row-opacity composition continue to use the existing paths.

Optional capabilities live in the view's typed services (`ViewServices`, `utils/viewServices.ts`,
Stage 117), one object per view provided under `VIEW_SERVICES_CONTEXT` and passed explicitly to
helpers outside components. `viewCore` installs diagnostics, pointer, tooltip, root-frame and
domain capabilities and the update gate; Scene2D/Scene3D install navigation controls and camera
access; Interactive installs picking, brush readback, scene access and export effects. Each
capability is a `Capability<T>`: a departing owner invalidates pending work and its release
removes only the value it installed, never a replacement's. Borrowers read `current` when they
act and tolerate its absence during mode changes or teardown. Marks publish what others read of
them as an accepted `MarkBinding` in the same services. Lifecycle/animation helpers still own
preparation barriers and clock state on `renderer.plot*` fields until they move too. A brush
retains the controls it disabled so it can restore that same object even after the view's
current controls change.

Vector export follows live fields → captured data → vector construction. The internal
`vectorExport.js` facade delegates to separate 2D and depth-sorted 3D writers, which consume
`vectorExport/capture.js`. Capture reads effective field bindings, row validity, scalar/per-row
appearance and the existing scale metadata; GPU reads happen only for an explicit export.
Render-scale constants and paired CPU/TSL evaluation live beside the scale-transform helpers.
Their equal/reversed-domain and midpoint arithmetic is intentionally distinct from other scale
helpers. Geometry algorithms, primitive budgets, raster fallbacks and the documented approximation
for intersecting 3D vectors are unchanged.

[API generation](API-GENERATION.md) documents the maintained inputs and the deliberate validation
tightening. [The JAX patch guide](../vendor/jax-js/PATCHES.md) owns fork pins, patch status and
upgrade gates. Baseline and integrated measurements belong in [PERFORMANCE.md](PERFORMANCE.md).

## Fixed defects

- `OptionsContext` invoked an undefined `defineOption` function and wrote an undefined `bounds` option during startup.
- `BasePlotObject.getValueNode()` dereferenced a null value node for solid-color marks.
- Selecting a line or segments before generating data dereferenced undefined size arrays. Demo JAX values were consumed directly in markup and were not consistently disposed.
- Capacity clipping used multidimensional scalar indexing instead of first-axis slicing.
- Two-component positions called a nonexistent JAX `.pad()` method. Line distances also relied on unavailable array methods.
- Three-component attributes allocated three floats per element while uploading four-float padded data.
- GPU copies used the allocation size instead of the logical array byte length.
- Queued inputs were not retained until execution; stale or disposed updates could retain resources or modify dead fields.
- Replaced geometry, storage attributes, option listeners, and cancelled reallocation resources were not consistently disposed.
- Threlte called the Three.js renderer's `dispose` method without its receiver. Renderer teardown now stops animation immediately and drains queued uploads before disposal.
- Repeated picking registration leaked object IDs. Asynchronous hover reads could complete after pointer exit or target replacement.
- Three.js's readback helper left staging buffers mapped and allocated. The plot now explicitly unmaps and destroys each picking staging buffer.
- Changing MSAA replaced the picking target without invalidating the frame. Picking IDs were also susceptible to transparency blending.
- Dashed-line options were not connected to their material. Connected lines lacked usable cumulative transformed distances.
- Shared geometry controls allowed unsuitable shapes and excessive icosahedron subdivisions. Concrete marks now constrain these choices.
- 3D scatter bypassed size transforms; heatmaps retained stale normal nodes and used incorrect normal slopes.
- Bicubic interpolation referenced an unimported `max` and subtracted from unsigned coordinates at the lower boundary.

## Compatibility decisions

jax-js is bundled: `@hmplot/jax` (vendor/jax-js), jax-js 0.1.25 with hmplot's patches (TODO Stage 23), exported to apps as `hmplot/jax`. Until then it was the registry package `@jax-js/jax`, a peer dependency (exactly 0.1.24 until Stage 17.13, then ^0.1.24). The shared WebGPU device and existing component paths remain. New marks reuse options inheritance and the field lifecycle; plain JavaScript and JAX inputs are borrowed.

Settings use plot-local native popovers. Host applications may hide the built-in trigger, prohibit shared editing, or open settings from their own button. Shared editing never silently replaces a local override.

Round joins/caps are implemented by the existing instanced stroke geometry. TeX supports MathJax base, AMS, and newcommand packages. Labels are flat geometry, with optional billboarding; extruded text and visual normal-vector debugging were outside the agreed scope. Browser fallback rendering and settings persistence remain outside scope.

## Validation record

The baseline production build passed, but runtime inspection found startup exceptions, so an original-versus-updated GPU timing comparison is not available. No performance improvement is claimed from build success alone.

The automated suite includes deterministic numerical/reference-count tests plus real Chrome WebGPU tests covering all marks in both scene types, empty data, the 250,000-point case, clipping containers, multiple plots, local and shared settings, external triggers, narrow viewports, teardown, and actual pointer picking under both AA modes.

On this machine, the 250,000-point scene retained 3 renderer geometries, 7 textures, 2 active field managers, and 4 managed fields before and after repeated size changes. This checks stable resource counts; the test's explicit settling delays are not a rendering benchmark.

Generated screenshots are saved under the ignored `test-results/` directory. Use `/gallery` to review lit surfaces, explicit triangle meshes, arrows, dashed lines, curves, text, and TeX together.

Earlier stabilization checks: 14 unit tests and 6 Chrome/WebGPU browser tests passed. A separate empty temporary checkout completed `npm ci` and the production build, confirming that the local tarball dependency is gone. The final workspace production build also passed without application Svelte warnings. The existing large-bundle and static-adapter fallback notices remain.


## Settings revision

The settings revision is organized into three reviewable parts:

1. **State and regression fixes:** definition-based control ordering; intermediate namespace inheritance; owner queries; structural subscriptions separated from value updates; numeric validation with independent slider bounds. Nested shader uniforms now invalidate the rendered frame when edited.
2. **Inspector and plot controls:** an indented target tree, explicit Plot settings versus Plot defaults, grouped dependent controls, stable scrolling and expansion, named inheritance sources, local view mode with optional `bind:type`, and a contextual trigger measured against the actual canvas.
3. **Integration validation and documentation:** a deterministic `/settings-fixture` route with nested heatmaps, two plots, host controls, clipping, and a sidebar. Browser tests compare rendered pixels as well as values, and cover shared overrides, target recovery, labels, external anchors, keyboard access, resizing, and touch-only suppression.

The fixture exposes read-only option/diagnostic helpers and programmatic opening for browser tests. Existing public settings flags and component paths remain supported. No persistence, layout resizing controls, camera-state persistence between modes, or sidebar is introduced.

Settings validation (2026-09-09): all 23 unit tests and all 12 Chrome/WebGPU browser tests passed. The six settings browser tests also passed after the final help-text cleanup. Grid enable/disable and styling, quantized levels, and contours were verified against rendered pixel changes, including restoration of the original image after disabling the grid. The 250,000-point case again settled at 3 geometries, 7 textures, 2 field managers, and 4 fields before and after repeated updates. Production build and whitespace checks passed; existing bundle-size and adapter notices remain.

## Marks and view axes

The inherited mark settings target is now named **Marks**. Plot settings includes optional 2D coordinate axes (`axes2d`, off by default) and a hover-only 3D orientation indicator (`orientation3d`, off by default since TODO 60). The SVG overlays do not intercept pointer events or allocate GPU geometry. Tick positions invert the common Marks coordinate transforms and track the active orthographic camera during pan and zoom. Linear, logarithmic, square-root, reversed, and degenerate scales have numerical coverage.

Shape replacement now preserves the mesh geometry's lifetime and the mark's instanced data buffers. Only retired mesh vertex/index attributes are released, through Three's attribute registry, and material state is invalidated for the new topology. This avoids destroying shared JAX-uploaded buffers and avoids a second destruction during teardown. The adapter uses the installed Three WebGPU renderer's attribute registry; geometry replacement and teardown tests should remain mandatory when upgrading Three.

Browser coverage includes repeated sphere/cube/detail changes, identical rendered pixels after a round trip, stable settled resources, and switching away from the edited mark. Orientation visibility/rotation, 2D scale edits/zoom, and both settings toggles are covered too. Escape also dismisses settings when the search field is focused; invalid numeric drafts still consume their first Escape to cancel editing.

Validation for this update: 24 unit tests and all 14 Chrome/WebGPU browser tests passed, including the geometry pixel round trip and explicit teardown. The production build passed without application Svelte warnings. The 250,000-point resource counts remained stable.

## Remembered inspector state and 2D axis styling

Closing and reopening the inspector now preserves its selected target, search, section expansion, and scroll position for each mounted plot. Explicit shared editing retains its banner and context; first opening still starts at Plot settings. Existing removal recovery selects a surviving ancestor when a remembered target disappears.

The 2D axis style section adds CSS-pixel font size, line thickness, tick length, four margins, tick-label and title visibility, and editable X/Y titles. These use the existing options inheritance/reset system and are disabled unless 2D axes are active. Margins crop and position the overlay without remapping data coordinates, and are bounded on small canvases.

Validation: 25 unit tests and all 15 Chrome/WebGPU browser tests passed. New regressions exercise remembered mark/shared targets, search and scrolling, SVG style/label changes, resets, and mode/visibility dependencies. The 250,000-point settled resource counts remain unchanged.

## Reusable Svelte package

The public entry point exports Plot, all marks, OptionsContext, initialization,
and component prop types. `npm run package` emits the library and declarations;
`npm pack` rebuilds it and creates an installable tarball. The existing demo build
remains separate. Package contents exclude routes, tests, and local build output.
Renderer libraries are peers, with the validated Three/JAX/Threlte versions pinned
to avoid incompatible GPU or context instances. Demo-only dependencies are kept
out of consumer runtime dependencies.

Initialization is now lazy and browser-only, without SvelteKit imports or source
aliases. SSR emits a loading placeholder; mounting starts the shared WebGPU
initialization. The demo and numerical fixtures use the exported initialization
function. Packaging also corrected type-only picking imports, optional component
props, and shader-node declarations that prevented declaration generation.

`npm run test:package` installs the actual tarball into a fresh plain Svelte/Vite
app, checks TypeScript usage and SSR, builds for production, then exercises real
Chrome/WebGPU rendering, settings, fonts/TeX, camera switching, and remounts. The
consumer fixture includes the TypeScript preprocessing required by Threlte and
uses a modern build target. Installation instructions are in `docs/USAGE.md`.

Packaging validation (2026-09-09): the isolated tarball consumer passed installation,
type checking with zero diagnostics, SSR, production build, and Chrome/WebGPU
checks. All 26 unit tests and all 16 browser cases passed. The interpolation fixture
was updated for lazy initialization; one Chrome screenshot timeout passed on rerun.
The demo production build passed. The 250,000-point case retained its settled
3 geometries, 7 textures, 2 managers, and 4 fields. Existing bundle-size and static
adapter notices remain. No package was published to a registry.

## GPU-resident arrows and links

Arrows now validates shape metadata and uploads JAX endpoints/attributes directly,
without reading values back or compacting input rows. Zero-length transformed
arrows use a finite fallback frame and collapsed geometry, preserving input
indices while producing no fragments or picking hits. Static mesh attributes are
interleaved to stay below WebGPU's vertex-buffer limit with buffered width/color
and picking enabled.

Segments with control points use JAX for cubic Bezier subdivision, attribute broadcasting, and cumulative
Euclidean distances after coordinate transforms. Prefix sums reset for each link.
Omitting both controls selects a one-segment straight path. Inputs are borrowed;
returned arrays are retained by the existing upload queue and released by the
component. Invalid shapes fail before field updates, and obsolete uploads retain
the existing cancellation/disposal behavior. GPU intermediate allocation and
buffer copies remain; these paths eliminate bulk CPU readbacks, not all copies.
Surface remains on the CPU mesh-construction path.

Validation: 31 unit tests and all 17 Chrome/WebGPU browser tests passed. New tests
compare curves/distances against CPU numerical references, check scalar and vector
attributes and reference ownership, and instrument JAX readback methods during
2D/3D rendering, rapid updates, subdivision changes, picking, and remounts. The
GPU-mark test recorded zero readbacks, stable settled resource counts, no WebGPU
validation errors, and identical blank pixels with zero-length arrows versus no
arrows. The existing 250,000-point resource regression also passed.

The demo production build and isolated tarball consumer checks also passed. The
installable `artifacts/hmplot-1.0.0.tgz` has been rebuilt with these changes.
