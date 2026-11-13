/**
 * Vector-tile helpers (R2.0: off the root barrel), for loading and placing tiles yourself; the
 * VectorTile mark does both for you:
 *
 *   import { tileAt, loadVectorTiles, DEFAULT_TILES } from "hmplot/tiles";
 */
export { loadVectorTiles, tileAt, tileBounds, localPlane, DEFAULT_TILES } from "./plot/utils/vectorTiles.js";
export { vectorTileScheme } from "./plot/utils/vectorTileStyle.js";
