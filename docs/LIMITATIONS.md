# Known limitations

What HMPlot does not do, or not yet. Each item says where it is described in more detail.

## Platform

- **WebGPU is required.** There is no WebGL or canvas fallback; a browser or device without
  WebGPU shows the plot's error state (USAGE.md). A notebook in such a browser shows a static
  image of the scene that the kernel draws headlessly, not an interactive plot
  (DOCUMENT-EXPORT.md, "Notebooks without WebGPU"). Chrome and Edge on the desktop are tested;
  Safari, Firefox and mobile browsers are not (STABILITY.md).
- **GPUs:** only Apple M-series GPUs run the full suite before each release; other vendors run
  nothing but SwiftShader in CI (TESTING.md).
- **Python exports need Chrome:** an installed Chrome, Edge or Chromium, or Chrome for Testing,
  which hmplot downloads once (DOCUMENT-EXPORT.md). Linux on ARM64 has no Chrome for Testing:
  install the distribution's Chromium.

## Drawing

- **Frame clipping is rectangular 2D Cartesian clipping.** `axisMask` clips drawing and
  picking, intersecting ancestor masks, including ranged and planar anchored frames.
  Arbitrary SVG clipping paths and curved/3D frame masks are not supported.
- **Surface** draws only in a Cartesian frame whose parents are linear, and reports an error
  otherwise (FRAME-IMPLEMENTATION.md).
- **Categorical color** is not supported on Heatmap and Image category grids or per glyph of
  Text; those combinations report an error (DATA.md).
- **SVG and PDF exports** keep axes, text, legends and most 2D marks as vector primitives;
  heatmaps, images, 3D views with a 3D mark, additive blending and the rest of the list in
  DOCUMENT-EXPORT.md ("What is not vector") are placed as images in the same file
  (`mode: "auto"`), or refused with `mode: "vector"`.

## Data and interaction

- **Custom point shapes:** at most 233 on a page (the `registerShape` reference).
- **Partition:** at most 256 groups, each mounting its own marks (PERFORMANCE.md).
- **Vector tiles:** a VectorTile loads at most 16 tiles at once for a fixed area, or at most 48
  for a live one that follows the view; PMTiles archives, raster tiles and Mapbox GL style JSON
  are not supported (VECTOR-TILES.md).
- **Brushing** needs an axis with a valid domain: a log axis whose automatic domain contains 0
  can't be brushed (DATA.md).
- **Dragging** writes back through a channel's expression, so every operator on the path needs
  an inverse (DATA.md).

## Capacity

Every limit on how much a component draws or computes is registered in
`src/lib/plot/utils/limits.js` (TODO 136.9), with what happens past it. A limit that refuses
reports one error, "<Component>: <what> needs <count> <unit>; the limit is <limit>. <hint>",
with the code below (in `hm.check`'s diagnostics and `SceneRuntime.diagnostics()`). A device's
limits differ by GPU; a fixed limit is the same everywhere. tests/unit/limits.test.js keeps this
table and the registry in step.

| Code | Component | What | Limit | Past it |
|---|---|---|---|---|
| `limit.storage` | any mark or transform | its data on the GPU | the device's bytes | refused with an error |
| `limit.texture` | any mark or transform | a texture side | the device's pixels | refused with an error |
| `limit.vertexBuffers` | any mark or transform | its per-row channels | the device's vertex buffers | refused with an error |
| `limit.varyings` | any mark or transform | its shader | the device's varyings | refused with an error |
| `limit.marks` | any mark or transform | rows of one mark (maxElements grows to the device's ceiling) | the device's rows | rows past it not drawn; the plot says so |
| `limit.sampledRows` | Line | rows drawn with maxInstances (the minimap's default) | 1,000 rows | rows sampled |
| `limit.animation` | any mark or transform | animating values | the device's values | refused with an error |
| `limit.curvedPaths` | Line | curved or spherical paths refined in one batch | 1,024 paths | done in parts |
| `limit.curvedSubdivisions` | Line | subdivisions over a batch of curved paths (256 per path) | 65,536 subdivisions | reduced to fit |
| `limit.curvedPieces` | Line | the refined pieces of one curved mark | 4,194,304 pieces | refused with an error |
| `limit.curvedDetail` | Line | the detail of curved segments | the device's subdivisions | refused with an error |
| `limit.wrapCopies` | Plot | a wrapped map view | 16 copies | refused with an error |
| `limit.shapes` | Points | custom shapes on one page | 233 shapes | refused with an error |
| `limit.shapeSegments` | Points | a shape's outline | 4,096 segments | refused with an error |
| `limit.exactShapeVertices` | Points | a polygon shape drawn exactly (past it, from a distance field) | 16 vertices | a slower or approximate path |
| `limit.colormaps` | Plot | custom colormaps on screen together | 224 colormaps | refused with an error |
| `limit.coordinateStages` | Frame | a coordinate mapping | 16 stages | refused with an error |
| `limit.expressionDepth` | Calculate | an expression's nesting | 64 levels | refused with an error |
| `limit.expressionOperations` | Calculate | an expression | 256 operations | refused with an error |
| `limit.stackPairs` | Stack | totaling every (x, series) pair | 16,777,216 pairs | refused with an error |
| `limit.stackInsideOut` | Stack | order "insideOut" (it places series one at a time) | 1,024 series | refused with an error |
| `limit.dodgeUnits` | Dodge | a grid Dodge's expansion | 16,777,216 units | refused with an error |
| `limit.partitionGroups` | Partition | partitioning | 256 groups | refused with an error |
| `limit.timeBins` | Bin | binning time | 100,000 bins | refused with an error |
| `limit.densityBins` | Density | a Density's grid (it shrinks to fit) | 16,777,216 bins | reduced to fit |
| `limit.densityQueue` | Density | one kernel queue of a Density | 67,108,864 bytes | done in parts |
| `limit.reduceRows` | Calculate | rows reduced in one pass (more go in 256 blocks) | 65,536 rows | done in parts |
| `limit.filterRows` | Filter | rows a Filter keeps in place (more compact into buckets) | 65,536 rows | a slower or approximate path |
| `limit.vectorTiles` | VectorTile | a fixed VectorTile | 16 tiles | refused with an error |
| `limit.liveTiles` | VectorTile | a live VectorTile (it loads a coarser zoom) | 48 tiles | reduced to fit |
| `limit.tileCache` | VectorTile | fetched tiles kept (and 64 MiB) | 256 tiles | least recently used dropped |
| `limit.axisTicks` | Plot | an axis | 4,096 ticks | refused with an error |
| `limit.axisBreaks` | Plot | axis breaks | 50,000 intervals | refused with an error |
| `limit.exportPixels` | Scene | an export | 67,108,864 pixels | refused with an error |
| `limit.vectorPrimitives` | Plot | a vector export | 100,000 primitives | refused with an error |
| `limit.templateBytes` | PortableTemplate | a template's JSON | 1,048,576 bytes | refused with an error |
| `limit.templateNodes` | PortableTemplate | a template's tree | 256 nodes | refused with an error |
| `limit.templateDepth` | PortableTemplate | a template's nesting | 32 levels | refused with an error |
| `limit.readback` | read() | a table read back to the host | 16,777,216 bytes (16 MiB) | refused with an error |

## Python

- **Compound marks** (new marks built from existing ones) are JavaScript only; Python packages
  patterns of existing components as templates (USAGE.md, python/README.md).
- **A template's `update()`** is not available yet: update the components it keeps
  (python/README.md).
- **The wire format** between Python and the browser changes with the package: a saved
  notebook's scene is read by the version that wrote it (STABILITY.md).
