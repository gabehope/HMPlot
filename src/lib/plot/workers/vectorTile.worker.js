// Live VectorTile tiles (TODO 35): tileMesh off the main thread. The worker keeps the features
// of the tiles it prepared last, so a click can ask for the feature under it: at most RECENT tiles
// and RECENT_BYTES of their source bytes (TODO 63.5; a dense city tile's features take about 15
// times its bytes), and the main thread prepares a forgotten tile again for a click.
import { tileMesh } from "../utils/vectorTileMesh.js";
import { createLru } from "../utils/vectorTileCache.js";
const RECENT = 96, RECENT_BYTES = 8 * 2 ** 20;
const recent = createLru({ maxEntries: RECENT, maxBytes: RECENT_BYTES, size: (entry) => entry.bytes });
self.onmessage = ({ data }) => {
  if (data.type === "feature") {
    const feature = recent.get(data.key)?.features[data.index] ?? null;
    self.postMessage({ id: data.id, feature });
    return;
  }
  try {
    const { result, features, transfer } = tileMesh(data.job);
    recent.set(data.key, { features, bytes: data.job.bytes?.byteLength ?? 0 });
    self.postMessage({ id: data.id, result }, transfer);
  } catch (error) {
    self.postMessage({ id: data.id, error: { message: error.message, code: error.code } });
  }
};
