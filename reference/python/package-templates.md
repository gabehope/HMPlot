# hmplot/templates

Render a code-free Python template inside a Svelte plot or data context.

JavaScript only.

## Example

```svelte
<script>
  import { Plot } from "hmplot";
  import { PortableTemplate } from "hmplot/templates";
  import trend from "./trend.hmplot.json";
</script>

<Plot data={table}>
  <PortableTemplate definition={trend} params={{ x: "day", y: "value" }} />
</Plot>
```

## Exports

- `PortableTemplate` (`component`): Renders an exported Python Template subtree inside the current Svelte HMPlot context; definition is its JSON file, params bind its named values, props are its main part's props (its contract's main, else its only mark; visible alone for a group of marks), or under a contract part's name an object of that part's props, events binds host callbacks by contract part name or unique node name, and children fill its slot.

## Usage

`hmplot/templates` publicly exports `PortableTemplate`, the Svelte loader for an exported
Python template. The repository's JavaScript `defineTemplate` and `TemplateHost` are internal
authoring tools, not exports of this package entry. Use an ordinary Svelte component for a
pattern authored directly in an application.

A portable file is an expanded component tree: it can hold marks inside a host Plot, or a
non-mark pattern such as Calculate → Plot → slot inside a host Data scope. Supply the table
from the host. The same file loads in Python with `hm.load_template(path)`.

| Prop | Purpose |
| --- | --- |
| `definition` | The exported `.hmplot.json` object, not a JavaScript template definition. |
| `params` | The file's explicit parameter values; omitted values use marker defaults. Unknown or missing required parameters are errors. |
| `props` | Extra properties for the main mark, or a named-part object such as `{band: {opacity: 0.2}}`. A group with several marks and no main takes only `visible` besides named-part overrides. |
| `events` | Host callbacks by contract part name, else a node's unique `name`, such as `{head: {click: handler}}`. They are not code from the file. |
| Children | A Svelte snippet placed at the exported slot; supplying children without a slot is an error. |

Each instance remaps node IDs and has its own children and handlers. Changing `params` or
`props` updates its instantiated tree; it does not run Python. Main/named parts, nested
contracts, follower visibility and legend entries retain their declared behavior. Slot
children remain the caller's marks and do not select the template's main part.

Python authors with `hm.Template` or `@hm.template`, passes explicit `hm.template_param()`
markers, then exports an instance with an empty slot and no registered callbacks. A marker's
own JSON default, not the Python function's default, determines whether a file parameter is
optional. Attach Python callbacks after loading, or Svelte callbacks through `events`.
Python methods and attributes do not travel.

Files require a matching HMPlot version and are limited to 1 MiB, 256 nodes and 32 nesting
levels. Loaders reject embedded resources, external URLs, unsupported component properties
and callbacks in the file. See [Template](template) and the
repository's `docs/PORTABLE-TEMPLATES.md` authoring guide for mark composition, a non-mark
transform/layout pattern, complete programs and exact limits.
Templates compose existing behavior; [plug-ins](/HMPlot/reference/svelte/plugins.md) supply new execution or rendering.

Download and adapt [candlestick](/HMPlot/examples/template-candlestick.md),
[parallel coordinates](/HMPlot/examples/template-parallel.md), [ridgeline](/HMPlot/examples/template-ridgeline.md),
and [radar](/HMPlot/examples/template-radar.md). Each provides Python authoring/loading, Svelte loading,
a portable JSON file and its host-data shape.
