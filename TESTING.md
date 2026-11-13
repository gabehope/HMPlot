# Testing

What each suite covers, how to run it, and what runs where.

## Scale-summary continuation (2026-10-07)

Mutable validity-mask revisions now remain distinct in pending extent batches. Missing-value
checks share pending immutable work, recheck mutable host inputs and keep cancellation local
to each caller. All **1,317 unit tests** pass, including the two regressions; types report
**0 errors and 0 warnings**, and generated Python signatures/API checks pass. All **five**
fresh-source DPR-2 `scale-summary.spec.js` cases pass, asserting SVG geometry/pixels, accepted
domains and completed-frame progress for mutable arrays, evolving time, point units, pointer
abstention and Image placement. This does not rerun or supersede the broader Stage107/108
rendering gate and its existing failure record below.

Current matched scale controls retain three warmed repetitions for seven complete scenarios
under separate plain/counter runs, with accepted counts/domains and sampled RGB screenshot
parity. Independent facets' colorbar labels differ in 29 sampled pixels despite matching mark
domains/counts; that control is excluded and remains open in Stage105. The investigation
fixtures initially needed corrected facet-handle access and an unfiltered storage-count
oracle; those failed attempts contribute no timing claims. See
`tests/perf/investigations/results/scale-current-controls.json` and
`docs/PERFORMANCE-INVESTIGATIONS.md`. Larger filtering, palette/range, broad interaction and
export coverage remain outside this bounded continuation. `npm run build:python` also passes
and refreshes the local notebook/standalone bundles after the helper changes.

## The suites

