# hmplot/scene

The runtime that draws declarative scenes (what Python sends) in any Svelte app.

## Example

```svelte
<script>
  import { initializePlot } from "hmplot";
  import { SceneRenderer, SceneRuntime } from "hmplot/scene";
  const runtime = new SceneRuntime((message) => console.log(message));
  // state: a scene (python/PROTOCOL.md); load(id): its binary columns.
  initializePlot().then(() => runtime.apply(state, load));
</script>

<SceneRenderer {runtime} />
```

## Exports

- `SceneRenderer` (`component`): Draws a runtime's scene: <SceneRenderer {runtime} />; notebook adds the notebook's frame around it; a Plot without a width fills it unless fill={false}.
- `SceneRuntime` (`class`): new SceneRuntime(send): one scene's state. apply(state, load) validates and draws a scene (load(id) resolves a binary column to { descriptor, payload }); settle(timeoutMs) waits until it is drawn; command({ command, target, args }) runs Python's commands (exports, camera, viewport, time, selection); dispose() frees it. send(message) receives what Python would: status, events, input values, interaction and offsets.
- `SceneResources` (`class`): The tables, scales, selections and identities a runtime holds (runtime.resources); apply prepares them.
- `sceneRegistry` (`object`): The components a scene may name, their properties and settings, and the protocol version (the registry.json Python ships too).

## Usage

Python builds a scene as data, a tree of components with their props and binary columns, and the browser draws it with this runtime: the notebook widget, exported HTML pages and Python's headless exports all use it. Use it to draw a scene that Python (or your own code) produced, in any Svelte app: a dashboard that loads a scene saved by Python, or another transport than Jupyter's.

`runtime.apply(state, load)` checks and draws a scene: `state` is a scene message's state (its protocol version, revision and root node, and the columns, tables and other resources its nodes name), and `load(id)` returns, or resolves to, one binary column as `{ descriptor, payload }` (a Uint8Array). A later `apply` with a new revision updates the scene in place, keeping what did not change. `send(message)`, given to the constructor, receives what the browser would send Python: status, events, input values, selections and drag offsets. `command({ command, target, args })` runs the commands Python's async methods send (`settled`, `export_png`, `export_svg`, `camera`, `viewport`, `time`, `selection`, ...) and resolves to their results.

The scene format and the commands are python/PROTOCOL.md's; a scene names only components in `sceneRegistry`, and a protocol version other than its own is an error. Call `initializePlot()` before the first `apply`, and `dispose()` when the scene goes away. Setting `runtime.snapshot` to `{ src, alt, width, height, note }` shows that image, with the note, in the scene's place, as the notebook widget does in a browser without WebGPU.
