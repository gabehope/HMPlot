# Title

A heading or note beside plots, drawn as text that stays text in SVG and PDF exports.

## Example

```python
import hmplot as hm

data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
with hm.Scene() as scene:
    hm.Title("Four measurements")
    with hm.Plot(data=data, height=300, axes2d=True):
        hm.Points(x="x", y="y")
scene
```

## Options

Keywords are snake_case.

- `text` (`string | (string | expression | {value, format})[]`): The text: "\n" breaks a line and {$name} shows an input's value. Python takes it positionally: hm.Title("..."). A readout shows live values: a list of parts, strings and reductions over the Data around the Title (count(where="@brushed"), mean("fare")), or {value, format} with a d3-format string; in Python an f-string does it, hm.Title(f"Selected: {hm.count(where='@brushed'):,}"). A live value follows the data and its selections, written as tooltips write numbers, "—" when no row has one.
- `size` (`"title" | "subtitle" | "caption" | number`): "title", "subtitle" or "caption", sizes that follow the theme's text size, or pixels. Default: `"title"`.
- `weight` (`number | "normal" | "bold"`): The font weight, as in CSS. Default: 600 for a title, 400 otherwise.
- `align` (`"left" | "right" | "center"`): Where the lines sit across the block. Default: `"left"`.
- `color` (`color`): The text color. Default: the theme's text color.
- `font` (`string`): The font, a CSS font-family. Default: the theme's.
- `wrap` (`boolean`): Wrap words at the block's width; false keeps each line whole. Default: `True`.
- `name` (`string`): A name for the block (its element's data-name attribute).

## Usage

Title is plain text for a layout: a figure's heading, a note between plots, a caption under a grid. Its lines break at `"\n"` and wrap at the block's width in the loaded font, and they are drawn as SVG text, so a scene's SVG and PDF exports carry the same lines as vector, searchable text (in the embedded default font). `size` picks the theme's title, subtitle or caption size, or takes pixels. `{$name}` shows an input's value as the input shows it and follows it: `"Temperature anomaly, {$year}"`.

A Title inside a Data is also a **readout** (a KPI, a live count): its text can hold live values, reductions over that data that follow it and its selections, written as tooltips write numbers or in a d3 format, `"—"` when no row has one. In Python an f-string does it; in Svelte `text` is a list of parts:

```python
with hm.Data(trips):
    hm.Title(f"Selected trips: {hm.count(where='@brushed'):,} · mean fare {hm.mean('fare', where='@brushed'):$.2f}")
    with hm.Plot():
        hm.Points(x="distance", y="fare", brush=True)
```

```svelte
<Title text={["Selected trips: ", count({ where: "@brushed" }), " · mean fare ", { value: mean("fare", { where: "@brushed" }), format: "$.2f" }]} />
```

An expression in an f-string is only a live value in Title's text; elsewhere it is an error. For a number beside the data inside a plot, use [Text](text) of a Group's column.

Use Title for publications; Markdown (Python layouts) is for dashboards and exports as an image. A plot's own heading is its `title`, `subtitle` and `caption`.

## Related examples

- [Titles, bands and callouts](/HMPlot/examples/annotations.md)
