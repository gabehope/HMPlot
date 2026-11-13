# @hmplot/jax: jax-js with hmplot's patches

This directory is [jax-js](https://github.com/ekzhang/jax-js) (MIT, by Eric Zhang) at
**`jax/v0.1.25`** (commit `bd581f70b0b72453174c5d8c5c2fa3eeb22735df`), plus the patches in `patches/`. hmplot bundles it (a `file:` dependency listed in
`bundleDependencies`) under its own package name, `@hmplot/jax`, so it never collides with an app's
own `@jax-js/jax`. It is not published on its own, and the patches are not submitted upstream (TODO
Stage 23: we maintain the fork).

- `dist/`: the built package (`npm run build:jax-fork` rebuilds it; `-- --check` verifies it).
- `patches/`: `git format-patch` output against `jax/v0.1.25`, one change each, applied in order.
- `LICENSE`: jax-js's license, copied by a rebuild and compared by `--check`.
- `build.env`: the exact upstream commit, Node and pnpm versions, shared with CI.

## Why

jax-js caches each GPU program by a hash of the whole kernel, sizes and constants included, and writes
lengths and values into the WGSL. Every new array length or constant compiled a new pipeline (tens of
milliseconds each). hmplot's interactive paths change lengths and values on every gesture (a
brushed Filter, a slider, a new bin count), and Stage 17 worked around it path by path. These patches
fix it in the compiler.

## Patches

All patches are maintained locally and **not submitted upstream**. “Upstream bug candidate”
identifies work suitable for proposing upstream; it is not a claim of acceptance or an open PR.
HMPlot regression filenames below are under `tests/unit/` unless identified as browser checks.

