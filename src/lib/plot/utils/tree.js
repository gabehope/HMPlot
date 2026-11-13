import { createDataScope } from "./categorical.js";
import { treeHostLayout } from "./treeHost.js";

/** Every mode uses the same rooted topology and node identity. A mounted Tree keeps its
 * node scope across layouts; direct callers own one until their result is disposed. */
export async function treeLayout(scope, config, options = {}) {
  const owned = !options.nodeScope;
  const ownCache = !options.cache,
    cache = options.cache ?? new Map();
  const nodeScope = options.nodeScope ?? createDataScope();
  try {
    const frame = await treeHostLayout(scope, config, {
      ...options,
      nodeScope,
      cache,
    });
    const dispose = frame.dispose;
    frame.dispose = () => {
      dispose();
      if (ownCache) for (const value of cache.values()) value.dispose();
      if (owned) nodeScope.dispose();
    };
    return frame;
  } catch (error) {
    if (ownCache) for (const value of cache.values()) value.dispose();
    if (owned) nodeScope.dispose();
    throw error;
  }
}
