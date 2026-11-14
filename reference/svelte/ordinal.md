# ordinal

A scale from ordered categories to colors along a colormap.

## Example

```svelte
const rank = ordinal({ domain: ["Low", "Middle", "High"], colormap: "Viridis" });
<Points fill="rank" fillScale={rank} />
```

## Parameters

- `domain` (`category[]`): The categories in order.
- `colormap` (`string | color[]`): The colormap the categories are spread along (default Viridis).
- `range` (`color[]`): Explicit colors instead of a colormap.
- `unknown` (`color`): The color of other categories.
- `label` (`string`): The legend's title.

## Usage

Unlike an unordered categorical palette, an ordinal colormap communicates rank. Supply the category order explicitly; category values are not numerically interpolated.