| Suite | Command | Covers | Needs |
|---|---|---|---|
| Unit | `npm test` (`npm run test:all` adds the slow ones) | Data, transforms, expressions, scales, layouts and the docs manifests, with jax-js on its CPU backend | Node |
| Types | `npm run check` (0 errors) | svelte-check over the library, the site and the tests; strict internal contracts/controllers via `tsconfig.internal.json` and the actual mark preparation body via `tsconfig.preparation.json` (`npm run check:preparation`); the frame publication owner and brush/tooltip overlays via `tsconfig.frames.json` (`npm run check:frames`) | Node |
| Formatting | `npm run format:check` | Prettier over the areas the refactor formatted, an explicit allowlist in `package.json` that each change extends when it formats an area; `.prettierignore` lists generated, vendored and data files and the maintainer's prose | Node |
| Ratchet | part of `npm test` (`tests/unit/refactor-ratchet.test.js`) | Counts that may only fall (one only rise) as the refactor retires mechanisms: ownership flags, `renderer.plot*` fields, mark-object fields, kind checks outside a named allowlist, namedMark's length, legacy Axis lines, strictly checked modules and others; a change that lowers one lowers its recorded value | Node |
| Leak harness | `LEAK_CHECK=1 node --import ./tests/unit/helpers/leakHarness.js --test tests/unit/<file>.test.js`; `npm run test:leaks` runs every unit file under it (the gate's unit tests) | jax-js references a test acquires and never releases, and double disposes, per test (named caches may keep one reference). Every unit test file passes under it; run it on the files a change touches, or on `tests/unit/*.test.js`. A test releases what it creates or is handed, inside its own body: the harness checks before a file's `afterEach` | Node |
| Python API | `npm run check:python-signatures` | Every generated registry, component module, signature, stub and type metadata matches the maintained declarations | Node |
| API report | `npm run check:api` | `api/hmplot.api.md` is current, and a change to the public API has a CHANGELOG entry | Node, git |
| pytest | `PYTHONPATH=python python -m pytest python/tests -q` | The Python package: scenes, snapshots, validation, callbacks, headless exports (skipped where no Chrome can launch), and what the wheel contains | Python; the bundles (`npm run build:python`); Chrome for the exports |
| Browser | `npx playwright test` | Rendering, interaction, picking, exports and the settings pane, in Chrome with WebGPU | Chrome, a GPU (or SwiftShader); the bundles (`npm run build:python`) for the export specs and the docs' Python examples |
| Examples | `npm run test:examples` | Every gallery example renders and responds | Chrome, a GPU |
| Python scenes | `HEATMAP_TEST_URL=<dev server> npm run test:python-scenes` | Python-built scenes rendered in the browser, and their round trips | A dev server, Python, Chrome |
| Package | `npm run test:package` | The packed npm package in a fresh Vite app: types, SSR, rendering, subpaths | Node, Chromium |
| Performance | `PERF=1 npx playwright test --config playwright.perf.config.js tests/perf/<spec>` | Churn and kernel timings; local only | A GPU |
| Docs loading | `npm run check:docs-budget` after `npm run build`; `node tests/perf/docs-loading.mjs` for the full audit | The built docs site as a static host serves it: a text page's JavaScript (under 300 KB compressed, none of the plotting runtime), the first preview requested before the runtime, every web preview under 500 KB; the gallery's thumbnails (a typical one under 75 KB, the home page's under 300 KB in all, every examples-page card's loaded, no card loading a live plot); the audit times first paint, previews and live plots under several network and CPU profiles (docs/PERFORMANCE.md, "The docs site") | Chrome; a GPU for the live timings |

### Running the browser suites

- The browser suite starts its own dev server on port 5173, or reuses one there. Counters that
  count builds and compiles read 0 on a long-lived server after edits: start a fresh one before
  a run (`reuseExistingServer` is true locally).
- Don't edit the tree while a suite runs: the dev server hot-reloads the pages under test.
- Size and pop-in bugs often hide at Playwright's device pixel ratio of 1; reproduce them at 2.
- For per-frame work, count completed frames, not just data: an upload every frame can starve
  rendering while the data looks right.

## What runs where

- **CI, every push and pull request** (`.github/workflows/ci.yml`): the formatting check, unit
  tests (with the ratchet), types, the Python API and API report checks, pytest, and the package test; pytest on Python 3.11 to 3.14 with
  NumPy 1.x and 2.x, with and without the dataframe packages; `pip install`, a scene and exports
  on Linux, macOS and Windows; the unit tests on each Node LTS. The runners have no GPU, so
  exports draw on SwiftShader.
- **CI, daily** (`.github/workflows/browser.yml`): the browser suite on SwiftShader, in four
  shards. Specs tagged `@gpu` (below) are skipped there.
- **CI, fork/build changes and manual runs** (`.github/workflows/jax-fork.yml`): rebuild the
  maintained JAX fork with its pinned toolchain and compare the complete artifact set and
  license without modifying them. Patch changes also require the upstream/backend and real-GPU
  checks in [the fork maintenance guide](vendor/jax-js/PATCHES.md).
- **Locally, before each release:** every suite above on a real GPU (Chrome on Apple M-series).
  The counts per suite and the Playwright HTML report are attached to the GitHub release.

### CI fixes (2026-10-02)

The first CI runs (main at 05c7da92) failed in four places; fixed on branch stageci:

- **Node 20 unit tests** (38 failures): the jax fork read `navigator.userAgent`, which Node 20
  lacks (patch 13, vendor/jax-js/PATCHES.md), and Node 20's `TextDecoder("windows-1252")`
  decodes as Latin-1 (the PDF fonts' WinAnsi set is a table now). Verified with Node 20.20.2:
  1120 of 1120 pass. Node 20 reached end of life in April 2026 and left the CI matrix
  (2026-10-02, maintainer's decision); the guards stay, so Node 20 still runs the tests.
- **Windows export smoke test:** `PermissionError` reading Chrome's DevToolsActivePort while
  Chrome still held it; it is read again until the launch timeout.
- **Linux exports** (the smoke test, and 7 pytest failures in test_animation.py): the first frame
  a WebGPU canvas showed lost the device ("Device was destroyed", "A valid external Instance
  reference no longer exists"). Reproduced on a Mac with `--disable-gpu`: Chrome's log says
  "SharedImageManager::ProduceSkia: ... incompatible backing: CompoundImageBacking", i.e. Chrome
  cannot composite the canvas. `open_page` uses a setup only once a canvas has drawn in it, and
  errors name the Chrome, flags, adapter and GPU log lines. The Vulkan flags added then for
  Linux did not work there (below).
- **Cleanup masking the error** ("Directory not empty" from the profile): Chrome is asked to
  quit and waited for, and the profile is deleted with retries, never raising. Chrome's log is
  read as it is written (an unread pipe blocks Chrome once it fills).

The next run (37046691089, on 068049f8) still failed on Linux and Windows exports, and in the
minimal Python jobs; fixed on branch stageci2:

- **Measured on the runners.** A throwaway workflow (branch `ci-webgpu-probe`, deleted after)
  launched the runners' Chrome 154 in about 50 configurations each and, in each, asked for a
  WebGPU adapter and drew: into an offscreen GPUTexture read back with `mapAsync`; on a canvas
  presenting 8 frames, and 40 frames resized three times; in a canvas outside the document; in
  an OffscreenCanvas. SS below is `--use-webgpu-adapter=swiftshader --enable-unsafe-swiftshader`;
  every configuration had `--headless=new --enable-unsafe-webgpu`.

  | Runner | Flags | Adapter | Offscreen | Canvas |
  |---|---|---|---|---|
  | Linux | none, SS, SS + `--disable-gpu-compositing` | SwiftShader | draws | device lost |
  | Linux | SS + `--enable-features=Vulkan --use-vulkan=swiftshader --use-angle=vulkan --disable-vulkan-surface` (stageci's) | SwiftShader | draws | lost; ANGLE on Vulkan fails `eglInitialize` and the GPU process exits |
  | Linux | SS + any two of `--enable-features=Vulkan`, `--use-vulkan=swiftshader`, `--use-angle=swiftshader` | SwiftShader | draws | lost |
  | Linux | **SS + all three** (also without SS, with `--use-gl=angle` or `--ignore-gpu-blocklist`, headed under Xvfb, and in Chrome for Testing and its headless shell given `--no-sandbox`) | SwiftShader | draws | **draws, resizes, reads back** |
  | Linux | the three + `--disable-vulkan-surface` or `--disable-gpu-compositing` | SwiftShader | draws | draws; compositing back in software, the canvas reads back empty |
  | Linux | `--use-webgpu-adapter=opengles --use-angle=swiftshader --enable-unsafe-swiftshader` | SwiftShader | draws | draws |
  | Linux | SS + Skia Graphite on Dawn's SwiftShader (`--enable-skia-graphite --skia-graphite-dawn-backend=swiftshader`), `--use-angle=gl`, `--ozone-platform=headless`, `--disable-dawn-features=adapter_blocklist`; headed under Xvfb | SwiftShader | draws | lost |
  | Windows | none, SS, `--disable-gpu-compositing`, `--use-angle=swiftshader`, `--use-angle=d3d11-warp` without SS, Vulkan on SwiftShader, Graphite on SwiftShader, `--use-webgpu-adapter=d3d11` or `opengles`; the headless shell | none | | |
  | Windows | **SS + `--use-angle=d3d11-warp`** (also in the headless shell) | SwiftShader | draws | **draws, resizes, reads back** |
  | Windows | `--ignore-gpu-blocklist` | Microsoft WARP (D3D12) | draws | draws |
  | Windows | SS + `--use-angle=d3d11` | SwiftShader | draws | lost |
  | macOS | none; SS | the runner's paravirtual GPU; SwiftShader | draws | draws |
  | macOS | `--disable-gpu`; the headless shell | SwiftShader | draws | lost |

  Why, from Chrome's log and chrome://gpu: on the Linux runner Chrome composites in software by
  default (or on SwiftShader's GL through ANGLE, when asked), and neither can make the shared
  image a WebGPU canvas draws into ("Could not find SharedImageBackingFactory with params:
  usage: ...WebgpuSwapChainTexture..."); with the three flags Skia composites on SwiftShader's
  Vulkan, whose images can. The Windows runner's only adapter is WARP ("Microsoft Basic Render
  Driver" on Hyper-V video), which Chrome blocklists: GPU features fall back to software and
  WebGPU offers no adapter, SwiftShader's included; asked to run ANGLE on WARP, Chrome composites
  there. Drawing offscreen worked wherever there was an adapter, so an export mode that never
  presents a canvas would have worked too; with the flags it is not needed.
- **The fix:** hmplot/chrome.py's SwiftShader setup passes `LINUX_SWIFTSHADER_FLAGS`
  (`--enable-features=Vulkan --use-vulkan=swiftshader --use-angle=swiftshader`) on Linux and
  `WINDOWS_SWIFTSHADER_FLAGS` (`--use-angle=d3d11-warp`) on Windows, so WebGPU draws on
  SwiftShader on every runner. playwright.swiftshader.config.js (the daily suite) passes the
  same per platform. WARP's own WebGPU adapter (`--ignore-gpu-blocklist`) also drew on Windows;
  it is not used, to keep one software adapter everywhere (open for the maintainer).
- **Minimal Python installs:** the home page's penguins example imports pandas, an optional
  dependency; `test_reference_examples_build` skips an example whose import of one of hmplot's
  extras fails (any other missing module still fails). The example keeps pandas.
- **Exports run in every Python job now**, and `test_headless_clock_steps_a_playing_playback`
  failed in 2 of 16: its Playback plays until the first `set_time` freezes the clock, mounting
  took 0.3 to 43 s on SwiftShader there (25 trials on a runner), and by then it had passed every
  row. The rows go on to 200 s.
- **The package test** (`npm run test:package`, reached once pytest passed) waited for
  "127.0.0.1:4175" in Vite's output, which Vite colors when `CI` is set: the port is bold
  ("127.0.0.1:\x1b[1m4175"). It matches the text without color codes. Its Chrome then lost the
  WebGPU device as the exports had (no plot within 30 s); in CI it passes the daily suite's
  SwiftShader arguments (`swiftShaderArgs` in playwright.swiftshader.config.js).
- **The daily suite on Linux** (not run; probe jobs ran specs with its config on a runner):
  with the flags before, `plot.spec.js` lost the device in 3 of its 4 tests; with the new ones,
  `plot.spec.js`, `export-menu.spec.js` and `document-export.spec.js` passed 79 of 82. One
  failure opened a Python-built example: the dev server builds them with `python3`, which had
  no numpy and no hatchling (for the docs editor's wheel); browser.yml installs both and the
  dataframe extras. Two failed in each of 3 runs and are open: `document-export.spec.js`
  "vector, as drawn: points-value" (a hue's box 64 px off between the vector and raster
  exports) and "text-category" (a hue only in the vector export), likely SwiftShader drawing
  differently, not yet investigated or tagged.
- **Not fixed, found on the way:** on the Ubuntu 24.04 runner, Chrome for Testing (what hmplot
  downloads when no Chrome is installed) crashes at launch and its headless shell says "No usable
  sandbox!"; both start with `--no-sandbox` (Ubuntu restricts the user namespaces Chrome's
  sandbox uses; Google Chrome's package brings the AppArmor profile it needs). hmplot passes
  `--no-sandbox` only as root. Open for the maintainer.

### Python CI preparation and dependency fixes (2026-10-03, Stage 88)

Two failures in the supplied CI logs have separate causes:

- `test_skill_programs_draw_without_errors`, `patterns-7`: `hm.check(timeout=...)` passed its
  budget to later waits, but initial scene application first waited with a hardcoded 30-second
  limit. Application now receives the requested budget; ordinary runtime callers and rollback
  recovery keep their existing 30-second defaults. The skill-program correctness test requests
  180 seconds per wait for CI's software renderer, retaining the million-point program intact.
  This does not impose a total deadline on resource loading and image export.
- `test_connection_lists_and_texts_match_the_renderer`: connection metadata indirectly imported
  JAX through view-state analysis's literal marker. The marker now lives beside the other
  dependency-free expression names, with its existing categorical/public exports preserved.
  Python-only jobs need no npm install or test skip for this comparison.

The native skill test passed before the change; a forced-SwiftShader run also passed, but its
million-point program took 92 seconds overall. That timing is not the initial preparation time.
A deterministic regression delayed a GPU readback by 200 ms: before the fix, a check with a
50 ms budget incorrectly succeeded; afterward it reports the preparation timeout and a retry
renders a red circle in SVG. A DPR 2 browser regression also checks that timeout rollback
restores the previous rendered scene and that a subsequent update publishes its new color.

Verification: 763 Python tests passed, one skipped; both the timeout-recovery and all-skill
tests passed on forced SwiftShader (102 seconds together); all 12 scene-command browser cases
passed at DPR 2. All 1,167 units, type checks, 110 signatures and the API report passed. Both
Python browser bundles were rebuilt. The 20 Python and 20 Node connection tests also passed
in a checkout without `node_modules`. These are local checks; no GitHub rerun is claimed.

### Final validation fixes (2026-10-02)

The final validation of the integration branch (735f99db: every suite, the browser suite on a
fresh server after `npm run build:examples` and the thumbnails) failed three specs every time;
fixed on branch stagefinal:

- **`fonts.spec.js:99`** (plot text in the bundled font): the screenshot of /examples/themes
  differed from its PNG export at the tick labels (0.71 to 0.97 against < 0.5). Since the static
  previews fade out over the live plot (bb2be00c, merged in 774dac4c), the preview, an SVG image
  whose text cannot reach the page's fonts, stays 250 ms over a plot that has drawn, and the
  screenshot taken right after `whenSettled()` caught it. Bisected over the first-parent merges
  with a probe that read the preview's state at the screenshot: on 15a77eda 3 of 3 passed, the
  preview gone (differences 0 and 0.0002); on 774dac4c 3 of 3 failed (1.27 to 1.98), the preview
  still fading. The fade is the product working as asked, so the spec waits for `.live.ready`
  (the live plot shown alone, as the docs' specs read it) before the screenshot; the threshold
  stays. It depends on load: on an idle machine the fade was usually over by then.
- **`earth-highres.spec.js:3`**: `getByRole("status")` matched the Example's visually hidden
  preview status (bb2be00c; "Interactive plot" once live) and the Slider's `<output>`. The spec
  reads the slider's own output (the `label` holding the slider). The preview status keeps
  `role="status"`: it is a status message, as an exported page's `#hmplot-status` is, and a page
  has several anyway (one per Example, one per input's output). No other spec reads an unscoped
  status (`gallery-improvements.spec.js:154` filters by text). 15a77eda passed, 774dac4c failed.
- **`docs-site.spec.js:655`, globe-tiles** (R2.11): the Python build's export had no zoom-0 tile
  (5,043 elements against the Svelte program's 5,170). A live VectorTile's `whenSettled()`, which
  the exports wait for, waited for the tiles the view selects and the requested ones, not for the
  world square, the zoom-0 tile and the overview drawn under them (TODO 61), so an export depended
  on which tile arrived first; globe-tiles is the first example that exports a live globe. With
  0/0/0 held back 6 s, the Svelte page's export matched the old Python build's element for
  element. Fixed in vectorTileLive.svelte: the selection's settling waits for those too
  (CHANGELOG, Fixed). Now the Svelte export is the same with 0/0/0 on time or 6 s late and has no
  differences from the rebuilt Python export. Test: `vector-tiles.spec.js`, "whenSettled and
  exports wait for the zoom-0 tile and the overview under the live level" (fails without the
  fix). Open: both programs still load VersaTiles' tiles from the network, so a change to those
  tiles between a build and a comparison would show as a difference.

Two more failed in the full run and passed on its rerun:

- **`examples.spec.js:378`** (twin frames): it read the container's text within the default 5 s
  while the labelled preview still showed ("Static preview; loading the interactive plot"):
  twin-axes is a paired example since 69.10, and its live plot took longer under the run's load.
  The spec waits for `.live.ready` (30 s) first.
- **`axes.spec.js:26`**: the run's second test, on a cold dev server, never showed
  /test/playground's Mark control in 90 s, while four workers compiled at once and the server
  built every example in the background. No preview or live state is involved and no race was
  found; not changed.

Verification on stagefinal: unit 1123 of 1123, types 0 errors, signatures and API checks,
pytest 576 passed and 1 skipped; `fonts.spec.js:99`, `earth-highres.spec.js`,
`examples.spec.js:378` and `axes.spec.js:26` 3 times each (12 of 12; the fonts check 8 more at 4
workers), `docs-site.spec.js` 18 of 18 and its comparison twice more, `vector-tiles.spec.js` 14 of
14, `flyover.spec.js` 5 of 5, and the globe and paired-gallery tests of `examples.spec.js` 6 of 6.

## Core refactor integration (2026-10-03, stages 78–85)

The full browser run passed 838 of 847 cases. Integration fixes and focused reruns resolved
six of the nine failures: four partition fixtures now use the declared `axes2d` prop, the
Python-template rendering failure was caused by the settings adapter mistaking inherited
Mapping channels for axes, and the already-listed flyover momentum flake passed in isolation.
The remaining failures are separated from this refactor:

- `frame-marks.spec.js`, the initial preparation-count assertion: expects three and receives six
  on untouched `4b68a972` too. Its rendered output checks pass; the count assertion remains open.
- `stage14-nested-paths.spec.js`, path-family parity: the same two violet-arrow vertices fail
  against the untouched baseline at the test's standard DPR 1.
- `docs-site.spec.js`, all Svelte/Python pairs: the `constant-data` simulation independently
  generates random positions/colors in the two runtimes. Exact SVG equality is not a valid
  comparison for that pair. Neither example source nor the test tolerance was changed.

The Mapping preview failure in that third test was introduced here and fixed; it is separate
from the independently random pair. Template rendered comparisons pass at DPR 2. Settings
round-trip coverage now also edits a nested Frame and compares SVG positions before and after
replaying its canonical public patch, including parent-coordinate ranges.

One hundred focused integration cases pass at DPR 2, covering keyed interruptions, scalar/row
opacity, filtered identity, streaming frame progress, brushes, root changes, tooltips, closed
settings and Python commands/templates. A notebook screenshot helper now captures CSS pixels
before indexing with CSS dimensions. The heatmap helper samples fractions of its actual image
dimensions; opacity/crosshair helpers received equivalent DPR corrections. Color thresholds
were not relaxed. Vector parity now waits for a canvas to exist before checking its readiness.

Source review also identified an unchanged, unverified nearby-interaction teardown risk:
the parent controller discovers producers through child renderer capabilities, which may have
been removed before parent disposal. A persistent/shared identity could retain its nearby
preview. Existing tests cover pointer leave and Escape, but do not reproduce that specific
shared-owner teardown case. This is a follow-up investigation, not a confirmed refactor defect.

Final integrated checks: 1,165 unit tests, 3 slow tests, zero Svelte errors/warnings, strict internal
types, all 110 generated signatures and the API report; pytest 762 passed and 1 skipped with
rebuilt bundles; package installation/types/SSR/browser checks; all 35 Python scene fixtures and
their interaction round trips; production build and docs budget. The last export/docs batch
passed all 97 cases, including 66 DPR 2 export comparisons. The paired-program subset in that
last batch was Mapping, Frame, ConstantData's deterministic reference, and Template; the full
paired-program run and its random-simulation limitation are described above.

Performance results and the limits of the allocation counter are in
[PERFORMANCE.md](docs/PERFORMANCE.md#core-refactor-integration-stage-85-2026-10-03).

## Stage 89 integration (2026-10-04)

The final full browser run passed **864 of 876** cases on a fresh server. Subsequent fixes
and an **11-case** focused run resolved nine failures: updated test gestures now use the
actual data interior, notebook probes resolve their own plot handles, and automatic axis
defaults have one owner rather than competing during nested Frame range updates. The already
listed flyover momentum flake passed in that focused run. A final **38-case** fresh-server run
passed for axes, 3D aspect/guides, masks, brush extents, themes, root coordinates, guide
ownership and changing nested Cartesian/polar/spherical Frames.

The three remaining failures are the same baseline failures recorded above for stages 78–85:
frame-marks' preparation count, two violet-arrow raster vertices at DPR 1, and exact SVG
comparison of the independently random ConstantData simulations. All deterministic paired
examples match; both desktop and phone gallery layout checks pass. These failures remain
visible and have not been skipped or quarantined. Existing geometry and pixel helpers now
account for the new palette, fonts, axis margins and Cartesian masking. Fixtures that test
marks alone explicitly disable guides or masks where those would obscure the tested geometry.

New Stage 89 browser cases run at **DPR 2**. They verify rendered axis controls/arrows/borders,
all flat spherical projections, transformed/inverted equal 3D units and camera updates,
box/triad/plane guides, boundary-crossing and nested/facet masks, hidden-fragment picking,
brush handles and empty-brush extents, and transparent PNG/SVG/PDF output. Live tests also
assert completed frames, stable shader counts, disposal and no additional interaction
readbacks. The warmed dashboard follow-up measured about 17–18 ms filtered frames with no
new compiles or slow uploads; this is an observation on this machine, not a portable budget.

Final gates: **1,187 unit tests**, **3 slow tests**, **0 Svelte errors/warnings**, strict internal
types, **110 generated signatures**, current API report, **772 Python tests passed and 1
skipped**, package installation/types/SSR/rendering, **35 Python scene fixtures and 4 interaction
round trips**, production build and docs loading budget. All **159 examples** and **115 gallery
thumbnails** were rebuilt. Third-party notices were regenerated from the actual Python bundle
graphs. The frozen-clock Python test initially differed in 18 grayscale guide-edge pixels by
one value; the data pixels matched. Its fixture now disables guides while retaining exact
frozen data-render equality and the assertion that stepping the clock changes the plot.

The merged R2.9 harness passes **45 focused checks**; its local report was inspected at DPR 2
on desktop and mobile for comparison selectors, program drawers, metrics, traces and overflow.
The active benchmark's frozen checkout and installed bundles were not rebuilt or changed.

## Stage 91 and gallery follow-ups (2026-10-04)

The final fresh-server DPR-2 batches pass **14 gallery/frame/map cases** and **26 rendering
regression cases**. Streamgraph's Python scene and Svelte program both preserve starting
pixels during retargets and return to the original wiggle pixels after expand, zero and center.
Its Svelte SVG matches the Python build. Frame checks cover numeric/log domains, nested ranges,
inherited dimensions, authored settings, GPU picking, frozen PNG/SVG/PDF exports, frame progress,
disposal, and no added shaders or readbacks during scale changes. Axes, 3D proportions/guides,
masks and guide ownership remain covered. Manhattan's paired scene and fixture both default
to streamed tiles; Tile detail changes rendering without moving the camera. Rapid projection
changes retain seam cuts, reuse warmed shaders and release their worker on disposal.

Full unit: **1,193 passed**; slow: **3 passed**; final focused animation/docs/gallery units:
**33 passed**; Svelte/internal types: **0 errors and 0 warnings**; **110 signatures** and API
report current; final rebuilt-bundle pytest: **781 passed, 1 skipped**. The packed-library
consumer passes types, SSR, production rendering, settings, fonts, remounts and JAX inputs.
No full browser-suite
rerun is claimed. Three older pixel helpers in nested-frames assume DPR 1; their standard-DPR
checks pass, while the new frame-animation case explicitly uses DPR 2.

Two broader gallery checks remain red and have not been skipped or weakened:

- Flyover's roof re-selection check receives the neighboring building after the zoom. The
  same failure reproduces with the original main-branch Manhattan gallery source restored;
  the new streamed-default/detail tests pass. This comparison restored only that gallery
  source, not the entire library checkout.
- The multi-example force/graph/polar/solar/Earth/flyover controls check completes its visual
  assertions but reports a Force position-buffer shape error (`2048` instead of 2/3 channels).
  Its origin has not been established. The dedicated changed-example checks pass; no baseline
  claim is made for this error.

## Ridgeline integration and scale animation refinement (2026-10-04)

Scale transitions now use `animateBounds`, `boundsDuration`, and `boundsEasing` on Plot and
Frame, with corresponding Python names. Nested frames inherit scale settings; marks retain
their separate animation settings. The frame browser check explicitly verifies that bounds
animation leaves its point mark disabled with the original mark duration. Streamgraph sets
Area animation separately and remains a paired Example with Python editing and source tabs.

The `/tmp/hmplot-ridgeline` fixes are integrated: adjacent curved intervals share their
joins, varying-width SVG strokes apply opacity once, path geometry is cached independently
of appearance, and guides publish with completed canvas frames. Guide publication is tracked
through settlement: the first integration run caught stale y labels in Streamgraph PNG exports
after returning from expand. The final checks retain exact pixel equality and now pass for
expand, zero, center, interruptions, and both language implementations.

Verification: **1,194 unit tests passed**; **0 type errors/warnings**; **110 signatures** and
the API report current; final rebuilt-bundle pytest **781 passed, 1 skipped**. A fresh-server
DPR-2 batch passes **36 rendering cases**, followed by the **exact Svelte/Python Streamgraph
comparison**. Coverage includes thick/varying-width curves, dashes, deferred guides, frame
domains/ranges, GPU picking, PNG/SVG/PDF exports, masks, hybrid sampling, brushing, projection
scrubbing and live globe tile navigation. The packed library passes consumer types, SSR,
production rendering, settings, fonts, remounts and JAX inputs. Ridgeline's screenshot and
thumbnail were inspected; the paired Streamgraph preview was rebuilt. All three added Python
programs download their real CSV data and construct valid scenes; standalone program exports
were not separately captured. The two broader gallery failures above remain recorded, and
no full browser-suite rerun is claimed. Stage 92 is a performance plan, not a measured fix.

## Stages 92–94 and globe zoom correction (2026-10-04)

The final fresh-server browser run completed **900 cases: 896 passed, 4 failed** in 16.2
minutes. Both dense tile growth/reversal and the actual gallery globe's repeated eight-level
zoom pass at DPR 2 with rendered pixels, frame delivery and zero GPU validation errors.
Tile PNG/SVG/PDF/HTML export, 3D buildings/picking/flyover, scene updates, hidden tree views,
frame animation, axes/masks, Shift and all eight template language cases pass. This is a
complete run, not a claim of an entirely green browser suite.

The paired-example case initially reported fixed Python versus responsive Svelte widths in
the four new templates, alongside the existing independently random ConstantData SVG mismatch.
Both languages now explicitly use responsive sizing; rebuilt previews and a fresh focused run
pass **9 cases**, including exact SVG equality for all four Python/Svelte templates and their
PNG/SVG/PDF, radar-guide and download checks. No new full-suite rerun after that host-example
correction is claimed. The remaining full-run failures have not been skipped or weakened:

- `frame-marks.spec.js:261`: preparation count 6 versus 3, recorded since Stages 78–85.
- `stage14-nested-paths.spec.js:223`: two violet-arrow raster vertices at DPR 1, also recorded.
- `docs-site.spec.js:662`: independently random ConstantData simulations differ in exact SVG;
  all deterministic pairs passed after the template width correction.
- `examples.spec.js:1349`: the previously recorded Force position-buffer shape error (2048
  instead of 2/3 channels). Its origin remains unestablished; no stronger baseline claim is made.

Final nonbrowser gates: **1,201 unit tests and 3 slow tests passed**, **0 Svelte/internal type
errors or warnings**, **111 generated signatures**, current API report, rebuilt Python browser
bundles, **789 pytest passes and 1 skip**, and packed-consumer types, SSR, production rendering,
settings, fonts, remounts and JAX inputs. **35 Python scene fixtures and 4 interaction round
trips** pass; the dashboard test now waits for completed guide publication before asserting
its changed titles. The production docs loading budget passes. Template previews/thumbnails
were rebuilt and inspected. No fork source was changed.

Performance verification retains six fresh interleaved dev samples against isolated baseline
7a62be92, three production repeats and the actual gallery replay. GPU validation capture and
restyled pixels reject invalid-draw measurements; the earlier exploratory samples were
explicitly discarded. Controlled production replay meets the 33 ms p95 / 80% paced-frame
budget, with zero settled idle GPU work and bounded trimmed buffers. Gallery first-zoom/seam
maximum gaps of 283/433 ms remain: see docs/PERFORMANCE.md and stage92-measurements.json.
A separate unpinned real-network reproduction completed three zoom cycles with zero console
or GPU errors. The frozen agent benchmark checkout, configuration and bundles were untouched.

## Stage 95 outline audit (2026-10-05)

Seven new DPR-2 outline checks cover filled boundaries, numeric/RGB/categorical channels,
faded border colors in PNG/SVG, hollow points, picking, PDF structure, animation, completed
frames and disposal. Literal inside-border edits add no pipelines or GPU readbacks. The
mixed-channel fixture also checks contours, sectors, polygons, bands, symbols and lit 3D
extruded Rects. Packing boundary/style varyings and using the existing storage overflow path
fixed shader-limit failures found during this stage. The final focused outline suite passes;
all 14 facet transform checks and 12 symbol checks pass. The rebuilt density-contours image
was inspected. Small SVG triangle edges still differ in viewer antialiasing.

The final fresh full browser suite completed **907 cases: 902 passed, 5 failed** in 14.1
minutes. All new outline cases, density/sector exports, masks, 3D guides, theme/scene updates,
frame animation and streamed-tile checks pass. One failure was an assertion bug: the legend
SVG regex matched `stroke-opacity` instead of `opacity`. An exact DOM attribute query keeps
the original count and 0.3–1 opacity requirements; **all 21 legend checks pass** afterward.
No rendering code changed after the full run, and no additional full rerun is claimed.

The other four checks remain recorded from the previous full run:

- `frame-marks.spec.js:261`: preparation count 6 versus 3.
- `stage14-nested-paths.spec.js:223`: the two DPR-1 violet-arrow raster vertices.
- `examples.spec.js:1349`: Force position-buffer shape 2048 instead of 2/3 channels.
- `docs-site.spec.js:662`: independently random ConstantData simulations differ in exact SVG.

The comparison also caught double-gyre's batch-generated preview using different axes
padding. A fresh single-example export passes exact Python/Svelte comparison. A separate
checkout of unchanged **d17e7ea4**, with its own rebuilt Python bundles, reproduces the same
preview padding after `dodge-basic` then `double-gyre` (80/24 versus 36/12 in a fresh export).
This establishes that the batch-preview problem predates outlines. The main preview was
regenerated independently; no export-session carryover fix is claimed. Baseline setup errors
from a dependency symlink's Vite allow list were corrected before measuring this comparison.

The remaining gates pass: **1,205 units and 3 slow tests**, **0 type errors/warnings**,
**111 signatures**, current API report, rebuilt Python bundles, **791 pytest passes/1 skip**,
packed consumer types/SSR/production/settings/fonts/remounts/JAX, **35 Python scene fixtures
and 4 interaction round trips**, and production docs loading budgets. Gallery previews and
115 stale thumbnails were rebuilt. The full Playwright report remains local at
`/tmp/stage95-browser-final-report/index.html`; logs retain the focused checks and
isolated baseline comparison. The frozen agent benchmark was not changed.

## Stage 96 automatic label bounds (2026-10-05)

The Layered DAG's labels were clipped because automatic domains included anchors and ordinary
fractional padding but omitted their rendered pixel footprint. Text now measures widths in
the atlas's font and units, reduces widths/sizes/offsets with the existing coordinate-extents
readback, and preserves the resulting reservations through domain unions and field grouping.
Rectangular 2D Cartesian frames fit these summaries in transformed units against their shared
projected boundaries. Empty, missing and filtered labels contribute no bounds. Callout uses
Text; Crosshair's view-following readouts keep their existing exclusion from automatic domains.

Five new DPR-2 cases in `stage16.spec.js` check actual DAG glyph bounds, PNG pixels with masks
enabled/disabled, size/alignment/offset/box edits, resize, inverted/log axes, nested and rotated
Frames, embedded facets, explicit-to-auto domain changes, withdrawal and viewport navigation.
The Text-only resize/inspector check completes at least three frames with **zero readbacks and
zero render shader builds**. The final fresh focused run passes **77 cases**, including masks,
axis controls, field facets, nested domain updates, 3D labels and SVG/PNG export parity.
Two further browser cases pass: the exact Svelte/Python SVG comparison for `text-basic`,
`callout-basic`, `nodes-basic`, and the existing annotation/callout export check.

Verification also passes **1,207 unit tests**, followed by **17 focused unit checks** after the
field-group metadata change; **0 type errors/warnings**, **111 signatures**, the current API
report, rebuilt Python bundles and **791 pytest passes/1 skip**. The three paired label previews
and Layered DAG thumbnail were refreshed. A fresh live DAG image was inspected at DPR 2.
The focused report is local at `/tmp/stage96-browser-report/index.html`.

Fitting uses conservative per-mark maxima and does not prevent label overlap. Oversized text
cannot fit in a smaller drawable frame; sqrt domains cannot extend below zero. Explicit,
categorical and view-following domains and zoom behavior remain authored. Polar/spherical/3D
views, Text3D and TeX retain position-based fitting. No new full browser run is claimed; the
Stage 95 residual failures above remain recorded. The frozen agent benchmark is unchanged.

## Stage 97 site examples and loading (2026-10-05)

The focused fresh-server run passes **39 browser cases**, including three new DPR-2 checks:
two stalled scene downloads followed by a rendered destination, navigation during an unfinished
component-settlement barrier, and an older gallery module delayed across navigation. These
checks retain SVG geometry assertions and reject page errors. Previews, script-free pages,
source-language persistence, WebGPU fallback, viewport gating, Python editing/Stop, component
trees, picking, settings and fonts also pass. Portable templates, eight template-gallery exports,
and selected deterministic Svelte/Python pairs pass. After rebuilding all previews and changing
the production configuration, the **three new navigation cases pass again** on a fresh server.

Production testing caught the old top-level-await plugin losing exported D3 function hoisting
with the split scene registry. Native ES2022 top-level await fixes the initialization error.
The loading budget now rejects page errors or missing completed live frames, and checks every
legacy preview variant as well as paired previews. It passes on the corrected production build.
A separate DPR-2 production smoke exports actual Points/Pie SVG geometry and captures the older
example with scripts blocked; the screenshots were inspected. The audit measures **29.7% less
compressed JavaScript** on Points versus main at 36c6678c. See docs/PERFORMANCE.md for bytes,
commands and the limits of the single-sample timings.

Other gates: **1,209 unit tests and 3 slow tests passed**, followed by **24 final focused units**;
**0 Svelte/internal type errors or warnings**, **111 signatures**, current API report, rebuilt
Python browser bundles and **791 pytest passes/1 skip**. The packed-library consumer passes
types, SSR, production rendering, settings, fonts, remounts and JAX inputs. **35 Python scene
fixtures and four interaction round trips** pass with lazy component loading. All **165 paired
examples** and **115 legacy previews/thumbnails** were rebuilt; all **151 gallery cards** load
thumbnails without a plotting runtime. No additional full browser-suite run is claimed; Stage
95's recorded residual failures remain. The frozen agent benchmark was not changed.

## Stage 98 continuous subdivision (2026-10-05)

The actual World map projections and Force 2D examples now assert completed draws while
longitude inputs and force positions keep changing, at DPR 2. The force case enables curves
while running. Live screenshots assert visible countries/curves; final map exports retain
their deterministic seam cuts. Both checks reject uncaptured GPU errors and warmed shader
builds. GeoJSON recovery, nested maps, picking, buffer growth and vector/raster parity pass.
**15 focused cases pass**, followed by the final full-suite checks of the same behavior.

The fresh full browser run completed **916 cases: 902 passed, 14 failed**. A fresh serial rerun
of those 14 passes nine. Five remain:

- Independently random ConstantData programs differ in exact SVG, as already recorded. The
  comparison's cleanup also reports the previously recorded double-gyre batch preview.
- `frame-marks.spec.js:261`: preparation count six versus three, previously recorded.
- `stage14-nested-paths.spec.js:223`: the same two DPR-1 violet-arrow vertices, previously recorded.
- `examples.spec.js`: editing the Lorenz Python program ends at `status="error"` rather than
  `ready`. This reproduces at the identical edited-Run assertion on unchanged **61b27fcc**.
- `flyover.spec.js:191`: roof re-selection picks Building 1028716 instead of 1028715. The same
  IDs and assertion fail on unchanged **61b27fcc**.

The baseline archive used its own rebuilt Python bundles and server. Its two failures establish
that those checks predate this patch; their underlying fixes remain outstanding. The full-run
Force shape-2048 failure passes in the serial rerun but remains the previously recorded race.
Eight additional full-run timeouts/fixture failures pass serially, including GeoJSON export,
hovering, partition labels, churn, label bounds, templates, dense tiles and live time. No fully
green browser run is claimed. Reports remain local at
`/tmp/stage98-full-browser-report/index.html`, `/tmp/stage98-retry-report/index.html`
and `/tmp/stage98-before-report/index.html`.

Other gates: **1,212 units and three slow tests**, **zero type errors/warnings**, **111 signatures**,
current API report, rebuilt bundles and **791 pytest passes/one skip**. Packed consumer
types/SSR/rendering/settings/fonts/remounts/JAX, **35 Python scene fixtures** and **four interaction
round trips** pass. docs/PERFORMANCE.md records frame measurements and snapshot costs; TODO
Stage 98 records implementation and limits. The frozen agent benchmark remains unchanged.

## Live simulation execution (2026-10-05)

The numeric Simulate update now reuses a compiled expression program, with current state,
input constants, clock values and interaction flags passed as arguments. Other expression
kinds and precision-sensitive integer columns retain the existing eager evaluator.

The full unit run passes **1,214 tests**; after the final ownership change, **nine focused
simulation units** pass, including output lifetime and borrowed-parent reference accounting.
Types report **zero errors/warnings**, **111 signatures** match and the API report is current.
On a fresh DPR-2 server, **three focused browser cases** pass: springs pause/settle/wake/reset,
the actual Lorenz workload's rendered 60,000-point output and allocation/compilation budget,
and double gyre's dye brush/reset/mixing with completed frame progress. A separate visual
probe passes Lorenz's collapse/recovery slider and linked orbit/histogram brushing.

The rebuilt Python bundles export both actual example programs at clock times 0 and 128 ms.
Their PNGs contain visible colored data and changed pixels after advancing, and were visually
inspected. Final warmed observations draw Lorenz at about **48 fps** with **31 MB cumulative
temporary allocations in four seconds**, versus about **6 fps/5,719 MB** before; double gyre
draws about **60 fps** without new GPU buffers. No new warmed shaders or uncaptured GPU errors
occur. These are observations on this machine, not portable frame-rate guarantees.

The day-to-day trigger reported by the maintainer remains unidentified: four isolated October
3–5 checkpoints already reproduce the same slow live Lorenz workload. PERFORMANCE.md records
those comparisons and the measured catch-up feedback loop. This focused verification does
not claim a new full browser-suite run or resolution of Stage 98's recorded residual failures.
The local browser report is `/tmp/hmplot-lorenz-report/index.html`; exports are in
`/tmp/hmplot-simulation-exports`. The frozen agent benchmark remains unchanged.

**Active-brush follow-up:** the initial double-gyre frame count above was taken before the
brush. An xy brush produces bool membership, which the first compiled evaluator missed,
returning to eager evaluation. The correction accepts both exact 0/1 membership types.
**39 focused simulation/interaction units** pass, including preview/commit/clear/manual dye
semantics; types remain at zero errors/warnings and both Python bundles were rebuilt.
**Two fresh DPR-2 browser cases** pass: Lorenz's existing progress budget and the strengthened
double-gyre dye/reset/mixing test, now counting continuous dragging and committed-brush frames
and enforcing shader/allocation/preview-readback budgets. It records about 60 fps in all three
phases. The brushed screenshot was visually inspected. Native Python exports at 128 and
256 ms retain moving gold dye after a real pointer gesture. No new full suite is claimed;
the report is `/tmp/hmplot-gyre-brush-report/index.html`.

## Zoomable sunburst (2026-10-05)

The paired sunburst programs use selection and calculated, tweened polar bounds to focus a
weighted hierarchy. Browser interaction stays in the scene, including standalone Python HTML;
there are no host callbacks. The ordinary annular-sector mesh now supplies the UV parameters
its picking material requests, matching the refined mesh.

Verification: all **1,217 unit tests** pass, types have zero errors/warnings, the API report is
current, and both Python bundles were rebuilt with **111 signatures** checked. Pytest recorded
**770 passed, 16 skipped**; six localhost/Chrome cases blocked by the process sandbox passed
when rerun with normal process permissions (**776 passed across the runs**). Four focused
browser cases on a fresh server at DPR 2 passed three repetitions (**12 passes**): Svelte and
Python zoom/back/leaf/reset navigation and intermediate animation geometry; pale-center pixels
and mobile layout; matching vector SVGs without errors/warnings; and existing polar-sector
picking and vector paths. Gestures measure the canvas position each time, since scrolling can
move it between screenshots and clicks. Native PNG, SVG and standalone HTML exports are also
checked, with zoom/back navigation exercised in the HTML and screenshots visually inspected.

This is focused verification, not a new full browser-suite run. The local browser report is
`/tmp/hmplot-lorenz-report/index.html`; exports are in
`/tmp/hmplot-sunburst-exports`. The frozen benchmark is unchanged.

## Stage 99 tree layouts and lifecycle (2026-10-05)

Final checks pass **1,230 unit tests**, **three slow tests**, **48 focused layout/animation
units**, and types with **zero errors/warnings**. All **111 signatures** and the API report
are current. Rebuilt Python bundles pass **794 pytest tests with one skip** (six existing
NumPy/xarray warnings); three additional visualizer checks pass after removing obsolete fixed
domains. **35 Python scene fixtures and four interaction round trips** and the packed npm
consumer's types/SSR/rendering/settings/fonts/remounts/JAX checks pass.

The final fresh DPR-2 run passes **13 browser cases**: paired Python/Svelte sunburst and
expandable-tree interactions; intermediate geometry and live frame progress; concurrent PNG
and SVG exports during animation; Tree auto/explicit bounds and depth filtering; Python tree
visualizer hover; hybrid/vector/PDF/effects exports; the export panel; and exact SVG comparison
of the five rebuilt Tree example pairs. Native Python PNG, vector SVG/PDF (the Plot rather
than Markdown-bearing Scene), and standalone HTML exports succeed for both examples. Real
pointer gestures change and reset their exported HTML geometry without errors. Focused HTML
and browser screenshots were inspected.

Native checks found an export overlapping atomic layout publication could restore a stale
boolean animation hold and freeze the clock. Shared counted holds now survive out-of-order
completion; unit and live-browser regressions cover this. GPU root-path tests also assert
correct distances when rerooting away from row zero.

The initial fresh full browser run completed **924 cases: 915 passed, nine failed**. A serial
rerun of 14 affected cases passed ten before the final visualizer correction. Tree progress's
pending-pick test timing and three stale Tree comparison exports were corrected; visualizer
domain/hover assumptions were corrected and now pass. Input-controls, flick and the previously
recorded Force shape race pass serially. Remaining recorded failures are:

- Full-gallery exact SVG comparisons of independently random ConstantData, and the previously
  recorded double-gyre batch-preview mismatch. The five affected Tree pairs pass; the entire
  gallery comparison was not rerun after them.
- `flyover.spec.js:191`: Building 1028716 rather than 1028715 on roof re-selection, already
  reproduced on unchanged 61b27fcc during Stage 98.
- `frame-marks.spec.js:261`: preparation count six versus three, previously recorded.
- `stage14-nested-paths.spec.js:223`: two violet-arrow raster vertices at DPR 1, previously
  recorded.

No fully green full-suite run is claimed. The full report remains at
`/tmp/hmplot-tree-full-report/index.html`; the final focused report is
`/tmp/hmplot-tree-final-report/index.html`, and native exports are in
`/tmp/hmplot-tree-exports`.

Each final warmed animation records **35 completed draws and 34 distinct bounds**, with **zero
new compute/render pipelines or shaders**. Over roughly 1.7 seconds of sampled work, sunburst
records 2,282 buffers/318 KiB and 269 readbacks (261 JAX/eight picking); expandable-tree records
2,091 buffers/146 KiB and 397 readbacks (389 JAX/eight picking). GPU numeric geometry itself
does not read coordinates back each frame; bounds, rendering and picking still have costs.
These small examples establish sustained progress, not 60 fps or universal layout speedups.
Approximate/fixed subtree sizing costs O(depth * (nodes + edges)); exact CPU tidy reads moving
inputs back. Changing root/reparenting is discrete and may compile new plans; continuous
sunburst zoom uses a fixed hierarchy with tweened widths/heights. The frozen benchmark is
unchanged. No full site build or entire gallery rebuild is claimed.

### Stage 99 animation performance follow-up (2026-10-05)

All **1,232 unit tests** pass, plus **20 focused document-export units** after the final vector
capture correction. Types have **zero errors/warnings**; **111 signatures** and the API report
remain current. Final rebuilt Python bundles pass **794 pytest tests, one skip**, with six
existing NumPy/xarray warnings. **35 Python scenes and four interaction round trips** and the
packed consumer's types/SSR/rendering/settings/fonts/remount/JAX checks pass. The two affected
Python example previews were rebuilt; screenshots were inspected.

The initial fresh DPR-2 browser run passed **49 of 52** checks. The three failures were older
legend tests sampling CSS coordinates as image pixels or comparing implicit DPR-1/DPR-2
contexts with different viewports. Their assertions now use the export's pixel ratio and
explicit identical viewports. The follow-up passes **35 checks** covering those corrected
tests, late-mounted opacity legends, Python/Svelte tree interactions, concurrent exports,
warmed intermediate geometry and Filter churn. The final **seven regressions** pass after
correcting vector capture: actual GPU interval bounds interpolate 2 → 3 → 4 with changing
SVG paths; a one-second Rect transition includes a deliberate 650 ms atomic preparation wait;
export pauses, shared scope/Playback, PNG/SVG/PDF and transparent effects remain correct.
The supplied Python Calculate-tween pattern also moves its GPU positions and SVG paths at
intermediate clock times. Root geometry interpolation and field mapping share existing paths.

Profiling found no per-tick layout-coordinate download or new warmed shaders. Per-draw GPU
buffers fall from **67.6 to 12.6** for sunburst and **63.7 to 3.9** for expandable-tree;
readbacks fall **7.7 → 5.8** and **11.7 → 3.5** respectively. A separate run without CPU/stack
profiling measures about **40/53 fps**. The 650/600 ms clock transitions finish at about
652/602 ms; pointer handling and final settling add about 46–80 ms. Remaining bounds,
label-dependent Filter counts and picking still synchronize with the GPU. Explicit exports
now capture displayed transitioning positions/bounds rather than uploaded targets.

This is focused verification, with no new full browser suite or universal 60-fps claim.
The frozen benchmark is unchanged. Reports: `/tmp/hmplot-tree-perf-report/index.html`
(35 follow-up checks) and `/tmp/hmplot-tree-perf-regressions-report/index.html`
(seven final regressions). Profiles and counters: `/tmp/tree-{sunburst,expandable-tree}-{before,final,quiet}.json`.

## Stages 100–106 integration (2026-10-06)

The integrated current-column tween, GraphData (with the inference FromEdges did), graph migration and shared extent
changes, including compiled numeric mark expressions, pass **1,305 unit tests**. The earlier
integrated source passes **three slow tests**. Type checks have zero errors and
warnings; **112 component signatures** and the API report are current. Focused DPR-2 cases
verify current values through transforms, live interval geometry, coherent bounds, graph
identity and large integer keys, Force dragging, keyed fades and displayed-frame exports.
Both Python and Svelte sunbursts show intermediate sector/text opacity, changing geometry,
white-center fading and exact root restoration. Focused regressions also verify current live
SVG corners and moving-column tooltips, complete publication ordering and partial Rect recovery.

Points/Points3D's `depthWrite` option has a rendered DPR-2 test: overlapping front/far points
change visible order when disabled, restore nearest visibility when enabled again, and retain
nearest-point picking. A depth-write-disabled 3D view uses raster export; forced vector export
reports the unsupported order. Focused affected units and Python round-trip validation pass.

Galaxy's two DPR-2 cases pass against the rebuilt Python bundle and paired example: ten million
GPU-generated rows, compact scene payload, source/download/editor views, filtering, the sampled
H–R view, brushing/clearing, camera motion and responsive layout. Warm interactions add no
shaders; idle plots submit and allocate nothing. The initial settled GPU-buffer allocation
counter falls from 11.748 GB to 5.268 GB after Calculate releases expression intermediates.
This counts requested buffer bytes, not physical GPU memory; it is not a matched speedup test.

The Stage 103 GPU picking prototype removes readbacks but misses its measured benefit target;
no production picking path changes. Stage 104's bounded count/capacity prototypes establish
count/sum/mean parity and memory tradeoffs, without changing production counts, capacity or
public API. Stage 105 retains only shared finite summaries and conservative geometry reuse.
Three quiet CSS-size comparisons improve median p95 update latency from **35.6 to 18.2 ms**;
large filtering shows no repeatable improvement. Thirty-one focused units, four standalone
rendered guards and all five combined guards pass. Broader investigation matrices remain
listed as follow-up in [the investigation report](docs/PERFORMANCE-INVESTIGATIONS.md).

The sunburst measurements distinguish changing layout geometry from the near-60-fps retirement
tail. Current-column field reuse and static sector membership improve warmed geometry progress
from **16–18 to 20–21 updates/s** against a baseline retaining the same fade behavior. They also
reduce JAX reads from 69–74 to 37–39 per flight. Later source-checked Text-only controls remain
around **20 updates/s** with about 1.4 s total settlement: glyph caching alone has no reliable
frame-rate gain. The dedicated Text guard verifies retained glyph inputs, moved/changed PNG
pixels and searchable updated SVG text; label updates add no render pipelines before export
passes. Remaining expression evaluation and extent summaries are recorded in
[the investigation report](docs/PERFORMANCE-INVESTIGATIONS.md). These CPU/async traces overlap
and are not isolated GPU kernel timings. Smooth sunburst animation is still an open issue.

The final rebuilt-bundle Python suite passes **806 tests, with one skip**. Python scenes
(35) and interaction round trips (four) pass at DPR 2; the packed consumer passes types,
SSR, rendering, fonts, settings and remount checks. These scene/consumer runs precede the
numeric compiler; final compiler verification passes six fresh-server DPR-2 rendered guards.
They verify native/Python sunburst fades/exports, warmed geometry progress, two consumers of
current tween columns, live bounds/static fades and the original first 12 example navigation/
SVG comparisons. The current-column case completes 62 frames and 124 writes with zero new
shaders/readbacks and stable buffers. Final hashes are in
`/tmp/hmplot-stage106-final-source-evidence.json`.

The broad browser run recorded **822 passes and 116 failures out of 938**; the serial gallery
recorded **75 passes and five failures out of 80**. A 120-case correction matrix recorded
111 passes and nine failures; subsequent exact RGB, wheel and legacy Calculate startup checks
resolve three more failures. The remaining six assertions reproduce unchanged on baseline
`a3667d1d`: mount preparation counts, texture green coverage, nonlinear SVG center color, two
globe-box extents and nested-horizon SVG vertices. Their assertions remain intact. Lossless
pixel transfer, readiness/DPR gesture corrections and a plain immutable data-generation helper
resolve the diagnosed test/startup problems. This reconciliation is not a green full-suite
result. Broad browser/gallery and slow suites were not repeated after the final compiler
integration when the user requested that work be wrapped up.

Source-verified compiled-target comparisons improve changing sunburst geometry from roughly
**19–24 to 27–30 updates/s**, with no warmed shader/pipeline compilation. Buffer allocations
fall from 476–491 to 157–174 per flight; readbacks remain. Five-way Text ablations show that
animated row-opacity processing remains expensive: roughly 25–28 updates/s versus 50–56 with
constant opacity. Hiding glyph drawing adds no material gain; fixed domains alone add little.
Changing opacity also changes fade deadlines, so whole-flight timing and submission totals
do not isolate the active GPU cost. Smooth animation remains an open performance issue.

Logs and HTML reports are retained under `/tmp/hmplot-stages100-105` and the
`/tmp/hmplot-stage101-*` / `/tmp/hmplot-stage106-*` artifacts. Portable performance
evidence and reproduction scripts are in `tests/perf/investigations`. The frozen benchmark
remains unchanged.

## Manhattan storage bindings and Stage 106 broad verification (2026-10-07)

The Manhattan detail replay identified a retired GeoFaces category-color storage buffer in
Three's texture-keyed bind-group cache. Storage-group refreshes now bypass that cache while
retaining shader/pipeline caching. Six real-data detail changes produce no GPU validation
errors; the inspected screenshot retains the map and extruded buildings. Six fresh-server
DPR-2 browser guards pass, including forced buffer growth with identical exported PNG pixels,
tile reuse/picking, globe reversals, flyover navigation, momentum and building SVG output.
The unit guard exercises Three's actual bind-group cache with allocation replaced by a
binding snapshot; texture-only groups still reuse their cache entries.

Required gates now complete after the Stage 106 compiler integration: **1,306 unit tests**,
**zero type errors/warnings**, signature/API checks, **806 Python tests with one skip** against
rebuilt bundles, and **three slow tests** pass. The fresh DPR-2 full browser run records
**929 passed and 14 failed out of 943** in 18.8 minutes. The fresh serial DPR-2 gallery run,
with current example artifacts and background thumbnail capture disabled, records **77 passed
and three failed out of 80** in 6.6 minutes. These are completed runs, not a green full suite.

An eight-case serial rerun passes fractional mesh opacity, Galaxy's single payload request
and paused Force dragging (**148 completed frames / 150 animation frames**). Remaining
failures, with their assertions intact:

- The six earlier assertions matched on `a3667d1d`: preparation count, texture green coverage,
  nonlinear SVG center color, two globe-box extents and nested-horizon SVG vertices. The new
  broad run uses DPR 2 globally; this does not repeat their earlier DPR-1 baseline comparison.
- Paired-program SVG parity: independently random ConstantData and the recorded double-gyre
  preview margin mismatch. Rebuilding all example artifacts does not resolve either.
- Solar system page overflow: 350 pixels at a 1,300-pixel viewport. The pre-patch archive's
  layout replay times out on hidden live content earlier; that is not equivalent evidence.
- Interaction-dashboard pipeline budget: seven distinct pipelines versus a budget of six,
  with six distinct WGSL pairs. Both solid and dashed per-row Line probes also report zero
  blue coverage at DPR 2. All three failures match on pre-patch `206e98f9`.
- The serial gallery controls replay hits the previously recorded Force position-shape-2048
  race; the same errors occur in the pre-patch archive. It passes in the new full run, so it
  remains intermittent.

Reports are `/tmp/hmplot-todo-{browser,serial,gallery}-report`; corresponding JSON
results use the `-results.json` suffix. Logs are `/tmp/stage106-{full-browser,serial,
gallery}.log`; the pre-patch comparison is `/tmp/storage-before-browser.log`.
The focused flyover log is `/tmp/flyover-final-browser.log`. The baseline archive
uses current example artifacts and the same dependencies; two initial server-setup attempts
were interrupted and are excluded. No frozen benchmark configuration or bundles changed.

## Shared expression plans and column operations — Stage 107 (2026-10-07)

The final source passes **1,315 unit tests**, **813 Python tests with one skip** against
fresh Python bundles, **zero type errors/warnings**, **112 component signatures**, API checks
and the packed npm consumer (types, SSR, production rendering, settings, fonts, remounts and
JAX inputs). **Three slow tests** pass. Unit coverage includes compiled/reference parity,
predicated and boolean reductions, typed neighbor fills, stable group-local ordering,
window/container parity, grids and logical metadata, changing scalars/masks/publications,
literal-slot separation, cache eviction and ownership. Exact int32/device-boolean lag/lead
requires an explicit typed fill; no nullable sentinel is invented for those buffers.

The initial focused fresh-server DPR-2 run passes **29/29**. It checks rendered ordered
expressions, linked selection, shared Window behavior, animation progress and exports. The
full fresh-server DPR-2 run completes **944 cases: 929 passed and 15 failed**, in 16.7 minutes,
before the final Force correction. Thirteen failure names match the Stage 106 record above:
mesh opacity, paired-program SVG parity, Solar overflow, interaction-dashboard pipeline budget,
paused Force under broad load, preparation count, texture PNG, two per-row Line pixel probes,
nonlinear SVG, two globe bounds and nested-horizon SVG. The new explicit-initial-position Force
failure was an omitted evaluator argument; it is fixed with unit coverage and a rendered
Force/dragging replay. A new warped-Image predicate timeout passes serially. These are
completed runs, not a green full suite; the complete suite was not rerun after the Force fix.

The final serial fresh-server DPR-2 replay records **7 passed and 2 failed out of 9** in
1.2 minutes. Corrected Force, paused Force (**148 completed frames / 150 animation frames**),
fractional mesh opacity, warped Image, ordered-expression pixels and warmed Sunburst/tree
progress pass. Preparation count and the texture-example PNG probe retain their previous
failures. Assertions and timeouts remain unchanged. The ordered-expression screenshot shows
the five expected points and selected-sum line; the inspected Sunburst screenshots retain
sector geometry, fading labels and the white center. A Python node-transform variant also
exports successfully at DPR 2 with `GraphData → Nodes → Calculate → Tree → Nodes`; putting
Calculate directly under GraphData correctly reports missing node fields in the edges scope.

The shared service is used by the audited authored-expression consumers, with bounded
consumer-owned plans and explicit fallback reasons. Producer-owned tweens, random and
metadata operations retain their lifetimes. Their supported numeric inputs can compile;
a tween fallback counter represents producer dispatch, not uncached interpolation. Existing
count/group/topology and scalar-validation reads remain; no new predicate/value reads were
added. [The consumer audit](docs/NODE-EXECUTION.md#expression-consumer-audit-stage-107-2026-10-07)
documents the boundaries and specialization triggers.

Matched, inspector-off Sunburst replays use local headless Chrome at DPR 2, text and opacity
enabled, one warmed click/return pair followed by three measured pairs with 900 ms waits per
gesture. Development progress is **191 before / 193 after**, over about 5.78 s. Three production
pairs average **35.15 before / 35.46 after completed frames/s**; this includes waits and is
not animation-only FPS. The first production pair samples about **1.19 s active CPU in both
builds** over about 5.6 s. There is no meaningful measured frame-rate improvement. Remaining
CPU binding/allocation, reactive publication and asynchronous waits are not isolated GPU costs.

Bounded opt-in hooks record one warmed **Text beauty-material first build, 4 ms, version 7**,
followed by no more Three.js shader-graph builds or native GPU pipeline creation. The Rect
"Studio workload" picking material is reused at source version 27. The hook was enabled after
initialization, so this does not identify the exact material/first-use trigger in the earlier
supplied Chrome picking burst. The replay establishes no unnecessary rebuild to optimize
safely; picking invalidation behavior is unchanged. Tree/Filter/Rect/Text plan diagnostics
confirm compatible program reuse, including animated opacity. Sunburst smoothness remained
an open issue at this point; the Stage 108 scheduling investigation below identifies and
improves a separate cause.

Logs are `/tmp/stage107-{final-unit,final-pytest,slow,force-types,force-python-build,
focused-browser,full-browser,serial-browser,package}.log`; the broad and serial JSON/HTML and
failure artifacts use corresponding `-results.json`, `-report` and `-artifacts` suffixes.
Production profiles, summaries and inspected screenshots are
`/tmp/stage107-prod-{before,after}-{2,3,4}-*`; the opt-in replay is
`/tmp/stage107-prod-diagnostics-*`. The corrected node-transform screenshot is
`/tmp/stage107-nodes-calculate.png`. Production measurements use the same archived
baseline dependencies and examples, plus a test-only example-handle exposure for measurement;
library production semantics are unchanged. Initial attempts without that handle timed out
and are excluded. Frozen benchmark configuration and bundles remain unchanged.

## Live row-animation readiness — Stage 108 (2026-10-07)

Temporary probes measure completed frames, skipped-draw reasons and the responsible tracks
on the same six-gesture Sunburst replay at DPR 2. Tree publishes new geometry, animated Text
retargets, and registering its RowTransition sets `applied=false`. The draw guard waits for
another clock tick even though the row-animation producer could publish its current value.
With text, the instrumented replay records **86 completed frames, 66 Tree updates and 66
unapplied-track skips**; without text, **132/132/6**. Most blocked tracks are Text animations
(72 instances across 66 skipped draws). A diagnostic guard bypass gives **152/118/0**.
The targeted current-value application, with the guard retained, gives **292/216/6**.
These probes add overhead and include waits; they establish scheduling behavior rather
than GPU pass timings. Parent spans, extent waits and GPU map intervals overlap.

The production fix lives in the shared `RowTransition.prepare`: after retargeting, submit
the blend at the current clock time, then mark the track applied while keeping it pending
for future ticks. It adds **one blend dispatch per retarget and no readback**. Snap, row start
times, easing and the normal draw guard remain intact. No Tree/Text-specific scheduling or
animation dependency API is added. The existing unit test covers dispatch order, pending and
applied state, current time, growth, snap and disposal.

Three matched, inspector-off development pairs without timing hooks average **34.71 before
and 53.31 after completed frames/s**, about **54% more frame progress**. Each sequence uses
the same six gestures with 900 ms waits. This is not animation-only FPS, a GPU timing, or a
claim of universal 60 FPS. It identifies and improves a substantial scheduling cost; the
remaining CPU binding/allocation, reactive work and asynchronous extent waits have not been
ranked as the next limiting cost. All replay page-error lists are empty. The inspected final
screenshot retains the sectors, labels and white center.

Final-source gates pass **1,315 unit tests**, **813 Python tests with one skip**, rebuilt
Python bundles, **zero type errors/warnings**, **112 signatures**, API checks and the final
packed consumer (types, SSR, production rendering, settings, fonts, remounts and JAX inputs). The full
fresh-server DPR-2 run completes **944 cases: 931 passed, 13 failed**, in 17.6 minutes. Twelve
failure names match Stage 107's earlier record: interaction-dashboard pipeline budget,
paired-program SVG parity, Solar overflow, paused Force under broad load, preparation count,
texture PNG, two per-row Line pixel probes, nonlinear SVG, two globe bounds and nested-horizon
SVG. The newly observed moving-Text glyph-payload identity assertion fails in that run and
passes alone; its cause remains unisolated. It is recorded rather than silently retried away.

The fresh serial replay passes **2/2**: paused Force completes **147/150 sampled frames** with
zero maps, and Text retains glyph buffers, moves rendered labels, and updates content in SVG.
The full run also passes Sunburst drill/reset/fades, expandable Tree, warmed shader/pipeline
counts, row-animation scale-space/retargeting/enter/exit, live tweens, picking and exports.
Assertions/timeouts are unchanged. Earlier broad/serial failure records remain intact; the
full suite is complete, not green. Stage 107's three slow-test gates precede the
row-readiness change.

Logs and results are `/tmp/stage108-{unit,types,python-build,signatures,api,pytest,
full-browser,serial-browser,package}.log`, with corresponding browser `-results.json`/`-artifacts`
paths. Matched summaries and screenshots are `/tmp/stage108-{before,after}-{1,2,3}-*`;
temporary config/driver files are `stage108-replay.*`. Instrumented cost probes are
`/tmp/stage107-cost-*`; an initial legend-coordinate run and an unmatched probe
replacement are excluded. Frozen benchmark configuration and bundles remain unchanged.

## Data and mark preparation — Stages 109–111 (2026-10-08)

The data layer lazily owns category codes; retained immutable Filter mappings lease gathered
columns with a 64-entry / 16 MiB payload limit. Shared channel dependency records let eligible
Text, Rect and Points update accepted fields without reconstructing unrelated preparation.
Moving Text retains label codes, widths, atlas and export strings; changed content, font,
membership, representation or unsupported channels still use complete preparation. Font-load
notifications invalidate retained atlas pixels and bounds footprints. Text payload errors
remain inside the plot's validation boundary, and valid subsequent content recovers.

Final-source gates pass **1,324 unit tests**, **813 Python tests with one skip**, rebuilt Python
bundles, **zero type errors/warnings**, **112 generated signatures**, API checks and the packed
consumer (types, SSR, production rendering, settings, fonts, remounts and JAX inputs). The three
slow tests pass on the preparation implementation before the final font/error-boundary fixes.
No public API or protocol changed. Python used `.venv/bin/python`; an initial system-Python
attempt lacked pytest, and a sandboxed attempt could not launch Chrome or bind export sockets.
The permitted run passes. An initial packed-consumer preview startup timeout is retained; the
final offline package run passes without changing its assertions or timeouts.

Two fresh-server DPR-2 full browser gates completed:

| Run | Cases | Passed | Failed | Duration |
| --- | ---: | ---: | ---: | ---: |
| Initial preparation gate | 945 | 931 | 14 | 17.2 min |
| After Text error-boundary correction | 946 | 933 | 13 | 18.8 min |

The initial run caught a **new dashboard regression**: a label-atlas validation error thrown
from a derived payload unmounted the enclosing example. It now reports through the existing
mark boundary. A focused test checks that the plot stays mounted and recovers after valid
content. The initial serial replay was 13 passed / 1 failed at that dashboard case, before
this correction; its failure is retained.

The second full gate still fails these assertions:

- `blend.spec.js:58`: fractional mesh row alpha.
- `docs-site.spec.js:792`: paired Svelte/Python SVG parity.
- `examples.spec.js:1366`: Solar example panel overflow.
- `facet-variants.spec.js:12`: interaction-dashboard pipeline budget.
- `facets.spec.js:669`: Force fill pixels.
- `frame-marks.spec.js:263`: preparation count on mount.
- `gallery-improvements.spec.js:70`: texture PNG pixels.
- `line-buffers.spec.js:96,114`: per-row Line pixels and buffer-limit error.
- `nested-frames.spec.js:147`: nonlinear parent SVG parity.
- `stage14-lonlat.spec.js:71,94`: root-globe box bounds.
- `stage14-nested-paths.spec.js:223`: nested-horizon SVG.

Eleven failure names match earlier stage records. Mesh alpha passes both a serial baseline
control and the final serial run. Force fill fails on the baseline and passes in the final
serial run. Their broad-run causes remain unisolated; these results do not establish new
regressions or erase the failed gates. The earlier paused-Force and moving-Text failures pass.
Sunburst drill/reset/fades, expandable Tree, live bounds, masks/picking, PNG/SVG/PDF exports,
warmed shader/resource checks and Lorenz/Double Gyre progress pass in the broad run.

The final font-revision/footprint invalidation correction follows the second full gate.
Its fresh DPR-2 serial replay passes **9/9**: native/Python Sunburst, intermediate Tree
geometry, Force fill, mesh alpha, loaded-font pixels/widths, moving filtered Text and current
SVG geometry, payload-error recovery and the 4,096-row dashboard. The latter records 17–18 ms
warmed pointer-to-filtered-frame responses. Sunburst midpoint/final screenshots and the moving
Text screenshot were inspected. The full gate was not repeated after this narrow font fix;
the suite is complete, not green, and no assertion or timeout was weakened.

Additional quiet 5k/50k filtering controls retain three repetitions with plain timing and
GPU counters captured separately. All cases complete six accepted frames per sequence,
retain the correct row counts/domains and match original PNG hashes exactly. A second 50k
pair checks the first timing difference; durations overlap and no general filtering speedup
is claimed. Both versions retain the same 12 reads / 138 submits / 14 buffers / four shaders
per sequence. Source/fixture hashes were verified on the frozen servers after capture.
The separate verified idle replay records no draws/submits/reads/allocations over 500 ms in
either build (one completion-wait call each), using a nonfallback `apple / metal-3` adapter.
See the compact preparation/filter results for every repetition and measured limits.

The Stage 111 candidate was built only in a private pinned-fork snapshot. All **3,753 upstream
core tests in 34 files** pass, including **four realization cases** across available devices
and a real WebGPU run in Chrome **154.0.8037.98**. Scalar/empty/constant/contiguous arrays,
slices, broadcasts, transposes, pending compiled calls, repeated realization, buffer identity,
reference counts and disposed-array validation are covered. Byte reproduction with pinned
Node 22.22.0 / pnpm 11.24.0 passes. An earlier all-workspace attempt had eight unresolved
optional-package imports because only core dependencies were installed; the corrected core
run excludes `packages/**`, as in the fork's historical verification. This is recorded as
experiment verification, not acceptance of a runtime patch. The measured acceptance decision
is in [the performance investigation](docs/PERFORMANCE-INVESTIGATIONS.md).

Logs: `/tmp/stage109-110-{full-browser,serial-browser,final-full-browser,slow}.log`,
`/tmp/stage109-110-font-final-{unit,types,signatures,api,python-build,pytest,package,
focused-browser}.log`, and `/tmp/stage109-110-final-baseline-controls.log`. Full gates
retain matching `-results.json`, `-artifacts` and HTML reports. Backend records are
`/tmp/stage111-{upstream-core,candidate-reproducibility}.log`; the source experiment is
`/tmp/hmplot-stage111-source`. Measurement commands and compact source-verified results
are retained under `tests/perf/investigations`. Frozen benchmark configs/bundles and the user's
localhost:5173 server were preserved.

## Python gallery decoder follow-up — Stage 110 (2026-10-08)

The actual Python gallery exposed a compilation gap that the earlier native Svelte timing
fixture did not cover: decoded columns included unset own metadata properties, which the
shared planner rejects as lossy JSON snapshots. The decoder now omits those absent properties
and preserves supplied metadata. The unit regression checks changing decoded values, metadata
and compiled-plan reuse; the existing native/Python Sunburst rendering test now also checks
zero mark-arithmetic fallbacks after drill/reset.

Final-source checks pass **1,325 unit tests**, **813 Python tests with one skip** against
freshly rebuilt bundles, **zero type errors/warnings**, signatures and API checks. The fresh
isolated-server DPR-2 serial browser run passes **7/7**: both Sunburst languages, both expandable
Tree languages, warmed intermediate Sunburst/Tree GPU progress, and moving filtered Text with
current SVG geometry and changed content/footprints. Midpoint/final Sunburst and moving Text
screenshots were inspected. There is no new public API or fork artifact. This bounded decoder
fix did not repeat the entire browser suite; the earlier full-gate failures remain recorded
above and are not reclassified as passing.

Four separate serial captures compare frozen baseline `b5b84320` with the decoder correction
on the actual `/examples/sunburst` Python scene, with identical payload/fork bytes and served
decoder-source checks. Each discards a warm-up pair and retains five measured pairs. Active
CPU falls 548.4 → 444.6 ms per gesture; plain observed frame p95 falls 28.4 → 20.7 ms, while
median remains 16.7 ms and completed frames rise 75.6 → 78.1. All four final PNG hashes match.
This is development-only evidence from one machine, with no GPU-counter comparison; it shows
reduced CPU/stalls rather than a substantial FPS gain. See the retained Python-metadata JSON
and performance report for individual flights, source hashes, cumulative plan diagnostics
and limitations. The overlapping private compiled-gather timing experiment was excluded;
no gather/backend change was retained.

Logs: `/tmp/hmplot-scene-metadata-{all-unit,types,signatures,api,python-build,pytest,
browser}.log`; rendering results/artifacts are matching `-browser-results.json` and
`-browser-artifacts`. Raw captures are `/tmp/hmplot-scene-metadata-{baseline,fixed}-
{plain,cpu}`. The first focused unit attempt had one incorrect assertion expecting an addition
result to retain the source unit; checking the source's supplied metadata fixes that test,
and the complete final unit suite passes. Frozen benchmark configurations/bundles and the
user's localhost:5173 server were preserved.

## Before a release

1. Every suite in the table above, on a real GPU, on a fresh dev server.
2. The counts per suite and the browser suite's Playwright HTML report
   (`npx playwright test --reporter=html`) are attached to the GitHub release.
3. `npm run check:api`: every change to the public API since the last release has a CHANGELOG
   entry.

## Not covered

- GPUs other than Apple M-series (NVIDIA, AMD, Intel): only SwiftShader in CI.
- Safari and Firefox, and mobile browsers.
- Performance numbers are measured on one machine, per release.

## Flaky tests

A flaky test is a bug: it is fixed, or quarantined here with its reason, within a release. There
are no silent retries: a red run from a flake costs more trust than a retry saves.

**Quarantined:** listed in tests/browser/QUARANTINE.md, which `npm run gate` reads (TODO 136.1): a
listed test still runs, and its failure does not block. Tests tagged `@timing` count frames or
time a response; the gate runs them after the rest, on one worker.
Tests tagged `@nightly` (the scale sweep, `scale-sweep.spec.js`: each mark family at 1, 1,000,
1,025, 100,000 and 1,000,000 rows) run in the daily browser suite only; the gate leaves them out.

**Traces:** a failed browser test keeps a Playwright trace, `test-results/<test>/trace.zip`
(`npx playwright show-trace <file>`; the gate keeps its parallel pass's in its temporary folder,
and its @timing pass runs without them). The gate prints each failed test's requests that never
got a response, and the requests its dev server took more than 5 s to answer (TODO 136.1b).

**Stalled page loads:** specs import `test` and `expect` from `tests/browser/fixtures.js`. When a
page of the test's context is loading (in page.goto, or its modules in the 10 s after) and its
document, script or stylesheet has had no response for 30 s, the page is loaded once more, and
the test is annotated `stalled-load` with the requests it waited on. A second stall, or one
later in the test, is annotated and not retried. This is the one retry, and it is not silent:
the gate lists every stalled load, passed tests' too (TODO 136.1b).

**Known flaky, to fix before the release:**

- `tests/browser/interaction-gallery.spec.js:87` (the join-tables brush): about 1 run in 3 on
  main (measured 2026-09-28).
- `tests/browser/animation-engine.spec.js:44` (animate() on a log axis passes through the
  geometric midpoint): failed once in a full run on 2026-09-29, then passed twice alone.
- `tests/browser/flyover.spec.js:366` (a flyover flick glides on; `@gpu`): failed once in the
  full run of 2026-10-02 (TODO 69.15). The flick did not glide, because the release came 35-60 ms
  after the last move, a frame and a round trip, past Momentum's 40 ms pause. The spec now
  releases right after its last move: 3 of 3 alone and 15 of 16 beside a three-worker examples
  suite. The one failure was not traced. A likely cause is a frame of more than about 65 ms
  between the last two moves (live tiles load as the view pans), which leaves one move in
  Momentum's 80 ms velocity window. `examples.spec.js:988`, the paired flyover's flick, failed
  once the same way in the next full run, and its release follows its last move now too (3 of 3
  alone).
- `tests/browser/force-performance.spec.js:87` "paused" (`@gpu`, frames counted while a node is
  dragged): in the second full run of 2026-10-02 it drew 118 frames where the test asks for more
  than 120 (0.8 of 150). Other agents' browser suites were running on the machine at the time, at
  a load average of 33-48. It passed 15 of 15 runs alone. The "running" case's last-move check
  failed in 5 of 9 runs alone: a test error (the pick's offset; force-drag.js allows for it now,
  12 of 12).

## Tagged `@gpu`

Tests tagged `@gpu` need a real GPU and are skipped on SwiftShader (`grepInvert` in
`playwright.swiftshader.config.js`). These 30 failed there on each of three runs on 2026-09-29,
the last two alone on the machine, and pass on the GPU. They fall into three groups.

**Frame rate.** SwiftShader draws a few frames a second, and these sample an animation
mid-flight, count frames or time a response:
- `animation-engine.spec.js:44`: the log axis's midpoint, sampled mid-animation.
- `keyed-updates.spec.js:33, 58, 109, 119, 370`: rows sampled mid-transition.
- `solar-system.spec.js:41`, `pipeline-churn.spec.js:331`, `vector-tiles.spec.js:192`: frames
  counted while playing or loading.
- `force-performance.spec.js:87` (paused and running; added 2026-10-01, not yet run on
  SwiftShader): frames and ticks counted while a node is dragged at 120 moves a second.
- `interaction-regressions.spec.js:221, 343`: the 95th percentile of brush latency.
- `examples.spec.js`, "the double gyre's brush drops dye ..." (R2.11; added 2026-10-02, not yet run
  on SwiftShader): frames counted while it runs and zooms, and eddies that mix over many steps.

**Too slow.** These time out at 3 minutes or more: many plots on one page, 500,000 rows, 3D
over tiles, or long interaction loops:
- `view-state.spec.js:15, 39, 56, 66, 74, 112`: a page of seven plots that don't all reveal.
- `pipeline-churn.spec.js:254, 302, 408` and `soak.spec.js:44`.
- `flyover.spec.js:3, 76` and `vector-tiles.spec.js:240`.
- `examples.spec.js`, "the ten million stars example" (R2.11; added 2026-10-02, not yet run on
  SwiftShader): ten million points, filtered while a slider moves.

**Pixels.** Software rendering draws these differently from the GPU, beyond their tolerances.
They were not investigated further:
- `plot.spec.js:170`: picking ids through transparency and antialiasing.
- `stage14-connections-mixed.spec.js:3`: connector endpoints to three decimals.
- `stage14-lonlat.spec.js:66, 89`: a box's pixel bounds, within 3px.
- `stage14-root-map.spec.js:62` (four projections): a vector export against the raster.
- `vector-tiles.spec.js:52`: a road's color at a probe pixel.

The config also gives polling checks 30 seconds, not Playwright's 5: 13 more tests pass then,
since SwiftShader draws the same pixels, only slower.
