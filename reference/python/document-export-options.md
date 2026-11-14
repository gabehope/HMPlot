# DocumentExportOptions

How exportSVG and exportPDF draw: size, vector or raster, and text.

## Example

```python
await plot.export_svg("figure.svg", width="160mm", mode="vector")
```

## Members

- `width` (`string | number`): The page width: CSS pixels, or a CSS length ("20cm").
- `height` (`string | number`): The page height: CSS pixels, or a CSS length.
- `mode` (`"auto" | "vector" | "raster"`): "auto" (default) draws what has no vector form as images, "vector" refuses it, "raster" draws the whole plot as one image.
- `raster_dpi` (`number`): The images' resolution (default 300).
- `text` (`"embedded" | "outlines"`): "embedded" keeps text selectable with its fonts embedded; "outlines" draws it as paths, so it looks the same without the fonts.
- `primitive_budget` (`number`): The most vector pieces one export draws (default 100,000): a mark past it is drawn as an image, or refused in "vector" mode.

## Usage

Export SVG or PDF for print and publication, where lines and text should stay sharp at any size and a journal asks for vector figures; export PNG (`exportPNG({ scale })`) for slides, the web and plots that are mostly images anyway. The options are the same for a Plot, a Facet and a Python Scene.

`width` and `height` set the document's size, as a number of CSS pixels or a length with a unit: `"160mm"`, `"7in"`, `"12cm"`, `"300pt"`. The plot as it is drawn on screen is scaled to that size, not laid out again, so fonts and line widths scale with it: give the plot the on-screen size you want at print size, and only one of the two lengths, so the other follows its aspect (both stretch it to that box). Without either, the document is the plot's size on screen.

`mode` decides what happens to content that has no vector form ([what is not exported as vector](/HMPlot/docs/export.md)): `"auto"` (the default) draws it as an image at `rasterDpi` (`raster_dpi` in Python; 300 by default), in its place among the vector shapes; `"vector"` refuses the export and names it; `"raster"` draws the whole plot as one image. Use `"vector"` to make sure a figure has no images in it, and `"raster"` for a dense plot whose vector form would be too large to open. `primitiveBudget` (`primitive_budget`; 100,000 by default) caps the vector pieces of one export: a mark that would pass it is drawn as an image, or refused in `"vector"` mode. `text: "outlines"` is not implemented yet: the text stays text, and the report says so.

The result's `report` lists what happened to each mark (`markOutcomes`: vector or raster), the image layers and their DPI (`rasterLayers`), and warnings. Read it to find which mark became an image, then change that mark or accept the image.

Python takes the same options as keywords. `await plot.export_svg("figure.svg", width="160mm")` and `export_pdf` export a displayed notebook view; `hm.export_svg(plot, "figure.svg", width="160mm")` and `hm.export_pdf` export without a notebook, in a private headless Chrome. Python's PDFs are printed from the SVG export by Chrome, keep text as text and embed the fonts; prefer them to the handle's `exportPDF()`, whose in-browser conversion mishandles some SVG. See the [Plot handle](plot-handle) for the export methods, and docs/DOCUMENT-EXPORT.md for what each mark exports as.

## Related examples

- [Legends & uncertainty](/HMPlot/examples/guides.md)
