# Statistical plots and polar sectors

Violin, BoxPlot, Swarm, Bar, Histogram, Lollipop, Pie, Smooth, Ecdf, DensityContour and DensityBands are built-in templates: they compose
transforms and primitive marks, live in `src/lib/compound/`, and are importable from
`hmplot/charts` (`hm.charts` in Python); `hmplot/compound` remains a compatibility subpath
for Svelte template authoring. Statistical templates such as Bin, Hexbin, Normalize, Window
and Summary come from `hmplot/stats` (`hm.stats` in Python). See "Writing a pattern" in docs/USAGE.md.
Their axes are titled by the columns you give them (a Bar's category and value columns, a
Histogram's binned column), not by their internal columns; a Histogram's frequency axis reads
its normalization: count, proportion or density.

`Density` estimates grouped Gaussian density curves or rasters from named data. Its default Scott bandwidth accounts for nonnegative weights; `normalization="count"` scales the integral to the included weight. One-dimensional output has `x` and `density`, from the bounds' one end to the other. Two-dimensional output also has `y` and is a grid table (docs/DATA.md "Grid tables") of y then x that `Heatmap` draws directly: it samples its cells' centres, so the cells tile the bounds, and a Density grouped by one key gains a leading dimension of its groups. `Grid`'s output is a grid table too.

```svelte
<Plot data={observations} axes2d>
  <Density x="measurement" by="species" resolution={256}>
    <Line x="x" y="density" color="species" />
  </Density>
</Plot>
```

`Pivot` converts long rows to wide columns, `Fold` performs the inverse for selected numeric columns, and `Sample` selects seeded rows without replacement (`order="random"` shuffles them). A group's statistic on every row, which JoinAggregate gave, is a reduction with `by` in Calculate (`mean("x", {by: "g"})`), and a quantile is the `quantile("x", p)` reducer (TODO 137.3 removed JoinAggregate and Quantile). They retain the existing `Data` scope and transform lifecycle, including completed-frame replacement on errors.

The convenience marks use those same primitives and data scopes:

```svelte
<Plot data={observations} axes2d loading="atomic">
  <Violin x="species" y="measurement" />
  <BoxPlot x="species" y="measurement" />
  <Swarm x="measurement" y="species" />
  <Bar x="species" y="total" />
</Plot>
```

Use one mark per plot when their axes or visual meanings differ. `Violin` mirrors grouped density bands, `BoxPlot` uses Tukey whiskers and source-identified outliers, `Swarm` composes Dodge with flat points, and `Bar` draws a categorical band against a baseline. Aggregate measurements with `Group` when a category has several rows to summarize. Bar stacks rows sharing a category by default; `arrange="group"` places series side by side and `arrange="overlap"` draws each from its baseline. Separate, copyable gallery examples are available under `/examples`.

## Fits: Regression and Smooth

`Regression` fits `y` on `x` by least squares over the rows shown, and outputs `samples` rows
(default 100) across `extent` (default the fitted rows' x range): `x`, `y` (the fit), and `lower`
and `upper`, a confidence band for the mean response at level `band` (default 0.95; `false` for
none), from Student's t at n − k − 1 degrees of freedom. `method` is `"linear"`, `"poly"` (`order`
1 to 6, default 2), `"log"` (y on ln x), `"exp"` (ln y on x) or `"pow"` (ln y on ln x); the last two
fit on a log scale, so their bands are asymmetric, and rows a log cannot take are left out with a
warning. The fit runs on the GPU in one compiled program, so under a Filter or a brush it refits
as the rows change, reading nothing back; the handle's `fit()` reads the coefficients (from the
constant up), r², the rows fitted and the degrees of freedom. `Smooth` is Regression, an Area
and a Line, as Violin is Density and an Area:

