# hmplot/tiles

Load, place and style vector tiles yourself; the VectorTile mark does all of it for you.

## Example

```svelte
import { tileAt, tileBounds, loadVectorTiles, DEFAULT_TILES } from "hmplot/tiles";

const tile = tileAt([-73.99, 40.73], 12);   // [12, 1206, 1539]
const [west, south, east, north] = tileBounds(tile);
const features = await loadVectorTiles(DEFAULT_TILES.url, [tile]);
```

## Exports

- `tileAt([longitude, latitude], z)` (`[z, x, y]`): The tile that contains a point at zoom z (an integer, 0 to 30); latitudes past Web Mercator's ±85.05° clamp.
- `tileBounds([z, x, y])` (`[west, south, east, north]`): A tile's box in degrees.
- `loadVectorTiles(url, tiles, {signal, init, clip, layers})` (`Promise<FeatureCollection>`): Fetches and decodes Mapbox Vector Tiles into one GeoJSON FeatureCollection in degrees, each feature's source layer in properties.layerName; VectorTile's data= takes it. url: a {z}/{x}/{y} template or a function of { z, x, y }. clip (default true) cuts geometry at each tile's edge; layers(name) chooses source layers. An HTTP error names the status and URL; a 204 or an empty body is an empty tile.
- `localPlane(origin, unitsPerMeter)` (`([lon, lat]) => [x, y]`): A local plane around origin ([longitude, latitude]): meters east and north of it, times unitsPerMeter (default 1). Within a few tens of kilometers, lengths are off by well under 1%.
- `DEFAULT_TILES` (`{ url, attribution, maxZoom }`): The tiles VectorTile draws without a url: VersaTiles' OpenStreetMap tiles (Shortbread schema, zoom 0 to 14, no key), with the credit their licenses ask for.
- `vectorTileScheme(theme)` (`scheme`): VectorTile's part styles from a theme's colors (background, palette, text), as a theme's vectorTile section or VectorTile's scheme= takes them.

## Usage

The [VectorTile](vector-tile) mark loads, decodes, places and styles tiles itself, from `tile`, `tiles` or a `bounds` box, or following the view. These helpers are for doing a part of that yourself: finding the tiles for a place (`tileAt`, `tileBounds`), loading them once and passing the result as VectorTile's `data` or to a GeoJSON mark (`loadVectorTiles`), placing other data in the meters of a local map (`localPlane`), or styling a basemap from a theme (`vectorTileScheme`).

Tile coordinates are the standard XYZ ("slippy map") ones: zoom, then the column from the west and the row from the north, in Web Mercator. `DEFAULT_TILES` needs no key and allows any origin; show its `attribution` wherever the tiles are shown, as their licenses ask. Another tile server's `url` is a template with `{z}`, `{x}` and `{y}`, as in its documentation. See docs/VECTOR-TILES.md.

These helpers are JavaScript only. In Python, VectorTile takes `tile`, `tiles` and `bounds` the same way, and exported pages embed the tiles they drew.

## Related examples

- [Vector tiles that follow the view](/HMPlot/examples/vector-tiles.md)
