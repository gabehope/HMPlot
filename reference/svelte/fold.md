# Fold

A wide table made long: each row repeated once per chosen column, with that column's name and value.

## Example

```svelte
<script>
  import { Plot, Fold, Points } from "hmplot";
  const data = { name: ["a", "b", "c"], before: [1, 3, 2], after: [2, 4, 1] };
</script>

<Plot {data} height={300} axes2d>
  <Fold fields={["before", "after"]}>
    <Points x="key" y="value" />
  </Fold>
</Plot>
```

## Options

- `name` (`string`): Names the transform, so a Facet's getTransform(name) reaches its copy in every cell.
- `fields` (`column[]`): The numeric columns to fold: each row appears once per column, with the column's name in `key` and its value in `value`.
- `as` (`{key, value}`): New names for the output columns `key` and `value`.

## Usage

Outputs key and value plus retained source columns and identities. as can rename key and value. Fold expands each observation once per requested field; it does not aggregate. Use a categorical X scale for the key channel.

To let the viewer change a setting, read an input in it: `fields={input("fields")}` (Python `fields=hm.input.fields`), where `fields` is a [Select with multiple=true](select) of column names.

## Related examples

- [Pivot and fold](/HMPlot/examples/pivot-fold.md)
