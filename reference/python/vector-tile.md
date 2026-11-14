# VectorTile

A basemap of land, water, roads, buildings and place names from vector map tiles.

## Example

```python
import hmplot as hm

with hm.Plot(coordinates="spherical", projection="mercator", tone_mapping=0, height=300) as plot:
    hm.VectorTile(tile=[14, 9014, 4818], live=False)
plot
```

## Options

Keywords are snake_case.

- `url` (`string | ({z, x, y}) => string`): Where tiles load from: a URL template with {z}, {x} and {y}, or in JavaScript a function of {z, x, y}. In Svelte markup pass the template as a JavaScript string: url={"https://.../{z}/{x}/{y}.pbf"}. Default: VersaTiles' OpenStreetMap tiles, which need no key and are credited on the plot.
- `tile` (`[number, number, number]`): One tile to load, [z, x, y]: its zoom, its column from the west and its row from the north.
- `tiles` (`[number, number, number][]`): Several tiles to load (at most 16), each clipped to its own square.
- `bounds` (`[number, number, number, number]`): A box [west, south, east, north]: load every tile it touches at zoom (at most 16). In degrees.
- `zoom` (`number`): The zoom at which bounds picks its tiles.
- `data` (`object`): Already decoded tiles to draw instead of loading any: a GeoJSON FeatureCollection whose features name their source layer in properties.layerName.
- `styles` (`object`): Per part (water, roads, buildings, places, ...): false hides it, or {fill, color, width, size, opacity, outline_color, outline_width} changes its look over the scheme.
- `scheme` (`string | object`): The basemap's colors: a theme preset's name ("dark", "sea", ...), "default", or part styles as for styles. Default: the enclosing Theme's basemap colors (derived from its colors when it has none), else "default".
- `source_layers` (`object`): Assign a tileset's source layers to parts, {layer: part}, or hide one with false, before the built-in rules.
- `clip` (`boolean`): End each tile's geometry at the tile's edge (tiles overlap by a buffer). Default: `True`.
- `fit` (`boolean`): Frame the tiles when they change, in a 2D map. Default: `True`.
- `origin` (`[number, number]`): Draw in a local plane instead of longitude and latitude: meters east and north of this [longitude, latitude], times units_per_meter. For Cartesian and 3D plots. In degrees.
- `units_per_meter` (`number`): The plot units per meter in the local plane that origin sets. Default: `1`.
- `plane` (`"xy" | "xz"`): In a Cartesian 3D plot, "xz" lays the tiles on the horizontal ground plane. Default: `"xy"`.
- `snapshot` (`boolean`): In an HTML export of a scene, embed the tiles on screen as tile_data; false exports only the url, so the page loads its tiles when it opens. Default: `True`.
- `live` (`boolean`): In a 2D view (a Cartesian plot, or a map in any projection, the globe included), and under a 3D flyover camera (with origin and plane="xz"), also load the tiles the camera shows as it moves. Needs opaque styles; not inside nested Frames. Default: `True`.
- `min_zoom` (`number`): The coarsest zoom live tiles load. Default: `0`.
- `max_zoom` (`number`): The finest zoom live tiles load; zoomed in further, those tiles stretch. Default: `14`.
- `zoom_bias` (`number`): Live tile detail offset in zoom levels, between -4 and 4: +1 doubles linear detail at the same view scale or camera height; -1 uses coarser tiles. Zoom limits and the tile budget still apply. Default: `0`.
- `attribution` (`string | false`): A credit line in the plot's lower-left corner, kept in every export (most tile licenses require one); false hides it. Default: the default tiles' credit when there is no url, else none.
- `tile_data` (`object[]`): Embedded tiles instead of loading them: [{tile: [z, x, y], bytes}], bytes as base64 text or a Uint8Array (null for an empty tile). Exported pages carry their tiles this way.
- `extrude_buildings` (`boolean`): Under a 3D flyover camera, stand the tiles' buildings up from their height tags (5 meters when missing) with flat roofs; false draws flat footprints. 2D maps are always flat. Default: `True`.
- `name` (`string`): The name of its group of parts in the settings pane.
- `visible` (`boolean`): Show or hide every part.
- `opacity` (`number`): A multiplier on every part's opacity; live tiles need 1.

## Usage

`VectorTile` loads Mapbox Vector Tiles that you name by their coordinates, `tile={[z, x, y]}`, a list of `tiles`, or a longitude/latitude `bounds` box at a `zoom`, from a `url` template with `{z}`, `{x}` and `{y}`. It decodes them and draws them as a basemap: land and parks, water, buildings, roads, railways, boundaries and place names, each a part with its own style. Put it in a 2D map (`coordinates="spherical" projection="mercator"`); the map frames the tiles, and other marks overlay them in longitude and latitude.

