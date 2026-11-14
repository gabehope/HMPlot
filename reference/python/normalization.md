# normalization

A domain and transform that several scales share, so their colors and sizes agree.

## Example

```python
norm = hm.normalization(domain=[0, 100])
colors = hm.continuous(normalization=norm, colormap="Viridis")
sizes = hm.continuous(normalization=norm, range=[8, 22])
```

## Parameters

- `domain` (`[number, number] | "symmetric"`): The source domain; without it, the data's.
- `transform` (`"linear" | "log" | "sqrt" | "symlog"`): The transform (default linear).
- `constant` (`number`): symlog's constant: linear within ±constant (default 1).
- `midpoint` (`number`): The value mapped to the middle of the range, for diverging scales.
- `domain_source` (`"data" | "source"`): Whether the domain follows the data or the source's full range.

## Usage

JavaScript uses normalization, Python hm.normalization. One normalization can drive a color encoding and a separate size encoding without making those outputs identical. Supply an explicit domain for cross-dataset comparisons.

A normalization's transform is linear, log, sqrt, or symlog (d3's scaleSymlog, linear within ±`constant` and logarithmic beyond, for data that crosses zero). A value outside the transform's domain, such as a zero under log, is missing: it is not drawn and not counted in automatic domains. `midpoint` makes a diverging scale: the domain's halves map to the range's halves, so a diverging colormap's middle color falls on the midpoint and both ends are used. An explicit domain must contain the midpoint; an automatic one grows to include it.

See the [complete example](/HMPlot/examples/symlog-diverging.md).

## Related examples

- [Shared and independent scales](/HMPlot/examples/scale-resources.md)
