# typedColumn

One column with a logical type (ordinal, datetime, duration, ...), where a schema would type it.

## Example

```svelte
<script>
  import { Plot, Points, typedColumn } from "hmplot";
  const size = typedColumn(["M", "S", "L", "M"], { type: "ordinal", domain: ["S", "M", "L"] });
</script>

<Plot data={{ price: [4, 2, 7, 5], size }} axes2d>
  <Points x="size" y="price" />
</Plot>
```

## Parameters

- `values` (`array`): The column's values: numbers, text, Dates, BigInts or a typed array (Python: a list, NumPy array or pandas Series).
- `type` (`"numeric" | "categorical" | "ordinal" | "boolean" | "datetime" | "duration"`): The logical type; required.
- `domain` (`category[]`): Categorical and ordinal: the categories, unique, in order.
- `unit` (`"ns" | "us" | "ms" | "s" | "m" | "h" | "d"`): Datetime and duration: the unit of numeric values (default ms).
- `timezone` (`string`): Datetime only: the zone the times are shown and computed in (an IANA name, "UTC" or "Local").
- `returns` (`typed column`): A frozen column that a table, a Data value or a mark channel takes like any other; Python: an hm Column.

## Usage

A schema types a table's columns for its whole scope (a Data's or a Table's `schema`); `typedColumn` types one column where you make it, for data that has no schema of its own: a list of size labels that sort S, M, L, numbers that are times in seconds, codes that are categories. The type travels with the column to the axis, scale, legend and tooltip that show it, as a schema's would: an ordinal column gets a band axis in its domain's order, a datetime one a time axis.

A categorical or ordinal `domain` fixes the categories and their order; values outside it are missing. A datetime column takes Dates, ISO 8601 text, BigInts or numbers in `unit`, and is shown in `timezone`. Python's `hm.typed_column` also takes NumPy datetime64 and timedelta64 arrays and pandas Series, which carry their own unit. A [cast](casts) types one use of a value inside an expression instead.

See docs/DATA.md, "Logical column types".

## Related examples

- [Categorical and datetime frames](/HMPlot/examples/typed-axes.md)
