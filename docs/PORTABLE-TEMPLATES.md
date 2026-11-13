# Authoring templates and portable patterns

A template reuses a tree of existing HMPlot components. It can draw a mark, prepare data for
its caller's marks, or arrange several views. The children keep the data, frame and input
scopes of their position in that tree. No new numerical kernel or renderer is needed.

## Choose an authoring form

| Form | Use it when | What runs |
| --- | --- | --- |
| Python `hm.Template` or `@hm.template` | A notebook or Python application builds the pattern; Python logic or methods help construct it. | `build()` runs in Python at construction and on `update()`. The browser draws its expanded components. |
| Portable `.hmplot.json` | Distribute a Python-authored pattern to Python or Svelte without distributing its Python function. | Python builds the tree once at export. Loaders substitute declared parameters into that fixed tree. |
| JavaScript template definition | Contribute a built-in pattern in this repository, sharing one declarative definition between its wrapper, tests and generated API. | `TemplateHost` expands the definition in Svelte. This authoring machinery is internal, not an installed-package entry point. |

For an application written in Svelte, use a portable file or an ordinary Svelte component
with a `children` snippet. The public `hmplot/templates` entry exports `PortableTemplate`;
it does not export `defineTemplate` or `TemplateHost`. The experimental `composition` surface
from `hmplot/compound` is another option for advanced Svelte component authors; see
[Writing a pattern](USAGE.md#writing-a-pattern).

Choose a built-in chart from `hm.charts` / `hmplot/charts`, or a statistical pattern from
`hm.stats` / `hmplot/stats`, before authoring another version of it.

## Author in Python

Use `@hm.template` for a function, or subclass `hm.Template` and put the same construction
in `build(self, ...)`. The function's or method's parameters define the call signature and
its Python defaults. Create components inside `build()`; a component instance has one parent
and cannot be reused between calls.

The Python blocks below run in order. They write portable files into the current directory
but do not display or render anything until a notebook displays one of the resulting roots.

### A mark with a main part and named parts

This pattern overlays points on an interval band. It belongs inside a Plot, like the marks
it composes. The caller can add an annotation at the slot, after the band's and points' draw
positions.

```python
import hmplot as hm

@hm.template
def interval_points(x, y, lower, upper, *, band_opacity=0.2):
    band = hm.Area(x=x, lower=lower, upper=upper, fill="#547ba2", opacity=band_opacity)
    head = hm.Points(x=x, y=y, fill="#547ba2")
    hm.contract(main=head, parts={"band": band, "head": head})
    hm.slot()

data = {
    "day": [1, 2, 3], "value": [2, 4, 3], "alternate": [3, 3, 4],
    "low": [1, 3, 2], "high": [3, 5, 4],
}
with hm.Plot(data=data, axes2d=True, legend=True) as mark_plot:
    with interval_points("day", "value", "low", "high", size=7, label="Estimate",
                         band={"opacity": 0.15}) as interval:
        annotation = hm.Text(x=2, y=5, text="Peak", dy=-12)
    hm.Legend(target=interval)
```

`hm.contract()` is called once during the build. Here it declares:

- **Main part:** `head` supplies mark events, selection options, endpoints and the legend
  target. With exactly one mark of its own, a Python template infers that main part. With
  several marks, declare one when callers should treat the pattern as one mark. A nested
  template can be main; resolution continues to its main mark.
- **Named parts:** `interval.part("band")` and `interval.part("head")` return this instance's
  components. These names are independent of their `name=` settings labels. A part name
  cannot also be a build parameter or a prop of the main mark.
- **Forwarded properties:** `size` and `label` are not build parameters, so they go to the main
  Points. `band={"opacity": 0.15}` goes to the named Area and overrides `band_opacity` there.
  Other appearance props are not automatically broadcast to every part; route a value in
  the build when several parts should share it. A build accepting `**kwargs` receives those
  keywords itself and is responsible for forwarding them.

A template with several marks and no main is a group. It accepts `visible=` for the group,
but other undeclared properties and operations requiring one mark raise; use named parts.
A non-mark pattern should take its configuration as explicit build parameters.

### Children, updates and instance independence

There is one unnamed slot per Python template. Call `hm.slot()` in the component scope
where children belong. `with instance:`, `add`, `remove` and `clear` operate on that slot;
`clear()` leaves the template's own parts intact. `instance.children` lists its own top-level
nodes, while `instance.slot.children` lists the caller's children. Without a slot, `with`
and `add` raise. Named or replaceable part slots are not supported.

Slot children remain the caller's marks: they do not determine the template's main part or
join its main part's legend/visibility contract. Their position still determines which data
and coordinate scopes they inherit.

```python
clicks = []
def record_click(event):
    clicks.append(event.source_index)

interval.on_click(record_click)       # the Points' events
head_before = interval.part("head")
interval.update(y="alternate", size=9)
interval.part("band").update(opacity=0.1)
```

Call `update()` after the template's own `with` block closes. It merges build parameters and
forwarded props into the original call and runs the build again. Components matched by kind
and position keep their objects, IDs and externally registered callbacks; caller children
move into the rebuilt slot. A failed build leaves the prior template intact. Changing the
shape can create or remove parts. Direct edits to rebuilt parts, including settings-pane
edits, reset to what the new build declares. Updating an outer template also rebuilds its
nested templates.

Each call has its own nodes, parts, slot, settings scope and input names. Sharing the same
host table deliberately shares that table's interaction state; independence does not copy
its data or disconnect linked views.

### A non-mark pattern: transform, layout and child slot

`CenteredPanel` computes a column with the existing Calculate and mean expression, then
owns a Plot whose marks the caller supplies. A Row arranges two independent instances. The
slot's children see `centered`; siblings outside the Calculate see the original table.

```python
class CenteredPanel(hm.Template):
    def build(self, field, *, title="Centered values", height=260):
        with hm.Calculate(centered=hm.subtract(field, hm.mean(field))):
            with hm.Plot(title=title, height=height, axes2d=True) as self.plot:
                hm.slot()

with hm.Scene() as panel_scene:
    with hm.Data(data):
        with hm.Row():
            with CenteredPanel("value") as first:
                hm.Points(x="day", y="centered")
            with CenteredPanel("alternate", title="Other measure") as second:
                hm.Line(x="day", y="centered")
first.update(title="Centered observations")
```

This template has no mark of its own; its callers' Points and Line stay in their respective
slots. Set `title` or `height` through the declared parameters, and use `first.plot` for the
Plot's own handles or events. Mark-specific keywords such as `size` are not panel parameters;
put them on the caller's Points. A class is useful here because it exposes that Plot as an
attribute. A decorated function can build the same tree.

### Settings, events and legends

A Python mark template inside a Plot has a settings group. With a main part it presents that
part's controls and hides the helper marks' individual rows. A group without a main lists its
parts, using contract part names where they have no `name=`. Patterns owning views, or no
marks of their own, keep their Plot/Frame/layout settings structure instead. Build parameters
are not automatically settings-pane controls; edit a component's supported settings or call
`update()` with the parameter. There is no public `hm.setting()` declaration.

Events registered on the mark template use its main mark. Register events on a named part
for another target, or on a class attribute such as `first.plot` for a view. Python callbacks
require an attached kernel and are not executable content in a portable file.

With a main part, its legend entry represents the pattern; helper marks default to
`legend=False` and follow the main mark's effective visibility. A helper's explicit `legend`
or `visible` remains its own choice. For several marks with one group legend entry and no
main, declare `hm.contract(legend_entries=[{"label": "Range", "swatch": band,
"parts": [band, head]}])` instead of `main=`. The listed helpers follow the swatch's visibility;
unlisted marks keep their own entries. A main part and `legend_entries` cannot be combined.

## Export an empty instance

Portable export records explicit `hm.template_param()` markers that reach component props.
A marker without a default is required on loading, even if the Python build parameter had a
default. Fixed arguments stay fixed; unused markers create no parameter. Defaults must be
plain finite JSON values. Parameter names should be simple identifiers such as `x` or `field`.

Export a fresh instance with an empty slot and no registered callbacks. Keep host tables and
other resources outside it. These files retain the mark contract and the non-mark transform
scope, respectively:

```python
interval_points(
    hm.template_param("x"), hm.template_param("y"),
    hm.template_param("lower"), hm.template_param("upper"),
    band_opacity=hm.template_param("band_opacity", default=0.2),
).export_template("interval-points.hmplot.json")

CenteredPanel(
    hm.template_param("field"),
    title=hm.template_param("title", default="Centered values"),
).export_template("centered-panel.hmplot.json")
```

Python control flow runs only at export. A marker can occupy a property or an expression
operand; it cannot decide a Python `if` or loop. Use ordinary values to choose a tree before
export. A portable loader cannot add branches by rerunning the original Python function.

### Load in Python

`hm.load_template()` returns a Template class with keyword parameters from the file and the
same forwarding and slot rules. It restores main/named parts and nested contracts, not Python
class methods or attributes such as `CenteredPanel.plot`. Its own `update()` rebinds file
parameters; expanded nested template nodes have no Python build function to rerun.

```python
LoadedInterval = hm.load_template("interval-points.hmplot.json")
LoadedPanel = hm.load_template("centered-panel.hmplot.json")

with hm.Plot(data=data, axes2d=True, legend=True) as portable_plot:
    with LoadedInterval(x="day", y="value", lower="low", upper="high",
                        size=6, label="Loaded estimate") as loaded_interval:
        hm.Text(x=1, y=3, text="Loaded", dy=-10)
    other_interval = LoadedInterval(x="day", y="alternate", lower="low", upper="high",
                                    visible=False)
loaded_interval.on_click(record_click)  # attach the host's callback after loading

with hm.Data(data) as portable_panel:
    with LoadedPanel(field="value") as loaded_panel:
        hm.Points(x="day", y="centered")
```

Every load instance remaps node IDs and has its own slot and handlers. `part("head")` still
works on `loaded_interval`; the second instance does not inherit its callback or children.
The loaded panel's caller supplies the table, and its default title comes from the marker.

## Use in Svelte

Put the two exported files beside this Svelte component. `params` supplies file parameters;
`props` supplies main-mark properties or named-part overrides. Use camelCase for JavaScript
component properties. The host binds callbacks by contract part name, or by a node's unique
`name=` when there is no matching contract name.

```svelte
<script>
  import { Data, Plot, Points, Text } from "hmplot";
  import { PortableTemplate } from "hmplot/templates";
  import interval from "./interval-points.hmplot.json";
  import panel from "./centered-panel.hmplot.json";
  const data = { day: [1, 2, 3], value: [2, 4, 3], low: [1, 3, 2], high: [3, 5, 4] };
</script>

<Plot {data} axes2d legend>
  <PortableTemplate definition={interval}
    params={{ x: "day", y: "value", lower: "low", upper: "high" }}
    props={{ size: 6, label: "Estimate", band: { opacity: 0.15 } }}
    events={{ head: { click: (payload) => console.log(payload) } }}>
    <Text x={2} y={5} text="Peak" dy={-12} />
  </PortableTemplate>
</Plot>
<Data value={data}>
  <PortableTemplate definition={panel} params={{ field: "value" }}>
    <Points x="day" y="centered" />
  </PortableTemplate>
</Data>
```

Updating `params` or `props` updates the instantiated tree; callbacks come from the current
`events` object. The children snippet occupies the exported slot. Supplying children to a
file without a slot is an error. A non-mark file has no main mark to receive `size` or `fill`;
use its declared parameters and put mark properties on the slot's children.

## JavaScript definitions in this repository

The following examples use source-relative imports inside HMPlot's `src/lib/templates/`.
They are contributor examples, not imports available from an installed package. Applications
can use the public portable loader above without access to this machinery.

A definition declares parameter defaults and a tree. `param()` reads a parameter; `rest()`
forwards the caller's non-parameter props. JavaScript main selection is explicit: the node
marked `main: true`, else the node holding `rest()`. Unlike Python, a lone mark without either
does not infer a main. An `id` names a handle for `host.part(id)`; including it in `parts`
and `params` also makes its caller-provided object an override for that node.

Save this as `src/lib/templates/intervalPoints.js`:

```js
import { defineTemplate, node, param, rest, slot } from "./define.js";

export default defineTemplate({
  kind: "IntervalPoints",
  params: { x: undefined, y: undefined, lower: undefined, upper: undefined,
            bandOpacity: 0.2, band: undefined },
  parts: ["band"],
  root: node("Mapping", {}, [
    node("Area", { x: param("x"), lower: param("lower"), upper: param("upper"),
                   fill: "#547ba2", opacity: param("bandOpacity") }, [], { id: "band" }),
    node("Points", { x: param("x"), y: param("y"), fill: "#547ba2", ...rest() },
         [], { id: "head", main: true }),
    slot(),
  ]),
});
```

The wrapper supplies the components the tree names and forwards the caller's snippet. Save
this as `src/lib/templates/IntervalPoints.svelte`:

```svelte
<script>
  import Mapping from "../plot/mapping.svelte";
  import { Area, Points } from "../plot/composition.js";
  import TemplateHost from "./TemplateHost.svelte";
  import definition from "./intervalPoints.js";
  let { children, ...props } = $props();
  let host = $state();
  export const getMark = () => host?.getMark();
  export const getLegendSource = () => host?.getLegendSource();
  export const subscribeSettings = (listener) => host?.subscribeSettings(listener) ?? (() => {});
  export const whenSettled = () => host?.whenSettled();
</script>

<TemplateHost {definition} parts={{ Mapping, Area, Points }} {props} {children} bind:this={host} />
```

Use this local wrapper inside a Plot. `size={7}` and `onclick={handler}` reach the Points;
`band={{ opacity: 0.1 }}` overrides the Area. The slot's children are rendered after both.
The definition and component map are fixed for a mounted instance; props are reactive.

A non-mark definition can instead compose Calculate and Plot. This is the JavaScript form
of the centered panel; it uses an existing expression, not a new numerical transform:

```js
import { defineTemplate, node, param, slot, dataExpression as expr } from "./define.js";

export default defineTemplate({
  kind: "CenteredPanel",
  params: { field: undefined, title: "Centered values", height: 260 },
  root: node("Calculate", {
    columns: { centered: expr("subtract", param("field"), expr("mean", param("field"))) },
  }, [node("Plot", { title: param("title"), height: param("height"), axes2d: true },
          [slot()], { id: "plot" })]),
});
```

Host it with `parts={{ Calculate, Plot }}` and a children snippet, using the same wrapper
pattern. There is no main part and no `rest()`: configure it through its declared parameters.
`dataExpression()` substitutes the field name, then Calculate evaluates it per row. The
parameter-only helpers such as `where()` evaluate during expansion, not over table rows.

JavaScript definitions may additionally declare `settings` to expose consumed parameters
in the host's settings group (Histogram is an existing example). A `params` default alone
adds no control. Public chart definitions use `defineChart` with `option(type, doc, ...)`
in `src/lib/charts/`; generation writes their wrapper, props and Python signatures. Keep
that registry/API integration with its owner; the examples here add no public component.
A definition is not the portable scene-file format and is not input to `PortableTemplate`.

## Supplied-value charts: first pattern batch

The first low-risk batch uses `defineChart` and existing public marks/transforms. It adds four
chart templates to `hm.charts` / `hmplot/charts`, with no core renderer, kernel or plugin.
The reference examples and the four agent recipes are complete Python/Svelte programs.

| Chart | Main mark (`getMark()`) | Named part overrides | Supplied inputs |
| --- | --- | --- | --- |
| ForestPlot | Points (`estimate`) | `interval`: ErrorBars; `referenceLine`: RuleX | Estimate, absolute lower/upper endpoints, category, optional reference |
| BulletChart | Bar (`actual`) | `ranges`: Bar; `tick`: Prism | Actual, category, target, list of cumulative range-bound columns |
| IntervalTimeline | Prism (`interval`) | `milestones`: Points | Category, x0/x1 interval endpoints, optional milestone per row |
| Sparkline | Line (`line`) | `band`: BandY; `last`: Text | Ordered x/y, optional lower/upper reference bounds and final-row text |

Python spells `reference_line` in snake_case. The main mark owns events, selection, legend and
main-part settings; named part objects override that part's existing props. Supporting parts
follow main visibility through the template contract, and `following()` routes shared opacity,
interaction response and axis settings where appropriate. The host Plot owns dimensions,
axis settings and layout. Sparkline labels the final finite x/y row in current input order;
its Line retains ordinary missing-value gaps. A reference band does not expand the domain.

The surface-ratchet exception is limited to these four explicitly requested template kinds
and seven named concepts (`reference`, `referenceLine`, `last`, `ranges`, `tick`,
`milestone`, `milestones`). Other keywords reuse existing names; the largest signature does
not grow. The list of qualitative bounds uses Fold and Sort rather than one prop per range.
There are no aliases for existing charts. Figure, linked-selection and dendrogram patterns
remain later work; statistical estimation, clustering and scheduling algorithms remain external.

## Templates and plug-ins

A template chooses and configures existing components: Calculate already knows how to
subtract a mean, and Area already knows how to draw a band. A numerical plug-in supplies
new numerical execution or layout behavior; a rendering plug-in supplies effects or shading.
Those use the plug-in registry and its execution/resource contracts. A template can compose
components that use a registered plug-in, but does not install a new operation by naming it.

See the [plug-in authoring guide](../src/routes/content/reference/plugins.svx) and
[Python plug-in delivery](../src/routes/content/reference/use-plugin.svx) for those extension
points. Plug-in code and installation are separate from a portable template's component tree;
any recorded plug-in dependencies must be available in the consuming host.

## File and serialization limits

- Export requires an empty caller slot. Registered callbacks make export fail; attach them
  after loading. Python functions, class methods, arbitrary objects and build-time control
  flow are not serialized. Nested templates are already expanded, with their own contracts.
- The file contains protocol/library versions and a version-1 template record with
  parameters, the slot ID, contracts and any plug-in references. Loaders require a matching
  HMPlot library version, validate properties and remap all node references per instance.
- Scene, Provider, VectorTile and Markdown nodes are rejected. External URLs, embedded
  table/column/scale/normalization/theme/selection/identity resources and image/sky addresses
  are rejected. Supply tables and resources from the host or via parameters. Literal JSON
  lists and objects used as component values are permitted; a portable file is not a dataset
  bundle or a Python executable.
- Limits are 1 MiB of JSON, 256 nodes and 32 levels of nesting. Parameters have finite JSON
  defaults; malformed descriptors, unresolved references and unknown properties are errors.

## Chart patterns to download

The gallery's [candlestick](/examples/template-candlestick),
[parallel coordinates](/examples/template-parallel), [ridgeline](/examples/template-ridgeline)
and [radar](/examples/template-radar) have paired Python/Svelte programs and downloadable
portable files. Each documents its host-data shape. They are further examples of fixed
component trees with parameters and an annotation slot.
