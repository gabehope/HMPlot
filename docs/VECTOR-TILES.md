# Vector tiles: a basemap that follows the view

`VectorTile` loads [Mapbox Vector Tiles](https://github.com/mapbox/vector-tile-spec) (MVT, the
format of most vector tile servers) that you name by their coordinates. It decodes them and
draws them as a styled basemap: land and parks, water, buildings, roads, railways, boundaries
and place names. Put it in a 2D map. The map frames the tiles, and other marks draw over them
in longitude and latitude. In a flat 2D view the basemap is live: the tiles the camera shows
load as it moves (see "Live tiles"). Under a 3D flyover camera the basemap lies on the ground,
follows the camera, and its buildings stand up (see "Live tiles under a 3D flyover").

```svelte
<script>
  import { Plot, VectorTile, Points } from "hmplot";
</script>

<Plot coordinates="spherical" projection="mercator" toneMapping={0} height={480}>
  <VectorTile url={"https://tiles.example.org/{z}/{x}/{y}.pbf"} tile={[14, 9014, 4818]} />
  <Points position={[[18.0716, 59.3268]]} size={6} fill="#d6453d" />
</Plot>
```

```python
with hm.Plot(coordinates="spherical", projection="mercator", tone_mapping=0, height=480) as plot:
    tiles = hm.VectorTile(url="https://tiles.example.org/{z}/{x}/{y}.pbf", tile=(14, 9014, 4818))
    hm.Points(position=[[18.0716, 59.3268]], size=6, fill="#d6453d")
plot

tiles.update(tile=(14, 9015, 4818))   # the browser loads the next tile
```

`hm.VectorTile(...)` displayed on its own is shown in such a map.

The tiles you name (the requested tiles) load first, and the map frames them. In a 2D view (a
flat map, the orthographic globe, or a Cartesian plot) the tiles the camera shows then load too,
as it moves, and so they do under a 3D flyover camera over a local plane. In other 3D views,
inside nested Frames, and with `live={false}`, the requested tiles are all that draws: panning
and zooming move over them.

The gallery example "Vector tiles at fixed coordinates" (`vector-tiles`) switches between four
bundled tiles. The "Manhattan building flyover" draws twelve tiles in a 3D scene, under the
city's building footprints (see "A local plane" below), or streams VersaTiles' tiles around the
camera with their own buildings standing (see "Live tiles under a 3D flyover").

## Tiles and URLs

- Without `url` (and without `data`), the tiles come from VersaTiles
  (`https://tiles.versatiles.org/tiles/osm/{z}/{x}/{y}`: OpenStreetMap data, Shortbread schema, zoom
  0 to 14, no key), and their credit draws in the plot's lower-left corner (`DEFAULT_TILES` in JavaScript).
  `attribution` replaces the credit, and `attribution={false}` hides it. A page with a default
  VectorTile makes requests to VersaTiles' server.
- `tile={[z, x, y]}` names one tile: zoom `z`, column `x` (0 at longitude −180, increasing
  east) and row `y` (0 at the north edge of Web Mercator, increasing south). These are the
  standard "slippy map" (XYZ) tile coordinates.
- `tiles={[[z, x, y], ...]}` loads several tiles. Each is clipped to its own square, so
  neighbours meet without overlapping.
- `bounds={[west, south, east, north]}` with `zoom` loads every tile that the
  longitude/latitude box touches at that zoom.
- One VectorTile loads at most 16 tiles: it draws a fixed area, not a streamed map.
- In JavaScript, `tileAt([lon, lat], z)` gives the tile containing a point, and
  `tileBounds([z, x, y])` gives a tile's box. These helpers, with `loadVectorTiles`, `localPlane`,
  `DEFAULT_TILES` and `vectorTileScheme`, come from `hmplot/tiles`.
- `url` is a template with `{z}`, `{x}` and `{y}`, as in every tile server's documentation.
  - In Svelte markup, pass it as a JavaScript string, `url={"https://.../{z}/{x}/{y}.pbf"}`.
    In a quoted attribute, Svelte reads `{z}` as an expression.
  - In JavaScript, `url` may also be a function of `{ z, x, y }`.
  - A gzipped tile served as a plain file (without `Content-Encoding`) is gunzipped.
- `data`: already decoded tiles instead of a url. This is a GeoJSON FeatureCollection whose
  features name their source layer in `properties.layerName`, as `loadVectorTiles(url, tiles)`
  returns it. Exports embed tiles this way.

## Live tiles

`live` (default true) applies in a 2D view: a Cartesian plot (longitude and latitude as x and y,
or the `origin` local plane below), or a map in any projection, the orthographic globe included,
outside nested Frames.

On Equal Earth, Natural Earth and Albers maps, tile geometry is cut into the longitude
extent centered on `projectionCenter`, matching ordinary point and line marks. A change to
that extent or to the projection prepares the visible tiles again. Orthographic rotation
and camera zoom keep existing geometry; moving one tile slot preserves the state objects
of unchanged slots.

