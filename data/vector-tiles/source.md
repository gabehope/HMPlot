# Vector tiles

Mapbox Vector Tiles (MVT version 2, Shortbread schema) for the "Vector tiles at fixed
coordinates" gallery example, the Manhattan flyover's ground and the VectorTile specs (TODO 24),
stored as served (uncompressed), at `{z}/{x}/{y}.mvt`:

| Tile | Place |
|---|---|
| 14/9014/4818 | Stockholm, Gamla stan |
| 14/8414/5384 | Amsterdam, the canal ring |
| 13/4376/2932 | Venice |
| 13/2411/3080 | New York Harbor and Lower Manhattan |
| 12/1205-1207/1537-1540 | New York City around Manhattan, twelve tiles (the flyover's ground, 816 KB) |

Downloaded 2026-09-26 from VersaTiles, `https://tiles.versatiles.org/tiles/osm/{z}/{x}/{y}`:

    curl -o 14/9014/4818.mvt https://tiles.versatiles.org/tiles/osm/14/9014/4818

Map data © OpenStreetMap contributors, available under the Open Database License (ODbL 1.0,
https://opendatacommons.org/licenses/odbl/), and ESA WorldCover 2021 (© ESA WorldCover project /
Copernicus Sentinel data, CC BY 4.0), as the tileset's attribution states. Tiles: VersaTiles
(https://versatiles.org).

The Manhattan flyover also embeds its initial streamed view, downloaded 2026-10-17
from the same endpoint and distributed under the same licenses: 36 zoom-14 tiles
(`14/4822-4827/6154-6159`) plus `11/602/769` and `11/603/769`. The 38 files total
9,622,597 uncompressed bytes (largest 667,409 bytes), measured before embedding.
They live in `src/examples/manhattan-flyover/`, alongside the twelve ground tiles.
The planet background (`0/0/0`, 127,323 bytes) is embedded as well, bringing the
startup addition to 9,749,920 bytes across 39 tiles.
The existing tileData seeds cover startup offline; live navigation still requests other tiles.
Current source and attribution metadata: https://tiles.versatiles.org/tiles/osm/tiles.json.
