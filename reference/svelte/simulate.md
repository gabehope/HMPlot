# Simulate

Per-row state, such as positions and velocities, stepped at a fixed interval for the marks inside it to draw.

## Example

```svelte
<script>
  import { Checkbox, InputContext, Data, row, Plot, Points, Simulate, add, cos, divide, multiply, prev, sin, input, subtract } from "hmplot";
  const radius = add(row(), 1), speed = subtract(3, row());
  // Each step, a row's angle moves on by its speed (radians per second) times the step.
  const angle = add(prev("angle"), multiply(speed, divide("@dt", 1000)));
</script>

<InputContext>
<Checkbox name="running" label="Run simulation" value={false} />
<Data rows={3}>
  <Simulate initial={{ angle: 0 }} update={{ angle }} running={input.running}>
    <Plot height={300} axes2d x={{ domain: [-4, 4] }} y={{ domain: [-4, 4] }}>
      <Points x={multiply(radius, cos("angle"))} y={multiply(radius, sin("angle"))} />
    </Plot>
  </Simulate>
</Data>
</InputContext>
```

## Options

- `name` (`string`): The simulation's name in its status.
- `initial` (`Record<string, string | number | expression>`): Each state column's first value: a column name, a number, or an expression over the data's columns. Rows that arrive later start from it too.
- `update` (`Record<string, string | number | expression>`): Each state column's next value, reading the previous step (prev("x"), Python hm.prev.x), the data's columns, the step ("@dt", Python hm.view.dt) and inputs. Every update reads the previous step, so their order does not matter.
- `step` (`number`): The simulated time one step advances; the state after n steps is the same at any frame rate. Default: `16` ms.
- `maxSteps` (`number`): The most steps one frame takes, so a slow device runs behind real time instead of stalling. Default: `8`.
- `stop` (`{tolerance, every, columns}`): Settles once no column in `columns` (default: the updated ones) changes by more than `tolerance` in a step, checked every `every` steps (default 30). New data, inputs, running or reset wake it.
- `running` (`boolean`): Plays or pauses the simulation; running={input("run")} lets a Checkbox do it. Under prefers-reduced-motion one that plays from the start waits until running changes, as a Playback's autoplay does. Default: `true`.
- `reset` (`number | string`): Each change of its value starts again from `initial` (a Button's count works: reset={input("kick")}).

## Usage

Simulate keeps state columns for the rows of the Data scope around it and steps them at a fixed interval of simulated time. `initial` gives each state column's first value and `update` its next one; an update reads the state after the previous step with `prev("x")` (Python `hm.prev.x`), the parent's columns with `col("x")`, the step in milliseconds as `"@dt"` (`hm.view.dt`), [inputs](slider) with `input("name")`, and the Simulate's own rows' `"@selected"`, `"@brushed"` and `"@hovered"`. Every update reads the previous step, so the order of the columns does not matter.

Steps are counted from elapsed time (at most `maxSteps` in one frame), so the motion is the same at 60 and 120 Hz. With `stop`, the simulation settles when nothing moves more than `tolerance` over `every` steps; a change of its data, inputs, selection or `reset` wakes it. `running={input("run")}` with a [Checkbox](checkbox) pauses it, and `reset={input("kick")}` with a [Button](button) starts again from `initial`. Under `prefers-reduced-motion` a Simulate that runs from the start stays at its first state (its exports show that state) until `running` changes; `setAnimationTime` still steps it. A new parent keeps each surviving row's state by key.

## Related examples

- [Springs](/HMPlot/examples/springs.md)
