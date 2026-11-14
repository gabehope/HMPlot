# Slider

A number, date or two-endpoint interval the viewer drags between min and max, read by name.

## Example

```svelte
<script>
  import { InputContext, Plot, Rect, Slider, input } from "hmplot";
import { Bin } from "hmplot/stats";
  const data = { x: [1, 2, 2, 3, 3, 3, 4, 4, 5, 7] };
</script>

<InputContext>
  <Slider name="bins" min={1} max={10} step={1} value={4} />
  <Plot {data} height={300} axes2d>
    <Bin x="x" bins={input("bins")}>
      <Rect x0="x0" x1="x1" y0={0} y1="count" />
    </Bin>
  </Plot>
</InputContext>
```

## Options

- `min` (`number | Date | expression`): The low end of the range: a number, a Date, or an expression such as min("x") over the data around the slider. Default: `0`.
- `max` (`number | Date | expression`): The high end of the range: a number, a Date, or an expression such as max("x"). Default: `1`.
- `step` (`number | string | {unit, step}`): The distance between values; over Dates, a calendar interval such as "1 month" (which lands on month starts) or milliseconds. Default: any value.
- `value` (`number | Date | [number, number] | [Date, Date] | expression`): The initial value, or [lower, upper] for two thumbs selecting an interval. Endpoints are sorted and clamped to min/max; an expression reads the data. Default: min.
- `format` (`string | (value) => string`): How the value is shown: a d3-format string such as ".2f", a %-pattern such as "%b %Y" over Dates, or (in JavaScript) a function. Default: a numeric step's decimals, else 4 significant digits (12,346); over Dates, by the step, as an axis labels them.
- `timezone` (`string`): Over Dates, the time zone its steps and labels are in: an IANA name, "UTC" or "Local". Default: the zone of the datetime column min or max reads, else UTC.
- `name` (`string`): The name readers use (input("name"), hm.input.name, or "$name" where a string names a column): an identifier, unique in its input context.
- `label` (`string`): The text shown beside the control. Default: the name.

## Usage

Use a scalar `value` for one thumb or `[lower, upper]` for two thumbs selecting an interval.
Endpoints are sorted and clamped to `min` and `max`; either numbers or Dates work, including
calendar steps. Both thumbs support keyboard arrows and cannot cross. This replaces RangeSlider.
In Svelte, bind the interval with `bind:value`; in Python, read it with `hm.input.name`,
for example as a plot domain.

An input sends its value up to the nearest input context (an InputContext, a Python Scene, or a Template instance), and everything in that context reads it by name: `input("name")` in JavaScript, `hm.input.name` in Python, or the string `"$name"` where a string names a column. A read is replaced by the value before its reader sees it, so moving an input re-runs its readers once, and the change animates like any other data change. Inputs go beside Plots (in a Row or Column), not inside them.

> **SVG and PDF export**
>
> **Left out.** PNG, SVG and PDF exports leave inputs out, and show the plots at the inputs' current values. See [what is not exported as vector](/HMPlot/docs/export.md).

## Related examples

- [Inputs](/HMPlot/examples/inputs.md)
