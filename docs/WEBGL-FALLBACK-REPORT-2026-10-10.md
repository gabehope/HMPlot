# Minimal WebGL and JAX WASM fallback for HMPlot

**Codex-generated**

**Date:** October 10, 2026

**Updated:** October 11, 2026 — planned as TODO Stage 124, with interleaved regression gates.

**Reconciled against main:** `976a111f1090af5e962bd4c4955fdcd4305d8bb7` (Stage 121 complete).

**Original probe snapshot:** `bc199704ead073e175381cecb454d9427ce82f2f`. The earlier probes
below are retained as historical evidence; they have not been rerun against this baseline.

**Scope:** Feasibility report and proposed changes. No library implementation changes.

**Execution checklist:** Stage 124 in the TODO, with Stage 122.6 owning the shared
field/storage readability work. The October 10 request reopens the bounded feasibility work
after Stage 71's earlier decision; delivery follows only after the spike's recorded go decision.

## Recommendation

A practical fallback is feasible without replacing HMPlot's renderer architecture or rewriting
its numerical transforms. Keep the existing Three.js `WebGPURenderer`, select its **WebGL2
backend**, run the existing JAX programs on **WASM**, and add host implementations at the
boundaries that currently require direct WebGPU access.

This is a moderate compatibility project spanning initialization, field uploads, raster
preparation, geometry, interaction, and delivery. It is substantially smaller than maintaining
a second set of marks. It is also more than changing `forceWebGL`: ordinary heatmaps,
colorbars, picking, and some line rendering currently bypass Three's portable interfaces.

The smallest useful version should support ordinary interactive plots, data updates, and
exports, while accepting slower computation, snapped mark transitions, and simpler curve
tessellation. Data `tween()` and `@time` still compute new values; animated plots need a
separate usability gate and may run substantially slower. GPU sampling optimizations and
specialized globe/rendering effects can stay outside its initial support contract.

Here, “OpenGL” means **WebGL2 in the browser**, including the browsers used by notebooks and
HTML exports. Native desktop OpenGL and WebGL1 would require a different proposal.

## What should generally work

Use this as the acceptance boundary, rather than treating a successful scatterplot as completion:

| Area | Initial fallback expectation |
|---|---|
| Common marks | Points, Lines, Rects/bars, areas/bands, text, arrows, error bars, Heatmap, Image, and ordinary mesh/surface plots |
| Plot composition | Axes, legends/colorbars, facets, nested Frames, automatic Frame promotion, ordinary polar charts, and compound marks built from supported primitives |
| Data | Existing expressions, Calculate, Filter, Bin/Histogram, aggregation, Density, Slice, and interpolation on moderate data |
| Interaction | Pan/zoom, ordinary 3D camera navigation, hover/tooltips, picking, and brushing with correct source-row identities |
| Updates | Input/selection/provider changes produce correct new frames; smooth row/texture transitions may snap |
| Delivery | JavaScript plots, Python notebook scenes, and live standalone HTML use the fallback automatically |
| Export | PNG and the existing SVG/PDF export paths for supported scenes remain usable |

This is a proposed support target, not a claim that these features already render on WebGL.
Large data may be slow or exceed a documented capacity. Small plots must not lose normal
semantics such as missing values, categorical colors, datetime axes, or selection identity.

For the lowest implementation cost, require WebGL2 plus renderable float color attachments
for the existing picking pipeline. Test `EXT_color_buffer_float` and actual framebuffer
creation. Browsers without that capability can retain the existing static-preview/error
behavior initially. Supporting every WebGL2 device through packed byte IDs and reconstructed
world positions is a separate extension, described below.

## Evidence supporting this approach

