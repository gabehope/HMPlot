import { componentLoaders } from "./components.js";

/** Cache successful imports across scenes; retry a failed download on the next load. */
export function createComponentLoader(loaders) {
  const loaded = new Map();
  return async (root) => {
    const kinds = new Set();
    const visit = node => { if (!node) return; if (loaders[node.kind]) kinds.add(node.kind); node.children?.forEach(visit); };
    visit(root);
    return Object.fromEntries(await Promise.all([...kinds].map(async kind => {
      if (!loaded.has(kind)) {
        const pending = Promise.resolve().then(loaders[kind]).catch(error => { loaded.delete(kind); throw error; });
        loaded.set(kind, pending);
      }
      return [kind, (await loaded.get(kind)).default];
    })));
  };
}

export const loadSceneComponents = createComponentLoader(componentLoaders);
