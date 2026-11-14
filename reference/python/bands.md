# rules and bands

Reference lines and shaded spans of an axis, behind the marks, on a Plot or a Frame.

## Example

```python
hm.Plot(rules=[{"axis": "y", "value": 0}], bands=[{"axis": "x", "from": 40, "to": 52, "label": "Warm spell"}])
```

## Members

### ReferenceRule

- `axis` (`"x" | "y"`): "x" draws a vertical rule at an x value, "y" a horizontal one. Required.
- `value` (`string | number | Date`): Where the rule is, in the axis's units: a number, a Date or an ISO date. Required.
- `label` (`string`): Text at the rule's end.
- `color` (`string`): The rule's color; default the axis text color.
- `width` (`number`): The rule's stroke width in CSS pixels.
- `dash` (`number[]`): Alternating dash and gap lengths in CSS pixels; [] or omitted draws a solid rule.

### ReferenceBand

- `axis` (`"x" | "y"`): "x" shades a vertical strip (in a polar frame, a wedge of angles), "y" a horizontal one (a ring of radii). Required.
- `from` (`string | number | Date`): One end, in the axis's units: a number, a Date, or an ISO date ("2024-03-01" or "2024-03-01T09:30" in the axis's time zone, or with an offset such as "2024-03-01T12:00:00Z"). Required.
- `to` (`string | number | Date`): The other end (either order). Required.
- `label` (`string`): Text at the band's start, like a rule's label.
- `color` (`string`): A six-digit hex color. Default the axis text color.
- `opacity` (`number`): 0 to 1. Default 0.1.

## Usage

`bands` on a Plot or a Frame shades spans of an axis behind the marks and grid lines: `[{ axis: "x", from: 40, to: 52, label: "Warm spell", color: "#d9824b", opacity: 0.16 }]`. An x band is a vertical strip and a y band a horizontal one; in a polar frame they are a wedge of angles and a ring of radii. Ends are values on the axis (numbers, Dates, or ISO dates: `"2024-03-01"` or `"2024-03-01T09:30"` in the axis's time zone, or with an offset such as `"2024-03-01T12:00:00Z"`), in either order. The label sits at the band's start, as a rule's does.

A Frame takes `rules` and `bands` in its own coordinates. Bands export as vector rectangles or sectors, and the settings pane lists them beside the reference lines.

## Related examples

- [Titles, bands and callouts](/HMPlot/examples/annotations.md)
