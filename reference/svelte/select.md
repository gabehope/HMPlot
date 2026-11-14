# Select

One or several options, chosen by the viewer and read by name; a Select of column names picks what a channel plots.

## Example

```svelte
<script>
  import { InputContext, Plot, Points, Select } from "hmplot";
  const data = { a: [1, 2, 3, 4], b: [4, 2, 3, 1], y: [3, 1, 4, 2] };
</script>

<!-- "$column" reads the input where a string names a column: x plots the chosen one. -->
<InputContext>
  <Select name="column" options={["a", "b"]} />
  <Plot {data} height={300} axes2d>
    <Points x="$column" y="y" />
  </Plot>
</InputContext>
```

## Options

- `options` (`(string | number | boolean | Date)[] | {label: value} | expression`): The choices: a list of values, labels and their values, or categories("field") or columnNames() read from the data around it.
- `multiple` (`boolean`): Allow several choices; the value is a list usable with is_in(column, input("name")). Default: `false`.
- `value` (`string | number | boolean | Date | (string | number | boolean | Date)[]`): The chosen value, or list of values when multiple is true. Default: the first option, or an empty list when multiple.
- `name` (`string`): The name readers use (input("name"), hm.input.name, or "$name" where a string names a column): an identifier, unique in its input context.
- `label` (`string`): The text shown beside the control. Default: the name.

## Usage

Set `multiple={true}` in Svelte or `multiple=True` in Python to choose several options. The
value is then a list (empty by default), and `is_in(col("species"), input("chosen"))` uses it
to filter rows. When data-derived options change, choices that are no longer present are
removed. This replaces MultiSelect.

An input sends its value up to the nearest input context (an InputContext, a Python Scene, or a Template instance), and everything in that context reads it by name: `input("name")` in JavaScript, `hm.input.name` in Python, or the string `"$name"` where a string names a column. A read is replaced by the value before its reader sees it, so moving an input re-runs its readers once, and the change animates like any other data change. Inputs go beside Plots (in a Row or Column), not inside them.

> **SVG and PDF export**
>
> **Left out.** PNG, SVG and PDF exports leave inputs out, and show the plots at the inputs' current values. See [what is not exported as vector](/HMPlot/docs/export.md).

## Related examples

- [Inputs](/HMPlot/examples/inputs.md)
