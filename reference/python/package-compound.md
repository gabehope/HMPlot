# hmplot/compound

The built-in templates, and the experimental surface to write your own patterns.

JavaScript only.

## Example

```svelte
import { Lollipop, composition } from "hmplot/compound";
const { ErrorBars, Points, ThemeDefaults, minimum, maximum } = composition;
```

## Exports

- `Histogram, Violin, BoxPlot, Swarm, Bar, Lollipop, Pie, RuleX, RuleY, Crosshair, Callout, Smooth, Ecdf, DensityContour, DensityBands, ErrorBars` (`components`): The built-in templates, the same components as hmplot/charts (each has its reference page), and their props types.
- `composition` (`namespace (experimental)`): What a pattern written in Svelte is built from: Transform, DataBoundary, ThemeDefaults, the options and data contexts, the data-bound primitive marks, the transforms the built-in templates wrap, framePointer and planeRule, expression builders and the input helpers. Names and behavior may change in any release.

## Usage

The built-in templates, built from transforms and simpler marks, are exported from `hmplot/charts` (`hm.charts` in Python). `hmplot/compound` adds `composition`, everything a pattern written in Svelte may use: the `Transform` component that runs a named transform around its children, `DataBoundary`, `ThemeDefaults`, `Undescribed` (a helper part left out of the plot's description), the options and data contexts, the data-bound primitive marks (Rect, Points, Line, ErrorBars, Polygon, ...), the transforms the built-in templates wrap, `planeRule` and `framePointer`, and expression and input helpers.

`composition` is **experimental**: its names and behavior may change in any release, unlike the rest of the package. Its complete list, with what each part is for, a worked Lollipop and the conventions a pattern written in Svelte follows (forward the remaining props to the mark that carries color and interaction, re-export `getLegendSource` and `getMark`, give secondary parts `legend={false}`), is in docs/USAGE.md, "Writing a pattern". In Python a [template](template) packages a pattern of existing components.

## Related examples

- [Lollipop chart](/HMPlot/examples/lollipop.md)
