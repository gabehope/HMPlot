# view

View and interaction state, read in any expression: the pointer, the visible domain, the clock, and each row's interaction flags.

## Example

```svelte
<RuleX x={view.pointer_x} />
<Points x="x" y="y" size={where(view.hovered, 6, 3)} hover />
```

## Parameters

- `selected, brushed, hovered, nearby, nearest, tooltip` (`state`): 1 for the rows in that interaction state, else 0; "@selected" reads the same.
- `any_selected, any_brushed, any_hovered, any_nearby, any_nearest, any_tooltip` (`state`): 1 while any row is in that state.
- `pointer_x, pointer_y` (`state`): The pointer in the frame's data; missing off the frame.
- `view_x_min, view_x_max, view_y_min, view_y_max` (`state`): The frame's visible domain as it pans and zooms.
- `time` (`state`): The animation clock, in milliseconds.
- `dt` (`state`): A Simulate's step, in milliseconds.
- `offset_x, offset_y, offset_z` (`state`): The row's drag offset.

## Usage

`"@pointer_x"` and `"@pointer_y"` are the pointer in the data of the frame that reads them, and `"@view_x_min"`, `"@view_x_max"`, `"@view_y_min"` and `"@view_y_max"` that frame's visible domain. They are view state, as `"@time"` is: a mark channel can name one, and any expression can read one with `view.pointer_x`, in a mark, a Filter, a Calculate or a transform parameter.

The pointer is missing off the frame and before it arrives, so a `where(is_missing("@pointer_x"), ...)` chooses what to show then. Over a band axis it is the category under the pointer, which compares with a categorical column by value. On a datetime axis it counts from the axis's time origin, as the marks on it do.

A mark that reads only the pointer steps as it moves and never on the clock, so a still pointer runs nothing. RuleX, RuleY and Crosshair are built on these values.

## Related examples

- [Crosshair and rules](/HMPlot/examples/crosshair.md)
