// The docs site under a base path (svelte.config.js kit.paths.base: /HMPlot on GitHub Pages). The
// example programs fetch their data at root paths ("/data/penguins/penguins.csv", Provider's and
// VectorTile's url), as an app serving those files at its root would, and the docs show that code
// as it is: once DocsPage has installed this, a same-origin URL outside the base, given to fetch,
// is fetched under it. Without a base (dev, the tests) fetch is left alone. Not a client hook
// (hooks.client.js): a dev server's page can evaluate those before Vite defines $app/paths' globals.
import { base } from "$app/paths";

let installed = false;
export function installRootedFetch() {
  if (!base || installed || typeof window === "undefined") return;
  installed = true;
  const native = window.fetch;
  const inside = (path) => path === base || path.startsWith(`${base}/`);
  /** @param {RequestInfo | URL} input */
  const rebase = (input) => {
    if (typeof input === "string") return input.startsWith("/") && !input.startsWith("//") && !inside(input) ? base + input : input;
    if (input instanceof URL) return input.origin === location.origin && !inside(input.pathname) ? new URL(base + input.pathname + input.search + input.hash, input) : input;
    return input;
  };
  window.fetch = (input, init) => native.call(window, rebase(input), init);
}