- **Which tiles.** As the camera moves, the tiles it shows load at the nearest whole zoom, as
  deck.gl's TileLayer picks it: tiles show at 0.71 to 1.41 times 512 CSS pixels (tile zoom
  follows CSS pixels, not device pixels: lines keep their pixel widths at any DPR). Zooming in,
  the level on screen stays until the view is 0.15 zooms past half-way to the next (its tiles
  up to 1.57 times their size), so a zoom that wavers around half-way does not switch levels
  back and forth; zooming out switches at half-way. At most 48 tiles at once; past that, one
  zoom coarser. Ranges are counted before their tiles are listed, so a view of a whole
  hemisphere at zoom 14 selects as quickly as a city.
  - On the globe the view's box is its visible part in longitude and latitude, and the zoom
    fits its center. With the globe's edge in view the box covers much of a hemisphere, and the
    tile cap can make the center coarser than a flat map's. Globe tiles are subdivided to follow
    the sphere (an eighth of a tile at most, 1.2 to 1.8 times a flat tile's work), and the
    world square covers the poles past Web Mercator's 85 degrees (sea in the north, land in the
    south).
  - Once the camera has been still for 150 ms, the tiles around the view load too (at most
    32), ahead of a pan: fetched and prepared, and drawn only when the view reaches them. While
    the view pans at one zoom, the next tiles ahead of it load the same way (at most 8).
  - `minZoom` and `maxZoom` (default 0 and 14, VersaTiles' range) bound the zoom loaded. Zoomed in
    past `maxZoom`, the `maxZoom` tiles stretch; the camera is not limited.
  - Positions are float32, so rounding grows as the view zooms in: about a fifth of a pixel for
    a zoom-14 tile at its native size, doubling with each level deeper. The `origin` local
    plane does not have this problem near its origin.
- **Layers.** Finer tiles draw over coarser ones, whatever they are: the world square, the
  zoom-0 tile, the overview, the requested tiles, the tiles an exported page carries, the
  previous zoom level, the current one.
  - The world square is the map's background part over the whole map (no request): where
    nothing has loaded yet the map shows its land color, not the plot's.
  - The zoom-0 tile, the whole world at the coarsest level, always loads (unless `minZoom` is
    above 0), so a globe's minimap shows every continent and a quick pan shows coarse land and
    water rather than the bare square.
  - The overview is the one to four tiles three zooms coarser that cover the view. They load
    first and reach eight times as far each way, so a quick zoom out or pan shows them, coarse,
    until the live level arrives.
  - The requested tiles always load and draw under the live levels, so where a live tile is
    missing or fails, they show.
  - Zooming in or out, the previous level stays until the new one shows every tile it selects
    (at most 12 of its tiles).
  - A request to VersaTiles takes 300–450 ms, and preparing a tile 5–30 ms (about 100 ms for a
    zoom-5 coast with hundreds of islands).
- **Opaque styles only.** A tile covers the coarser tiles under it with its background, so
  every part a live VectorTile draws must be opaque (opacity 1, colors without alpha), with the
  background part shown, and the mark's own `opacity` 1. Anything else is an error on the plot
  naming the part, for example `VectorTile: live tiles need opaque styles, but part "water" has
  opacity 0.5. Use opaque colors, or pass live={false}.` Every preset scheme is opaque.
- **Failures.** A live tile's 404 or 204 is an empty tile. Any other failure leaves what is
  under the tile, shows no error on the plot, reaches `onerror({ error, tile })`, and logs one
  diagnostic; the tile is not requested again for 10 seconds, so an offline page does not keep
  requesting, and is asked for again after those 10 seconds while the view still shows it. The
  requested tiles fail as before: the error shows on the plot.
- **Requests.** At most 16 at once, as MapLibre: an HTTP/2 server (VersaTiles, most tile CDNs)
  answers a view's tiles in one round trip, and the browser still holds an HTTP/1 server to 6.
  They start 16 ms after the camera last asked for new ones, and at most 100 ms after the first
  of them (a camera asking for tiles every frame put them all off), the view's center first. A
  tile the view leaves is dropped before its request starts, and aborted if it is under way.
- **Caches** (each least recently used first out):
  - each tile's bytes: 256 tiles and 64 MB, but the tiles in use always stay (exports embed the
    ones on screen), so a tile seen again is prepared again from them, not fetched;
  - prepared tiles (a worker's arrays): 48 tiles and 48 MB, so a tile seen again shows without
    preparing (a dense city tile's arrays are about 2 MB);
  - each worker keeps the features of the last 96 tiles it prepared, and of at most 8 MB of their
    bytes, for clicks; a click on a tile whose features are forgotten prepares it again;
  - tile slots (below) that hold no tile keep their buffers for the next tiles; past 64 MB of
    them, once the view has been still for a second, the largest goes, one every 250 ms.
- **Place names** come from the tiles shown at most one zoom finer than the live level (zoomed
  out, a requested zoom-14 tile's names would stack on one point), and the finest tile at a
  place names it. Which show is placed again when the live level changes and once the camera
  has been still for 150 ms (see "Default features and names").
- **Automatic bounds.** In a Cartesian plot the axes' automatic bounds come from the requested
  tiles, never from live tiles, so loading cannot move the view it follows.
- **Status.** `getStatus().live` has the zoom, the tiles selected, shown and failed, the ring,
  the previous level's tiles still drawn, the overview tiles shown, the slots, the requests
  queued or running, and the selection's center.
- **Clicks.** `onclick` works on live tiles; `event.feature` is the tile feature, as on the
  requested tiles. A mark that only takes clicks draws its picking pass when a click asks for
  it, not with every frame (docs/PERFORMANCE.md, "Interaction"): a click waits for one frame.
- **Cost.** A live tile is decoded, split into parts and triangulated in a worker; the main
  thread colors it from the styles (about a millisecond for 36,000 triangles) and writes its
  arrays straight into a tile slot's buffers, marks made once and reused.
  - Workers: 8–13 ms for a zoom-13 or 14 city tile, 20–30 ms at zooms 8 to 10, about 100 ms for
    a zoom-5 coast, 75 ms for the densest bundled tile (Amsterdam at zoom 14, 670 KB, 36,000
    triangles). Hiding a part skips its source layers: a zoom-14 Stockholm tile takes 4 ms
    without buildings. Zoomed out, land and water are most of the work.
  - A change of colors, widths or sizes in `styles` repaints the tiles on screen with no worker
    job; showing or hiding a part, or an outline, prepares them again from their bytes.
  - A slot is made at its first tile's size and keeps the size of the largest tile it has held
    (a zoom-8 tile has about 30,000 triangles, a city tile about 5,000); a free slot goes to the
    tile it fits. three.js builds a slot's materials in the first frame that draws it (about 30
    ms in the dev server, 10 ms in a production build), so new or grown slots take turns, one a
    frame. Its points mark is made only for a tile with points.
  - Zooming out six levels and back over real VersaTiles tiles at DPR 2 (1400 x 900): on the
    third pass about 58 frames a second (p90 17.6 ms), no new GPU pipelines. A new level shows
    in 0.35–1 s, most of it the network; a level seen before in under 0.1 s (TODO 35).
  - Over dense tiles replayed locally, before and after TODO 63 (frame gaps, completed frames,
    GPU memory): docs/PERFORMANCE.md, "Live vector tiles".

## A local plane (Cartesian and 3D scenes)

A map plot draws longitude and latitude. A Cartesian plot, and a 3D scene in particular, draws
plain coordinates, often meters around a place. There, give the tiles a local plane:

- `origin={[lon, lat]}` draws each point at the meters east and north of the origin, times
  `unitsPerMeter` (default 1). The plane is equirectangular, with the origin's latitude
  scale: x = (lon − lon₀) · 111,320 · cos(lat₀), y = (lat − lat₀) · 111,320. Within a few
  tens of kilometers of the origin, lengths are off by well under 1%. `localPlane(origin,
  unitsPerMeter)` (JavaScript) gives the same projection for your own data.
- `plane="xz"` (Cartesian 3D) lays the tiles on the horizontal ground plane, as GeoJSON's
  `plane` does.
- Under a flyover camera (`cameraMode="flyover"`) with an `origin` and `plane="xz"`, the tiles
  draw as a flat basemap under the 3D marks (see "Live tiles under a 3D flyover").
- Elsewhere in a Cartesian 3D view (an orbit camera, or no `origin`), every part lies in one
  plane, so on depth alone coplanar parts would flicker through each other. Each part therefore
  sits one meter (in the local plane; 0.00001 units without an origin) below the next, and all
  of them sit below the plane, so extruded marks on it rise out of the map.
- `fit` does nothing there: give the plot its domains.

The Manhattan flyover draws its ground this way, in the plane its building footprints were
projected into (scripts/build-manhattan-buildings.py). Its twelve bundled tiles stay as they are
(`live={false}`): the bundle has no finer ones.

```svelte
<VectorTile url={"/data/vector-tiles/{z}/{x}/{y}.mvt"} bounds={[-74.068, 40.669, -73.885, 40.895]}
  zoom={12} live={false} origin={[-73.95, 40.72]} unitsPerMeter={0.004} plane="xz"
  styles={{ places: false, buildings: false }} />
```

## Live tiles under a 3D flyover

In a Cartesian 3D plot with `cameraMode="flyover"`, a VectorTile with an `origin`, `plane="xz"`
and linear x, y and z axes (TODO 66) is a flat basemap on the ground that follows the camera,
and the tiles' buildings stand up. Other 3D views (an orbit camera, a camera whose up is not
+y, nested or placed Frames, log or datetime axes) keep the requested tiles as above, and 2D
views are unchanged.

```svelte
<Plot type="3d" cameraMode="flyover" x={{ domain: [-50, 50], range: [-50, 50] }}
  y={{ domain: [-50, 50], range: [-50, 50] }} z={{ domain: [0, 30], range: [0, 30] }}>
  <!-- VersaTiles around Midtown, 0.01 units a meter (a 100 m building stands 1 unit tall). -->
  <VectorTile bounds={[-74.0, 40.74, -73.97, 40.77]} zoom={14}
    origin={[-73.985, 40.755]} unitsPerMeter={0.01} plane="xz" styles={{ places: false }} />
</Plot>
```

```python
with hm.Plot(type="3d", camera_mode="flyover", x={"domain": [-50, 50], "range": [-50, 50]},
             y={"domain": [-50, 50], "range": [-50, 50]}, z={"domain": [0, 30], "range": [0, 30]}) as plot:
    hm.VectorTile(bounds=(-74.0, 40.74, -73.97, 40.77), zoom=14, origin=(-73.985, 40.755),
                  units_per_meter=0.01, plane="xz", styles={"places": False},
                  extrude_buildings=True)   # False: flat footprints
plot
```

- **Which tiles: the camera's height.** Not the visible frustum, which reaches the horizon: the
  tiles of a square around the camera, 4 camera heights each way (the height above the ground,
  at least 2 meters; wider for a wider lens or canvas, narrower for a zoomed one, within a factor
  of 2), centered up to one height ahead along the view (looking straight down, right under it).
  The zoom is the one whose tiles have a top-down view's ground resolution from that height,
  2 h tan(fov / 2) over the canvas's CSS height in meters, at the nearest whole zoom with the
  2D hysteresis. `zoomBias` offsets that zoom (-4 to 4, default 0): +1 requests twice the linear
  detail at the same height, -1 requests coarser tiles. Selection is still coarsened while the
  square holds more than 48 tiles. A finer level than the
  one on screen must fit in 36 of them, so a camera at the budget's edge does not switch levels
  back and forth as it climbs and descends. Looking toward the horizon, the ground past the square
  shows the overview (three zooms coarser), the zoom-0 tile and the map's background; fog (the
  Plot's `effects` entry `{ kind: "fog", near, far }`) hides that edge. Accepted, not worked around: a low camera looking at the horizon
  sees past what loads.
- **Following the camera.** Moving, looking, climbing, a new lens or a resized canvas selects
  again, at most once a frame, through the same requests, workers, caches and slots as 2D (see
  "Live tiles"); a selection with the same tiles does nothing. Loading never moves the camera
  or the axes. `plot.whenSettled()` after `setCamera()` waits for the tiles the new view selects.
  Tiles loaded ahead of the view (the ring around a still view, the tiles ahead of a moving one)
  use at most 8 of the 16 requests, so the tiles a moving camera then shows find requests free.
- **Drawing.** The basemap lies flat in the ground plane (the z axis at 0) and draws first, in
  the parts' order and tile order, without depth: coplanar parts keep their order with no height
  offsets. A colorless plane then writes the ground's depth (under the camera, out to its far
  plane), and the buildings and every other 3D mark draw with depth as usual, so they stand on
  the map and hide what is behind them, fog fades the ground by distance, and a click on a
  building picks the building, not the map under it. The ground plane is not a mark: no legend,
  bounds, minimap or feature.
