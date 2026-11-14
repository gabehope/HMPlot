# categorical

A scale from categories to colors, shapes or numbers, in a fixed order.

## Example

```python
colors = hm.categorical(domain=["A", "B"], range=["#547ba2", "#cf8955"])
hm.Points(fill="group", fill_scale=colors)
```

## Parameters

- `domain` (`category[]`): The categories in order; others are added as they appear.
- `range` (`string[] | number[]`): What each category maps to: colors, shape names or numbers (default the palette).
- `unknown` (`color`): The color of a category the range has no entry for.
- `label` (`string`): The legend's title.

## Usage

An explicit domain fixes category order. A band x axis lists it from the left and a band y axis from the top, as a table reads; `y={"invert": True}` lists it from the bottom. Otherwise inferred domains append newly seen values. Finite ranges repeat deterministically. Shared scale identity shares the mapping, not selection state. Numeric values can be treated as categories by explicitly using this resource.

## Related examples

- [Named data & categories](/HMPlot/examples/categories.md)
