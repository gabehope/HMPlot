# hmplot/jax

The jax-js that hmplot runs on, for building GPU arrays that plots read without a copy.

## Example

```svelte
import { initializePlot } from "hmplot";
import { numpy as np } from "hmplot/jax";

await initializePlot();
const points = np.array([[0, 0], [0.5, 0.5]]);
```

## Exports

- `everything jax-js exports` (`jax-js`): numpy, the transformations and the rest of jax-js's API, as upstream jax-js 0.1.25 documents it (hmplot's patches change compilation, not the API).

## Usage

`hmplot/jax` is [jax-js](https://github.com/ekzhang/jax-js) 0.1.25 (MIT, by Eric Zhang), bundled as `@hmplot/jax` with patches that keep GPU programs from compiling again for every new array length or constant. It exports everything jax-js does, with the same API; see jax-js's own documentation for it rather than this reference. The patches are listed in `vendor/jax-js/PATCHES.md` in the repository.

Plots take plain JavaScript arrays and typed arrays without any of this. Build jax-js arrays with this module when the data is computed on the GPU, so the arrays belong to the same jax-js, and the same GPU device, as the plots that read them: then a plot reads them in place. Call [initializePlot](initialize-plot) first, in the browser (in `onMount` or an event, not during server rendering); it selects WebGPU as jax-js's default backend. Dispose arrays you own when you are done with them; marks keep the inputs they still need.

An app that imports `@jax-js/jax` directly gets a separate copy of jax-js, whose arrays are copied through the CPU: use [hmplot/vite](package-vite) to make it this one.
