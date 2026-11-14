# Package entry points

What each import path of the npm package offers, and how stable it is.

JavaScript only.

## Example

```svelte
import { Plot, Points } from "hmplot";          // components and functions
import { numpy as np } from "hmplot/jax";        // the bundled jax-js
import { tileAt } from "hmplot/tiles";           // vector-tile helpers
import { composition } from "hmplot/compound";   // experimental
```

## Entry points

The npm package `hmplot` has one main entry point and ten subpaths, the `exports` of its package.json. Import only from these; a file's path inside `dist/` is internal and may change in any release.

| Import | Stability | What it offers |
|---|---|---|
| `hmplot` | Public | Core components and functions, and their TypeScript types. |
| [`hmplot/charts`](package-charts) | Public | Chart patterns such as Bar, Histogram, Arrows and ErrorBars. |
| [`hmplot/stats`](package-stats) | Public | Statistical patterns: Bin, Hexbin, Normalize, Window and Summary. |
| [`hmplot/jax`](package-jax) | Public | The jax-js that hmplot runs on, for GPU arrays that plots read without a copy. |
| [`hmplot/vite`](package-vite) | Public | A Vite plugin that makes an app's own `@jax-js/jax` hmplot's. |
| [`hmplot/tiles`](package-tiles) | Public | Vector-tile helpers: the tile at a point, a tile's box, loading and decoding tiles. |
| [`hmplot/video`](package-video) | Public | MP4 encoding in the browser, which Plot's `exportVideo()` loads on first use. |
| [`hmplot/scene`](package-scene) | Public | The runtime that draws Python's declarative scenes in a Svelte app. |
| [`hmplot/templates`](package-templates) | Public | Renders portable, code-free Python templates inside Svelte contexts. |
| [`hmplot/types`](package-types) | Public | Option types for the settings a component registers. |
| [`hmplot/compound`](package-compound) | Experimental, in part | The built-in templates also offered by `hmplot/charts`, and `composition`, the experimental surface for writing a pattern in Svelte. |

**Public** names follow the version rules in docs/STABILITY.md: at 0.x a minor release may change them, and every change is listed in CHANGELOG.md. **Experimental** names may change in any release. `api/hmplot.api.md` in the repository lists every name each entry point exports, with its type; a change to it needs a CHANGELOG entry.

In Python, `import hmplot as hm` exposes core components and helpers; chart patterns use `hm.charts` (`from hmplot.charts import Bar`) and statistical patterns use `hm.stats` (`from hmplot.stats import Bin`). Other modules, and names that start with an underscore, are internal.

## Requirements

The package is ESM and its components are Svelte 5 components: an app compiles them with the Svelte plugin, and `hmplot/vite`'s plugin is optional. `svelte`, `three`, `@threlte/core` and `@threlte/extras` are peer dependencies; jax-js is bundled (as `hmplot/jax`), and apache-arrow, hyparquet and the video encoder load only when used. Drawing needs WebGPU in the browser. See docs/USAGE.md, "Browser and build requirements".
