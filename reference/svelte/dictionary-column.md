# DictionaryColumn

A category column as integer codes and the categories they stand for.

## Example

```svelte
<Points x="x" y="y" fill={{ codes: [0, 1, 0], categories: ["A", "B"] }} />
```

## Members

- `codes` (`any`): Required.
- `categories` (`CategoryValue[]`): Required.

## Usage

A dictionary column is a category column already encoded: `codes`, one integer per row, index `categories`, the distinct values in their order. Pass one wherever a column goes (a table's column, or a mark channel directly) when the data comes encoded, or when the codes are computed on the GPU: a jax-js array of codes stays on the GPU, and no step reads it back to find the categories, since they are given. Strings and pandas categoricals are encoded this way for you; Python sends every string column as codes and categories.

The category order is the order of `categories`: it orders a band axis, a legend and the default palette's colors, so `["Low", "Medium", "High"]` keeps that order however the rows are sorted. A code of -1 is a missing category. In JavaScript a code that is out of range, fractional or not finite is unknown too; Python refuses such codes, and codes that are not one-dimensional. Categories must be unique strings, numbers or booleans, and Python refuses integer categories past 2^53 (use strings).

To give a column a category order without encoding it yourself, use a schema's `domain` or [typedColumn](typed-column); to fix colors per category, a [categorical](categorical) scale. [Named data & categories](/HMPlot/examples/categories.md) colors marks by dictionary columns.

## Related examples

- [Named data & categories](/HMPlot/examples/categories.md)
