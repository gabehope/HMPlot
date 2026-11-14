# Voronoi cells, hulls and a Delaunay triangulation

Each penguin's Voronoi cell (hover one to highlight its penguin), each species' convex hull, and the Delaunay triangulation, drawn by Polygon and Segments.

## Svelte

```svelte
<Plot axes2d>
  <Voronoi x="bill_length_mm" y="bill_depth_mm">
    <Polygon fill="species" opacity={0.3} hover respond="hovered" />
  </Voronoi>
  <Points x="bill_length_mm" y="bill_depth_mm" fill="species" respond="hovered" />
</Plot>
<Plot axes2d>
  <Hull x="bill_length_mm" y="bill_depth_mm" by="species">
    <Polygon fill="species" opacity={0.25} outlineWidth={1.5} />
  </Hull>
</Plot>
<Plot axes2d>
  <Delaunay x="bill_length_mm" y="bill_depth_mm">
    <Segments start="start" end="end" />
  </Delaunay>
</Plot>
```
