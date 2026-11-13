// Where scripts/build_examples.py's outputs are served, under the site's base path ($app/paths:
// /HMPlot on GitHub Pages, svelte.config.js), and the builds' manifest.
import { base } from "$app/paths";

/** The builds' folder. */
export const BUILDS = `${base}/example-builds`;
/** An asset path from the manifest (relative to the builds' folder) as a URL. */
export const assetURL = (path) => `${BUILDS}/${path}`;

let manifest;
/**
 * An example's manifest record ({views: {plot, tree}, files}), fetched when the page did not
 * provide it (a test route; a dev server's rebuild). `fresh` refetches. Null when it has no build.
 */
export async function manifestEntry(id, { fresh = false } = {}) {
  if (fresh || !manifest) {
    manifest = fetch(`${BUILDS}/manifest.json${fresh ? `?t=${Date.now()}` : ""}`, { cache: fresh ? "no-store" : "default" })
      .then((response) => (response.ok ? response.json() : {})).catch(() => ({}));
  }
  return (await manifest)[id] ?? null;
}
