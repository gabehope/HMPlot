# Animation

Three things move a mark: the implicit transition every animated mark gets when its
data changes, the two explicit operators `animate()` (the mark's presentation) and `tween()`
(the data itself), and `@time`, the clock, which mark channels, Filter conditions,
Calculate columns and transform parameters can read. Plots in one scope share a clock (see
[Clocks and scopes](#clocks-and-scopes)).

```svelte
<script>
  import { Plot, Points, Calculate, animate, tween, col, multiply, sin, divide } from 'hmplot';
</script>

<Plot animationDuration={300} animationEasing="cubic-in-out">
  <!-- implicit: every channel moves when the data changes -->
  <Points animation x="x" y="y" fill="value" />
  <!-- explicit: only y moves, in log space, with values for rows that come and go -->
  <Points x="x" y={animate("y", { duration: 500, enter: 0, exit: 0 })} />
  <!-- tween anywhere inside an expression, in the value's own units -->
  <Calculate columns={{ smoothed: multiply(tween("value", { duration: 800 }), 2) }}>
    <Points x="x" y="smoothed" />
  </Calculate>
  <!-- procedural: re-evaluated every frame -->
  <Points x={multiply("r", sin(divide("@time", 1000)))} y="y" />
</Plot>
```

```python
hm.Points(x="x", y=hm.animate("y", duration=500, enter=0, exit=0))
with hm.Calculate(smoothed=hm.tween("value", duration=800) * 2):
    hm.Points(x="x", y="smoothed")
hm.Points(x=hm.col.r * hm.sin(hm.view.time / 1000), y="y")
```

## The two operators

| | `animate(value, {duration, easing, enter, exit})` | `tween(value, {duration, easing})` |
| --- | --- | --- |
| What moves | The mark's pixels, and only that mark's | The value: every consumer (a Filter, a Bin, `mean()`, a mark) sees it move |
| Where | Outermost on a mark channel (or a Mapping channel) | Anywhere inside an expression, including Calculate columns |
| Space | The channel's scale: log axes interpolate geometrically, sqrt axes in root space, categorical channels step at t = 0.5 | The value's own units: `exp(tween("a"))` interpolates `a`, then applies `exp` |
| Enter / exit | Yes: values new rows start from and departing rows move to | No |
| State | On the consuming mark, one transition per channel (x, y and z are separate) | Where it is evaluated (Calculate, a layout input, or the mark channel), per row |
| Calculate | Not allowed as an output (error) | Allowed |

Either one turns off the implicit transition for that channel. `animate(tween(...))` is
composition, not a conflict: the outer transition owns the channel and the inner tween
publishes its current value.

Tree partition also consumes `tween()` in `nodeWidth` and `layerHeight` before computing geometry. Keep nodes present while their numeric weights/heights shrink to zero, then filter the zero-area output. Restoring their targets animates them back. This preserves hierarchy constraints at every frame, unlike independently animating the layout's output coordinates. Root IDs and edge topology are discrete and should not be interpolated.

### animate() or tween()

The two interpolate in different spaces, and on anything but a linear scale they move
differently:

- `animate()` interpolates **in scale space**: what the channel's scale draws. A position moves
  evenly across the screen in its axis's transform (on a log axis, by equal ratios: from 1 to
  1000 it passes 10 a third of the way and 100 two thirds of the way); a channel mapped through
  a continuous color, size or width scale moves evenly along that scale's normalization (a log
  color scale moves geometrically, a colormap's colors pass in order); a categorical channel
  steps halfway. The value in between is never computed, only drawn.
- `tween()` interpolates **in data space**: the value itself, in its own units, which then goes
  through the scale like any value. From 1 to 1000 on a log axis it is 500.5 halfway, so on
  screen it jumps up the first decades and creeps through the last; `exp(tween("a"))`
  interpolates `a`, then applies `exp`.

Use `animate()` when only the picture should move: a mark's points sliding to new positions or
colors, with `enter` and `exit` values for rows that come and go. Use `tween()` when the moving
value is data that something else reads: a Filter, a Bin, a reduction such as `mean()`, a
Calculate column, or another mark. On a linear scale and a plain number the two draw the same
motion.

The example `animate-tween-basic` (src/examples/animate-tween-basic/, in Svelte and Python)
moves one point of each from 1 to 1000 on a log axis, with gray dots at every tenth of the way:

```svelte
<Calculate columns={{ v: where(equal(up, 1), 1000, 1) }}>
  <Points x={1} y={animate("v", { duration: 2000 })} />   <!-- equal steps on the log axis -->
  <Points x={2} y={tween("v", { duration: 2000 })} />     <!-- equal steps of the value -->
</Calculate>
```

```python
with hm.Calculate(v=hm.where(up == 1, 1000, 1)):
    hm.Points(x=1, y=hm.animate("v", duration=2000))
    hm.Points(x=2, y=hm.tween("v", duration=2000))
```

`animation` on a mark (or a Plot, for its marks) is `animate()` on every channel: the implicit
transition interpolates each changed row in scale space too, timed by `animationDuration` and
`animationEasing`. Raster marks (Heatmap, Image, Surface textures) are the exception, below.

A tween is data that moves. `mean(tween("x"))` glides, a Filter on a tweened column lets rows
in as they cross its threshold, and a Bin re-bins rows as they move. `add(tween("a"), "b")`
moves `a` only; a change of `b` applies at once. While a tween moves, whatever reads it
re-runs on every frame (a transform, or a mark channel that reads it inside an operator),
then once more on the landed values, and stops. `whenAnimationsFinished()` waits for it.

The producer owns interpolation and publishes current values through ordinary column reads.
A direct mark expression owns its tween; a Calculate column shares its current value with
every consumer. Marks do not reinterpret an upstream column's targets or timing. Eligible
live point/rectangle updates reuse field buffers; filters, changing membership and automatic
bounds can require additional preparation.

A tween over a value that moves (`tween(view.time)`, `tween(interval(...))`, another moving
tween) is allowed: every change retargets from the current value, so the result trails its
input by about the duration (a smoothed cursor), and `tween(interval(view.time, 1000))`
glides from step to step.

Tween state follows each observation: through a Sort, a Filter or a Sample by the source row
it came from (a row a Filter hides keeps moving; a row a Sample drops and brings back resumes
where its motion is), and across a new version of the table by key (`key=`), else by
position, with a one-time `tween.positional` warning when the row count changed. Over an
aggregate's rows (a Calculate after a Bin or a Group) there is no source row to follow, so
rows match by position.


## Animation groups

Use `animationGroup="country"` (Python `animation_group="country"`) on Data, Plot or
Frame when different observations should occupy the same animated row. For a country/year
table, keep `key=["country", "year"]` for observation identity, set the animation group to
`"country"`, then Filter to one year before animated marks or Calculate's `tween()`.
The countries move between years even when their source rows or order change.

The nearest group setting applies to descendants, including expression tween producers.
A Frame can override one branch without changing its siblings; nested Data inherits unless
it supplies its own setting. Multiple column names form a composite group. Explicit `null`
(Python `None`) restores unique Data-key matching, then positional fallback. Changing the
column scheme resets motion history instead of connecting unrelated groups.

Repeated group values in the full table are allowed. Each snapshot actually consumed by a
row tween must have one row per group after filtering or transforming; duplicates, missing
values and missing group columns report an error. Aggregate first when several rows should
be one animated entity. Entering groups start at their target unless a mark declares an
enter effect; departing groups use the mark's exit behavior. Selection, hover and connections
continue using observation identity and are unaffected by animation groups.

A tween needs one clock. A Calculate outside every Plot reads the clock of the Plots under it
when they share one (one Plot, or Plots in one scope). Sharing live data across independent
clocks gives an error: put those Plots under one Scene or InputContext. Before a consumer
adopts its clock, the producer publishes initial values without advancing. Costs:
[Performance](PERFORMANCE.md#animation-and-settling).

`animate()` on a constant (`opacity={animate(0.3, {duration: 1000})}`) animates the
uniform with its own duration and easing, and `animate()` on `x` leaves `y` and `z` to the
mark's own animation setting. Unchanged targets retain their original schedule, including
when unrelated live geometry updates. `animate()` on anything that is not a channel (a
transform's parameter, `enterEffect`, a Data prop) is an error.

Durations are milliseconds, defaulting to the mark's `animationDuration` (300) and
`animationEasing` (cubic-in-out). Easings: `linear`, `quad-in`, `quad-out`,
`quad-in-out`, `cubic-in`, `cubic-out`, `cubic-in-out`, `sine-in-out`. Explicit
operators run whether or not the mark's `animation` switch is on; `prefers-reduced-motion`
freezes everything.

## Per-row transitions

Every row keeps its own from / to / start, in GPU buffers owned by the transition. A data
update compares each row's new target with its current one: rows whose value changed
retarget from their **current interpolated value** and restart the duration; rows whose
value did not change do not move. Nothing is read back; the transition writes into the
channel's live buffer, so material bindings never change.

Row identity across updates comes from the keyed lifecycle: with `key=` on the table (or
`identity`), rows are matched by key, entering rows appear and departing rows are retained
until the mark's own transitions end. A re-ordered update (a sort, a filter that lets rows
in or out) carries each row's transition state to its new index, so every row keeps moving
from where it is instead of rows sliding between each other's positions. That also holds
for derived views: a mark reading a Sort, Filter or Sample of a table matches rows by the
source row they came from (for animated marks only; it costs one small readback per
update). An update that arrives while the previous one is still animating continues from
what is on screen: moving rows keep going from their current values and rows that were
leaving keep leaving. Without keys, rows of the table itself match by position; a tweened
channel that is aligned by position while the row count changes logs a one-time
`tween.positional` warning.

Each animated field keeps four row-sized state buffers (from, to, start, and the incoming
values) for as long as the mark exists; they grow with the row count and are reused across
updates. A field too large for one storage buffer on the device updates without animation
and logs one `animation.limit` warning.

Positional channels interpolate in their own axis's scale. In nested frames that is the
mark's innermost frame; an outer nonlinear frame warps the resulting motion like it warps
everything else inside it. Channels bound to a continuous color, size or width scale
interpolate in that scale's normalization (a log color scale moves geometrically), and
datetime positions interpolate linearly in milliseconds.

The implicit transition (`animation` on) now uses the same scale-space path for instanced
marks, so an animated point on a log axis passes through the geometric midpoint. Raster
marks (Heatmap, Image, Surface textures) keep the raw-space blend: interpolating per texel
in scale space is not worth its cost, and they have no row identity to key.

## enter and exit values (animate()'s options)

```python
hm.Points(x="x", y=hm.animate("y", enter=0, exit=10))
```

On a keyed update, a row whose key is new starts at `enter` and moves to its value; a row
whose key disappeared moves from its value to `exit` and is removed when the transition
ends. `enter`/`exit` are in the channel's units (`x`/`y`/`z` take one number each; a color
channel takes a color). They are values, not effects: the mark's `enterEffect="fade"` and
`exitEffect="fade"` props (Python `enter_effect`, `exit_effect`) fade the row's opacity as
it arrives or leaves, whatever its channels do. The two combine, and retirement waits for the
longer one.

An exit begins when the mark observes a departing row. If a Filter retains a tree node until
its animated area reaches zero, the node's mark exit starts after that layout animation.
The two durations are sequential. Drive opacity from the desired visibility while keeping
the row present if fading should overlap the collapse. A frozen-clock replay must visit the
layout endpoint before advancing through the resulting mark retirement.

A filtered-out row no longer receives layout updates. Its exit animation retains its last
coordinates, which still pass through the current frame scales. In a zooming polar plot,
changing the angular extent can move those retained coordinates around the circle. When a
fading label should follow a collapsing sector, keep its row in the layout table and animate
an opacity expression for visibility. The sunburst example uses this pattern in both languages.

Numeric column names and expressions also work as endpoints. For Tree nodes, `x=hm.animate(hm.col.x, enter=hm.col.parentX, exit=hm.col.parentX)` grows from the parent and returns to it on removal. Enter expressions read each arriving row in the new data; exit expressions read each departing row in the previous data. Nonfinite endpoint components retain their channel value, so a root's missing parent coordinates are safe. Interrupted transitions keep endpoints aligned with their row keys.

### How a keyed update is drawn (for contributors)

A keyed update is published as three frames (namedMark.svelte `publish`, utils/keyedLifecycle.js):

1. **Source.** The union of the rows on screen and the new rows. It is built against what is
   drawn: while an earlier update is still animating, its union, departing rows included;
   otherwise the previous frame. It is written with animation off, and the mark is marked as
   staging (`markAnimation(mark).staging`): a field written in that frame carries each row's
   transition state (from, to, start) to the row's new index on the GPU (RowTransition's
   gather) instead of starting a transition. While a mark is staging, the clock leaves its
   tracks alone, so rows in flight hold where they are rather than finishing (the
   "second keyed update mid-flight" race, fixed at d4b554d).
2. **Target.** Once the source frame's uploads are done: the new values for the union, with
   departing rows at their `exit` values or fading, and animation on. Each row retargets from
   its current value. `whenSettled()`, `setAnimationTime` and exports wait for this frame to be
   written, not for the transition to end.
3. **Final.** When the mark's own transitions have finished (at most twice the duration plus
   100 ms of clock time, so a frozen clock keeps departing rows in place): only the new rows.
   It is a truncating re-order (`finalStaging`), so rows still moving keep moving.