- **Buildings** (`extrudeBuildings`, default true; the settings pane's "3D buildings"): each
  building polygon of the live level's tiles (with a fixed basemap, the requested tiles') stands
  from its tags, as VersaTiles' Shortbread extension gives them at zoom 14:
  - `height` (meters) is the roof, `min_height` the base (default 0, clamped to [0, height]);
  - a building without a usable `height` stands 5 meters tall; a valid `height` of 0 stays flat;
  - `hide_3d` (the outline of a building whose parts are mapped) stays flat, and its parts
    (`part`) stand instead; with `extrudeBuildings={false}` the parts are left out and the outlines
    draw flat;
  - roofs are flat and heights approximate: no roof shapes, terrain or merging across tiles; a
    building cut by a tile's edge has no wall there (its neighbour draws the rest);
  - heights convert like positions: meters times `unitsPerMeter`, through the z axis (a z range
    larger than its domain exaggerates them);
  - they are the buildings part's fill, shaded without the scene's lights (roofs in the fill,
    walls darker, those facing south-west lighter), so a plot needs no lights for them.
  Other Shortbread tilesets may have no heights: their buildings stand 5 meters tall. Buildings
  exist at zoom 14 in VersaTiles' tiles, so they show below about 1.5 km (at a 520-pixel-high
  canvas); higher up, coarser tiles draw no buildings, and no zoom-14 tiles load to keep them.
  Changing levels, the new level's buildings stand once its tiles show. `styles.buildings=false`
  hides footprints and buildings; `extrudeBuildings={false}` keeps the footprints. Switching it
  prepares the tiles again from their bytes, with no request.