The original probes used Three.js **0.183.2** and the vendored
**`@hmplot/jax` 0.1.25-hmplot.1**. Three's existing renderer explicitly accepts
`forceWebGL: true` and uses its WebGL2 backend. Its TSL materials can therefore remain the
shared implementation. This is also the intended behavior in the
[official WebGPURenderer documentation](https://threejs.org/docs/pages/WebGPURenderer.html).

JAX WASM is already present in the vendored package. HMPlot's
[initializePlot](../src/lib/jaxExtensions/setup.js) deliberately rejects initialization
without WebGPU and changes JAX's default device to `webgpu`. Removing that policy is much
smaller than replacing the expression/transform engine. Upstream describes WASM and WebGPU
as separate execution backends in its
[JAX documentation](https://github.com/ekzhang/jax-js#devices); the vendored implementation
was inspected for this report rather than assuming current upstream behavior is identical.

Two limited probes substantiate the central approach:

- **Explicit WASM:** eleven checks passed using `await init('wasm')` and
  `defaultDevice('wasm')`: masked mean, median/sort/gather, weighted histogram, finite range,
  masked raster normalization, the fork's scatter operation, grouped Slice interpolation,
  Filter, Density, Calculate, and Bin. These exercised existing helpers without source edits.
- **Three WebGL2:** a temporary Playwright probe using installed Three and Chromium's
  SwiftShader rendered TSL instanced geometry, a multisampled scene pass through
  `RenderPipeline`, and two float picking attachments. Reading the attachments returned the
  expected object/index values and world position. The probe also exposed the indexed-storage
  and update issues in change 2 below.

These are numerical and renderer probes, not an end-to-end HMPlot compatibility test.
Actual marks, browser diversity, packaged bundles, and failure recovery remain implementation
acceptance work. No performance claim follows from them.

The earlier current-main review used immutable Git objects during a separate Sunburst
bisection. That investigation is now resolved: the
[final interleaved comparison](../tests/perf/investigations/results/refactor-final.json)
withdraws the apparent 116.3/116.4 regression. This documentation update ran no builds, tests,
benchmarks or profiles; the original fallback probes remain historical evidence.

## Foundations already present on main

Stages 116–121 have landed the relevant ownership and service boundaries. Build on them:

- [columnReads.js](../src/lib/plot/utils/columnReads.js): a synchronous scope read borrows;
  work spanning an `await`, queue, cache, or revision change acquires and later releases.
- [viewServices.ts](../src/lib/plot/utils/viewServices.ts): lifecycle, clock, diagnostics,
  drawing, and renderer-owner installation/release already have typed owners. Expose the
  runtime capabilities here; do not recreate a `renderer.plot*` service bus.
- [SceneResources.transaction()](../src/lib/scene/resources.js): compose its preparation,
  activation, acceptance, rollback, and retirement when materialization or startup fails.
  A second rollback protocol is unnecessary.

The earlier refactor is a completed foundation, not a future prerequisite. The remaining
coordination is with readability R5: field states and fallback storage/upload adaptation
must share one implementation sequence, as specified in change 2.

## Direct-backend inventory and disposition

At the pinned main snapshot, the literal `backend.device|device.queue` search finds 20
maintained `src/lib` files. Including the optional-access device owners `dashDistances.js`
and `lifecycle.js` gives **22 core device/queue sites**. Startup gates, allocation/readiness
checks, optional limit readers, and guarded hooks expand the practical inventory to **40
files**. These are not 40 missing implementations: some already handle other backends.

Paths in these tables are relative to `src/lib/`. Generated bundles, tests, and imports of
`three/webgpu` alone are excluded; that import also supplies Three's WebGL fallback renderer.
The broader table matters: the narrow 20-file search is not a sufficient future ratchet.

### The 22 core device/queue sites

| File | Current dependency | Initial fallback decision |
|---|---|---|
| `picking/readPixel.js` | Native texture copies, staging buffers, mapping | Common asynchronous render-target readback; normalize origin, formats, and subrectangles. |
| `picking/sourcePosition.js` | Reads a row from a native attribute buffer | Read the published host field for the drawn revision, preserving staleness checks. |
| `plot/scenes/export.svelte` | `backend.device.limits` before PNG allocation | Actual runtime texture limits and an explicit allocation budget; preserve early oversize errors. |
| `plot/scenes/interactive.svelte` | Queue completion during render/export cleanup | Backend-aware completion through existing view lifecycle services. |
| `plot/scenes/overview.svelte` | Native limits, completion, and MinimapGPU | Shared limits/completion; defer overview presentation initially, independently of colorbars. |
| `plot/utils/animation.js` | Transition buffers, kernels, gathers, retirement | Never construct GPU transition machinery on fallback; snap mark fields, retain clock/data animation. |
| `plot/utils/connectionGather.js` | Raw WGSL endpoint/anchor gather | Host preparation on relevant revisions; preserve provenance; do not instantiate the GPU gatherer. |
| `plot/utils/curvedPaths.js` | Subdivision/count/fill kernels, snapshots, readback | Bounded host subdivision, source mapping, cancellation, and camera/viewport invalidation. Required for polar/Pie. |
| `plot/utils/dashDistances.js` | Native projected-distance/prefix compute | Host projected distances and correct storage bindings. Its existing missing-device return alone is insufficient. |
| `plot/utils/diagnostics.js` | Patches device allocation, compilation, uploads, submissions, loss | Preserve CPU/shader metrics; supply appropriate GL counters or mark unavailable metrics explicitly. |
| `plot/utils/exportPixels.js` | Texture-to-buffer copies and aligned mapped rows | Common readback returning top-down tightly packed bytes. |
| `plot/utils/guideBounds.js` | Reads GPU normalization bounds during animation | Use the existing JAX extent path on WASM with valid-row masking; bypass raw animated normalization. |
| `plot/utils/lifecycle.js` | Optional queue completion and unconditional GPU loss subscription | Shared completion, backend-specific loss handling; remount after loss. |
| `plot/utils/minimapGPU.js` | Separate WebGPU canvas/pipeline | Canvas2D or SVG colorbars from existing palette data; omit optional overview initially. |
| `plot/utils/normalizeGPU.js` | Native reduction/normalization compute | WASM normalization at the host texture boundary, including invalid and constant domains. |
| `plot/utils/pathMetadata.js` | Native classify/scan/pack and queue operations | Bypass with sampledBuffers; obtain needed curve/path metadata through host geometry instead. |
| `plot/utils/sampledBuffers.js` | Storage limits, gather buffers, WGSL sampling | Omit the accelerator and its shader bindings; draw bounded unsampled data with correct source indices. |
| `plot/utils/surfaceTexture.js` | Device limits and queue retirement around Three targets | Shared limits/completion if enabled; defer embedded-plot composition separately from scalar Surface. |
| `plot/utils/timeSeriesSampling.js` | Native WGSL sampling | Do not instantiate; draw bounded unsampled rows. |
| `plot/utils/vectorExport/capture.js` | Native capture of drawn connection/transition rows | Capture accepted host fields; verify host-computed connection positions, not merely original `field.data`. |
| `plot/viewCore.svelte` | Shared GPU device constructor and guide export limits | Select forceWebGL without a GPU device; expose actual limits through view services. |
| `threeExtensions/array/arraytexture.js` | Buffer copies, raw writes, compute textures, transitions, limits | Central upload/indexed-storage helper, host textures, correct ownership and bounded capacity. |

`pathMetadata.js` has two `queue.writeBuffer` source sites and one `queue.submit`, plus a
completion wait. These are three queue mutation/submission sites, not three distinct
`writeBuffer` sites. It is constructed by `sampledBuffers.js`; the fallback need not port
its sampling machinery to make host curves work.

### The 18 related capability/backend-assumption sites

| File | Current dependency | Initial fallback decision |
|---|---|---|
| `docs/Example.svelte` | WebGPU-only live/Python example gates | Allow a supported runtime to initialize; retain the static preview on failure. |
| `docs/exampleLoading.js` | Cached WebGPU adapter probe | Lightweight supported-runtime availability without a second backend-selection owner. |
| `jaxExtensions/setup.js` | Rejects absent WebGPU, pins JAX, subscribes to device loss | Own coherent shared numerical runtime selection and backend-specific availability. |
| `picking/setupInteractivity.svelte.js` | Native `.texture` readiness check | Shared allocation/completed-pass readiness that works with WebGL `.textureGPU`. |
| `plot/bound/namedMark.svelte` | Optional storage-limit reads | Shared preparation/upload budgets; absent `.device` must not mean unbounded allocations. |
| `plot/geojson.svelte` | Optional GPU limits and WebGPU-shaped defaults | Actual runtime and host geometry budgets; retain triangulation bounds and useful errors. |
| `plot/marks/labels.svelte` | Optional texture limit with fixed fallback | Use actual texture dimensions for atlas preparation. |
| `plot/objects/base.js` | WebGPU vertex/storage budget model | Runtime attribute, sampler, and storage capabilities; common binding ownership with R5. |
| `plot/objects/heatmap.js` | Optional device limits for grid/surface geometry | Shared geometry allocation budgets; retain portable geometry preparation. |
| `plot/utils/dataView.js` | GPU limits with a catch/default budget | Already avoids a missing-device throw; replace guessed limits with the chosen runtime budget. |
| `plot/utils/force.js` | Checks `array.device` before `gpuBuffer()` | Already host-aware: preserve individual waits for non-WebGPU arrays; update the shared availability guard. |
| `plot/utils/shaderBuilds.js` | Patches backend `createNodeBuilder` | Keep the backend-common hook; verify GLSL attribution and restoration. |
| `plot/vectorTileSlot.svelte` | Optional uniform limit with fixed default | Shared actual limits; full tile parity remains a separate milestone. |
| `scene/htmlPage.js` | Embedded WebGPU availability gates/messages | Attempt fallback startup; show the preview only when supported interactive startup fails. |
| `scene/resources.js` | GPU limits during resource loading | Runtime compute/upload budgets; retain transaction rollback and column ownership. |
| `scene/widget.js` | GPU capability limits and snapshot fallback | Report the selected runtime; preserve kernel snapshots when no supported runtime initializes. |
| `threeExtensions/array/lifecycle.js` | Native `.buffer` check before destruction | Correct WebGL `.bufferGPU`/PBO destruction and attribute cache cleanup. |
| `threeExtensions/storageBindings.js` | Three r183 binding-cache workaround | Already guarded by `isWebGPUBackend`; keep it WebGPU-only and prove it is not installed on fallback. |

Additional delivery changes are capability reporting in `scene/standalone.js` (currently
unconditional `{ webgpu: true }`) and Python's browser probe/export startup. They are covered
in change 7, rather than counted as direct device-access files.

## The minimum changes

### 1 Select one coherent runtime and remove startup barriers

Primary files: [setup.js](../src/lib/jaxExtensions/setup.js),
[viewCore.svelte](../src/lib/plot/viewCore.svelte),
[viewServices.ts](../src/lib/plot/utils/viewServices.ts),
[lifecycle.js](../src/lib/plot/utils/lifecycle.js),
[diagnostics.js](../src/lib/plot/utils/diagnostics.js).

Select one shared numerical runtime in initialization, then expose it and each renderer's
capabilities through the existing typed view services. Install/release renderer-specific
limits and operations with their owner; the services themselves survive renderer replacement.
The record should answer whether direct GPU copies, raw compute, or float picking targets
are available. Reuse the existing clock, diagnostics, and lifecycle owners. No general
renderer plugin framework or parallel service registry is needed.

The selection policy should be:

1. Prefer the existing shared WebGPU device when initialization succeeds.
2. Otherwise initialize JAX WASM and construct `WebGPURenderer({ forceWebGL: true, ... })`
   without passing `getWebGPUDevice()`.
3. Expose a deterministic forced-fallback setting for testing and affected environments.
4. If the fallback cannot initialize its required capabilities, retain the existing useful
   error/static-preview outcome.

Resolve this before scene resources are created. JAX's default device is shared module state;
changing it whenever an individual Plot mounts would make different plots and pre-existing
arrays disagree. Preserve `initializePlot()`'s existing return contract if possible, and add
a separate internal runtime accessor. A public backend option, if added, needs the normal API
documentation and generation checks.

Initialize the desired JAX backends explicitly; this fallback does not need JAX's separate
WebGL numerical backend. Inputs created before selection, foreign JAX arrays, and asynchronous
WASM reads need a defined adoption boundary. Apply the landed column read contract: use
`scope.get()` only for immediate borrowed access; call `acquireColumn()` before retaining
a column across asynchronous materialization or queued publication, and release once in
`finally`. Consuming JAX operations still receive their own `.ref` where required. A low-level
`array.ref.data()` call alone does not establish a scope/revision lifetime contract.

Verify the renderer's actual backend after initialization: Three can itself fall back, so
`renderer.isWebGPURenderer` does **not** prove WebGPU is active. Do not convert arbitrary
shader/data errors into “WebGPU unavailable.” If startup must be retried, discard partially
initialized resources before selecting the other runtime.

Guard WebGPU-only device-loss listeners, queue waits, diagnostics, and device limits.
Handle WebGL context loss through the fallback's own lifecycle. Use WebGL texture/attribute
limits and an explicit host-memory policy instead of inventing a `GPUDevice` or treating
missing limits as unlimited capacity.

**Deliberately excluded:** migrating a running WebGPU scene to WASM after device loss. A
reload/remount is sufficient for this first version and avoids a second resource-migration
project.

### 2 Complete the existing host upload path and make field reads correct

Primary files: [arraytexture.js](../src/lib/threeExtensions/array/arraytexture.js),
[proputils.js](../src/lib/plot/utils/proputils.js),
[base.js](../src/lib/plot/objects/base.js), and
[attribute release](../src/lib/threeExtensions/array/attributeRelease.js).

There is already a useful seam: `arrayToStorageBufferAttribute()` falls back to
`await array.ref.data()`, `copyArray()`, and `needsUpdate` when it cannot copy between shared
WebGPU buffers. Extend that mechanism rather than introducing separate mark implementations.

The remaining work is important:

- `ArrayInstancedBufferAttribute.writeHost()` currently writes directly through
  `renderer.backend.device.queue`. Add a host-array/update branch, retaining vec3-to-vec4
  padding and valid row counts.
- Prevent row/texture transition branches from calling `gpuBuffer()` on WASM arrays. Snap
  to the new values initially, including explicit animation descriptors; changing only the
  implicit `animation` option is insufficient.
- Read device scalars as ordinary uniforms where practical. Keep normal per-row attributes
  as attributes; use indexed storage only where required.
- Ensure field growth, release, and disposal work with Three's WebGL attribute/texture
  resources. Host snapshots must represent the accepted data revision.

The current `releaseAttribute()` checks a backend record's `.buffer` to decide whether to
destroy it. Three's WebGL implementation uses `.bufferGPU`; deleting its tracking entry
without destroying the allocation can leak it. Correct that compatibility boundary and
include PBO textures in cleanup. Three's PBO setup can also pad/replace `attribute.array`;
subsequent uploads must preserve the array/layout the bridge actually uses.

**Indexed storage is a correctness blocker.** In installed Three, the WebGL shader builder
does not provide native storage buffers. A storage element expression without PBO mode can
degrade to an attribute read that ignores the supplied index. HMPlot uses these reads for
scalars, fields moved out of the vertex-attribute budget, sampled rows, and refined geometry.

The probe rendered two instances using `storage.element(1 - instanceIndex)`:

| Configuration | Observed pixels |
|---|---|
| Normal storage node | Red, green: requested reversed indexing was lost |
| `.setPBO(true)` | Green, red: indexing was correct |
| Change host data and set only `attribute.needsUpdate` | Old colors remained |
| Also mark the associated PBO texture dirty | New reversed colors appeared |

Use a central storage-node/upload helper for the fallback. Three's texture-backed PBO mode
is the smallest promising implementation, but the helper must own texture updates, growth,
and retirement. Do not scatter access to Three's internal `attribute.pbo` state across marks.
If that integration proves unstable, explicit data-texture reads are the contained alternative.
The relevant installed source is `StorageArrayElementNode`, `StorageBufferNode`, and
`webgl-fallback/nodes/GLSLNodeBuilder` under `node_modules/three/src`.

Also account for WebGL sampler and texture-size limits; moving every attribute to a texture
would trade one limit for another. `BasePlotObject.vertexBuffersExceeded()` currently models
WebGPU buffer/storage budgets. The fallback needs actual vertex-attribute, texture-unit,
texture/renderbuffer-size, and supported-sample limits. Test an ordinary mark with several
per-row channels.

**Coordinate with [readability R5](READABILITY-PLAN-2026-10-09.md#r5-make-gpu-field-states-and-shader-contracts-explicit).**
TODO 122.6 and 124.2 record this dependency; the whole R5 package is not a spike prerequisite.
Give the field/storage/upload seam in `proputils.js`, `objects/base.js`, and
`array/arraytexture.js` one owner and one change sequence. First make representation and
ownership explicit in behavior-preserving commits; then add the fallback storage/upload
implementation at that same boundary in logic commits. Pause independent R5 restructuring
of these areas while this work proceeds. Unrelated shader formatting/helper cleanup can
continue. The result must retain the fast WebGPU path without extra per-frame objects,
host reads, or generic dispatch at each scalar operation.

### 3 Add one CPU raster preparation path

Primary files: [ArrayTexture](../src/lib/threeExtensions/array/arraytexture.js),
[normalize.js](../src/lib/threeExtensions/array/normalize.js), and the
`TextureField` factory in [proputils.js](../src/lib/plot/utils/proputils.js).

Heatmap/Image textures are currently `StorageTexture` objects populated through TSL
`textureStore`, `computeAsync`, and optional raw WebGPU normalization. Three's WebGL backend
does not make that storage-texture algorithm portable merely because its shader is TSL.

Implement a host-backed texture with the same small consumer-facing contract: `write`,
`setRemap`, dimensions/resolution, and disposal. A factory can choose it or the existing GPU
implementation. On the fallback:

1. Use existing JAX normalization on WASM and obtain the resulting host values.
2. Resample into a typed array using a straightforward CPU loop.
3. Upload a normal Three `DataTexture` and mark it dirty when inputs change.

Preserve the channels the material already expects. Scalar maps carry value, derivatives,
and coverage; RGB/RGBA images have different color-space and orientation rules. Keep
missing-cell coverage, nearest/bilinear modes, and the existing uneven-grid remap tables.
Uploading raw scalar values as an arbitrary RGBA image would not preserve Heatmap/Surface
behavior.

A modest resolution is acceptable. Cache by accepted data/remap/settings revision and
yield between large jobs if necessary. Do not resample unchanged data every frame. Animated
textures can update immediately, avoiding `NormalizeGPU` and `BufferTransition` entirely.

This one implementation supports multiple marks; it is preferable to special-casing each
Heatmap, Image, and Surface component. A fullscreen fragment-pass implementation can be a
later optimization, not an initial dependency.

### 4 Bypass GPU accelerators and provide basic host geometry

Relevant files: [sampledBuffers.js](../src/lib/plot/utils/sampledBuffers.js),
[curvedPaths.js](../src/lib/plot/utils/curvedPaths.js),
[curves.js](../src/lib/plot/utils/curves.js),
[dashDistances.js](../src/lib/plot/utils/dashDistances.js),
[animation.js](../src/lib/plot/utils/animation.js), and
[connectionPrepare.js](../src/lib/plot/utils/connectionPrepare.js).

The inventory also includes `pathMetadata.js` and `timeSeriesSampling.js`: neither should be
constructed when GPU sampling is bypassed. Their removal from the active path must include
shader bindings, not just queue dispatches.

Do not port every raw WGSL kernel to GLSL. Separate acceleration from required geometry:

| Current GPU path | Minimum fallback treatment |
|---|---|
| Reservoir/time-series/path sampling | Draw all rows within capacity; bypass automatic display sampling |
| Row and texture transitions | Publish the new values immediately; retain live data updates and ordinary camera interaction |
| Adaptive curve refinement | Use CPU or WASM evaluation with a modest subdivision count and preserve source-row mappings |
| Screen-space dash distances | Compute cumulative projected distances on the CPU when geometry/camera changes |
| Live connection buffer gather | Reuse existing JAX/host preparation and recompute on relevant changes; optimized per-frame following can wait |
| GPU texture normalization | Reuse WASM normalization before the host texture upload |

There are two traps in an apparently simple “disable compute” implementation:

**Sampling nodes exist even when sampling is inactive.** `BasePlotObject` constructs
`SampledBuffers` for sampleable marks, and `BufferedField.rebind()` can put its indexed
storage reads into the shader regardless of the runtime enabled flag. The fallback should
avoid constructing/binding this optimization, not merely skip its dispatch.

**Curves are not solely an exotic mapping feature.** `curves.js` requests refinement for
nonlinear frames, polar coordinates, and ordinary non-linear curve choices. A blanket
`prepareCurves()` no-op would break or misrepresent legitimate Lines/bands and polar plots.
Reuse the existing JAX curve-control preparation and coordinate helpers; replace the GPU
count/refine/fill stage with host-generated pieces or metadata. Carry per-row styles and
pick identities through subdivision. Preserve missing-value gaps and step discontinuities.

Fixed subdivision can be less smooth under extreme zoom. Full adaptive spherical seam,
horizon, and deep nested-projection parity can be deferred with a clear unsupported-feature
diagnostic. It must not silently turn a requested curved path into an unrelated straight one.

There is reusable host math in [operationTable.js](../src/lib/plot/utils/operationTable.js)
(`operationTablePoint`, `operationSampler`) and
[vectorExport/geometry.js](../src/lib/plot/utils/vectorExport/geometry.js)
(`localPathSource`, `chainPolyline`, `chainedOutline`, `lineDashStarts`). Extract only the
needed shared helpers; rendering should not depend on the whole export subsystem. Ordinary
Pie is one reason to include polar geometry rather than classify all of it as optional.

For connections, `connectionPrepare.js` already has a data preparation path independent of
raw GPU gather, while [connectionGather.js](../src/lib/plot/utils/connectionGather.js)
contains host reference math. Reuse it where appropriate. Updating static/simple links is
part of useful graph support; reproducing every attachment during animated surface deformation
can remain outside the initial contract.

Force and Simulate's JAX numerical work should stay on WASM. Their scalability and interactive
update rate need separate validation; raw WebGPU presentation optimizations are not a reason
to replace the numerical algorithms. `force.js` already checks `array.device` and avoids
`gpuBuffer()` for WASM, waiting for those arrays individually. Keep that useful branch and
make the common availability/loss guard runtime-aware.

### 5 Make picking and export readback backend independent

Primary files: [interactive.svelte](../src/lib/plot/scenes/interactive.svelte),
[readPixel.js](../src/lib/picking/readPixel.js),
[sourcePosition.js](../src/lib/picking/sourcePosition.js),
[exportPixels.js](../src/lib/plot/utils/exportPixels.js),
[capture.js](../src/lib/plot/utils/vectorExport/capture.js), and
[guideBounds.js](../src/lib/plot/utils/guideBounds.js).

Keep the current picking shaders and event/brush machinery where supported. The float-MRT
probe showed that the installed Three backend can carry object IDs, row IDs, and world
coordinates. Replacing all picking with Three raycasting would duplicate HMPlot's custom
mark hit semantics and is unnecessary for the recommended capability floor.

Route readback through a small adapter using Three's
`readRenderTargetPixelsAsync(target, x, y, width, height, textureIndex)`. Current helpers accept
textures and directly allocate/map `GPUBuffer`s, so callers must retain/pass the owning render
target and attachment index. Preserve cancellation and stale-frame rejection.

Update the allocation-readiness check in
[setupInteractivity.svelte.js](../src/lib/picking/setupInteractivity.svelte.js) too: it currently
looks for `.texture`, whereas the WebGL backend stores `.textureGPU`. Without this change,
picking can remain perpetually “not ready” even after its render pass succeeds. Prefer a
shared readiness contract over duplicating backend-record inspection at every caller.

Normalize coordinates and results in the adapter. The WebGL probe confirmed a bottom-up
pixel convention, unlike the assumptions documented in the current WebGPU helpers. Handle
Y origin, row order, float/half-float/byte decoding, DPR, and nonzero read rectangles explicitly.
A chart can look right while hover and export are vertically reversed.

For source positions and vector-export capture, use accepted host-backed field values on
the fallback. Current checks of `backend.get(attribute).buffer` see no allocation when WebGL
uses `.bufferGPU`; substituting that property into raw WebGPU copy code would also be wrong.
Use the same accepted revision for drawing,
picking, and SVG/PDF capture. Existing JAX extent calculations remain available on WASM.

[export.svelte](../src/lib/plot/scenes/export.svelte) also validates output size through
`renderer.backend.device.limits` before allocating the PNG target. Move that check to actual
runtime texture dimensions and a host/readback allocation budget. A portable readback helper
alone will not make export reachable while this unconditional device access remains.

If support without float color attachments is required later, add byte-encoded IDs plus
host reconstruction of picked positions, or a targeted host picking implementation. That
requires precision/capacity and overlap tests; it is not a free switch on the current MRT.

### 6 Preserve guides and the ordinary presentation pipeline

Primary files: [gradient.svelte](../src/lib/plot/guides/gradient.svelte),
[minimapGPU.js](../src/lib/plot/utils/minimapGPU.js),
[overview.svelte](../src/lib/plot/scenes/overview.svelte), and
[interactive.svelte](../src/lib/plot/scenes/interactive.svelte).

Colorbars use `MinimapGPU`, which creates a second `canvas.getContext('webgpu')` and raw GPU
render pipeline. Fixing the main canvas leaves ordinary colorbar plots broken.

The smallest solution is to draw fallback colorbars with Canvas2D or SVG from existing
`colormapStops`/`colormapColor` helpers. `gradient.svelte` already uses them for vector export.
Keep discrete levels, missing/flat values, orientation, and PNG guide capture consistent.

Overview/minimap support is less essential. Initially disable that optional control, or
render it into a Three target and read it back to a 2D canvas at a reduced rate. Do not build
a second full renderer and duplicate every mark solely to present the overview.

Retain the ordinary Three scene-pass/compositor path: the renderer probe exercised it on
WebGL2. Verify HMPlot's actual blend modes and mark materials before declaring parity.
Use conservative antialiasing and attachment formats. Sky, atmosphere, glow, and uncommon
postprocessing combinations can be outside the first guarantee if they need extra work;
normal transparency, clipping, axes, text, and color management cannot.

[surfaceTexture.js](../src/lib/plot/utils/surfaceTexture.js) also reads WebGPU device limits
when configuring plots drawn onto surfaces. Its Three render targets are reusable, but that
composition feature needs the shared limit/readback adapters if included. It can be deferred
separately from ordinary scalar-colored Surface marks.

### 7 Let notebook, HTML, docs, and headless entry points reach the fallback

Primary files: [resources.js](../src/lib/scene/resources.js),
[widget.js](../src/lib/scene/widget.js),
[standalone.js](../src/lib/scene/standalone.js),
[htmlPage.js](../src/lib/scene/htmlPage.js),
[exampleLoading.js](../src/lib/docs/exampleLoading.js),
[Example.svelte](../src/lib/docs/Example.svelte),
[exporter.py](../python/hmplot/exporter.py), and
[chrome.py](../python/hmplot/chrome.py).

Several entry points currently equate “no WebGPU” with “cannot display a live plot”:

- `SceneResources` and the notebook capability message read WebGPU buffer limits.
- Standalone startup currently reports `{ webgpu: true }` unconditionally.
- The notebook requests a static snapshot when initialization returns `webgpu.unavailable`.
- Exported HTML with a preview stops before mounting when `navigator.gpu` is absent.
- Documentation examples gate live loading on `webgpuAvailable()`.
- Python's headless launcher accepts a browser only after a WebGPU canvas probe succeeds.

Use the selected runtime's capabilities and actual startup result. Absence of `navigator.gpu`
alone must not prevent live WebGL rendering. Keep static previews until a supported live
scene draws successfully; update both the browser and Python-generated page behavior and
messages, and report the actual backend. Preserve lightweight docs loading rather than
importing the plotting engine just to decide whether an example might be live.

Keep `SceneResources.transaction()` as the scene update boundary. Failed or superseded WASM
materialization must retire newly prepared resources and retain/restore the last accepted
scene through its existing activation/acceptance/rollback contract. Do not introduce a
second transaction abstraction for this backend.

For headless PNG/SVG/PDF export, allow a tested WebGL2 draw/readback probe when WebGPU setups
fail, and pass the selected mode to the page. Otherwise the library fallback would work
interactively while Python exports still refuse the same environment. Retain existing
browser discovery and successful WebGPU configurations.

WASM code generation is already bundled: the inspected fork does not require a separately
hosted `.wasm` binary. It uses shared memory/workers when available and can execute without
them, so cross-origin isolation is not required for the slower fallback. Validate the actual
notebook/standalone bundles, offline loading, CSP constraints, and the no-SharedArrayBuffer
case. Regenerate built browser bundles through `npm run build:python`; do not edit them.

## What can safely remain outside the first version

| Capability | Recommended initial policy |
|---|---|
| Large-data GPU sampling and guaranteed interactive frame rates | No performance guarantee; draw within documented limits, with an actionable error if exceeded |
| Smooth row, keyed-enter/exit, and texture transitions | Snap to accepted new values; do not lose updates or leave settlement pending |
| Full adaptive curve/globe tessellation | Use simpler supported curves; diagnose unsupported seam/horizon/projection combinations |
| Overview/minimap control | Omit or update through slow readback; ordinary legends/colorbars still work |
| GPU-following connections during complex animation | Reprepare simple connections; defer specialized animated attachments |
| Sky, atmosphere, glow, advanced effect combinations | Add only if the shared pipeline passes focused tests without substantial work |
| Live vector-tile/globe optimization parity | Treat as a separate validation milestone; host uploads help, but do not promise every tile/material/projection combination |
| Embedded plots drawn onto 3D surfaces | Defer complex composition/picking if necessary; ordinary scalar-colored Surface remains in scope |
| Automatic recovery into another backend after device loss | Reload/remount, rather than migrating live resources |
| WebGL1, native OpenGL, WebGL2 without required float targets | Outside the initial capability floor |

“Unsupported” should name the component/feature and the supported alternative. Do not let
disabled compute paths leave loading indicators, stale geometry, or never-resolving exports.

## Per-frame cost and update policy

Snapping field transitions avoids the GPU interpolation kernels. It does **not** stop data
animation. In the existing [Sunburst example](../src/examples/sunburst/sunburst.svelte),
`tween()` changes Tree's inputs; Tree relayout and three Filters publish new geometry while
the animation runs. The relevant path is:

`ClockScope.frame` → Tree input tween/layout → transform dependency analysis and Filters
→ `planMarkUpdate` → live/procedural writes → host field materialization and GL uploads.

`@time` expressions and simulations likewise continue to produce changing values. Their
numerical work runs on WASM. Intermediate arrays can remain inside WASM, so this is not
necessarily one JavaScript readback per transform; count actual host materializations,
copied bytes, and uploads at the boundaries. Curves, dashes, picking, and raster preparation
can add further work on geometry or camera changes.

**Initial policy:** accept and document lower animation throughput; do not promise WebGPU
frame rates or smooth 60 Hz animation. Reuse the existing preparation/drawing barriers and
bounded pending work. Coalesce obsolete presentation requests to the latest accepted revision
where the existing semantics permit it, retain the final tween update, and cache unchanged
fields/textures so static plots perform no repeated data uploads. Do not add per-mark timers
or silently change a data tween into a jump to its endpoint.

Preserve Simulate's fixed numerical steps, `maxSteps` behavior, and serialized batches. Under
load, slower simulation playback is acceptable; dropping required steps is not. Exact
`seek()` replay and explicit frozen-time/export operations retain their existing semantics
independently of wall-clock presentation. Do not assume that a large live clock jump is
equivalent to exact seek.

Measure before adding a scheduler. If automatic clock work misses the spike's usable-frame
bound, the first candidate is a **30 Hz cap in the existing shared clock**, with one chain
in flight and bounded latest-time pending work for stateless evaluation. That would require
its own explicit clock/simulation tests and an updated estimate. It is not hidden work inside
the minimal storage adapter. Until that decision, animated support is conditional on the
spike; the static-plot probes cannot establish it.

Record JAX execution, host materialization time/bytes, upload bytes, completed presentations,
input latency, pending work, and retained allocations separately. Use actual completed
frames, not RAF callbacks or counters that read zero because WebGPU is absent. Full-size
Lorenz is a useful stress measurement; report its real data size and simulation throughput
even if only a smaller fixture meets the initial usability target.

## Numerical parity, including dtypes

WASM can represent types that WebGPU cannot, including 64-bit values. The fallback should
preserve HMPlot's existing numeric contract, not accidentally introduce a different precision
mode. [data.js](../src/lib/plot/utils/data.js) already normalizes Float64/BigInt numeric input
columns to float32 while retaining exact host keys and metadata where needed;
[deviceParams.js](../src/lib/plot/utils/deviceParams.js) uses explicit float32/int32 values,
and [simulate.js](../src/lib/plot/utils/simulate.js) maintains float32 states. Audit inferred
types in literals, intermediate JAX results, and upload conversion. Do not convert exact
keys, source indices, or temporal metadata indiscriminately to float32.

Run identical inputs on explicitly selected WASM and WebGPU in isolated pages/processes,
avoiding shared default-device state and compiled caches. Assert exact shapes, intended
dtypes, NaN/missing masks, category dictionaries, integer identities, and row provenance.
Compare floating values with named per-operation tolerances grounded in existing numerical
tests; neither bitwise equality everywhere nor one loose global epsilon is appropriate.

| Parity area | Existing test seeds and required comparisons |
|---|---|
| Input/metadata conversion | [data.test.js](../tests/unit/data.test.js): Float64/BigInt normalization, signed/unsigned extremes, nullable masks, exact adjacent keys near `2^63`, duration and timestamp origins. |
| Expressions/transforms | [transforms.test.js](../tests/unit/transforms.test.js): decimal bin boundaries including the final edge, NaN/out-of-range handling, stable Filter/sort provenance, grouped Density/quantiles, variance around a large offset. Include reduction/scatter and Slice fixtures used by the original probe. |
| Integer-sensitive simulation | [simulate.test.js](../tests/unit/simulate.test.js): `Int32` values around `2^24`, threshold/reduction results, eager/compiled agreement, fixed-step counts. |
| Time-dependent values | [tween-state.test.js](../tests/unit/tween-state.test.js): easing and Filter/Bin consumers; add fixed-time Tree partition/polar bounds and a short fixed-step Lorenz comparison. |

Long chaotic Lorenz trajectories are not a useful bitwise/pixel parity oracle. Compare
short, fixed numerical runs and separately verify ongoing frame/step progress. Fix genuine
dtype drift at the shared semantic boundary; do not conceal it with backend-specific expected
answers. The eleven historical WASM-only probes do not satisfy this comparative gate.

## Keep the second backend working

### A local direct-backend ratchet

Extend the approach in [refactor-ratchet.test.js](../tests/unit/refactor-ratchet.test.js)
with a reviewed manifest derived from the inventory above. Each entry names the file,
owner/symbol, operation family and bounded occurrence count, capability guard, fallback
decision, and proving test. The invariant is **zero unreviewed direct-backend callsites**,
including new calls added inside an already allowlisted file. Removed or stale entries
must fail too, so the manifest stays meaningful.

Scan maintained source for optional/direct `backend.device` access, device/queue aliases,
`getWebGPUDevice`, `.gpuBuffer()`, native buffer/texture creation/copy/map/dispatch primitives,
GPU constants, `compute`/`computeAsync`, WebGPU canvas contexts/availability, device-type
branches, and native backend-record assumptions. Include small scanner fixtures proving
that optional access and common local aliases are detected. Classify backend-common hooks
such as `shaderBuilds` rather than banning all backend access.

This remains a cheap static guard, not a proof that every runtime branch is safe. The
forced behavioral suite below supplies the second half. Keep the already guarded r183
`storageBindings` workaround explicitly allowlisted and test that it remains inactive on GL.
Any new acceleration path must supply a portable treatment or a clear unsupported-capability
decision in the same change, before its allowlist entry can grow.

### A curated forced WebGL + WASM browser gate

Create a deterministic local test project selecting **both** backends before initialization,
even on WebGPU-capable machines. Assert the actual selected numerical and rendering backends.
Apply forced mode to manually created browser contexts too. Separately test missing
`navigator.gpu` and a device without the required float attachment capability.

Target roughly **20–25 selected behavioral cases**, grouped around the following contracts.
The seeds name existing tests to adapt or share, not whole files to run unchanged:

| Contract | Existing seeds / additions |
|---|---|
| Ordinary fields and growth | [rgb-marks.spec.js](../tests/browser/rgb-marks.spec.js), [max-elements.spec.js](../tests/browser/max-elements.spec.js): multiple per-row channels, scalar fields, capacity growth. |
| Indexed storage lifecycle | New focused regression using the reversed-index pixels from the probe; second write, dirty PBO texture, padded backing-array replacement/growth, scalar→rows→scalar, repeated teardown returning tracked allocations to baseline. |
| Polar geometry and identity | First two [stage14-polar-sectors.spec.js](../tests/browser/stage14-polar-sectors.spec.js) cases; [stage14-polar-line.spec.js](../tests/browser/stage14-polar-line.spec.js); selected [row-opacity.spec.js](../tests/browser/row-opacity.spec.js) assertions. Verify picks after subdivision and filtering. |
| Curves, bands, dashes | Selected [line-buffers.spec.js](../tests/browser/line-buffers.spec.js) row-style, curved-join, and CSS-pixel dash cases; add the **combined dashed curved line**, gaps/step breaks, and an area/band. |
| Raster/colorbar contract | Selected [color.spec.js](../tests/browser/color.spec.js) Image and palette cases; missing Heatmap cells, uneven-grid remaps, matching colorbar, RGBA alpha/orientation, and scalar-textured Surface. |
| Picking/readback | First [hover3d.spec.js](../tests/browser/hover3d.spec.js) behavior; asymmetric top/bottom pick and brush at DPR 2, resize, nonzero read rectangle, and superseded readback. |
| Live updates and lifetime | Selected [providers.spec.js](../tests/browser/providers.spec.js) abort/settlement cases; add data `tween()`/`@time` frame progress, snapped field transitions, and disposal during pending host work. |
| Export/delivery | Asymmetric PNG and supported polar SVG/PDF; selected [document-export.spec.js](../tests/browser/document-export.spec.js) behaviors. Add fallback notebook updates, live standalone HTML, unsupported-capability preview, and non-isolated/offline bundle loading as entry points land. |

Some seed files assert WebGPU-specific buffer limits/counters or smooth transitions that the
fallback deliberately does not promise. Select the common behavioral assertions, use
backend-appropriate instrumentation, and add explicit snap expectations. Do not weaken
WebGPU tests to make the fallback pass. The PBO regressions must assert changed pixels and
resource retirement, not only absence of exceptions.

Run this curated gate locally for changes to the manifest, shared fields/geometry, runtime,
or delivery paths, and for Three/JAX upgrades. Retain normal WebGPU local gates required by
[TESTING.md](../TESTING.md), including the full rendering gate before a rendering PR. Do
**not** duplicate the entire 954-test browser suite in forced fallback mode or introduce
CI as a prerequisite; CI was waived in favor of local gates. Use fresh servers, wait for
all canvases to be ready before settlement, assert drawn output at DPR 2, and count completed
frames. Do not edit files during browser runs.

## Implementation order, sizing, and stopping point

**Proposed feasibility timebox: four engineer-days for steps 1–2 together**, roughly two for
runtime/storage/host geometry and two for raster/picking. This is a limit on exploration,
not an estimate that the entire fallback will ship in four days. At the limit, record
passing cases, measured costs, blockers, and an updated estimate. Do not begin notebook or
headless integration on the strength of a static Points demo.

1. **Test the uncertain parts first.** Establish forced runtime selection, shared-service
   capabilities, the R5 upload/storage seam, and accelerator bypasses. Render Points, Rect,
   text, and straight Line **plus Pie/polar sectors and a dashed curved Line**. Exercise
   reversed indexed reads, second uploads, padded growth, and repeated replacement/disposal.
   Then run the actual Sunburst data-tween path. Host curves and storage lifetime are spike
   blockers, not later enhancements.
2. **Complete the representative browser slice.** Add CPU raster preparation, colorbar,
   float picking/readback, and source identity; verify Heatmap/Image, one scalar Surface,
   DPR-2 brush/hover, and asymmetric PNG. Run same-input numerical parity cases and measure
   animated host cost. Land the first ratchet and focused fallback regressions with the
   implementation so the spike leaves reviewable evidence.
3. **After the go decision, complete entry points.** Enable notebook/HTML/docs startup,
   transaction-safe scene loading and capacity checks, headless probing, and generated
   bundles. Complete supported SVG/PDF and packaged offline/no-shared-memory coverage.
4. **Publish the tested support contract.** Record the hardware/browser capability floor,
   measured useful data sizes, known animation slowdown, snapped/deferred behavior, and
   actionable diagnostics. Expand deferred features only through separately sized work.

### Go/no-go at the end of the spike

These are **proposed acceptance budgets, not observed results**. Before measuring, record
the reference machine, browser, production build, fixture sizes, viewport, DPR 2, and warmup.
Keep those fixed throughout the spike; do not shrink data or loosen tolerances afterward
to turn a failure into a pass.

| Gate | Go criterion |
|---|---|
| Backend/semantic correctness | Actual WebGL2 + WASM selected; listed step 1–2 marks, polar geometry, dashed curves, source identities, raster channels, and readback assertions pass. Same-input numerical parity passes. |
| Storage/lifetime | Indexed second updates and growth draw correct pixels; repeated replacement/disposal returns tracked live allocations to the warmed baseline; superseded work cannot publish stale fields. |
| Bounded work and settlement | Pending presentation work and retained bytes do not grow throughout a 30-second live run. The final tween/provider revision draws, `whenSettled()` resolves, and unchanged static data produces zero new field uploads. |
| Moderate interactive fixtures | Proposed fixture set: 10,000 Points, a 2,000-vertex curved/dashed path, and a 256×256 raster, measured separately. Warmed p95 input-to-completed-presentation ≤250 ms, with no >1 s main-thread stall. Report startup separately. |
| Real animated case | Stock Sunburst, including Tree tweens and all three Filters: warmed p95 completed-frame interval ≤100 ms during active animation (a 10 fps floor), correct final layout/picks, no accumulating queue. |
| Simulation stress disclosure | Full stock Lorenz: record actual rows, completed frames/second, numerical steps/second, memory, and slowdown. Correct short-run numerical parity and bounded progress are required; full-size WebGPU-equivalent speed is not. |
| Existing fast path | Normal WebGPU rendering remains correct. For shared per-frame changes, matched before/after production Sunburst and Lorenz runs show no unexplained regression; follow the readability plan's explicit production comparison procedure. |

For shared-path regression comparisons, follow the
[investigations procedure](../tests/perf/investigations/README.md) and the
[readability production gate](READABILITY-PLAN-2026-10-09.md#required-comparison-for-a-hot-path-slice):
serve immutable before/after builds simultaneously from separate directories, discard a
warm-up capture for each, and alternate A/B every round for eight rounds preferred, six
minimum. Decide from per-round paired differences and their spread. Compare readbacks per
flight or gesture; retain completed-frame counts. Run browser/GPU work serially and measure
both Sunburst and Lorenz this way, rather than taking sequential batches from one preview.

Absolute fallback usability trials are distinct: use at least three repeated warmed runs
on the named machine against the fixed budgets above. Keep throughput/latency separate from
instrumented CPU/GPU attribution. Existing WebGPU-only profiling hooks need backend-aware
equivalents for fallback costs; missing WebGPU counters are not evidence of zero work.
SwiftShader is useful for functional regression, but hardware-backed WebGL measurements and
a browser without WebGPU are required before broad support claims.

If curves, indexed storage lifetime, parity, or the usable-frame bounds fail within the
timebox, the outcome is **no-go for delivery integration**. Report the failure and propose a
bounded follow-up or a narrower support contract for review. Do not silently drop polar
support, animation, or correct picking to call the original target complete. A successful
spike justifies sizing steps 3–4; it does not itself establish notebook/headless compatibility.
