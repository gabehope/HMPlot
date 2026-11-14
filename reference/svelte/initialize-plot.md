# initializePlot

Start the GPU array backend before making GPU arrays yourself; Plots start it on their own.

## Example

```svelte
import { initializePlot } from "hmplot";
import { numpy as np } from "hmplot/jax";
await initializePlot();
const values = np.array([[1, 2], [3, 4]]);
```

## Parameters

- `returns` (`Promise`): Resolves once the backend is ready; rejects with its error.

## Usage

Await initialization before constructing JAX-JS arrays in browser code. Plain named-column plots handle their own preparation. The notebook and documentation adapters initialize their runtime before publishing a scene. Python users do not call this JavaScript helper.
