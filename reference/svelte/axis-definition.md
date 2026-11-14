# AxisDefinition

A Plot's or Frame's x, y and z: the domain, scale and transform, and the ticks, labels and title.

## Example

```svelte
<Plot x={{ domain: [0, 10], label: "Time (s)", tickCount: 5 }} y={{ transform: "log" }}>…</Plot>
```

## Members

- `domain` (`[number, number] | [Date, Date] | [number | Expression | Date, number | Expression | Date] | "auto"`): The data range the axis spans; "auto" (the default) spans the marks' data, widened by padding and, on a 2D linear numeric axis, rounded out to tick values. Two dates make a datetime axis over them. Ends that are reductions (extent(column, {where})) are read from the data and follow it and the selection; automatic while no row matches.
- `transform` (`ScaleTransformName`): How data maps to the axis: "linear" (default), "log", "sqrt" or "symlog"; under log a value at or below zero is missing.
- `range` (`[number, number]`): Where the domain lands in the parent frame's coordinates (a Frame's sub-range of its parent axis).
- `constant` (`number`): symlog's constant c > 0 (default 1): the axis is linear within ±c and logarithmic beyond.
- `invert` (`boolean`): Flip the axis direction on screen (top-to-bottom for y, right-to-left for x, near-to-far for z).
- `scale` (`CategoricalScale`): A categorical scale: the axis becomes one band per category, in the scale's order.
- `label` (`string`): The axis title. Empty (or null) means automatic: the axis is titled by a categorical position scale's label, else by the name of the one column its marks plot there (through a Facet's value/x/y aliases and transform outputs such as a Bin's edges); an axis whose marks plot several columns, only constants, raw arrays or expressions, or nothing has no title. A Frame that sets its own domain, range, transform or scale for this dimension reads only its own label.
- `visible` (`boolean`): false hides the axis (its line, ticks and labels).
- `side` (`"left" | "right" | "top" | "bottom"`): Which side the axis is drawn on; "right" or "top" for a second axis.
- `type` (`"numeric" | "datetime"`): "datetime" labels positions as times counted from origin in timezone; a Date or datetime64 column sets it.
- `origin` (`number | Date`): Datetime axes: the time (a Date, or Unix milliseconds) positions count from.
- `timezone` (`string`): Datetime axes: the IANA time zone labels and calendar intervals use (default UTC).
- `format` (`string`): A d3-format string (".1f", ",") or, on a datetime axis, a time pattern ("%b %d").
- `majorInterval` (`string | CalendarInterval`): Datetime axes: the calendar step between major ticks ("1 month", "15 minutes").
- `minorInterval` (`string | CalendarInterval`): Datetime axes: the calendar step between minor ticks.
- `major` (`boolean`): false hides the major ticks and their labels.
- `minor` (`boolean`): Draw minor ticks between the major ones (subdivisions of each step).
- `step` (`number`): The spacing between major ticks, in data units, instead of an automatic choice.
- `tickCount` (`number`): About how many major ticks to draw; the axis picks round values near that count. Automatic: about one per 80 px along a 2D linear numeric x axis and per 45 px along y, else per 90 px.
- `subdivisions` (`number`): How many minor intervals each major step splits into (at least 2; default 5).
- `minorStep` (`number`): The spacing between minor ticks, in data units, instead of subdivisions.
- `padding` (`number`): An automatic domain's margin on each side, as a fraction of its span (default 0.04); on a 2D linear numeric axis the padded ends then round out to tick values, and 0 keeps the data's ends. An explicit domain is not padded.
- `grid` (`"off" | "major" | "major-minor"`): Grid lines at the major ticks ("major") or at major and minor ticks ("major-minor"); "off" draws none.
- `line` (`boolean`): Show the baseline independently of ticks, labels, grids and arrows.
- `ticks` (`boolean`): Show tick marks independently of tick labels.
- `tickSize` (`number`): Tick length in CSS pixels; defaults to the theme's tick size.
- `tickDirection` (`"outside" | "inside" | "both"`): Tick direction relative to the axes interior.
- `titleFontWeight` (`number`): Numeric title font weight from 1 to 1000.
- `gridColor` (`string`): Grid stroke color; omitted adapts to the background.
- `gridWidth` (`number`): Grid stroke width in CSS pixels.
- `gridDash` (`number[]`): Alternating dash and gap lengths in CSS pixels; [] draws solid grids.
- `lineWidth` (`number`): The baseline's stroke width in CSS pixels; 0 hides the baseline and arrow shafts.
- `tickWidth` (`number`): The tick marks' stroke width in CSS pixels.
- `arrow` (`"both" | "none" | "start" | "end"`): An arrowhead at the axis's start, end or both ends.
- `arrowSize` (`number`): The arrowhead's size in CSS pixels.
- `labelOverlap` (`"hide" | "show"`): "hide" (default) drops tick labels that would overlap their neighbors; "show" keeps them all.
- `tickLabelAngle` (`number`): Rotates the tick labels, in degrees.
- `tickLabelAlign` (`"auto" | "start" | "end" | "middle"`): How tick labels align to their ticks; "auto" chooses by the axis side and angle.
- `tickLabelPlacement` (`"outside" | "inside"`): Tick labels outside the axes interior (default) or inside it.
- `tickLabelOffset` (`number`): Extra distance between tick labels and the axis, in CSS pixels.
- `titlePosition` (`"start" | "end" | "middle"`): Where the title sits along the axis: at its start, middle or end.
- `titleAngle` (`number | "auto"`): The title's rotation in degrees; "auto" reads along a vertical axis.
- `titlePlacement` (`"outside" | "inside"`): The title outside the axes interior (default) or inside it.
- `titleOffset` (`number`): Extra distance between the title and the tick labels, in CSS pixels.
- `context` (`boolean`): Datetime x axes: a second row of labels where the coarser unit changes (the date under hours, the month and year under days); default true.
- `breaks` (`AxisBreak | AxisBreak[]`): Datetime axes: intervals the axis leaves out, in its time zone ("weekends", { hours: [16, 9.5] } every day, { dates: ["2026-12-25"] } whole days, { from, to } one interval).
- `calendar` (`string | { name: string; units: string; }`): A model calendar's axis (set from its column): "360_day", "all_leap" or "noleap", with the column's units ("days since 1850-01-01").