| # | Patch | What changes | Status / regression coverage |
|---|-------|--------------|------------------------------|
| 1 | `0001-WebGPU-kernels-read-their-sizes-and-constants-from-u.patch` | A kernel's thread count and nonzero numeric constants are read from a uniform buffer, not written into the WGSL, so kernels that differ only in those values share one pipeline. Kept in the source: structure, dtypes, tuning choices, zero and boolean constants, integer divisors (division by a constant compiles to shifts and multiplies) and the trip counts of one-thread-per-output reduction loops (a literal trip count unrolls: 2-4x faster than a uniform one on an M-series GPU). Sort and argsort read their length from uniforms. Uniforms go through one shared buffer (the old path created a buffer per dispatch and never destroyed it). The per-kernel shader cache is bounded (LRU, 4096). | Local performance; upstream `src/backend/webgpu.test.ts`, HMPlot `kernel-literals.test.js` and `kernel-lengths.test.js`. |
| 2 | `0002-Strided-workgroup-reductions-for-reductions-into-few.patch` | A reduction of at least 64 elements into at most 256 outputs runs a 256-thread workgroup per output, striding over a uniform length: any op, any dtype but bool, any length, one shader. Within ~2 us of the one-thread loop at 64-100 elements and faster from ~300; max over 93,250 int32: ~3.1 ms to under 0.07 ms. | Local performance; upstream `src/backend/webgpu.test.ts`, HMPlot kernel length tests. |
| 3 | `0003-Hash-kernels-with-integer-arithmetic-and-views-witho.patch` | `FpHash` mixes 32-bit integers (two lanes, 64-bit result) instead of a BigInt per character; views hash their fields instead of their JSON. Kernel construction ~85 us to ~46 us; main-thread hashing in a brush drag about halved. | Local performance; upstream `src/utils.test.ts` (hashes). |
| 4 | `0004-Export-webgpuShaderSource-kernel-the-WGSL-a-kernel-c.patch` | `webgpuShaderSource(kernel)`: the WGSL a kernel compiles to, without a GPU. hmplot's unit tests count compiled programs with it on the cpu backend (tests/unit/compiled-programs.js). | Local diagnostics API; upstream `src/backend/shader-source.test.ts`, HMPlot kernel tests. |
| 5 | `0005-Cumulative-scans-pad-their-quadratic-stage-to-a-powe.patch` | `cumsum`/`cumprod` pad their O(n^2) stage (a short axis, or a long axis's chunk totals) to a power of two: one shader per power of two instead of one per length. | Local performance; upstream `src/backend/webgpu.test.ts`, HMPlot kernel length tests. |
| 6 | `0006-Unravel-an-index-without-a-modulo-on-the-outermost-a.patch` | Unravelling a flat index leaves out the outermost axis's modulo, which is a no-op inside the array; it stayed after a gather (an index read from memory has no known range), writing the source length into every gather's shader. | Local performance; upstream `src/backend/webgpu.test.ts`, HMPlot kernel length tests. |
| 7 | `0007-Sort-and-argsort-of-one-element-compile-on-WebGPU.patch` | A bug fix, upstream's too: `sort`/`argsort` of one element (or over a trailing axis of 1) wrote its last local stage as `-1u`, which is not valid WGSL, so the shader failed to compile; it is clamped to 0 (a one-element sort has no stages). In hmplot, a Slice with one entity drew nothing (TODO Stage 25). | Upstream bug candidate; upstream `src/backend/webgpu.test.ts` (one-element sort). |
| 8 | `0008-Export-lax.scatter-updates-indices-shape-the-inverse.patch` | `lax.scatter(updates, indices, shape, {axis, mode})`: the Scatter routine (cpu, wasm, webgpu), reachable before only through the transpose of `take`. Slices of `updates` along `axis` go to 1D int32 `indices` in a zero-filled array of `shape`; `"update"` writes, `"add"` accumulates, and indices outside the axis are skipped (-1 marks an update that goes nowhere). hmplot keeps tween state in source-row order with it (TODO Stage 28). | Local API; upstream `test/lax.test.ts` (scatter on all backends). |
| 9 | `0009-Add-lax.cellPairs-sums-over-neighbors-on-a-uniform-g.patch` | `lax.cellPairs(...)`: a routine (cpu, wasm, webgpu) summing, for each query point, every source point in the uniform-grid cells within `radius` of its cell (sources sorted by cell, each cell a range), with d3's many-body force, a many-body force softened at max(d², 1e-3), or d3's collision. One thread per query loops over its neighbor cells' ranges, so any number of points may share a cell: hmplot's Force grid (TODO 30.1) uses it for the exact near field, where fixed-shape kernels had to cap the points per cell. Not differentiable. | Local API; upstream `test/lax.test.ts`, HMPlot `force-kernel.test.js` and `force-d3.test.js`. |
| 10 | `0010-WGSL-boolean-reductions-keep-their-operands-parenthe.patch` | A bug fix, upstream's too: a boolean reduction stripped each unrolled operand's parentheses before joining them with `&&` (all) or `\|\|` (any), so an operand that was itself a chain (`a <= b` is `(a < b) \|\| (a == b)`) mixed the two: WGSL rejects that ("mixing '\|\|' and '&&' requires parenthesis"), and the precedence would have been wrong. `np.all(logicalAnd(x >= 0, x < g), -1)` in the Force grid failed to compile. | Upstream bug candidate; upstream `test/lax.test.ts` (boolean reductions). |
| 11 | `0011-Add-profiler.setOpHook-a-callback-for-every-primitiv.patch` | `profiler.setOpHook(fn)`: a callback for every primitive bound, eager or traced, so a profiler can record a stack per operation and attribute work to its caller (eager arrays dispatch lazily: a stack at dispatch time shows where work was flushed, not who asked for it). Unset, one check per bind. hmplot counts operations per interaction with it (TODO 33.1). | Local diagnostics API; upstream `test/lax.test.ts`, HMPlot `transform-caches.test.js`. |
| 12 | `0012-WebGPU-dispatches-share-one-command-encoder-and-subm.patch` | Dispatches are encoded into one command encoder and submitted once per task (or after 256, or before a read, `gpuBuffer()` or a wait), instead of an encoder, a uniform write and a submit each. A batch's uniforms sit at distinct offsets of the shared buffer, written once before its submit; each pipeline's uniform bind group is cached; buffers released while a batch is open are held until it is submitted (an upload into a reused buffer cannot land before commands that read it, nothing referenced is destroyed early). While tracing, a dispatch is submitted on its own. A brush move over hmplot's brushed distributions: ~715 submits to ~70, bind groups halved, ~10% faster (TODO 33.5). | Local performance; all upstream WebGPU tests exercise batching, plus HMPlot browser performance checks. No dedicated upstream batching regression in this patch. |
| 13 | `0013-Run-where-there-is-no-global-navigator-Node-20.patch` | A bug fix, upstream's too: the WebGPU tuner read `navigator.userAgent` (to skip unrolling on mobile browsers) and `init("webgpu")` read `navigator.gpu`, unguarded. Node 20 has no global `navigator`, so tuning a kernel for WebGPU there (`webgpuShaderSource`, which hmplot's unit tests call on the cpu backend) threw "ReferenceError: navigator is not defined" (37 unit tests failed so in CI's Node 20 job, 2026-10-02). Without a navigator the tuner unrolls as in a desktop browser, and the webgpu backend is unavailable. hmplot's `tests/unit/kernel-literals.test.js` tunes kernels with the global removed. | Upstream bug candidate; HMPlot `kernel-literals.test.js` with global navigator removed. |
| 14 | `0014-Add-scatter-min-and-max-with-portable-extrema-semantics.patch` | `lax.scatter` min/max initialize every output to its dtype's extrema, propagate NaN and select deterministic signed-zero ties. WebGPU uses integer atomics or floating CAS, including packed float16; CPU/WASM share the same identities and semantics. Gradients explicitly reject these nonlinear modes. | Local numerical API; upstream scatter tests cover all three backends, empty and nonzero-axis shapes, dtype identities, invalid/repeated indices and contention. |
| 15 | `0015-Materialize-routine-operands-after-their-view-operations.patch` | A routine requires its actual operand as a contiguous buffer. The JIT previously materialized the producer before a slice/reshape instead, leaving a deferred view that scatter rejected. Materialize the final operand at the routine boundary. | Upstream bug candidate; all four scatter modes with sliced updates and indices, plus HMPlot's 262,145-row grouped update. |

| 16 | `0016-Bound-cumulative-scan-work-by-recursively-scanning-block-totals.patch` | Large cumsum/cumprod recursively scan block totals instead of growing one quadratic stage without bound. Existing short-axis and small block-total paths remain unchanged. Each recursive level shrinks by 256, bounding total work and scratch linearly. | Local performance; upstream integer boundary, long cumprod and jitted nonzero-axis float checks across CPU/WASM/WebGPU/WebGL. |

Measured on the perf harness (TODO 17.0; 19 gesture scenarios, Apple M-series, Chrome), hmplot
on upstream jax-js 0.1.25 against hmplot on this fork (with Stage 23's changes on its side): GPU
pipelines compiled during gestures 693 to 106, at page load 1,235 to 973; jax-js hashing CPU 1,094 ms
to 367 ms; readback wait per brush move on the Mona Lisa histograms 17.6 ms to 6.8 ms, elsewhere
unchanged within run-to-run noise. jax-js's own test suite
passes (3,707 tests with patches 1-7, including the patches' own in `src/backend/webgpu.test.ts`,
`src/backend/shader-source.test.ts` and `src/utils.test.ts`; 3,722 with patch 8, whose tests are in
`test/lax.test.ts`; 3,747 with patches 9 and 10, whose tests are there too: cellPairs against a
brute-force sum on cpu, wasm and webgpu, and the boolean reduction on every backend; 3,751 with
patches 11 and 12, whose batching runs under every WebGPU test. Those runs installed only the core
package, so the optax, onnx and loaders packages' test files did not load).

What still compiles: a new kernel structure; a new integer divisor (an inner dimension such as a bin
count); a new length of a reduction shorter than 64, or into more than 256 outputs; a new tuning class
(the upcast/unroll/group choices, which depend on divisibility and size thresholds); sorts of 512
elements or fewer (one shader per power of two); cumulative scans (one per power of two).

Not patched: the wasm and WebGL backends still write values into their programs (hmplot runs on
WebGPU); scatter and the linear-algebra and FFT routines still write their sizes into their shaders.

## Reproducing the checked-in artifacts

The pinned toolchain is **Node 22.22.0 and pnpm 11.24.0**, recorded in `build.env`; dependencies
come from the pinned upstream commit's frozen lockfile. With those tools on PATH, run:

```sh
npm run build:jax-fork -- --check
```

Alternatively, npm can provide these tools for the command:

```sh
npm exec --yes --package=node@22.22.0 --package=pnpm@11.24.0 -- sh scripts/build-jax-fork.sh --check
```

Verification builds in a disposable checkout and compares the complete `dist/` tree and `LICENSE`.
It never writes into `vendor/jax-js`, including on failure. `JAX_FORK_WORKDIR=<dir>` reuses an
upstream clone at `<dir>/jax-js` as an object cache; its working tree is never reset or patched.
Without `--check`, the complete built `dist/` tree and upstream license replace the vendored copies.
The build-policy unit test also checks that non-JavaScript assets are compared and copied.

The `Reproduce vendored jax-js` workflow runs on changes to this directory or its build script,
and can be run manually. It checks byte reproducibility and a clean checkout. It does not certify
GPU behavior. The Stage 84 rebuild matched every current artifact and the license with this
pinned toolchain; no patch or runtime bundle changed.

## Updating

An upstream-version, patch, or toolchain change must pass both gates before its rebuilt artifacts
are accepted:

1. **Reproducibility:** update `build.env` deliberately, keep the tag's exact commit and upstream
   `packageManager` consistent, apply patches in order to a clean checkout, and rebuild with the
   frozen lockfile. Run `--check` and the dedicated workflow. Do not bless differences by copying
   artifacts until their source/toolchain cause is understood.
2. **Runtime correctness and performance:** in the patched upstream checkout, run
   `BROWSER=chromium pnpm exec vitest run test src` with Chromium installed and a real WebGPU
   adapter available. Confirm that WebGPU tests executed rather than skipped; record the browser,
   adapter, test totals and skips. Then run HMPlot's kernel literal/length, force and transform
   cache unit tests, the relevant DPR 2 rendering tests, and the performance harness from a fresh
   server. Record completed plot frames, dispatches, submissions, allocations, readbacks and
   settled idle submissions separately. CPU shader-source equality and software GPU CI do not
   replace this hardware run. Finally run the full rendering verification in `TESTING.md`.

For an upstream release, rebase the patch series on its pinned commit, resolve conflicts, and use
`git format-patch <base-commit>..HEAD` to replace `patches/`. Review each row above: remove a patch
only when upstream supplies its behavior and its regression still passes. Update the local fork
version, this table and the recorded verification results. The historical test totals above
refer to the earlier implementation runs; Stage 84 only changes the reproducible build process.

### Stage 123 scatter verification (2026-10-17)

Patch 14 passes the patched upstream core suite: **3,785 tests, no skips**, Chrome
155.0.8059.82 on Apple Metal 3 (non-fallback WebGPU), including 51 scatter cases on CPU,
WASM and WebGPU. The targeted TypeScript check and independent byte-for-byte artifact rebuild pass.
HMPlot's kernel literal/length, force and transform-cache checks passed 177/178 initially;
the remaining failure caught the Window template's eager fallback, fixed in 5755493e and
verified by its targeted cache/window/reduction checks. The accumulated DPR-2 drag, Dodge,
connection and animation run passes 72/76; all four failures also occur in the original
baseline gate. Full HMPlot rendering/performance acceptance remains open.

The paired crossover experiment is in `tests/perf/investigations/scatter-crossover.test.ts`
and `results/scatter-crossover.json`. Direct floating scatter-add is rejected: strongly
skewed inputs caused severe CAS contention and eventually device loss. The bounded striped
sum prototype completes the matrix. Min/max and striped sums improve the large-group cases;
small-group sums remain faster through the existing one-hot implementation. These timings
include readback, not plot frames, and do not by themselves justify an application-wide change.

Patch 15 passes all **54 targeted scatter tests** on CPU/WASM/WebGPU and an independent
artifact rebuild. The HMPlot regression now updates a skewed Group from 32,768 to 262,145
rows, crosses a scatter batch boundary, checks its reductions against a host reference and
asserts the SVG points and completed frames. This exposed the JIT bug: a failed run correctly
kept the old publication, so the test also waits for the intended input's publication.

Patch 16 passes **64 targeted scan cases** and the combined patched core suite: **3,796 tests, no skips**, across its configured backends. The targeted TypeScript check and independent artifact rebuild pass. Paired real-WebGPU samples include small inputs, block boundaries and up to 2,097,152 values; timings are mixed, so this change claims bounded work rather than a uniform speedup. See `results/scan-crossover.json` and the performance investigation notes. HMPlot application timing and allocation/dispatch acceptance remain open.

HMPlot’s 92 targeted Window, grouping, Pie, curve-settlement and kernel-length consumer checks pass with patch 16.