- **`live={false}`** draws the requested tiles the same way (flat, with their buildings standing),
  and loads nothing else. With translucent styles (only allowed with `live={false}`), the
  requested tiles draw as GeoJSON parts as in other 3D views, flat.
- **Status.** `getStatus().extruded` counts the tiles whose buildings stand; `live.center` is
  the selection's center.
- **Exports.** PNG draws the view as on screen; SVG and PDF draw a 3D plot as an image (see
  "Exports"). An HTML export embeds the requested and shown tiles and the camera, so the page
  opens on the exported view; offline it draws it from the embedded tiles (buildings included),
  online it streams again as the camera moves.
- **Cost** (dev server, DPR 2, a 1200 x 800 plot, the Amsterdam tile's 6,995 buildings at every
  zoom-14 tile): a 6 km flight at 400 m draws a frame every animation frame (p95 16.8 ms), with
  10 tiles standing at once; climbing to 4 km and back draws 99% of the frames, p95 50 ms.
  Each dense tile's buildings are about 127,000 triangles (25 ms more in a worker, 5 MB of
  arrays), and a slot holding them about 15 MB of GPU buffers: the session held 300–470 MB.
  docs/PERFORMANCE.md, "Live vector tiles in a 3D flyover", has the table.

## Schemes and themes

