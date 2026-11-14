# createTheme

A theme: fonts, colors, axes and mark defaults, shared and changed live; themes holds the presets.

## Example

```svelte
const paper = createTheme({ extends: "paper", marks: { Line: { width: 1.5 } } });
<Theme value={paper}>…</Theme>
```

## Members

### Members

- `name` (`string`): The theme's name, shown in the settings pane. A name that starts with a partial theme's group ("axes/", "legend/", "title/", "controls/", "numbers/", "animation/", "marks/") makes the theme a partial: it should set only that section, and warns when it sets others.
- `extends` (`string | ThemeDefinition | ThemeResource | (string | ThemeDefinition | ThemeResource)[]`): Inherit from themes: a preset name (matched ignoring case and punctuation), a partial theme's name ("axes/minimal", "legend/inline-top", "title/centered", "numbers/currency", ...), a theme definition, a theme resource, or a list of them merged left to right, as in ["paper", "axes/minimal", "legend/inline-top"]. This definition's keys merge over the result: objects merge key by key, lists (a palette) replace.
- `vectorTile` (`Partial<Record<VectorTilePart, boolean | VectorTileStyle>>`): VectorTile's color scheme under this theme: part -> style (or false), as VectorTile's styles.
- `view` (`{ background?: string | undefined; }`): The plot area: background is its color.
- `typography` (`{ fontFamily?: string | undefined; fontSize?: number | undefined; color?: string | undefined; }`): Text everywhere unless a part overrides it: font family, size in CSS pixels and color.
- `axes` (`{ fontFamily?: string | undefined; fontSize?: number | undefined; color?: string | undefined; textColor?: string | undefined; line?: boolean | undefined; ticks?: boolean | undefined; tickDirection?: "outside" | "inside" | "both" | undefined; titleFontWeight?: number | undefined; gridColor?: string | undefined; gridWidth?: number | undefined; gridDash?: number[] | undefined; frame?: boolean | undefined; mask?: boolean | undefined; threeD?: Axes3DConfig | undefined; lineWidth?: number | undefined; tickSize?: number | undefined; grid?: "off" | "major" | "major-minor" | undefined; marginLeft?: number | "auto" | undefined; marginRight?: number | "auto" | undefined; marginTop?: number | "auto" | undefined; marginBottom?: number | "auto" | undefined; arrow?: "both" | "none" | "start" | "end" | undefined; arrowSize?: number | undefined; titlePosition?: "start" | "end" | "middle" | undefined; titleAngle?: number | "auto" | undefined; titlePlacement?: "outside" | "inside" | undefined; titleOffset?: number | undefined; tickLabelAngle?: number | undefined; tickLabelAlign?: "auto" | "start" | "end" | "middle" | undefined; tickLabelPlacement?: "outside" | "inside" | undefined; tickLabelOffset?: number | undefined; }`): Axis lines, ticks, labels, titles, grids and margins (see AxisDefinition for each key).
- `guides` (`{ fontFamily?: string | undefined; fontSize?: number | undefined; textColor?: string | undefined; }`): Legends and colorbars: their fonts, colors and spacing.
- `numbers` (`{ format?: string | undefined; }`): Numbers: format is a d3-format string (",.2f", "$,.0f", ".1%") that linear axis ticks, legends and tooltips use where they set no format of their own; dates keep theirs.
- `controls` (`{ accentColor?: string | undefined; fontSize?: number | undefined; }`): Inputs (Slider, Select, Button, Checkbox, Playback, ...): accentColor colors a slider's handle and fill, a checked box and the focus ring (default palette[0]); fontSize is their text size in CSS pixels (default typography.fontSize). A page's --hm-controls-* variables win.
- `animation` (`{ duration?: number | undefined; easing?: "linear" | "quad-in" | "quad-out" | "quad-in-out" | "cubic-in" | "cubic-out" | "cubic-in-out" | "sine-in-out" | undefined; enter?: boolean | "fade" | { effect?: "fade" | undefined; duration?: number | undefined; easing?: "linear" | "quad-in" | "quad-out" | "quad-in-out" | "cubic-in" | "cubic-out" | "cubic-in-out" | "sine-in-out" | undefined; } | undefined; exit?: boolean | "fade" | { effect?: "fade" | undefined; duration?: number | undefined; easing?: "linear" | "quad-in" | "quad-out" | "quad-in-out" | "cubic-in" | "cubic-out" | "cubic-in-out" | "sine-in-out" | undefined; } | undefined; }`): Animated changes: duration (milliseconds) and easing are a Plot's animationDuration and animationEasing, enter and exit a mark's enterEffect and exitEffect, where those are not set. It does not turn animation on: a Plot's or mark's `animation` does.
- `marks` (`Record<string, Record<string, string | number | boolean | null>>`): Mark defaults. A null ordinary mark color/fill clears an inherited color and uses palette[0].
- `palette` (`string[]`): The categorical colors, in order, for marks colored by a category.
- `colormap` (`ColormapSpec`): Default colormap for continuous fills and colors without an explicit colormap.
- `missing` (`string`): The color of a missing value (NaN or null) in a colormapped fill or color, unless its scale sets `missing` (default "#92989f", a neutral gray).
- `shapes` (`Record<string, string | [number, number][]>`): Custom point shapes registered when the theme applies: name -> vertices in [-1, 1] or an M/L/Z path.

### Presets

- `themes` (`Record<name, ThemeDefinition>`): The built-in themes by name, frozen: minimal, paper, presentation, colorblind, dark, 538, financeTerminal, pastel, graph, sea, sunset, ggplot, seabornDark, notebook, graphingCalculator, observable, wesAnderson, ghibli, yellowGlow, 8bit, vaporwave, blueprint, bubblegum, spooky, treasureMap, bureau, journal, bauhaus, risograph and tufte. Pass one to Theme's value, or name it in extends (matched ignoring case and punctuation). Python: hm.themes.paper, hm.themes.five_thirty_eight, hm.themes.eight_bit.

## Usage

JavaScript uses createTheme(definition); Python uses hm.create_theme(**definition). `extends` starts from a preset by name (matched ignoring case and punctuation: `"finance-terminal"` is `financeTerminal`) or from another theme, and the definition's sections override it. `themes` holds the 32 presets listed below as frozen definitions: pass one straight to Theme's `value`, or read its colors. Explicit scale ranges remain independent of a theme palette.

`hmplot` is the default. `minimal` is an airy presentation with quiet outside labels; `ink` uses charcoal-led ink colors. Each preset includes a categorical palette and a continuous colormap. Python discovers the same names through `hm.themes.names()`, including `hm.themes.hmplot` and `hm.themes.ink`.

## Related examples

- [Theme presets](/HMPlot/examples/themes.md)
