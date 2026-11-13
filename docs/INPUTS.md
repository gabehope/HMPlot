# Inputs

An input is a value the viewer sets: `Slider`, `Select`, `Select(multiple=true)`, `Checkbox`, `Button`, or `Playback`. Each has a `name` and an optional `label`. An input sends its value up to its input context, and everything in that context reads it by name, so one input can drive several transforms and marks. Inputs replace `TransformControls` (see "Migrating from TransformControls" below).

```svelte
<script>
  import { InputContext, Data, Filter, Plot, Rect, Select, Slider, categories, col, equal, input } from 'hmplot';
  import { Bin } from 'hmplot/stats';
</script>

<InputContext>
  <Data value={observations}>
    <div class="controls">
      <Select name="species" options={categories('species')} label="Species" />
      <Slider name="bins" min={2} max={80} step={1} value={24} label="Bins" />
    </div>
    <Filter where={equal(col('species'), input('species'))}>
      <Plot>
        <Bin x="length" bins={input('bins')}>
          <Rect x0="x0" x1="x1" y0={0} y1="count" />
        </Bin>
      </Plot>
    </Filter>
  </Data>
</InputContext>
```

## Inputs and input contexts

| Input | Value | Props besides `name` and `label` |
| --- | --- | --- |
| `Slider` | a number, Date, or `[lower, upper]` interval | `min` and `max` (default 0 and 1), `step` (default: any value), `value` (default: `min`), `format` (a d3-format string such as `".2f"`, or a function) |
| `Select` | one of `options` | `options` (a list of values, or `{label: value}`), `value` (default: the first option) |
| `Select(multiple=true)` | a list of `options` | `options`, `value` (default: none) |
| `Checkbox` | `true` or `false` | `value` (default `false`) |
| `Button` | the number of presses | `value` (default 0) |
| `Playback` | a number that plays | a Slider's, and `rate`, `loop`, `autoplay` (see "Playback") |

- `InputContext` is an input context. So are a Python Scene and each instance of a Python Template, so two copies of a template with a slider do not clash.
- A read walks out through the contexts around it until one has the name, so an inner name shadows an outer one. Two inputs with one name in one context are an error.
- Inputs go beside Plots, not inside them. In Python, `hm.Row(wrap=True, min_width=0)` lays them out in a row that wraps.
- Image and PDF exports leave inputs out; exported HTML keeps them working.
- In Svelte, `bind:value` keeps a variable in step with an input. The handles have `getValue()` and `setValue(value)` (a Button has `press()`), and an InputContext has `getValues()`.

## Reading an input

One read has three forms:

