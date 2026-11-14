# Offsets and dragging

Rows dragged with drag= move by offsets that views read through moved() and offset().

## Example

```python
hm.Points(x=hm.moved("x"), y=hm.moved("y"), drag=True)
```

## Functions

- `hm.moved(column)` (`expression`): A numeric table column plus each row's offset: what a view reads to follow drags, as in x={moved("weight")}. Offsets are in the column's units, so log(moved("weight")) moves through a log.
- `hm.offset(column)` (`expression`): Each row's offset in the column alone, 0 where it has none: set by dragging or from code.

## Usage

`drag` on a point mark makes its rows draggable. `true` drags along every numeric axis of the view; `"x"`, `"y"`, `"xy"` or `"xyz"` name the axes, and a categorical axis is never dragged, so a strip plot drags along its numeric axis. A press on a draggable row starts a drag, anywhere else the plot pans, Shift-drag still brushes, and Escape cancels.

A drag never changes the table. It writes **offsets**, per-row deltas in each column's own units, on the table's rows, and every view of the table shares them. A view follows only where it reads them: `moved("weight")` is the column plus its offsets and `offset("weight")` the offsets alone, so `x={moved("weight")}` follows a drag and `x="weight"` does not, the dragged mark included. That is what lets one drag move a row in every cell of a scatterplot matrix: each cell's `x` and `y` stand for its two fields, and `moved("x")` reads the offsets of the field the cell shows.

The drag goes back through the channel's expression and the transforms above the mark, so the row lands under the pointer through `log(moved("w"))`, a polar or map frame, or a Calculate column. A Filter that reads `moved()` hides and shows the row while it is dragged. A row of a Group drags its members: a mean or median moves them all by the change, a sum splits it in proportion to each member. Dragging a selected row moves the selection. Rows being dragged skip their transitions and stay under the pointer; Escape and `resetOffsets()` animate.

`getOffsets()`, `resetOffsets()` and `applyOffsets()` on a Data, Provider or Plot read, clear and apply the offsets; `ondrag` and `ondragend` report the dragged rows' keys and each column's change. In Python, `table.offsets` is a DataFrame of key, column and delta, `table.apply_offsets()` a new Table with the moved values, and `table.set_offsets()` and `table.clear_offsets()` change them. See docs/DATA.md, "Dragging".

## Related examples

- [Dragging points](/HMPlot/examples/drag-matrix.md)
- [Dragging cities on a map](/HMPlot/examples/drag-map.md)
