# Reductions

Scalar and grouped reductions with predicates, logical any/all, and row-aligned running totals, neighbors and windows.

## Example

```svelte
<Calculate columns={{ share: divide("sales", sum("sales", { by: "region" })) }}>
  <Points x="month" y="share" fill="region" />
</Calculate>
```

## Members

### ReductionOptions

- `by` (`ColumnName | ColumnName[]`): Columns that group the rows: each row gets its own group's value (as pandas' transform).
- `where` (`number | boolean | ColumnName`): A condition (a boolean column or expression): only the rows where it is true are reduced.

### OrderedReductionOptions

- `by` (`ColumnName | ColumnName[]`): Columns that group the rows: each row gets its own group's value (as pandas' transform).
- `where` (`number | boolean | ColumnName`): A condition (a boolean column or expression): only the rows where it is true are reduced.
- `orderBy` (`ColumnName | ColumnName[]`): Columns that order the rows within each group for the calculation; results return to the rows' own places.
- `order` (`"asc" | "desc"`): Ascending (default) or descending orderBy.

### OrderedExpressionOptions

- `by` (`ColumnName | ColumnName[]`): Columns that group the rows: each group is calculated on its own.
- `orderBy` (`ColumnName | ColumnName[]`): Columns that order the rows within each group for the calculation; results return to the rows' own places.
- `order` (`"asc" | "desc"`): Ascending (default) or descending orderBy.

### NeighborExpressionOptions

- `periods` (`number`): Nonnegative row offset; zero is identity.
- `fill` (`string | number | boolean | Date | null`): Missing by default; int32 buffers require an explicit integer fill for exact values.
- `by` (`ColumnName | ColumnName[]`): Columns that group the rows: each group is calculated on its own.
- `orderBy` (`ColumnName | ColumnName[]`): Columns that order the rows within each group for the calculation; results return to the rows' own places.
- `order` (`"asc" | "desc"`): Ascending (default) or descending orderBy.

### WindowExpressionOptions

- `size` (`number | Expression`): Positive integer, or scalar input expression resolving to one.
- `reduce` (`ReducerName`): The reduction over each window: mean (default), sum, min, max and the other reducers.
- `align` (`"center" | "trailing" | "leading"`): Where the window sits around each row: "trailing" (the row and those before it, default), "center" or "leading".
- `by` (`ColumnName | ColumnName[]`): Columns that group the rows: each group is calculated on its own.
- `orderBy` (`ColumnName | ColumnName[]`): Columns that order the rows within each group for the calculation; results return to the rows' own places.
- `order` (`"asc" | "desc"`): Ascending (default) or descending orderBy.

### Functions

