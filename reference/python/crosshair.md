# charts.Crosshair

Rules that follow the pointer across the frame, with a readout of its x and y.

## Example

```python
import hmplot as hm

data = {"x": [1, 2, 3, 4, 5, 6], "y": [3, 4, 2, 5, 6, 5]}
with hm.Plot(data=data, height=300, axes2d=True) as plot:
    hm.Line(x="x", y="y")
    hm.charts.Crosshair()
plot
```

## Options

Keywords are snake_case.

- `axes` (`"x" | "y" | "xy"`): Which rules to draw: a vertical one ("x"), a horizontal one ("y"), or both. Default: `"xy"`.
- `readout` (`boolean`): Show the pointer's value on each axis, finer than the ticks, where readout_position puts it. Default: `True`.
- `readout_position` (`"edges" | "pointer"`): Where the readouts sit: just inside the frame's bottom (x) and left (y) edges, or as one label beside the pointer, for a polar frame or a map, whose rules have no edge to pin to. Default: `"edges"`.
- `color` (`color`): The rules' color. Default: `"#40505d"`.
- `width` (`number`): The rules' width. Default: `1` px.
- `dash` (`boolean | number | [number, number]`): Dash the rules: true (4 px dashes and gaps), a dash length (gaps as long), or [dash, gap], measured along the drawn rules. In px.
- `text_color` (`color`): The readouts' text color. Default: `"#40505d"`.
- `name` (`string`): The rules' name in the settings pane.

## Usage

Place a Crosshair in a Plot (or in a Frame) and it follows the pointer there: a rule each way and a readout of each value. Readouts are finer than the ticks: a time with its time of day, a number to about a thousandth of the visible span, angles and map coordinates in degrees. By default they sit just inside the frame's bottom and left edges; `readoutPosition="pointer"` puts one label beside the pointer that holds both, for a polar frame or a map, whose rules have no edge to pin to.

Nothing draws while the pointer is off the frame. A still pointer costs nothing: the rules and readouts update once per animation frame with a move. `axes="x"` keeps only the vertical rule; `readout={false}` drops the text.

Crosshair is a built-in template, built from transforms and simpler marks: import it from `hmplot/charts`.

> **SVG and PDF export**
>
> **Left out.** PNG, SVG and PDF exports leave the crosshair out: it draws only where the pointer is. See [what is not exported as vector](/HMPlot/docs/export.md).

## Related examples

- [Crosshair and rules](/HMPlot/examples/crosshair.md)
