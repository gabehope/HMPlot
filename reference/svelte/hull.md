# Hull

The convex hull around points, one per group, as triangles for Polygon.

## Example

```svelte
<script>
  import { Plot, Hull, Polygon } from "hmplot";
  const data = { x: [1, 3, 2, 4, 2.5, 3], y: [1, 1, 3, 3, 2, 2.5] };
</script>

<Plot {data} height={300} axes2d>
  <Hull x="x" y="y">
    <Polygon />
  </Hull>
</Plot>
```

## Options

- `name` (`string`): Names the transform, so a Facet's getTransform(name) reaches its copy in every cell.
- `x` (`column`): The points' x column.
- `y` (`column`): The points' y column.
- `by` (`column | column[]`): Groups, a hull each, carrying the group's first row (one hull around every point without it).

## Usage

Hull makes the convex hull of each group of `by` as triangles for Polygon, carrying the group's first row: `fill="species"` colors each hull by its group.

## Related examples

- [Voronoi cells, hulls and a Delaunay triangulation](/HMPlot/examples/voronoi.md)