A newer update supersedes the sequence at any step (namedMark's `lifecycleRevision`): its
source frame is built from the older one's union. A mark's animation state (whether it has
drawn, whether this update snaps, the staging frame, the transition specs) is one record,
utils/markAnimation.js (TODO 32.11).

## @time

`@time` is the clock in milliseconds, shared by the Plots of a scope (see
[Clocks and scopes](#clocks-and-scopes)). It starts at 0 when the scope starts and advances by
the frame time while anything in the scope animates; it does not advance while the scope is
idle, while an export or `holdAnimations()` pauses it, or while it is frozen. Pending layout
preparation and field uploads defer drawing without discarding elapsed time: slow transitions
draw fewer intermediate frames and catch up on the next completed frame. Every transition is
timed by the same clock, so a frozen clock holds transitions and `@time` channels alike.
Playback and Simulate retain a 250 ms cap on each automatic ticker step; transition progress
and `@time` use the full elapsed time. Simulate also retains its own `maxSteps` budget.

The clock advances once per displayed frame, so everything that reads `@time` in a scope (mark
channels and transforms alike, in all its Plots) sees one time per frame.

A channel whose expression reads `@time` is *procedural*: it is re-evaluated every drawn
frame and written straight into the field, with no transition of its own (`animate()`
around a `@time` expression is an error; a `tween()` around one trails it, see above). The
data part of a procedural channel therefore moves at once when the data changes (by design);
`x` or `y` of the same mark without `@time` still animate. When a procedural mark should not jump on
updates, give it data that does not change: the animation-engine example keeps its orbiting
satellites on a `Data` of their own, fixed slots beside the keyed rows, so the clock is their
only motion:

```svelte
<Plot data={rows} key="id">
  <Points x="x" y={animate("y", { duration: 900 })} />
  <Data value={slots}>   <!-- fixed x, y and angle per satellite -->
    <Points x={add("x", multiply(0.35, cos(add(divide("@time", 700), "angle"))))} y="y" />
  </Data>
</Plot>
```

Procedural marks keep the clock running for as long as they exist, but they never block
settlement: `whenSettled()` and `whenAnimationsFinished()`
resolve while an orbit keeps turning. Under `prefers-reduced-motion` the clock stands still,
and `setAnimationTime` still moves it. So does a Simulate that runs from the start: it waits at
its first state until its `running` changes (a reader pressing play), as a Playback's autoplay
does.

A reduction inside a procedural channel, such as `mean("r")` in
`add(mean("r"), multiply(std("r"), sin(divide("@time", 1000))))`, depends on the data, not
the clock, so it is computed once per data revision and reused on every frame; only a
reduction that itself reads `@time` or an interaction column (`mean(where("@brushed", ...))`)
is recomputed each frame.

### @time in transforms

Filter conditions, Calculate columns and expression-valued transform parameters (`bins`,
`bandwidth`, ...) read `@time` too:

```svelte
<Filter where={less("t", "@time")}>…</Filter>  <!-- rows appear as the clock passes them -->
<Calculate columns={{ age: subtract("@time", "t") }}>…</Calculate>
```

```python
with hm.Filter(where=hm.col.t < hm.view.time):
    ...
```

A transform re-runs only when a value it reads changes. The part of an expression that reads
the clock and no data (`@time`, `floor(@time / 1000)`, `interval(@time, 500) - 250`) is
computed on the host each frame and compared with the last run's: a frozen clock re-runs
nothing, and `where={less("t", floor(divide("@time", 1000)))}` re-runs once a second. A run
still going when the next frame comes finishes, then the newest time runs. `setAnimationTime`
waits for the re-run, so exports and `export_mp4` frames show the transform at that time.

A transform inside a Plot reads that Plot's clock. One outside every Plot (`Data > Calculate >
Plot`) reads the clock of the Plots under it, which share one in a scope; over Plots with
different clocks (two plain Svelte Plots) reading `@time` is an error: put them in one
InputContext, or put the transform inside one Plot, or one transform in each.

The marks under a transform that reads `@time` outside an interval get new data every frame,
so they do not run their implicit transition (it would restart every frame and the mark would
chase its data); explicit `animate()` and `tween()` channels and `enterEffect`/`exitEffect` still run. A
data column named `@time` is an error: expressions read the view's.

Each re-run costs what the transform costs (a Filter reads back its kept count); with explicit
axis and color domains, a point mark under a Filter on `@time` swaps its row mask instead of
preparing again. See [Performance](PERFORMANCE.md#transforms).

### interval()

`interval(expr, ms)` reads the view state inside `expr` as of the last step of `ms`
milliseconds of the clock: `@time` becomes `floor(time / ms) * ms`. So
`interval(view.time, 500)` changes twice a second, every interval of one period steps on
the same frame, and `setAnimationTime` reproduces it. Data columns inside `expr` still apply
at once. A step is an ordinary data change: a mark channel on `interval(...)` animates each
step with its transition (and `animate()` around it is allowed), and a transform on it
re-runs once per step. `floor(x)` and `round(x)` (halves to even, as numpy) snap by value
instead, and the channels they feed stay procedural.

```python
hm.Points(x="t", y=hm.interval(hm.view.time, 1000) / 1000)   # steps once a second
with hm.Filter(where=hm.col.t < hm.interval(hm.view.time, 500)):
    ...
```

The clock reaches the GPU as a value in a buffer, not as a constant in the shader, so a
running `@time` channel or transform reuses the same compiled kernels frame after frame: a
channel costs one evaluation and one upload per drawn frame, and no shader compilation.

### Controlling the clock

`plot.setAnimationTime(ms)` sets the clock of the Plot's scope and freezes it there;
`setAnimationTime(null)` resumes it. Exports capture the frozen moment, which is how videos are
made:

```python
await plot.set_time(1500)        # live widget: freeze at 1.5 s, then export_png(...)
await plot.set_time(None)        # resume

await plot.export_mp4("orbit.mp4", duration=4000, fps=30)   # live widget
hm.export_mp4(plot, "orbit.mp4", duration=4000, fps=30)     # headless, no notebook needed
```

`export_mp4` steps the clock one frame at a time (`start`, `start + 1000/fps`, ...),
exports a PNG per frame, and stitches them with `ffmpeg` (which must be on `PATH`) into an
H.264 MP4, then puts the clock back where it was (also when a frame fails). `scale` is the
PNG export scale. An `ExportSession` does the same with `session.mp4(...)` and exposes
`session.set_time(...)` for single frames.

Data transitions are on the same clock, so a video records them too: a transition started
at clock time T is at its beginning for any frame before T. To record an update, trigger it
and start the video at `await plot.get_time()`. Moving the clock back and forth replays a
running transition; one that has finished stays finished.

### Clocks and scopes

One clock times everything in its scope: `@time`, transitions, Playbacks and Simulates. The
scopes, with no component to write:

- a Python `Scene`: every Plot in it;
- in Svelte, the outermost `InputContext` (nested InputContexts and Templates use the one
  above them);
- a standalone `Facet` and a `Simulate`, when there is no scope above them: a Facet's cells, and
  the Plots under a Simulate, stay in step;
- else each Plot has its own clock, as plain Svelte Plots do. Two Plots with no inputs share a
  clock inside one `InputContext`.

What sharing means:

- Every Plot in a scope reads the same `@time`. A Plot that mounts into a running scope (a Facet
  cell scrolled into view) starts at the scope's time, so an intro timed from 0 has already
  played.
- `setAnimationTime` on one Plot sets and freezes the whole scope, and an export of one Plot
  holds the whole scope while it draws. `whenSettled()` still waits for that Plot only.
- A playing `Playback` and a running `Simulate` move with the clock: an export or a frozen clock
  holds them, and each step of `setAnimationTime` moves them by that step, so `export_mp4`
  records them playing. A step back moves only the clock. On a frame where a Playback moves and
  `@time` moves, a transform reading both runs once.

## Simulate: state stepped over time

`@time` channels are functions of time: the same time always draws the same thing. A
`Simulate` keeps state instead: per-row columns that each step computes from the step before,
for springs, particles, flocking, or trails that decay. It sits in a Data scope, like a
transform, and its children see the parent's columns and the state columns:

```svelte
<InputContext>
  <Slider name="stiffness" min={5} max={120} value={40} />
  <Checkbox name="run" value={true} label="Run" />
  <Button name="kick" label="Kick" />
  <Data value={ring} key="id">
    <Simulate step={16} initial={{ x: "x0", v: 0 }}
      update={{
        v: add(prev("v"), multiply(multiply(input("stiffness"), subtract("rx", prev("x"))), divide("@dt", 1000))),
        x: add(prev("x"), multiply(prev("v"), divide("@dt", 1000))),
      }}
      running={input("run")} reset={input("kick")} stop={{ tolerance: 0.0005 }}>
      <Plot><Points x="x" y="y" select /></Plot>
    </Simulate>
  </Data>
</InputContext>
```

```python
with hm.Simulate(step=16, initial={"x": "x0", "v": 0},
                 update={"v": hm.prev.v + hm.input.stiffness * (hm.col.rx - hm.prev.x) * hm.view.dt / 1000,
                         "x": hm.prev.x + hm.prev.v * hm.view.dt / 1000},
                 running=hm.input.run, reset=hm.input.kick, stop={"tolerance": 0.0005}) as springs:
    ...
springs.step_count, springs.running, springs.settled   # follow the browser
```

- `initial` gives each state column's first value (a column name, a number, or an
  expression over the parent's rows); `update` gives its next value. An update reads the
  state after the previous step with `prev("x")` (`hm.prev.x`), the parent's columns now with
  `col("x")`, the step in milliseconds as `"@dt"` (`hm.view.dt`), the simulated time as `"@time"`,
  inputs, and the Simulate's own rows' `@selected`, `@brushed` and `@hovered`. Every update
  reads the previous step, never another column's new value, so their order does not matter:
  semi-implicit Euler repeats the velocity's update inside the position's.
- Steps come from elapsed time: every `step` milliseconds of the Simulate's clock is one step,
  at most `maxSteps` (default 8) in one frame, and one publish per frame. The motion is the same
  at 60 and 120 Hz; a slow frame runs behind real time instead of catching up later.
- `stop={ tolerance, every = 30, columns }` settles the simulation when no value of `columns`
  (default: the updated ones) moved more than `tolerance` over `every` steps (one read-back per
  check). A settled simulation takes no steps until its data, an input it reads, its rows'
  selection or brush, `running` or `reset` changes.
- `running` plays and pauses; each change of `reset`'s value (a Button's count) starts again
  from `initial`. A new parent keeps each surviving row's state by key (Data `key=`), and new
  rows start from `initial`.
- Its rows are a root for interaction, as a `Data` with `data=` is: selecting a point under it
  selects the Simulate's row, which is how an update reads `@selected`. Selections keep to
  their rows by key, through a Filter above the Simulate too.
- Give its Plots fixed domains (`x={{ domain: [-2, 2] }}`): automatic domains follow the
  state, which reads its extent back every frame while it runs. A step compiles nothing, and
  with fixed domains the stop checks are its only read-backs.
- The handle's `seek(ms)` computes the state at `ms` of simulated time from the start (the
  same state whenever asked), `getSteps()` counts the steps, and `subscribe` reports `steps`,
  `running` and `settled`. It steps by the clock of its scope (its own, when it has none above
  it; see [Clocks and scopes](#clocks-and-scopes)): an export or a frozen clock holds it, and
  each step of `setAnimationTime` moves it by the steps due, so `export_mp4` records it running
  from where it is (seek it first to start from a known state).

## Connectors follow their endpoints

A Line, Segments, Arrows3D, or Arrows with `connections` never animates itself: its
positions have no transition, no enter/exit values, and no lifecycle fade of their own. The
Plot clock re-gathers it from its endpoints' live rows right after each blend step, so it is
always drawn at the endpoints' current time; endpoints with a `@time` channel are followed
after every procedural step, and frame range sliders are followed without re-preparing. See
[Connections](CONNECTIONS.md#animation).

## Settlement and exports

`await plot.whenSettled()` waits for preparation and GPU work, not for a duration: it
resolves once the changes made before the call are drawn, including the work they start
downstream (a transform's output reaching its marks), and it does not wait for changes made
after the call. So it resolves while data changes every frame (a Slice at an animated `at`,
streaming updates), and a plot fed that way appears as soon as its first data is drawn. A
transform whose input changes while it runs finishes that run and draws it, then runs the
newest input, so a continuously changing input updates at the rate the transform completes.
`await plot.whenAnimationsFinished()` also waits for finite transitions (implicit,
animate, tween, including tweens moving through transforms) to end; continually retargeted transitions remain active until updates
stop, and while the clock is frozen it resolves at once (nothing moves until it resumes).
Retirement of departing rows is clock-driven and per mark; a frozen or held clock keeps
departing rows on screen. GPU row transitions use conservative CPU completion deadlines:
republishing unchanged targets can extend pending bookkeeping without restarting the visible
transition. Total settlement therefore includes preparation, any later departures and that
completion horizon; it is not a measurement of one channel's interpolation duration.
PNG/SVG/PDF exports hold the clock, so every transition and `@time` channel is captured at
the same moment and a frozen clock exports deterministically. `plot.beginUpdate()`
defers animation application and rendering while preparing a group of changes, preserving
elapsed time so the next consistent frame catches up. Use `holdAnimations()` for an explicit
pause that excludes elapsed time.


## Tree layout animation

Tree offers compact CPU `tidy`, GPU `tidy-approx` (horizontal intervals per subtree),
GPU `partition`, and CPU `cluster`. GPU modes cache topology by node IDs/order, source/target
columns, root and direction. Width/height changes reuse structural buffers. Partition uses
leaf prefix sums; root-path accumulation uses logarithmic pointer-jumping passes. Approximate
and fixed-width subtree sizing uses ordered depth passes, so very deep trees cost more.
CPU tidy can consume moving inputs too, but reads numeric values and lays out on the host.

`edgeLength` (Python `edge_length`) reads a nonnegative edge-table column or expression.
Tidy modes accumulate lengths along root paths, multiplied by `depthSpacing`; siblings can
have unequal lengths. Partition uses per-node `layerHeight`; cluster uses merge heights.

Put visibility on Tree's `where`, not a Filter after Nodes, when branches should reflow.
It reads the node table and disconnects descendants of hidden nodes; the root remains present.
Tree's `enter` and `exit` specify nonnegative numeric `nodeWidth`, `layerHeight`, and
`edgeLength` contributions (omitted endpoints are zero). `animationDuration` and
`animationEasing` control these lifecycle transitions. Initial mounting rests at the target.
In Python, nested keys are `node_width`, `layer_height`, and `edge_length`.

Departing nodes and edges remain until their contributions land; new rows start at enter
values. Interrupted membership transitions continue from their current contribution.
`presence` on Nodes and Edges ranges from zero to one, so `opacity="presence"` fades marks
with their branch. Incoming `tween()` expressions remain ordinary numeric inputs with their
own timing; they do not declare layout entry/exit. Draw moving geometry directly without
another mark animation or bounds animation. Cluster does not support layout lifecycle.
Changing the root or reparenting a surviving node switches topology discretely; it does not
retain both parents. Use a fixed root with tweened weights/heights for continuous zoom, as in
the sunburst example. Structural changes may compile a new GPU plan.

Source validation and membership updates may read data once; GPU numeric layout does not
read coordinates back each frame. Rendering, bounds, picking and export retain their existing
readbacks. See [Expandable tree](/examples/expandable-tree) and [Sunburst](/examples/sunburst).
