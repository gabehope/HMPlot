# colormap

A custom colormap: a list of colors, with an interpolation space and positions.

## Example

```svelte
const alert = continuous({ colormap: { colors: ["#e8eef4", "#f2a900", "#d7301f"], positions: [0, 0.8, 1] } });
```

## Parameters

- `colors` (`color[]`): At least two opaque CSS colors.
- `space` (`"lab" | "hsl" | "srgb"`): Where the colors are interpolated (default lab).
- `positions` (`number[]`): Ascending positions in [0, 1], one per color (default evenly spaced).

## Usage

A colormap is a built-in name, a list of at least two opaque colors, or `{colors, space, positions}` (colors with alpha are rejected; use the mark's `opacity` for translucency). Colors are interpolated in Lab by default; `space` chooses "hsl" or "srgb", and `positions` places each color on [0, 1]. Use it wherever a colormap name works: `continuous()` and `ordinal()` scales, a mark's `colormap`, and a theme's `colormap`, which becomes the default for continuous fills without an explicit colormap. Legends draw the same colors, and SVG exports write them as gradient stops.

## Related examples

- [Custom colormaps](/HMPlot/examples/custom-colormap.md)