A scheme colors every part at once, and `styles` adjusts parts on top of it:

- The default is the enclosing `Theme`'s scheme, its `vectorTile` section. Every preset has one
  that matches it: under `<Theme value={themes.dark}>` the basemap is dark, under
  `themes.sea` blue-green, under `themes["8bit"]` bright. The default theme (minimal) has the
  colors in the table below.
- `scheme` picks one directly: a preset's name (`scheme="dark"`, in any spelling the presets
  accept), `"default"`, or part styles (`scheme={{ water: { fill: "#1e3a5f" }, ... }}`).
- A theme with colors of its own and no `vectorTile` section (a custom theme, or one extending a
  preset with a new background) gets a scheme derived from its colors:
  - land from its background;
  - water and parks from its palette's blue and green;
  - roads from the background toward its text color, and major roads from its orange accent;
  - names in its text color.
  In JavaScript, `vectorTileScheme(theme)` returns that scheme.
- A theme's `vectorTile` section takes the same keys as `styles`, so a custom theme can carry
  its own basemap:

```js
const night = createTheme({ extends: "dark", vectorTile: { water: { fill: "#0b3d5c" }, majorRoads: { color: "#f59e0b" } } });
```

## Parts and styles

Each part is a GeoJSON mark (a Text for place names), and the parts draw in this order:

| Part | Draws | Default (minimal) |
|---|---|---|
| `background` | the tile squares | fill `#f2efe9` |
| `land` | landuse and sites that are not green | fill `#e9e5dc` |
| `green` | parks, grass, woods, cemeteries, pitches | fill `#cfe5c0` |
| `water` | seas, lakes, rivers as areas | fill `#aad3df` |
| `waterways` | rivers, canals and streams as lines | color `#8cc1d4`, width 1.5 |
| `buildings` | building footprints | fill `#d9d0c9` |
| `other` | every source layer the rules do not know | fill `#d4d0c8`, color `#8f8a80`, width 1, size 5 |
| `paths` | footways, cycleways, steps, tracks | color `#fbfaf7`, width 0.8 |
| `roads` | streets and service roads | color `#ffffff`, width 2 |
| `majorRoads` | motorways, trunk, primary, secondary and tertiary roads | color `#f7cf8e`, width 3 |
| `railways` | rail, light rail, trams and subways above ground | color `#9a9a9a`, width 1 |
| `boundaries` | administrative boundaries | color `#a19bb4`, width 1.2 |
| `places` | names of countries, states, cities, towns, suburbs and neighbourhoods | color `#3d3a36`, size 13 |

- Widths and sizes are in pixels, at zoom 14. Roads, paths, railways and waterways thin as the
  zoom goes out (half the width three zooms out, at least 0.3 of it), and within a part the
  more important kinds are wider (motorways 1.35 times, tertiary roads 0.7, ramps 0.6); borders
  keep their width. Plots draw these colors exactly by default; a filmic tone mapping
  (`toneMapping={4}`) would mute them.
