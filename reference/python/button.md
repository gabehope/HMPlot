# Button

Counts the viewer's presses, so a prop that acts on each change of its value (reset=, refresh=) acts on each press; with set, a press writes other inputs (back to the top of a drill-down).

## Example

```python
import hmplot as hm

data = {"x": [1, 2, 3, 4, 5, 6, 7, 8], "y": [3, 1, 4, 1, 5, 9, 2, 6]}
# Each press adds one to the button's value, so the Sample draws with a new seed.
with hm.Scene() as scene:
    hm.Button(name="draw")
    with hm.Plot(data=data, height=300, axes2d=True):
        with hm.Sample(size=4, seed=hm.input.draw):
            hm.Points(x="x", y="y")
scene
```

## Options

Keywords are snake_case.

- `value` (`number`): The count before the first press. Default: `0`.
- `name` (`string`): The name readers use (input("name"), hm.input.name, or "$name" where a string names a column): an identifier, unique in its input context. Optional with set.
- `label` (`string`): The text shown beside the control (needed with set and no name). Default: the name.
- `set` (`object | array`): Inputs a press writes: input("root").reset() restores root's default, input("root").set(literal("all")) sets a constant; a list writes several.

## Usage

An input sends its value up to the nearest input context (an InputContext, a Python Scene, or a Template instance), and everything in that context reads it by name: `input("name")` in JavaScript, `hm.input.name` in Python, or the string `"$name"` where a string names a column. A read is replaced by the value before its reader sees it, so moving an input re-runs its readers once, and the change animates like any other data change. Inputs go beside Plots (in a Row or Column), not inside them.

A press can also write other inputs: `set={root.reset()}` puts `root` back to its default, and `set={root.set(literal("all"))}` gives it a value, where `const root = input("root", { default: "all" })` (Python `set=hm.input("root", default="all").reset()`). A list writes several. The input need not be a widget's: marks writing it on click (`select={root.set("id")}`) and Buttons together declare it, so a Button goes back to the top of a drill-down a click on a rectangle went into. A Button with `set` needs no `name` (then give it a `label`); with a name it also counts its presses.

> **SVG and PDF export**
>
> **Left out.** PNG, SVG and PDF exports leave inputs out, and show the plots at the inputs' current values. See [what is not exported as vector](/HMPlot/docs/export.md).

## Related examples

- [Inputs](/HMPlot/examples/inputs.md)
