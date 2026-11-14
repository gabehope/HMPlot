# Regression

A least-squares fit of y on x, sampled across x, with its confidence band.

## Example

```svelte
<script>
  import { Plot, Regression, Line } from "hmplot";
  const data = { x: [1, 2, 3, 4, 5, 6], y: [2, 3, 5, 4, 6, 7] };
</script>

<Plot {data} height={300} axes2d>
  <Regression x="x" y="y">
    <Line x="x" y="y" />
  </Regression>
</Plot>
```

## Options

- `name` (`string`): Names the transform, so a Facet's getTransform(name) reaches its copy in every cell.
- `x` (`column`): The column y is fitted on; the output's `x` holds `samples` positions across its range.
- `y` (`column`): The column fitted; the output's `y` is the fitted curve.
- `method` (`"linear" | "poly" | "log" | "exp" | "pow"`): The model: a line, a polynomial of `order`, y on ln x, ln y on x, or ln y on ln x. The log models leave out rows at zero or below, with a warning. Default: `"linear"`.
- `order` (`number`): The polynomial's degree, 1 to 6, with method "poly". Default: `2`.
- `samples` (`number`): How many output rows, evenly spaced across `extent`. Default: `100`.
- `extent` (`[number, number]`): The x range the fit is sampled over. Default: the fitted rows' x range. In data units.
- `band` (`number | false`): The confidence level of the band around the fitted mean, in the `lower` and `upper` columns (Student's t); false for none, which leaves both columns missing. Default: `0.95`.
- `as` (`{x, y, lower, upper}`): New names for the output columns `x`, `y`, `lower` and `upper`.

## Usage

A least-squares fit of `y` on `x` over the rows shown, sampled at `samples` evenly spaced x values across the fitted rows (or `extent`), with a confidence band for the mean response from Student's t at n − k − 1 degrees of freedom. `method` picks the model: `linear`, `poly` (`order` 1 to 6), `log` (y on ln x), `exp` (ln y on x) or `pow` (ln y on ln x); exp and pow bands are asymmetric.

The fit runs on the GPU, so a Filter or a brush above it refits as it moves. The handle's `fit()` resolves to a `RegressionFit`: the `method` and `order`, the `coefficients` from the constant up (of `response`, y or ln y, in `variable`, x or ln x), `r2`, the residual sum of squares `rss`, the rows fitted `n` and the degrees of freedom `df`; `null` before the first run. Requires a Data scope; outputs x, y, lower and upper to its children.

## Related examples

- [A fitted curve that refits under a brush](/HMPlot/examples/smooth.md)
