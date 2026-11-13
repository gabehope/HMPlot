"""Dragging marks: offsets on a table's rows.

drag=True on a point mark makes its rows draggable. A drag never changes the table: it sets
offsets, per-row deltas in each column's units, on the table's rows. A view follows them only
where it reads hm.moved(column), the column plus its offsets (or hm.offset(column), the offsets
alone), so every view of the table can follow one drag. In this scatterplot matrix each cell's
"x" and "y" are its two fields, and a row dragged in one cell moves in every cell that shows the
column it was dragged along.

Dragging a selected row moves the whole selection; Escape cancels a drag. The drag and dragend
events report the rows' keys and each column's change. table.offsets lists the offsets (key,
column, delta), table.apply_offsets() returns a new Table with the moved values under the same
names, table.set_offsets() sets offsets from Python and table.clear_offsets() clears them.
"""
import math

import hmplot as hm

n = 36
penguins = hm.Table(
    {
        "id": list(range(n)),
        "species": [["Adelie", "Gentoo", "Chinstrap"][i % 3] for i in range(n)],
        "bill": [40 + 6 * (i % 3) + 3 * math.sin(i * 1.7) for i in range(n)],
        "depth": [17 - (i % 3) + math.cos(i * 2.3) for i in range(n)],
        "mass": [3700 + 700 * (i % 3) + 300 * math.sin(i * 0.9) for i in range(n)],
    },
    key="id",
)

with hm.Scene() as scene:
    with hm.Plot(data=penguins, height=480, axes2d=True):
        with hm.Facet(pairs=["bill", "depth", "mass"], triangle="lower"):
            points = hm.Points(x=hm.moved("x"), y=hm.moved("y"), color="species", size=3.5, drag=True)


def report(event):
    print(f"moved {event.keys}: {event.changes}")


points.on_event("dragend", report)

scene

# After dragging: the offsets, and the table with them applied.
print(penguins.offsets)
moved = penguins.apply_offsets()

# Offsets from Python move the points the same way; clear_offsets() puts them back.
penguins.set_offsets("mass", {0: 400, 1: -400})
penguins.clear_offsets()