- The rules read each feature's source layer and its `kind`, `class` or `type`. They cover the
  common schemas:
  - Shortbread (VersaTiles, openstreetmap.org's vector tiles);
  - OpenMapTiles (MapTiler, OpenFreeMap);
  - Protomaps;
  - Mapbox Streets.
- Hidden by default:
  - address and POI points;
  - label-only layers (street and water names);
  - ferries and aerialways;
  - tunnels;
  - maritime borders (territorial waters) and borders finer than states.
- The source layers the style cannot draw are not decoded at all, nor the ones a tile's zoom
  does not draw (below).
- `styles` sets, per part, `false` to hide it, or an object that overrides its `fill`, `color`,
  `width`, `size`, `opacity`, `outlineColor` or `outlineWidth`. For example:
  `styles={{ buildings: false, water: { fill: "#8fb8de" } }}`. A change of style restyles the
  tiles on screen without loading them again. The exception is a change that shows a part
  whose layers were not decoded: the tiles then load again (usually from the HTTP cache).
- `sourceLayers` maps a source layer to a part, or to `false`, before the built-in rules. A
  custom tileset can draw its `"parcels"` layer as `"buildings"`, or hide a layer that would
  otherwise go to `other`.
- `onclick` reaches every area and line part. `event.feature` is the tile feature: its
  `properties` are the tile's tags plus `layerName`.
- Street names along lines are not drawn.

### Default features and names

The defaults follow VersaTiles' own style for its Shortbread tiles
(tiles.versatiles.org/assets/styles/colorful), as MapLibre applies such a style under deck.gl's
and CARTO's basemaps.

- **Features by zoom.** A tile draws the kinds its zoom reaches: motorways from zoom 5, trunk
  roads 6, primary 8, secondary 9, tertiary 10, residential streets 12, service roads, footways
  and other ramps 13 (motorway ramps 12); railways from 11 (sidings 14); forests from 7, other
  landuse from 10, parks and grass from 11, cemeteries from 13; lakes and rivers from 4 (the
  open sea from 0), rivers and canals as lines from 9, streams from 14; country borders from 0,
  state borders from 7. Buildings draw wherever a tileset has them. A kind these rules do not
  name starts at 12 (roads) or 10 (landuse). The same rules read OpenMapTiles', Protomaps' and
  Mapbox's kinds where they share names.
- **Place names by kind and zoom.** Countries show at zooms 2 to 10 (small ones from 4), states
  3 to 10, capitals 4 to 12, state capitals 4 to 14, cities 6 to 14, towns 7 to 15, villages
  and suburbs 10 to 16, hamlets and quarters from 13, neighbourhoods from 14 (zooms as the
  view's, fractional). Farms, isolated dwellings and localities never show. Shortbread names
  countries and states in `boundary_labels`, and countries are the only names its tiles carry
  below zoom 4.
- **Which names win.** Names are placed most important first (countries, capitals, state
  capitals, cities, states, towns, villages, hamlets, suburbs, quarters, neighbourhoods; within
  a kind the most populous first), and a name that would overlap one already placed is left
  out, as MapLibre's collision does (the text's box is estimated from its length). A name shows
  once.
- **Sizes.** Each kind's size grows with the zoom as in VersaTiles' style, snapped to 9, 11, 13
  or 15 pixels (scaled by `styles.places.size` over 13); state names are drawn halfway from the
  places color to the map's background.
- With `live={false}` the requested tiles' zoom stands in for the view's.

## Loading, errors and settling

- The requested tiles load when the mark mounts, and at once when `url` or the tile list
  changes, with no debounce. Live tiles: see "Live tiles".
- A newer tile list aborts the load in flight, and a result that still arrives is dropped. The
  tiles on screen stay until the next load completes. Going back to the tiles on screen drops
  the pending request.
- A failed load keeps the tiles on screen. The error shows on the plot (for example,
  `VectorTile: HTTP 404 Not Found: /tiles/14/1/2.pbf`), and `onerror` receives it. The next
  successful load clears it.
- `onload({ tiles, features, ms })` runs after each load.
- `fit` (default true): when the tiles change, a 2D map root frames them.
  - Mercator, equirectangular and equal-area maps zoom to the tiles' box. An orthographic map
    centers on it.
  - Nothing happens in 3D, inside a nested Frame, or in a Cartesian plot, where the
    coordinates are plain x/y.
  - Pass `fit={false}` with an explicit Plot `viewport`.
- The plot reveals with its first tiles drawn. `plot.whenSettled()`, `vectorTile.whenSettled()`
  and every export wait for a load already requested, and in live mode for the tiles the
  current view selects and the ones drawn under them, the zoom-0 tile and the overview (shown
  or failed), never for the previous level or the ring. So an export does not depend on which
  tile arrived first. Other plots on the page do not wait for it.
- In Python scenes, an update (a new `tile`) is acknowledged once the tree is mounted: the plot
  keeps showing the previous tiles while the browser loads the next.
  - `await scene.when_settled()` and the exports wait for the load.
  - A failed load never fails a command. The error shows on the plot.
- With `live={false}`, decoding runs on the main thread. A dense city tile (Manhattan at zoom
  14, 667 KB, 17,000 features) decodes in about 50 ms with the default style, which skips its
  10,800 address and POI points. Live tiles decode in workers.
- GPU positions are float32. At zoom 14 a vertex rounds by about a fifth of a pixel of a tile
  shown 512 pixels wide (estimated from float32 spacing, not measured); much deeper zooms round
  visibly.

## Exports

- The browser's HTML export of a Python scene (`await scene.export_html()`) embeds the tiles on
  screen as raw tile bytes, `tileData` ([{ tile, bytes }], bytes as base64 text), and keeps the
  `url`: the requested tiles, and in live mode the live tiles on screen too.
  - Offline, the page draws the exported view from them and fetches none of them; live tiles it
    cannot load fail quietly. Online, a live VectorTile loads over them as the view moves.
  - Raw bytes are 4–10 times smaller than decoded GeoJSON (Amsterdam at zoom 14: 654 KB against
    3.3 MB; New York Harbor at zoom 13: 64 KB against 615 KB). A full live view is about 20
    tiles: 1–4 MB for typical tiles, up to about 13 MB for dense city tiles, plus base64's
    third.
  - `tileData` works as a prop too: tiles embedded by hand load nothing.
- `snapshot=False` exports the `url` only, and the page loads the tiles when it opens. That
  needs a server the page can reach (see CORS below).
- `hm.export_html(scene)` normally draws in headless Chrome and embeds the loaded tiles,
  like the browser export. Keep VectorTile's `snapshot=True` (the default), even with
  `live=True`: embedded tiles cover the initial offline view and new online navigation still
  fetches tiles. The export browser needs access to the tile service for this initial capture.
- With `hm.export_html(scene, snapshot=False)`, or if headless rendering fails, no browser
  result is available to embed. External tiles remain network-dependent; inspect the export
  warnings. For offline export without service access, supply local MVT bytes through
  `tile_data=[{"tile": [z, x, y], "bytes": tile_bytes}]`. Include the requested tiles and the
  surrounding area the offline view needs. Embedding cannot provide unvisited areas at every zoom.
- An exported 3D plot keeps its camera (as a 2D plot keeps its viewport), so a flyover's page
  opens where it was exported, over its embedded tiles.
- PNG, SVG and PDF exports (from a displayed scene, or an `ExportSession`) draw the loaded
  tiles, and wait for the load. A 3D plot, a flyover's basemap and buildings included, is one
  image in SVG and PDF.
  - SVG and PDF keep lines and place names as vectors. Filled areas are rasterized, as GeoJSON
    faces on a map are; the export report names them.
  - An `ExportSession` serves its pages from a local server, so use absolute tile URLs there.

## Where tiles come from

- **Tile servers.** Any server with `{z}/{x}/{y}` MVT URLs works. It must allow the page's
  origin (CORS: `Access-Control-Allow-Origin`), and most need a key. Never put a key you must
  keep secret in `url`: a Python scene's props are embedded in exported HTML and saved with
  notebooks. Use a key restricted to your domains, or a proxy that adds it.
  - VersaTiles (`https://tiles.versatiles.org/tiles/osm/{z}/{x}/{y}`, Shortbread schema, zoom
    0 to 14) needs no key and allows every origin. Its data is OpenStreetMap (ODbL) with ESA
    WorldCover landcover (CC BY 4.0), and both need a credit. The in-plot credit is short; ESA's full
    form is "© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium":
    give it in a publication's credits or a page's footer.
- **Static files.** Tiles saved next to the page, as the gallery example does
  (`static/data/vector-tiles/{z}/{x}/{y}.mvt`), work on a static site with no server and no
  key.
- **Attribution.** Tile data carries a license. OpenStreetMap-based tiles require a visible
  credit such as "© OpenStreetMap contributors" (ODbL). `attribution` draws it in the plot's
  bottom-right corner, and PNG, SVG, PDF and HTML exports keep it. Several VectorTiles on one
  plot share one line, each credit once.
- **Not supported:**
  - PMTiles archives (one file read by HTTP range requests);
  - raster tiles;
  - Mapbox GL style JSON: the style here is the fixed parts above, with `styles` and
    `sourceLayers`.

## Implementation notes

- `src/lib/plot/utils/vectorTiles.js` holds the MVT reader: our own protobuf reader, with no
  dependency, that skips the layers it is not asked for. The same file holds:
  - the conversion to GeoJSON: the Web Mercator inverse, with RFC 7946 winding. Exteriors are
    the rings with the first ring's sign, so version 1 tiles wound the other way read too.
  - clipping to the tile square: a polygon keeps its rings whole and carries the tile's box
    (`tileClip`), and its triangles are clipped after triangulation (clipping each ring on its
    own left holes that cross the edge unmatched, and earcut filled the difference: Stage 35's
    missing Norway); Liang-Barsky for lines;
  - the tile math (`tileAt`, `tileBounds`, `resolveTiles`) and `loadVectorTiles`.
- `src/lib/plot/utils/vectorTileStyle.js` holds the parts, their default styles, the rules that
  map source layers to parts at a tile's zoom, and the line widths by zoom and kind;
  `utils/vectorTileLabels.js` the place names' kinds, zoom ranges, sizes and placement.
- `src/lib/plot/vectorTile.svelte` loads through Stage 20's `createScheduler`: the newest
  request wins, a superseded load is aborted, and load jobs are tracked in the plot's own
  settle map.
  - It holds the plot's root ownership until its first result, as a Provider does.
  - It reports errors on the plot's error surface.
  - It mounts one GeoJSON mark per part that has features, and a Text for
    place names.
  - The mark is built from other marks, but it lives with the core marks rather than in
    `src/lib/compound`, because loading is outside the composition surface.
- Live tiles (TODO 35):
  - `src/lib/plot/utils/vectorTileView.js`: the view's longitude/latitude box and ground
    resolution, through the inverse of each flat projection (or a Cartesian plot's axes);
    `selectLiveTiles`, `liveZoom` and `tilesInBox` in `vectorTiles.js`.
  - `src/lib/plot/vectorTileLive.svelte`: the layers, the per-tile records, settling, the place
    names and the slot pool (best fit by rows, idle slots trimmed past their budget);
    `utils/vectorTileCache.js` (raw bytes, failures remembered; loads of one tile share a
    request, which waits with the most urgent of their priorities; `createLru`, the cache by
    count and bytes every live cache uses); `utils/requestScheduler.js` (after loaders.gl's
    RequestScheduler, which Stage 35 measured and did not install).
  - `utils/vectorTileMesh.js` `tileMesh` runs in `workers/vectorTile.worker.js` (a pool shared
    by the page's VectorTiles, `utils/vectorTileWorker.js`, which queues tiles on the main
    thread, drops the ones no longer wanted and shares a job between the loads of one tile), and
    gives each instance its part; `paintTile` colors it on the main thread.
    `vectorTileSlot.svelte` holds one tile's GeoFaces, GeoSegments and (with the first tile that
    has points) ScatterSprite, made once and reused, and writes the arrays into their buffers
    with `BufferedField.updateHost` (no jax arrays).
    Tile fields use private, runtime-sized storage nodes: replacing a grown buffer updates
    its binding without rebuilding the shader graph. Ordinary marks retain their existing
    field path. Tile-specific mesh/point position builders also omit unused identity instance
    matrices in render and picking, avoiding stale matrix bindings after capacity growth.
    Structural material changes and a slot's first draw still build graphs.
    `utils/tilePublication.js` budgets first-use/growth preparation per renderer: one tile
    publication through its completed draw, then another animation frame. Visible tiles take
    priority; canceled/offscreen jobs leave the queue, and renderer disposal releases pending
    work. Coarse coverage, slot fitting, worker
    limits and idle free-slot trimming continue to apply. Diagnostics expose `tilePreparation`
    and `tilePublication` durations. This queue cannot interrupt one synchronous node build;
    it avoids releasing another expensive tile before that draw completes.
  - Where meridians are straight (Mercator, the local plane) and no part has an outline,
    `tileMesh` triangulates with earcut 3 straight into the slot arrays; elsewhere it goes
    through `geoGeometry` (flat mode), which subdivides for curved meridians and the globe (at
    most an eighth of the tile, and the tile reaching 1/256 past its edges: neighbours cut a
    shared edge differently, and hairlines opened between them).
  - The standalone and notebook bundles inline the worker, as they do the geometry worker, so
    nothing loads from a CDN.
- Under a 3D flyover (TODO 66):
  - `vectorTileView.js` `flyoverGround` (the ground's height, the world-to-longitude/latitude
    inverse of the axes and the local plane, ground meters per world unit, or null where the path
    does not apply) and `flyoverView` (the loading square and ground resolution);
    `selectLiveTiles`' `hold` keeps a finer level out until it fits in three quarters of the
    budget.
  - `vectorTileLive.svelte` (mode "3d", or `fixed` for `live={false}`) compares the camera each
    frame it draws (a Threlte task), and Scene3D tells it of every move at once (the view's
    `navigation.onCameraMove`), so a move's selection is tracked for settling. It wraps the
    slots in the xz plane's rotation, flags every drawing object below it but the buildings as
    the basemap (a Threlte plugin), and owns the ground plane (`plotGround`).
  - `utils/layerOrder.js` gives a 3D scene's basemap objects renderOrder from BASEMAP_ORDER in
    declaration order and the ground GROUND_ORDER, moves the basemap's translucent items into the
    opaque list (renderOrder orders within a list only) and turns their depth testing and writing
    off. `scenes/interactive.svelte` keeps the ground plane in the picking pass.
  - `vectorTileMesh.js` `buildingMesh` (earcut roofs, walls from the rings' clipped edges, floors
    above the ground) and `buildingHeights` (the tags' rules); the slot's fourth mark is a
    `TileBuildings` (objects/geoFaces.js), whose corners carry their elevation, shown while the
    VectorTile extrudes its tile (`extrude()`).
  - The request scheduler's `speculative`/`maxSpeculative` holds the ring to half the requests.
