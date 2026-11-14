# TableView

The rows of the data around it as an HTML table, live: a Group's groups, a Sort's top rows, a Filter's kept rows; omitted from image exports.

## Example

```python
import hmplot as hm

cars = {"model": ["Civic", "Corolla", "Golf", "Model 3", "Prius", "Mustang"],
        "mpg": [36.0, 34.0, 31.0, 132.0, 52.0, 18.0], "weight": [1250, 1300, 1350, 1610, 1380, 1700]}
with hm.Scene() as scene:
    with hm.Data(cars):
        with hm.Plot(height=260, axes2d=True):
            hm.Points(x="weight", y="mpg", brush=True)
        with hm.Filter(where="@brushed", inactive="all"):
            with hm.Sort(by="mpg", order="desc"):
                hm.TableView(columns=["model", {"field": "mpg", "format": ".0f"}], limit=5, title="Most efficient")
scene
```

## Options

Keywords are snake_case.

- `columns` (`(column | {field, label, format})[]`): The columns, in order: names, or {field, label, format} with a header and a d3-format or %-pattern, as tooltip fields take. Default: every column.
- `limit` (`number`): How many rows to show; the rest are counted below the table. A Sort above it gives a top N. Default: `100`.
- `title` (`string`): A caption above the table.
- `select` (`boolean | selection | object`): Click a row: true selects its source rows in the data's selection, or give a selection(); input("root").set("id") writes an input (.set(literal(v)) a constant, .reset() its default), and a second click on that row restores its default.
- `hover` (`boolean | selection | object`): Hover a row: true marks its source rows @hovered, or give a selection(); input("focus").set("id") shows the row's id in an input while the pointer is on it.
- `name` (`string`): A name for the table (its element's data-name attribute).

## Usage

TableView shows the rows of the data around it as an HTML table, and follows them: a Group's groups, a Sort's top rows, a Filter's kept rows, a layout's nodes. It is for the lists and readouts a dashboard shows beside its plots, such as the ten most efficient cars under a brush or each region's total, without reading the rows into your own code. Put it inside the same Data as the plots (or inside the transform whose rows it shows), beside a Plot, never inside one.

```python
with hm.Data(cars):
    with hm.Plot():
        hm.Points(x="weight", y="mpg", brush=True)
    with hm.Filter(where="@brushed", inactive="all"):
        with hm.Sort(by="mpg", order="desc"):
            hm.TableView(columns=["model", {"field": "mpg", "label": "MPG", "format": ".1f"}], limit=10)
```

```svelte
<Data value={cars}>
  <Plot><Points x="weight" y="mpg" brush /></Plot>
  <Filter where="@brushed" inactive="all">
    <Sort by="mpg" order="desc">
      <TableView columns={["model", { field: "mpg", label: "MPG", format: ".1f" }]} limit={10} />
    </Sort>
  </Filter>
</Data>
```

- `columns` lists the columns in order, as names or `{ field, label, format }`; values are written as tooltips write them, numbers right-aligned. The default is every column.
- `limit` (100) is how many rows it shows; the rest are counted below it. The rows are read from the GPU when the data changes (a brush moving, an input), `limit` of them, never on every pointer move.
- `select` on a row: `true` selects its source rows in the data's selection, as a click on a mark does, so plots of the same data that `respond` fade the others. `input("model").set("model")` writes the row's value to an input instead ([select](mark-options) on marks takes the same), and a second click on that row restores the input's default.
- `hover` on a row: `true` marks its source rows `@hovered`; `input("model").set("model")` shows the row's value in an input while the pointer is on it.
- TableViews are omitted from PNG, SVG and PDF exports and kept in standalone HTML pages. For a number inside a plot, use [Text](text) of a Group's column; for a sentence with live values, [Title](title).
