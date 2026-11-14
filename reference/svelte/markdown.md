# Markdown

Formatted text (emphasis, lists, tables, math) beside plots in a Python layout.

Python only. Svelte pages lay this out with HTML and CSS.

## Example

```python
import hmplot as hm

data = {"x": [1, 2, 3, 4], "y": [3, 1, 4, 2]}
with hm.Scene() as scene:
    hm.Markdown("**Four measurements.** The largest is $y = 4$, at $x = 3$.")
    with hm.Plot(data=data, height=300, axes2d=True):
        hm.Points(x="x", y="y")
scene
```

## Options

- `text` (`string`): The markdown: CommonMark with tables, task lists and $math$; {$name} shows an input's value. Python takes it positionally: hm.Markdown("...").
- `width` (`number | string`): The block's greatest width: pixels, or a CSS length. Default: the container's.
- `fontSize` (`number`): The size of the body text; headings scale with it. Default: the theme's text size + 1. In px.
- `color` (`color`): The text color. Default: the theme's text color.
- `font` (`string`): The font, a CSS font-family. Default: the theme's.
- `align` (`"left" | "right" | "center"`): Where the text sits across the block. Default: `"left"`.
- `name` (`string`): A name for the block, in export reports and as its element's data-name.

## Usage

In a Python scene, `hm.Markdown(text)` sits in a Scene, Row, Column or Grid beside plots: CommonMark with GitHub's tables, strikethrough, task lists, autolinks and footnotes, and `$math$` or `$$math$$` typeset by MathJax. Raw HTML is not rendered, and links keep only http(s), mailto and tel URLs. The block takes the theme's font and text color; `width`, `fontSize`, `color`, `font` and `align` override them. `{$name}` shows an input's value as the input shows it (in an f-string, `{{$name}}`).

> **SVG and PDF export**
>
> **Image.** Scene exports place the block as an image of how it looks, captured at the export's raster DPI, and list it in the report as a raster layer: its text is not searchable, and `mode="vector"` refuses it. For text that must stay vector, use Title. See [what is not exported as vector](/HMPlot/docs/export.md).
