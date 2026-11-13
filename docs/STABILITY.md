# Versions and stability

HMPlot is at 0.x: the API may still change. This page says what counts as the public API, what a
version number promises, and where the library is tested.

## The public API

- **JavaScript:** what the package's entry points export: `hmplot` (the root), and `hmplot/jax`,
  `hmplot/tiles`, `hmplot/video`, `hmplot/vite`, `hmplot/types`, `hmplot/scene`,
  `hmplot/templates`, `hmplot/charts` and `hmplot/stats`.
  `hmplot/compound` (the building blocks of the compound marks) is **experimental**: it may change
  in any release.
- **Python:** the public names in `hmplot` (`import hmplot as hm`), `hmplot.charts` and
  `hmplot.stats`, their documented keywords, and the `hmplot` command. Chart and statistical
  patterns use `hm.charts` and `hm.stats`; core components and helpers use `hm`. Other modules
  and names that start with an underscore are internal.
- **The wire format** between Python and the browser (python/PROTOCOL.md) changes with the
  package: a saved notebook's scene is read by the version that wrote it.

Anything else, such as a file's path inside the package or a settings-pane option's internal
name, is internal and may change without notice.

## What a version means

- **0.x:** a minor release (0.2.0) may break things, and every break is listed in CHANGELOG.md.
  A patch release (0.1.1) fixes bugs and breaks nothing that worked as documented.
- **Deprecations:** a name that is going away first warns, for one minor release, saying what
  to use instead; the next minor release removes it.
- **One version:** the JavaScript and Python packages release together, with the same version.

## The public surface is snapshotted

Three files, committed with the code, list the public surface:

- `api/hmplot.api.md`: every name each JavaScript entry point exports, with its type
  (`npm run api:report` writes it; `npm run check:api` checks it);
- `python/hmplot/signatures.json`: every Python component's keywords and their types;
- `python/hmplot/registry.json`: the components, their properties and their settings.

CI fails when any of them changes and CHANGELOG.md has no entry for the change, so a break can't
land by accident.

## Supported environments

| Environment | Versions | Tested |
|---|---|---|
| Browsers | Chrome and Edge 113 or later on desktop, with WebGPU | In CI daily (Chrome, software WebGPU on Linux); before each release on a real GPU (Chrome, Apple M-series) |
| | Safari and Firefox, where they have WebGPU | Untested |
| | Mobile browsers | Untested |
| GPUs | Apple M-series | Before each release |
| | Others (NVIDIA, AMD, Intel) | Untested |
| Python | 3.11 to 3.14; NumPy 2.x, and 1.x on 3.11 and 3.12; with and without pandas, Polars and PyArrow | In CI |
| Node | The active LTS versions, for building an app with the npm package | In CI |
| Operating systems | macOS, Linux and Windows: `pip install`, a scene, and an export | In CI |
| Exports | Headless Chrome on a GPU, or on SwiftShader without one | In CI (SwiftShader); before each release (GPU) |

## What 1.0 will mean

1.0 promises that minor releases don't break the public API. It comes when:

- the R2.0 API cleanup is done;
- several minor releases in a row have had no unplanned breaking changes;
- the full browser suite runs in CI.
