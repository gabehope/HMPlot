# Checkbox

True or false, set by the viewer and read by name.

## Example

```svelte
<script>
  import { Checkbox, InputContext, Line, Plot, Points, input } from "hmplot";
  const data = { x: [1, 2, 3, 4], y: [3, 1, 4, 2] };
</script>

<InputContext>
  <Checkbox name="line" />
  <Plot {data} height={300} axes2d>
    <Points x="x" y="y" />
    <Line x="x" y="y" visible={input("line")} />
  </Plot>
</InputContext>
```

## Options

- `value` (`boolean`): The value before the viewer sets it. Default: `false`.
- `name` (`string`): The name readers use (input("name"), hm.input.name, or "$name" where a string names a column): an identifier, unique in its input context.
- `label` (`string`): The text shown beside the control. Default: the name.

## Usage

An input sends its value up to the nearest input context (an InputContext, a Python Scene, or a Template instance), and everything in that context reads it by name: `input("name")` in JavaScript, `hm.input.name` in Python, or the string `"$name"` where a string names a column. A read is replaced by the value before its reader sees it, so moving an input re-runs its readers once, and the change animates like any other data change. Inputs go beside Plots (in a Row or Column), not inside them.

> **SVG and PDF export**
>
> **Left out.** PNG, SVG and PDF exports leave inputs out, and show the plots at the inputs' current values. See [what is not exported as vector](/HMPlot/docs/export.md).

## Related examples

- [Inputs](/HMPlot/examples/inputs.md)