- `input("bins")` in JavaScript, anywhere an expression goes, as `col("x")` does.
- `hm.input.bins` (or `hm.input["bins"]`) in Python.
- The string `"$bins"`, where a string names a column: mark channels, expression arguments, and transform parameters that name columns (Filter's `where`, Sort's and Group's `by`). Elsewhere a string is literal: `title="$GDP"` is a title.

A read is replaced by the input's value before its reader sees it:

- As a whole prop, it is the value: `bins={input('bins')}`. A string value in a channel names a column, so a Select of column names chooses what is plotted (`x="$metric"`). This works for props that take no expressions too, such as Tree `orientation`, Sort `order`, and a Plot `title`.
- Inside an expression, it is a constant: `where={greater(col('weight'), input('threshold'))}`. A multiple Select's list can only be the values of `is_in`: `where={is_in(col('species'), input('chosen'))}` keeps the chosen rows.

A moved input re-runs its readers once, and the change animates like any other data change. A constant inside an expression compiles nothing on the GPU, so moving a threshold slider compiles no new kernels. Input values are never columns.

## Options and ranges from the data

An input inside a Data scope can read its options, range or first value from that data:

```svelte
<Select name="species" options={categories('species')} />
<Select name="metric" options={columnNames()} />
<Slider name="start" min={min('x')} max={max('x')} />
```

`categories(field)` lists a categorical column's categories, `columnNames()` (Python `hm.column_names()`) lists the scope's column names, and any expression with one value (`min`, `max`, `mean`, ...) gives a number. They are read once, and again when the data changes, never when the input moves. Until they are read, the input is pending and its readers wait instead of drawing with a stand-in value. When the data moves the range, the value is kept inside it: a Slider clamps it, a Select falls back to its first option, and a Select with multiple=true drops options that are gone.

## Dates

A Slider, Playback or Select over dates holds Dates (TODO 53.3): `min` and `max` Dates (Python
datetimes), or `min("t")` and `max("t")` of a datetime column, which are Dates in its zone.

```svelte
<Playback name="until" min={min("date")} max={max("date")} rate="4 years" step="1 month" loop />
<Filter where={less_equal("date", input("until"))}>…</Filter>
```

- The value shows as an axis would: by the step (`%b %Y` for months, the date for days, the time
  for hours), else by the span; `format` takes a %-pattern or a function.
- `step` is a calendar interval (`"1 month"` lands on month starts) or milliseconds; a
  Playback's `rate` is a calendar interval per second (`"1 day"`) or milliseconds per second.
- Steps and labels are in the input's `timezone`, default the zone of the column `min()` or
  `max()` read, else UTC.
- A Select's Date options show as dates, and match by time.
- Python sees an aware datetime in that zone, and a datetime it sets reaches the browser as one;
  `{$name}` placeholders show it as a date.

## Playback

`Playback` is a slider with play/pause and reset buttons:

```svelte
<Playback name="year" min={1950} max={2020} step={5} rate={10} loop label="Year" />
<Filter where={equal(col('year'), input('year'))}>…</Filter>
```

- Play advances the value by `rate` value units per second (default 1). With `step`, the value moves one step every step/rate seconds; without it, it moves every displayed frame.
- Its time is the clock of its scope (the Scene, or the outermost InputContext; see ANIMATION.md "Clocks and scopes"), which `@time` reads too: an export or a frozen clock holds it, and each step of `setAnimationTime` moves it by rate × step, so `export_mp4` records it playing.
- At `max` it stops, or wraps to `min` with `loop`. Reset returns to the first value. Dragging the slider moves the value, and play continues from there.
- `autoplay` starts playing on mount, except under prefers-reduced-motion.
- Each move is an ordinary data change, so marks animate between steps.
- From code: `playing` plays (`true`) or pauses (`false`), and each change of `reset`'s value resets. The handle has `play()`, `pause()` and `restart()`; Python has `playback.play()`, `pause()`, `reset()` and `playback.playing`.
- A plot export holds it, so the export captures the value at that moment.

## Trigger props

A trigger prop acts once each time its value changes, instead of holding a setting. The first value does not act. A Button's value counts presses, so a trigger prop that reads a Button acts on each press:

- Force: `reset` restarts the layout from its initial positions, `reheat` sets alpha back to 1, `step` pauses and advances one step, and `release` releases every pinned node. `running` is a plain setting: `true` plays and `false` pauses, so it takes a Checkbox.
- Provider: `refresh` loads again with the same params.
- Playback: `reset`, as above.

```svelte
<Slider name="year" min={1970} max={2020} step={1} value={2000} />
<Button name="reload" label="Reload" />
<Provider url={"/data/{year}.csv"} format="csv"
  params={{ year: input('year') }} refresh={input('reload')}>…</Provider>
```

The Force example below uses a Checkbox and Buttons this way.

## Python

```python
with hm.Scene() as scene:
    with hm.Row(wrap=True, min_width=0):
        hm.Select(name="metric", options=["length", "width"])
        hm.Slider(name="threshold", min=0, max=10, value=5)
    with hm.Data(table):
        with hm.Filter(where=hm.col.weight > hm.input.threshold):
            with hm.Plot(title=hm.input.metric):
                hm.Points(x="$metric", y="height")
```

- The Scene is the input context; `hm.InputContext()` makes another.
- The scene checks every read when it is built: a misspelled name raises, naming the reader and the inputs in view.
- `input.value` is the viewer's latest value, sent back from the browser without a new revision. Assigning it sets the value in every view. `input.on_change(callback)` runs after each change with `event.value`.
- Pass `hm.input.bins`, not `slider.value`: a copied value does not follow the input.
- A prop that takes a plain value may be an expression of inputs: the browser evaluates it each
  time an input it reads changes (TODO 69.10). A Frame's `placement` turned by a Playback
  (`{"anchor": [8 * hm.cos(hm.input.day / 58), 0, 0], "size": [1, 1, 1]}`), a Force's
  `dimensions=hm.where(hm.input.view == hm.literal("3d"), 3, 2)` beside `hm.Plot(type=hm.input.view)`,
  a light's `intensity`, `camera_position`, the distances in `hm.effect("fog", near=..., far=...)`
  in the Plot's `effects` list, `glow`, `visible`. Channels and
  transform expressions stay expressions (their constants come from uniforms). A Svelte page
  computes such values in its own code, from inputs it binds (`bind:value`). The gallery's solar
  system, large force graph and Manhattan flyover are built this way.

See python/README.md, "Inputs".

## Migrating from TransformControls

`TransformControls` (Python `hm.TransformControls`), transform handles' `setControl`, and the `controls` and `actions` fields of `TransformStatus` are removed. Give each setting the viewer should change an input, and read the input in that setting:

```svelte
<!-- Before -->
<TransformControls for={histogram}
  options={[{key: 'bins', label: 'Bins', min: 2, max: 80, step: 1}]} />
<Bin bind:this={histogram} x="length" bins={24}>…</Bin>

<!-- After -->
<InputContext>
  <Slider name="bins" min={2} max={80} step={1} value={24} label="Bins" />
  <Bin x="length" bins={input('bins')}>…</Bin>
</InputContext>
```

```python
# Before
binning = hm.stats.Bin(x="length", bins=24)
hm.TransformControls(target=binning)

# After, inside a Scene (the input context)
hm.Slider(name="bins", min=2, max=80, step=1, value=24, label="Bins")
with hm.stats.Bin(x="length", bins=hm.input.bins):
    ...
```

The settings a panel showed, as props that read inputs:

| Transform | Props |
| --- | --- |
| Filter | `where`, with `input(...)` inside the expression. A Slider with `min={min('x')}` and `max={max('x')}` spans the column; a Select with multiple=true with `is_in` replaces op `"in"`. |
| Bin, Histogram | `bins`; Histogram `normalization` |
| Slice | `at`: a Playback from `min(field)` to `max(field)` |
| Grid | `resolution`, `method` |
| Density | `resolution`, `bandwidth` |
| Summary | `interval`, `confidence` |
| Sample | `size`, `seed` |
| Group | `by` |
| Sort | `by`, `order` |
| Normalize | `method` |
| Stack | `y`, `series` |
| Window | `size`, `reduce` |
| Dodge | `padding`, `columns` |
| Tree | `root`, `orientation` |
| Force | its parameters (`repulsion={input('repulsion')}`, a number in `forces`), `running`, and the trigger props |
| Provider | `refresh` |

- A transform repeated in Facet cells (`transform="histogram"`) needs nothing more: every cell reads the same input.
- The Force panel's Fit is the Plot's: its toolbar, or `plot.fit()`. The panel's node editor (a node index, coordinates, Pin and Unpin) has no replacement; drag nodes instead. The handle's status still reports `iteration`, `alpha` and `selection`, and `action(id)` still runs `run`, `pause`, `step`, `reset`, `reheat` and `release` from code.

## Interpolate, Slice, and force-directed graphs

`Grid`, `Slice`, `Force`, `Nodes`, and `Edges` are exported core components. They use the existing `Data` context and shared WebGPU device.

### Grid

```svelte
<Interpolate x="longitude" y="latitude"
  values={['temperature', 'region']} resolution={[128, 128]}>
  <Heatmap fill="temperature" />
</Interpolate>

<Interpolate x="time" values={['signal']} resolution={256}>
  <Line x="x" y="signal" />
</Interpolate>
```

`method="auto"` chooses linear interpolation in one dimension, bilinear interpolation for complete rectangular grids, and local inverse-distance interpolation for scattered two-dimensional data. Explicit choices are `linear`, `bilinear`, `idw`, and `nearest`.

IDW uses the eight nearest usable samples with inverse-square distance weights. Exact matches take precedence. Coincident numeric samples are combined by their finite mean; categorical values use the first usable source observation and nearest-neighbor lookup. Invalid coordinate pairs are excluded. No triangulation or convex-hull mask is applied.

One-dimensional coordinates include endpoints. Two-dimensional coordinates are cell centers, with cell-edge bounds retained in metadata. `bounds={{x: [min,max], y: [min,max]}}` overrides the defaults. Heatmaps consume the shape and bounds directly and reshape GPU columns internally. Explicit mark bounds take precedence. Numeric fields can drive relief; categorical fields use nearest-sampled colors and cannot define surface height.

Coordinate-dependent preparation is cached separately from values. Cached geometry consists of compact neighbor indices and weights, not a full query-by-observation matrix. Working query batches adapt to the device allocation limit.

### Slice

```svelte
<InputContext>
  <Data value={recordings}>
    <Playback name="time" min={min('time')} max={max('time')} rate={20} loop label="Time" />
    <Slice field="time" at={input('time')} by="entity"
      values={['x', 'y', 'temperature', 'region']}>
      <Plot><Points x="x" y="y" fill="temperature" /></Plot>
    </Slice>
  </Data>
</InputContext>
```

Each key must have unique recorded times. Numeric values interpolate between brackets; categorical values use the nearer endpoint, choosing the earlier record on ties. Entities without a bracket are omitted. Exact endpoints remain valid. Entity order follows first occurrence, and inspection metadata includes the original endpoint indices.

The Playback reads the range of `time` from the Data scope around it once, and again when the data changes, not while it plays. Without `step` it moves `at` every frame, and the Slice interpolates every frame; with `step`, `at` moves in steps and the marks animate between them. Numbers for `min` and `max` read nothing from the data. `at` may lie outside the recorded times; entities without a bracket are then omitted.

A Slice reads its row count back from the GPU only when it can have changed. When every entity has samples on both sides of `at` (for example, every entity sampled over the same span), a new `at` reads nothing back; the count is read again when `at` leaves that span or the Filter above it changes.

For recorded fields, use spatial coordinates as keys and compose with Grid:

```svelte
<Slice field="time" at={time} by={['x', 'y']}>
  <Interpolate x="x" y="y" values={['temperature']}>
    <Heatmap fill="temperature" />
  </Interpolate>
</Slice>
```

Slice retains grouping and unchanged key columns. When the spatial subset stays the same, Interpolate reuses its neighbor indices and interpolation weights during scrubbing.

### Force-directed graphs

```svelte
<InputContext>
  <div class="controls">
    <Checkbox name="run" label="Run" />
    <Button name="step" label="Step" />
    <Button name="reset" label="Reset" />
    <Button name="reheat" label="Reheat" />
    <Slider name="repulsion" min={0} max={200} step={1} value={30} label="Repulsion" />
  </div>
  <Data value={connections}>
    <GraphData><Force dimensions={2} seed={42}
      running={input('run')} step={input('step')} reset={input('reset')}
      reheat={input('reheat')} repulsion={input('repulsion')}>
      <Plot>
        <Edges><Segments start="start" end="end" /></Edges>
        <Nodes drag>
          <Points position="position" fill="degree" />
        </Nodes>
      </Plot>
    </Force></GraphData>
  </Data>
</InputContext>
```

```python
with hm.Scene():
    with hm.Row(wrap=True, min_width=0):
        hm.Checkbox(name="run", label="Run")
        hm.Button(name="reset", label="Reset")
    with hm.Data(connections):
        with hm.GraphData():
            with hm.Force(running=hm.input.run, reset=hm.input.reset):
                ...
```

Nodes expose `id`, `position`, coordinate columns, `degree`, and `pinned`. Edges retain input columns and add `start`, `end`, `sourceIndex`, and `targetIndex`. Dictionary-encoded identifiers remain on the GPU. Duplicate edges are retained; self-loops contribute degree but no spring force. `weight` names an optional nonnegative weight column.

Defaults:

| Setting | Value |
| --- | --- |
| Dimensions / seed | 2 / 42 |
| Link distance / spring strength | 30 / 0.1 |
| Repulsion / centering | 30 / 0.01 |
| Velocity decay | 0.4 |
| Cooling | alpha 1 toward `alphaTarget` 0 by `alphaDecay` (0.001 after 300 ticks); stops below `alphaMin` 0.001 |
| Running speed | one step per display frame, while a node is dragged too; `ticks` ticks per step (1), `warmup` ticks before the first (0) |

The layout starts paused. `running` plays (`true`) and pauses (`false`) it. `step`, `reset`, `reheat` and `release` are trigger props: each change of value pauses and advances one step, restarts from the initial positions, sets alpha back to 1, or releases every pinned node. Compatible force changes, such as a moved repulsion slider, preserve positions and pins and reheat without starting a paused simulation. Topology, dimension, or seed changes initialize a new paused layout. Virtualized simulations stop while offscreen and retain their state.

Dragging temporarily pins a node. Letting go restores its prior pin status; Escape restores the drag-start position as well. Two-dimensional dragging uses the XY plane; three-dimensional dragging uses a camera-facing plane. The node moves to the pointer's latest position once per display frame, and a running layout keeps running during the drag: each frame applies the move, ticks and draws once.

#### Forces

`forces` names the forces, as d3's simulation does with `simulation.force(name, force)`:

```svelte
<GraphData nodes={people} edges={connections}>
<Force forces={{
    x: null, y: null,                                       // no default centering
    byTeam: { type: "x", x: "teamX", strength: 0.15 },      // a node column per node
    spacing: { type: "collide", radius: multiply("size", 1.5) },
    hubs: { type: "radial", radius: 220, strength: "hubPull" },
  }}>…</Force>
</GraphData>
```

| Type | Parameters (d3's defaults) | Per node or edge |
| --- | --- | --- |
| `center` | `x`, `y`, `z` 0; `strength` 1. Moves the nodes so their mean is the center. | — |
| `manyBody` | `strength` -30 (negative repels); `theta` 0.9; `distanceMin` 1; `distanceMax` ∞ | `strength` |
| `link` | `distance` 30; `strength` 1 / the smaller endpoint degree (`"auto"`); `iterations` 1. Each end moves by its share (bias by degree). | `distance`, `strength` (edge columns) |
| `collide` | `radius` 1; `strength` 1; `iterations` 1 | `radius` |
| `x`, `y`, `z` | the target (`x`, `y`, `z`) 0; `strength` 0.1 | target, `strength` |
| `radial` | `radius` (required); center `x`, `y`, `z` 0; `strength` 0.1 | `radius`, `strength` |

- Without `forces`, `repulsion`, `linkDistance`, `springStrength`, `weight` and `centering` configure the default forces: `charge` (manyBody), `link`, and `x`, `y` (and `z`) toward 0. They keep Force's layouts from before these forces: the springs pull each end by the whole spring and read positions, repulsion softens at a squared distance of 0.001.
- An entry named like a default force updates its parameters (`charge: { strength: -80 }`); one with a `type` replaces it with d3's force of that type; `null` removes it; a new name adds a force. Several forces of one type may act together.
- A per-node parameter takes a number, a node column (from `nodes`, or `degree`) or an expression over node columns; a per-edge one, an edge column of the input or an expression. Columns resolve when the graph or the force changes, not per tick. A number may read an input (`strength: input('pull')`); a new value compiles nothing. A non-finite target or strength leaves that node out of that force; a non-finite collision radius counts as 0; link distances and strengths must be finite. Parameters cannot read `@` fields.
- `fixed={{ x: "fx", y: "fy" }}` holds coordinates from node columns (d3's `fx`, `fy`, `fz`; non-finite leaves the node free); `initial` sets starting coordinates the same way (non-finite keeps the seeded start). A dragged node is pinned on top of these.
- `alpha` (bindable), `alphaMin`, `alphaDecay` and `alphaTarget` are d3's: each tick moves alpha toward `alphaTarget` by `alphaDecay` and the forces act with the new alpha; the layout stops below `alphaMin`, never while `alphaTarget` holds it above. Dragging a node holds `alphaTarget` at 0.3 until release.

Forces are evaluated simultaneously from a shared tick snapshot, where d3 applies them one after another (and a link's or collision's pairs one at a time): a tick of one force alone matches d3's when no node takes part in two links or two overlaps, and whole layouts match d3's in character, not bit for bit. Each tick is one compiled GPU program. Up to 4,096 nodes, many-body and collision forces are exact. Above that they use a uniform spatial grid, rebuilt each tick over the nodes' bounds (with far outliers clamped to its border cells): the near field is exact over every node in the cells around each node's, and the far field, cell by cell, level by level, uses each cell's total charge at its centroid. `theta` picks the near field's size (0.7 or more: one cell on each side; less: two; 0: exact). On the test layouts, 95% of nodes' forces are within 1% of the exact sums; a tick takes about 11 ms at 8,192 nodes, 13 at 32,768 and 27 at 131,072 (40, 230 and 985 ms exact). Collision on the grid is exact. No CPU force-layout or plotting fallback is used.

The examples gallery includes filter and bin inputs, regular and scattered grids, categorical rasters, interpolated signals, moving entities, time-varying spatial fields, and draggable 2D/3D graphs, with copyable source.