```svelte
<Plot data={penguins} axes2d x={{ domain: [170, 235] }} y={{ domain: [2500, 6500] }}>
  <Points x="flipper" y="mass" brush respond="brushed" />
  <Filter where="@brushed" inactive="all">
    <Smooth x="flipper" y="mass" method="poly" />
  </Filter>
</Plot>
```

Fix the axes' domains when a fit follows a brush: fitted to a few rows its band widens, and
automatic domains would follow it. For a fit per group, repeat it in a Partition. LOESS is planned
after the first release.

## Distributions: Ecdf

`Ecdf` draws each group's empirical distribution with a step Line per group: `<Ecdf x="mass"
by="species" />`. Underneath, an internal ECDF transform (public until TODO 137.3) reorders the rows by
group (`by`) and value (`x`) and adds `ecdf`, the fraction of the group's shown rows at or below
each value (`normalize="count"` for counts, `complementary` for the fraction above). Ties take the
last rank, so each distinct value is one step; missing values and hidden rows come last, with NaN.
The rows are the input's, so selections and brushes follow the points. In Calculate the same
fraction is `divide(cumsum(is_finite("x"), {by: "g", orderBy: "x"}), count("x", {by: "g"}))`,
which counts tied values one at a time.

## Contours: Contour, DensityContour and DensityBands

`Contour` draws iso-lines or filled bands of a grid table's `field` on the GPU: a Density's or a
Grid's output, `gridTable()`, or a NetCDF field. `thresholds` is a count of nice levels over the
field's range (default 10) or the levels. With `mode="lines"` each output row is a segment
(`start`, `end`, `level`) for Segments; the segments are d3-contour's marching squares, the same
saddle choice and crossings, without the pieces along the grid's border that close d3's rings.
With `mode="bands"` the rows are triangles for Polygon, with `lower`, `upper` and `band`: the
regions between consecutive levels, and above the last. Each cell is four triangles around its
centre (whose value is the corners' mean, so a saddle is resolved by the mean), each clipped to the
bands it meets, so a band's area is within a few percent of d3's. Missing values and a Filter's
hidden cells draw nothing; the output is sized exactly, reading back its row count once per run.
`DensityContour` is Density, Contour, then Segments colored by level, and `DensityBands` Density,
Contour, then Polygon filled by band, as d3's contourDensity (DensityContour's `mode="bands"`,
which drew the bands before, is deprecated):

```svelte
<Plot data={penguins} axes2d>
  <DensityBands x="bill_length" y="bill_depth" thresholds={10} />
  <Points x="bill_length" y="bill_depth" />
</Plot>
```

DensityBands leaves out its first band, which starts at or below the least density (the whole grid). For
very large grids, a Heatmap with a quantized scale draws bands at no geometry cost.

## Geometry: Delaunay, Voronoi, Hull and Polygon

`Voronoi` gives each point its cell, clipped to `extent` (default the points' bounds and a tenth of
their size around them); `Hull` the convex hull of each group of `by`; `Delaunay` the
triangulation's edges (`start`, `end`, and the two points' rows as `source` and `target`), for
Segments. They run on the host with d3-delaunay, over the rows shown, once per data change. Each
output row repeats its source row, so it carries that row's columns and identity: hovering a
Voronoi cell highlights its point, and a hull's `fill="species"` colors it by its group.

`Polygon` fills polygons. Inside Voronoi, Hull or Contour's bands, with no `x` or `y`, it draws
their triangles; given vertex rows, each group of `series` is a polygon, its rows its vertices in
order, triangulated on the host with earcut, its triangles carrying its first row.
`outlineColor` and `outlineWidth` (pixels) outline the polygons' own edges, not the triangles'
inner ones. Polygons draw in Cartesian frames; each is one ring (for holes and multipolygons use
GeoJSON). SVG and PDF exports draw a path per triangle, and a continuous fill exports as raster,
as for points and Rect.

```svelte
<Plot data={penguins} axes2d>
  <Voronoi x="bill_length" y="bill_depth">
    <Polygon fill="species" opacity={0.3} outlineColor="white" outlineWidth={0.5} hover respond="hovered" />
  </Voronoi>
  <Points x="bill_length" y="bill_depth" fill="species" respond="hovered" />