## Usage

A Plot's or a [Frame](frame)'s `x`, `y` and `z` each take one of these objects: how that dimension maps data to the frame, and how its axis is drawn. Set only what you need; the rest keeps its default or the theme's. Python writes the keys in snake_case (`tick_count`, `major_interval`), and an unknown key is an error that names the nearest one.

**The mapping.** `domain` fixes the data range; without it (`"auto"`) the axis spans the marks' data, widened by `padding` (a fraction of the span on each side, 0.04 by default; an explicit domain is not padded). On a 2D linear numeric axis the padded ends then round out to tick values, so both ends carry labeled ticks; an end at a bar's 0 baseline or at the bounds a Heatmap or Image is placed by stays, an end whose padding already reaches past a tick (data from 0, or up to 10) keeps its padding, and `padding: 0` keeps the data's ends. `transform` is linear, log, sqrt or symlog, with `constant` for symlog's linear band around zero. Under log a zero or negative value is missing: it is not drawn and not counted in the automatic domain. `invert` flips the axis on screen and keeps its domain, so zooming and ticks work as before. `scale`, a [categorical](categorical) scale, makes the axis a band per category in the scale's order: along x from the left, along y from the top (`invert` lists a y axis from the bottom). `axisMask` clips marks to the visible axes interior; it is enabled in HMPlot and most themes. Set `axisMask={false}` on Plot/Frame to allow overflow.

**Time.** `type: "datetime"` labels positions as times, counted in milliseconds from `origin` (Unix milliseconds, as [datetimeCoordinates](datetime-coordinates) returns it) and shown in `timezone`. A column of Dates, a datetime schema or a NumPy datetime64 column sets both itself. `majorInterval` and `minorInterval` take calendar steps (`"1 month"`, `"15 minutes"`), an x axis adds a second row of dates under hours (`context`), and `breaks` leaves out weekends, nights or holidays, as in [Market hours](/HMPlot/examples/market-hours.md).

**Ticks, labels and the title.** `tickCount` asks for about that many ticks (automatic: about one per 80 px along a 2D linear numeric x axis and per 45 px along y), `step` fixes their spacing, and `format` is a d3-format string (`".1f"`) or a time pattern (`"%b %d"`). `minor` with `subdivisions` adds minor ticks, and `grid` draws lines at the major (or major and minor) ticks. `label` titles the axis; left empty, it is the name of the one column the marks plot there. `visible: false` hides the line, ticks and labels but keeps the mapping, and `side` moves an axis to the right or the top, as a second y axis needs.

[Axes & datetime](/HMPlot/examples/axes.md) shows a datetime axis in a time zone with minor grids, and [Twin coordinate frames](/HMPlot/examples/twin-axes.md) two y axes over one x.

## Baselines, tick marks, and grids

`line` shows the baseline, independently of `ticks` and tick labels. `tickSize` is the
length in CSS pixels; `tickDirection` is `outside`, `inside`, or `both`. Major/minor
controls still decide which ticks exist. `ticks: false` leaves their labels visible.

```js
x={{ line: false, ticks: true, tickSize: 4, tickDirection: "outside", arrow: "end" }}
y={{ grid: "major", gridColor: "#dde4ed", gridWidth: 1, gridDash: [3, 3] }}
```

A baseline-free arrow has a short shaft twice `arrowSize` long and a filled head.
`lineWidth: 0` suppresses baseline and shaft strokes while arrows remain independent.
`titleFontWeight` sets a numeric weight from 1 to 1000. Grid color defaults to an adaptive
blend with the background; `gridWidth` and `gridDash` affect grids, leaving reference
`rules` independent. Explicit axis settings override matching `theme.axes` values.

`axisFrame` on Plot/Frame draws the missing sides of a rectangular 2D Cartesian border
without repeating ticks or labels. `axisMask` clips data marks and picking to the interior,
including when baselines are hidden. Both have theme defaults (`axes.frame`, `axes.mask`).

## Related examples

- [Twin coordinate frames](/HMPlot/examples/twin-axes.md)
- [Axes & datetime](/HMPlot/examples/axes.md)
- [Market hours: an axis that skips weekends and nights](/HMPlot/examples/market-hours.md)