In a 2D view (a Cartesian plot, or a map in any projection, the globe included) the basemap is live by default: as the camera moves, the tiles it shows load at the nearest zoom, over the requested tiles, which stay where live tiles fail. Roads, landuse and place names show by zoom and kind, as VersaTiles' own style shows them, and names that would overlap are left out. Live tiles need opaque styles; `minZoom` and `maxZoom` bound their zoom. Inside nested Frames, in 3D views other than the flyover below, and with `live={false}`, the requested tiles load once and pan and zoom move over them.

Under a 3D flyover camera (`type="3d" cameraMode="flyover"`, the tiles in a local plane with `origin`, `unitsPerMeter` and `plane="xz"`, and linear axes) the basemap lies flat on the ground and is live too: the tiles of a square of about four camera heights around the camera load, at a zoom from the camera's height, and the overview and the plot's `fog` cover the distance a low camera sees past them. The buildings of the tiles that have them stand up (`extrudeBuildings`, default true; "3D buildings" in the settings pane): `height` meters tall above `min_height` as VersaTiles' zoom-14 tiles tag them, 5 meters without a height, flat roofs, the buildings' fill shaded. `extrudeBuildings={false}` draws flat footprints, and `styles={{ buildings: false }}` hides both. With `live={false}` the requested tiles draw the same way and nothing else loads. 2D maps are always flat. See docs/VECTOR-TILES.md, "Live tiles under a 3D flyover". A new tile list loads at once, supersedes a load in flight, and replaces the tiles on screen when it arrives. `attribution` puts a credit line in the plot's lower-left corner, kept in every export. The default tiles' credit is short (OpenStreetMap and ESA WorldCover); ESA's full form, "© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium", belongs in a publication's credits or a page's footer (THIRD_PARTY_NOTICES.md lists every source's terms). `styles` hides or restyles parts without a reload; `sourceLayers` assigns a custom tileset's layers to parts. In Svelte markup, pass the URL template as a JavaScript string, `url={"https://.../{z}/{x}/{y}.pbf"}`. `bind:this` gives a `VectorTileHandle`: `whenSettled()` resolves once the requested loads are drawn (or failed), `getResult()` returns the tiles on screen and their decoded features (outside live mode), `getTileData()` the tiles' bytes as `tileData` carries them, `getParts()` each part's GeoJSON mark, and `getStatus()` the load state, with the live zoom and tile counts. See docs/VECTOR-TILES.md.

`zoomBias` adjusts live detail at the same view scale or flyover height: `+1` asks for
twice the linear detail, `-1` for coarser tiles, and `0` keeps automatic selection. Pass a
finite number between -4 and 4. `minZoom`, `maxZoom` and the live tile budget still apply,
so increasing detail cannot load unlimited tiles. The settings pane calls this **Tile detail**.
Python uses `zoom_bias`.

> **SVG and PDF export**
>
> **Partly an image.** SVG and PDF exports draw the filled areas (land, water, parks, buildings) as an image at the export's raster DPI, and `mode="vector"` refuses them. Place names stay text. Roads, paths, railways and boundaries are vector paths in a static basemap (`live` off) and part of the image in a live one, the default in a 2D view. In a 3D plot, a flyover's basemap and extruded buildings included, the whole basemap is part of the plot's image. See [what is not exported as vector](/HMPlot/docs/export.md).

## HTML that opens offline and stays live online

Keep `snapshot` enabled (the default) on VectorTile. `live=true` controls fetching new tiles
while navigating; it does not disable embedding. Python's `hm.export_html` normally draws
in headless Chrome and embeds the requested tiles and currently visible live tiles as
`tileData`, while keeping `url` and `live` for online navigation:

```python
with hm.Plot(coordinates="spherical", projection="mercator") as chart:
    hm.VectorTile(tile=[14, 8157, 6111], live=True)  # snapshot=True by default
hm.export_html(chart, "chart.html")
```

The export browser must be able to load the initial tiles. If it cannot reach the service,
provide local MVT bytes with `tile_data=[{"tile": [z, x, y], "bytes": tile_bytes}]` (JavaScript:
`tileData`). Include the requested tiles and any surrounding area needed offline. The
embedded area remains visible offline; navigating beyond it needs the tile service.

`VectorTile(snapshot=False)` deliberately leaves externally loaded tile bytes out of the
page. It requires network access when opened. The separate `hm.export_html(..., snapshot=False)`
skips the headless snapshot/export pass, so externally loaded tiles cannot be captured then
either. Neither option is suitable for making a network-sourced basemap self-contained.
A tile-fetch failure during export means there are no downloaded bytes to embed: keep the
offline requirement, supply local tile bytes or restore service access, and export again.

## Related examples

- [Vector tiles that follow the view](/HMPlot/examples/vector-tiles.md)