</Plot>
```

## Stacks: offsets and orders

`Stack` gives each row `y0` and `y1`, its span in the stack of its `x` group, with the rows
ordered by `series`, then by row. `offset` places each stack, as d3.stack's offsets do:

- `"zero"` (the default): positive values stack up from 0 and negative ones down (d3's
  diverging offset);
- `"expand"`: each stack's total magnitude spans 1, for 100% stacks (positives rise to P/T and
  negatives fall to -N/T, where T = P + N);
- `"center"`: each stack centered on 0 (d3's silhouette);
- `"wiggle"`: d3's streamgraph offset. Each stack moves, in x order, so the layers change slope
  as little as they can (the baseline starts at 0 at the first x).

`center` and `wiggle` need non-negative values: a negative one is an error naming the column
(d3 draws something odd instead). A Filter that hides the negative rows is enough.

`order` is a list of categories, or one of d3's orders: `"none"` (the series' own order, the
default), `"appearance"` (by the x of each series' peak), `"asc"` and `"desc"` (by
each series' total), `"insideOut"` (the largest series in the middle, for streamgraphs) and
`"reverse"`. `wiggle` and the orders computed from values need `series`; rows with no series are
the last layer. Hidden rows add nothing to the totals, peaks or offsets.

```svelte
<!-- A streamgraph -->
<Stack x="week" y="plays" series="genre" offset="wiggle" order="insideOut">
  <Area x="week" upper="y1" lower="y0" fill="genre" series="genre" />
</Stack>
<!-- 100% stacked bars -->
<Stack x="region" y="sales" series="product" offset="expand">
  <Bar x="region" y="y1" baseline="y0" fill="product" />
</Stack>
```

Everything runs in Stack's GPU program. `wiggle` and the computed orders first total every
(x group, series) cell, from a sort and a segmented scan, so their program is compiled per
number of series as well as per number of x groups; `insideOut` then places the series one by
one, a short sequence of scalar steps per series. A numeric `series` is grouped first (one
readback of its count, kept while the column is the same). `center` and `wiggle` read the
column's minimum back once per column; a brush over a Filter reads nothing more unless the
column has negative values, which a run with hidden rows then checks among the shown ones. See
the `streamgraph` and `stacked-percent` gallery examples and `python/examples/70_streamgraph.py`
and `70_stacked_percent.py`.

In a 2D polar view, `Rect` accepts angle bounds on X and radius-offset bounds
on Y to draw a filled sector. Angles may be unwrapped but each sector can span
at most one revolution. The Sunburst gallery page shows a deterministic static
hierarchy using these sectors and GPU labels.

```svelte
<Plot coordinates="polar" type="2d" baseRadius={0} radialScale={1}
  x={{ domain: [0, 360] }} y={{ domain: [0, 1] }}>
  <Rect x0="startAngle" x1="endAngle"
    y0="innerRadius" y1="outerRadius" fill="category" />
</Plot>
```

## Pie and donut

`Pie` draws a sector per row, its angle its value's share of the total, as polar Rect sectors
(the PieGeometry transform computes them):

```svelte
<Plot data={sales} height={360}>
  <Pie bind:this={pie} value="sales" category="region" innerRadius={0.5} padAngle={1} sectorLabel="percent" />
  <Legend for={pie} channel="fill" position="right" />
