# Delaunay

The Delaunay triangulation of points, as edges for Segments.

## Example

```svelte
<script>
  import { Plot, Delaunay, Segments } from "hmplot";
  const data = { x: [0, 2, 4, 1, 3, 2], y: [0, 0, 0, 2, 2, 4] };
</script>

<Plot {data} height={300} axes2d>
  <Delaunay x="x" y="y">
    <Segments start="start" end="end" />
  </Delaunay>
</Plot>
```

## Options

- `name` (`string`): Names the transform, so a Facet's getTransform(name) reaches its copy in every cell.
- `x` (`column`): The points' x column. Each output row is an edge from `start` to `end`, between the rows numbered `source` and `target`.
- `y` (`column`): The points' y column.

## Usage

Delaunay makes the triangulation's edges, a row each: `start` and `end` for Segments, and `source` and `target`, the two points' rows.

## Related examples

- [Voronoi cells, hulls and a Delaunay triangulation](/HMPlot/examples/voronoi.md)
