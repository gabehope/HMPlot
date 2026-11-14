# registerShape

Add a point shape by name: a polygon or an SVG path in the unit square.

## Example

```svelte
registerShape("kite", [[0, 1], [0.7, 0.2], [0, -1], [-0.7, 0.2]]);
<Points x="x" y="y" shape="kite" />
```

## Parameters

- `name` (`string`): The shape's name, used wherever a shape is: shape=, a shapeScale, a legend. Not a built-in shape's name.
- `definition` (`number[][] | string | object`): [x, y] vertices in [-1, 1] (y up), SVG path data in the same space, or { path, fillRule, viewBox }.

## Usage

There are 23 built-in shapes: `circle`, `triangle`, `diamond`, `square`, `hexagon`, `plus`, `cross`, `star`, `triangle-down`, `triangle-left`, `triangle-right`, `pentagon`, `octagon`, `wye`, `arrow`, `chevron`, `circle-open`, `square-open`, `diamond-open`, `triangle-open`, `heart`, `pin` and `drop`. Category shape palettes use them in that order.

`registerShape(name, definition)` adds a shape. The definition is a polygon (`[x, y]` vertices in the unit square [-1, 1] with y up), SVG path data in the same coordinates (M, L, H, V, C, S, Q, T, A, Z, relative forms included, with several subpaths), or `{ path, fillRule, viewBox }`. `viewBox: [minX, minY, width, height]` registers a path in its own coordinates, y down as icon sets draw them, fitted into the unit square. `fillRule` (`"nonzero"`, the default, or `"evenodd"`) decides what is inside where outlines overlap: holes, rings, shapes that cross themselves. The name then works anywhere a built-in shape does: `shape="name"` for every point, a `shapeScale` range for a shape column, category legends, and SVG export, where curves stay curves. `shape` itself is a channel: a shape name, a column of categories, or one shape name per row. Python uses `hm.register_shape(name, definition, fill_rule=..., view_box=...)`, and themes can register shapes under `shapes`.

A page holds 256 shapes, built-ins included, and a shape has at most 4096 segments once its curves are flattened. Winding order does not matter for a simple polygon, and a closing vertex that repeats the first is dropped. Names are ASCII (a letter, then letters, digits, `_` or `-`), and a built-in shape's name cannot be registered again.

How a shape is drawn: the circle, and polygons of at most 16 edges that do not cross, from their exact outline; every other shape, and every shape in a shape column except the circle and square, from a signed distance field (one 128 × 128 layer per shape, built when the shape is registered). A shape column costs one texture read per pixel however many shapes a page has, and registering a shape rebuilds no mark. Corners drawn from the field round slightly on points larger than about 256 pixels.

Each symbol is drawn on a square the size of the point, so when a mark sets `rotation`, outlines outside the unit circle (the corners of the square) are cut off at the square's edge; only the built-in `square` shrinks to fit. Keep rotated shapes within radius 1.

`shape` resolves columns first, as `fill` does: if the data has a column named `kite`, `shape="kite"` maps that column even after `registerShape("kite", ...)`. Use `literal("kite")` for the shape itself.

## Related examples

- [Custom point shapes](/HMPlot/examples/custom-shapes.md)