</Plot>
```

- Angles follow d3.pie, in degrees: 0 at 12 o'clock, clockwise, from `startAngle` (default 0)
  to `endAngle` (default 360; below startAngle the sectors run counter-clockwise). `sort` is
  "none" (row order, the default; d3.pie's default is descending), "asc", "desc",
  or a list of categories, the unlisted ones after them in row order.
- `padAngle` (degrees) works as d3.pie's: each sector's share is taken from the span less the
  pads (a pad is at most the span divided among the sectors), and the pad is left as a gap,
  half on each side. The gap is an angle, so it widens outward; d3.arc's has parallel edges.
  Unlike d3.pie, only sectors that draw take a pad: a zero value is a sector of no width, and
  a missing, hidden or filtered-out row takes neither a share nor a pad. With `by`, each
  sector's pad comes out of its own share instead, so the rings align; a sector loses at most
  half its width to it, so a very small sector gets a narrower gap.
- A negative value is a data error that names its row.
- `innerRadius` and `outerRadius` are fractions of the disk's radius (0 and 1 by default);
  `innerRadius` above 0 makes a donut.
- In a polar Plot or Frame the pie fills the disk, and its radii are the frame's y values: the
  disk's edge is the top of the y domain, which by default is the pie's own outer radius, so
  give the frame `y={{ domain: [0, 1] }}` for an `outerRadius` below 1 to leave a margin. In a
  Cartesian frame (a default Plot) the Pie places a polar Frame of its own: centered in the
  frame's domain with the disk across 90% of its shorter side, or where `placement` says
  (`anchor` in data coordinates, `size` in pixels), so a pie can be an inset beside other
  marks. A Pie needs a 2D plot.
- `label` writes text at each sector's centroid (its mid angle and mid radius): "category",
  "value", "percent", a column (as it is, or formatted if numeric) or an expression. Numbers
  are formatted with `sectorLabelFormat`, a d3-format specifier (".0%" for percent, ",.7~r"
  otherwise); `textColor` and `fontSize` style them. A label whose box (estimated from its
  length and the font size at the pie's drawn size) would overlap a larger sector's is hidden.
- `fill` defaults to the category, so the legend lists the categories; hover and select
  highlight sectors, and picking reports the row. With a `key` on the data and `animation` on,
  an update tweens the angles: each sector grows or shrinks in place.
- `by` draws one pie per group in the same disk, as concentric rings (the first group
  innermost, a pad's width apart), each summing to its own total. In row order, a ring's
  sectors start and end where the inner sectors whose values they sum do (a sunburst); `sort`
  sorts each ring on its own, which breaks that alignment. For pies side by side, put
  the Pie in a Facet: `<Facet data={sales} column="year"><Plot height={240}><Pie .../></Plot></Facet>`.
- `endpoint({at})` is "center" (a sector's centroid), "outer" or "inner" (the middle of its
  outer or inner arc); as a polar Rect's, "left" and "right" are the middles of its start and
  end edges, "bottom" and "top" the same points as "inner" and "outer". Connections do not yet follow a Pie that placed its own Frame (pixel-
  anchored Frames are not followed); a Pie in a polar Plot or Frame connects.

See the `pie`, `donut` and `pie-facet` gallery examples and `python/examples/72_pie.py`.

`Plot` defaults to `loading="atomic"`: it reserves layout immediately and reveals the first complete rendered frame when preparation settles. Use `loading="progressive"` to show marks as they mount. Axis settings are grouped under **Frame**, **X/Y/Z** (or **Angle/Radius/Height** for polar views), and **Appearance**; the underlying prop names and saved settings remain unchanged.

## Sankey flows

`Sankey value="value"` lays out a weighted acyclic graph with d3-sankey. Supply node/edge tables and their endpoint mapping through GraphData, which infers the nodes when no node table is given. Nodes expose `x0`, `x1`, `y0`, `y1`, center `x`/`y`/`position`, `depth`, and `throughput`. Edges keep their input columns and expose `startLower`, `endLower`, `startUpper`, and `endUpper` attachment positions. `<Edges><Flow startLower="startLower" endLower="endLower" startUpper="startUpper" endUpper="endUpper" /></Edges>` draws curved filled bands. Negative or nonfinite values, cycles, and self-loops are errors. See the `sankey-flow` gallery example and `python/examples/50_sankey.py`.