- `mean(x, {by, where})` (`number`): The mean of the column or expression x.
- `sum(x, {by, where})` (`number`): The sum; 0 when no value is left.
- `count(x, {by, where})` (`number`): How many finite values x has; count() without x counts the rows. 0 when none.
- `min(x, {by, where})` (`number`): The smallest value; of a datetime column, a datetime.
- `max(x, {by, where})` (`number`): The largest value; of a datetime column, a datetime.
- `std(x, {by, where})` (`number`): The standard deviation, over n (ddof 0, NumPy's default).
- `variance(x, {by, where})` (`number`): The variance, over n (ddof 0).
- `median(x, {by, where})` (`number`): The middle value (the mean of the two middle values for an even count); of a datetime column, a datetime.
- `quantile(x, p, {by, where})` (`number`): The p quantile (0 to 1), between the two nearest values as NumPy's default interpolates; quantile(x, 0.5) is the median. Of a datetime column, a datetime.
- `mode(x, {by, where})` (`number | category`): The most common value (ties: the smallest); of a category column, a category.
- `first(x, {by, where, orderBy, order})` (`number | category`): The first value in row order; keeps a category or a datetime.
- `last(x, {by, where, orderBy, order})` (`number | category`): The last value in row order; keeps a category or a datetime.
- `any(x, {by, where})` (`boolean`): Any finite participating value is true; empty is false.
- `all(x, {by, where})` (`boolean`): All finite participating values are true; empty is true.
- `extent(x, {where})` (`domain`): [min, max] of the rows where matches, as an axis domain read from the data; automatic while no row matches.
- `cumsum(x, {by, orderBy, order})` (`column`): Inclusive float32 running total, restored to source rows.
- `lag(x, {periods, fill, by, orderBy, order})` (`column`): Previous visible observation, with typed boundary fill and no wraparound.
- `lead(x, {periods, fill, by, orderBy, order})` (`column`): Next visible observation, with typed boundary fill and no wraparound.
- `window(x, {size, reduce, align, by, orderBy, order})` (`column`): Window's clipped rolling reduction, restored to source rows.
- `lookup(x, row, {fill})` (`column`): x at another row: the row numbered row (0-based) of the visible rows in their order, as x[parent]; a row number that is missing, not whole or past the last row reads fill. Keeps a category or a datetime; exact to 2^24 rows for float row numbers, throughout for int32; a drag cannot move a value read through it.
- `bin(field, bins, {interval, tz})` (`Group key`): A group per bin of field, as Bin bins it, in Group's by; writes its edges and center (x0, x1 and x for field x).
- `hexbin(x, y, {radius, bins, orientation})` (`Group key`): A group per hexagon of x and y, as Hexbin's, in Group's by; writes x and y.

## Usage

A reduction collapses a column (or an expression) to one value, which every row then gets: `divide("sales", sum("sales"))` is each row's share of the total, and `subtract("x", mean("x"))` centers a column. With `by`, a categorical column or a list of them, each row gets its own group's value instead, as pandas' `transform` does: `sum("sales", { by: "region" })` (Python `hm.sum("sales", by="region")`). Any number of groups works; a [Group](group) transform gives one row per group instead.

Missing and nonfinite values are skipped. With no value left, a reduction is NaN, except `count` and `sum`, which are 0. A reduction runs over the rows shown where it is evaluated: under a `Filter` or a brush it follows the kept rows, and it runs again when the data changes, not when the view moves.

`quantile("x", p)` (Python `hm.quantile("x", p)`) is the `p` quantile, 0 to 1, interpolated between the two nearest values as NumPy's default does, so `quantile("x", 0.5)` is the median: `Group` with `columns={{ p90: quantile("delay", 0.9) }}` gives each group's 90th percentile. For a whole quantile curve, sort the rows and give each its share of the group: `divide(cumsum(is_finite("x"), {by: "g", orderBy: "x"}), count("x", {by: "g"}))`, which is the empirical distribution [Ecdf](ecdf-chart) draws when the values are distinct (Ecdf puts tied values at their last rank).

Python spells `variance` as `hm.var`. `hm.min`, `hm.max`, `hm.sum`, `hm.any` and `hm.all` are left out of `from hmplot import *`; use the `hm.` prefix.

### Participation and booleans

`sum("sales", {where: "@selected"})` (Python `hm.sum("sales", where="@selected")`)
uses selected visible rows. A predicate is an ordinary expression: changing it updates the
reduction without changing table membership. False, missing and nonfinite predicates exclude
rows. `count(undefined, {where: predicate})` counts eligible rows; `count("sales", ...)` counts
eligible nonmissing sales. Python uses `hm.count(where=predicate)`.

### Highlight all observations of selected entities

`any("@selected", {by: "country"})` (Python `hm.any("@selected", by="country")`)
broadcasts selection membership to every visible row with the same country. Use it in
`Calculate` to name the predicate, in `Filter(where=...)` to keep matching observations,
or in an opacity expression to highlight them. Replace `@selected` with `@hovered` for
hover-linked highlighting. This derives a predicate; it does not expand the underlying
selection resource. Evaluate it before a filter that removes the peer observations you want
included. No `Group` or `Join` is needed, and grouping fields must be categorical.

### Domains from the data

An axis domain can be read from the data: `extent("x", {where})` is `[min, max]` of the rows
`where` matches (Python `hm.extent("x", where=...)`), so `x={{ domain: extent("x", { where: "@brushed" }) }}`
zooms a plot to the rows brushed in another plot of the same data and follows the brush. Each
end can be any reduction. It is read again when the data or the selection changes, and the
domain is automatic while no row matches.

`any` and `all` accept logical booleans or finite numbers (zero is false). Dictionary-encoded
booleans are decoded by value; category codes are never truth values. Compare string categories
first. Missing observations are skipped: no eligible observations means `any=false`, `all=true`.
Both reducers also work in Group's columns, GraphData's reduce and Window.

`first` and `last` accept `orderBy`/`order` (`order_by` in Python). Other scalar reducers have
no order option. Grouping fields must be categorical, as with existing reductions.

### Group keys

| Expression | A group of rows per |
| --- | --- |
| `bin(field, bins, {interval, tz})` | Bin of `field`, as [Bin](bin) bins it; writes its edges and center (`x0`, `x1`, `x`). |
| `hexbin(x, y, {radius, bins, orientation})` | Hexagon of `x` and `y`, as [Hexbin](hexbin)'s; writes its center (`x`, `y`). |

These go in [Group](group)'s `by`, alone or beside columns: `by={["carrier", bin("delay", 20)]}` (Python `by=["carrier", hm.bin("delay", 20)]`). They are not values, so Calculate rejects them. Like `hm.min`, `hm.bin` is left out of `from hmplot import *`.

### Row operations

| Expression | Result for each visible row |
| --- | --- |
| `cumsum(value, options)` | Inclusive running total; missing contributes zero. |
| `lag(value, {periods: 1, fill: null, ...})` | Previous observation; never wraps across a group. |
| `lead(value, {periods: 1, fill: null, ...})` | Next observation; zero periods is identity. |
| `window(value, {size: 5, reduce: "mean", align: "trailing", ...})` | Window's clipped rolling reduction. |

These accept `by`, `orderBy` and `order: "asc" | "desc"`. Without an order field, they use
visible table order. They calculate stably within groups and restore results to the original
rows. [Sort](sort) reorders the whole table instead. Ordered grid expressions are unsupported;
use a one-dimensional table. A standalone column-sort expression is deferred.

Totals and arithmetic window outputs use float32, with its normal rounding/overflow limits.
Neighbor gathers preserve categorical dictionaries, datetime origins and exact int32 values.
Missing floats are NaN; missing categories use their existing missing code. Int32 buffers have
no nullable representation: pass an integer fill, such as `{fill: 0}`, instead of losing precision.
Boolean device buffers likewise need an explicit boolean fill. Datetime fills use Date in
JavaScript and a datetime in Python. An explicit categorical fill must already be in the dictionary.
A row whose `by` key is missing belongs to no group: it is missing (NaN or the missing category), or
for int32 and boolean buffers takes the fill; a rolling `any` is false and `all` true there.

Window size can read a scalar input; it must resolve to a positive integer. Its reducer set and
trailing/center/leading alignment match [Window](window), including `any`/`all` identities.

### Another row's value

`lookup(value, row, {fill: null})` (Python `hm.lookup(value, row, fill=None)`) gives each row
`value` at the row numbered `row` (0-based) of the visible rows in their order, as `x[parent]`:
`lookup("x", "parent")` puts each node's parent's `x` beside it, and `lookup("x", 0)` the first
row's on every row. A row number that is missing, fractional or past the last visible row reads
the fill, typed as for `lag`. Row numbers count the visible rows, so after a
[Filter](filter) they count what it keeps. Float row numbers are exact up to 2^24 rows; an
int32 column of row numbers is exact throughout. A drag cannot move a value read through
`lookup`, and a Group's columns reject it, as they reject the row operations above.

### Running totals, previous values and rolling predicates

```svelte
<script>
  import { Plot, Calculate, Points, cumsum, lag, window, greater, subtract, sum } from "hmplot";
  const data = { day: [0, 1, 2, 3, 4, 5], sales: [4, 2, 1, 3, 5, 2], team: ["A", "B", "A", "B", "A", "B"] };
  const order = { by: "team", orderBy: "day" };
</script>
<Plot {data} height={320}>
  <Calculate columns={{
    total: cumsum("sales", order),
    change: subtract("sales", lag("sales", { ...order, fill: 0 })),
    recent: window(greater("sales", 3), { ...order, size: 2, reduce: "any" }),
    selectedTotal: sum("sales", { where: "@selected" }),
  }}>
    <Points x="day" y="total" fill="recent" select respond={false}
      tooltip={["team", "sales", "total", "change", "selectedTotal"]} />
  </Calculate>
</Plot>
```

```python
import hmplot as hm
data = {"day": [0, 1, 2, 3, 4, 5], "sales": [4, 2, 1, 3, 5, 2],
        "team": ["A", "B", "A", "B", "A", "B"]}
order = {"by": "team", "order_by": "day"}
with hm.Plot(data=data, height=320) as plot:
    with hm.Calculate(
        total=hm.cumsum("sales", **order),
        change=hm.col.sales - hm.lag("sales", fill=0, **order),
        recent=hm.window(hm.col.sales > 3, size=2, reduce="any", **order),
        selectedTotal=hm.sum("sales", where="@selected"),
    ):
        hm.Points(x="day", y="total", fill="recent", select=True, respond=False,
                  tooltip=["team", "sales", "total", "change", "selectedTotal"])
```
