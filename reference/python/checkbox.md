# Checkbox

True or false, set by the viewer and read by name.

## Example

```python
import hmplot as hm

data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
with hm.Scene() as scene:
    hm.Checkbox(name="line")
    with hm.Plot(data=data, height=300, axes2d=True):
        hm.Points(x="x", y="y")
        hm.Line(x="x", y="y", visible=hm.input.line)
scene
```

## Options

Keywords are snake_case.

- `value` (`boolean`): The value before the viewer sets it. Default: `False`.
- `name` (`string`): The name readers use (input("name"), hm.input.name, or "$name" where a string names a column): an identifier, unique in its input context.
- `label` (`string`): The text shown beside the control. Default: the name.

## Usage

An input sends its value up to the nearest input context (an InputContext, a Python Scene, or a Template instance), and everything in that context reads it by name: `input("name")` in JavaScript, `hm.input.name` in Python, or the string `"$name"` where a string names a column. A read is replaced by the value before its reader sees it, so moving an input re-runs its readers once, and the change animates like any other data change. Inputs go beside Plots (in a Row or Column), not inside them.

> **SVG and PDF export**
>
> **Left out.** PNG, SVG and PDF exports leave inputs out, and show the plots at the inputs' current values. See [what is not exported as vector](/HMPlot/docs/export.md).

## Related examples

- [Inputs](/HMPlot/examples/inputs.md)
