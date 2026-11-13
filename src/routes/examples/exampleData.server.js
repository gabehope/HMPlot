// The docs routes' examples, read on the server (TODO 68.1): each example's sources and its
// build's manifest record (scripts/build_examples.py), so the page's first HTML has the source and
// the preview image, and the browser fetches the preview at once. Example.svelte reads them from
// DocsPage's "hmplot-docs-examples" context.
import { readFileSync } from "node:fs";
import path from "node:path";

// Read from disk, not imported: an imported source would make the dev server reload the page on
// each save of a program, before its build has run (the Example refreshes when it has).
const read = (id, ext) => { try { return readFileSync(path.resolve("src/examples", id, `${id}.${ext}`), "utf8"); } catch { return ""; } };

/**
 * {id: {sources: {svelte, python}, views, files}} for these examples: views and files from the
 * builds' manifest, missing when an example has not been built. The manifest is read on every call
 * (a dev server's examples rebuild under it).
 */
export async function exampleData(ids) {
  let manifest = {};
  let gallery = {};
  try { manifest = JSON.parse(readFileSync(path.resolve("static/example-builds/manifest.json"), "utf8")); } catch {}
  try { gallery = JSON.parse(readFileSync(path.resolve("static/example-builds/gallery.json"), "utf8")); } catch {}
  const missing = ids.filter((id) => !manifest[id] && !gallery[id]?.preview && !gallery[id]?.skipped);
  if (missing.length) globalThis[MISSING_THUMBNAILS]?.(missing);
  return Object.fromEntries(ids.map((id) => [id, { sources: { svelte: read(id, "svelte"), python: read(id, "py") },
    ...(manifest[id] ?? (gallery[id]?.preview ? { views: { plot: { previews: { web: gallery[id].preview } } } } : {})) }]));
}

/** A page's data (docsPages.js docsPage) with its examples' data, as `examples`. */
export async function withExamples(page) {
  return { ...page, examples: await exampleData(page.exampleIds ?? []) };
}

// A dev server makes the thumbnails that are missing, in the background (scripts/vite-examples.js,
// TODO 73.8): its hook, which this server load runs beside (absent when the site is built).
const MISSING_THUMBNAILS = Symbol.for("hmplot:missing-thumbnails");

/**
 * Each example's gallery thumbnail (TODO 69.19), {src, srcset, width, height, background}, or null
 * without one: a program pair's from the builds' manifest (build_examples.py), a gallery program's
 * from gallery.json (build-thumbnails.mjs). Read on every call, as the manifest. On a dev server,
 * the ids without one (but those gallery.json skips, with a reason) are reported to be made.
 */
export function thumbnails(ids) {
  const read = (file) => { try { return JSON.parse(readFileSync(path.resolve("static/example-builds", file), "utf8")); } catch { return {}; } };
  const manifest = read("manifest.json"), gallery = read("gallery.json");
  const found = Object.fromEntries(ids.map((id) => {
    const record = manifest[id]?.views?.plot?.previews?.thumbnail ?? gallery[id];
    if (!record?.src) return [id, null];
    const { src, srcset, width, height, background } = record;
    return [id, { src, srcset, width, height, background }];
  }));
  const missing = ids.filter((id) => !found[id] && !gallery[id]?.skipped);
  if (missing.length) globalThis[MISSING_THUMBNAILS]?.(missing);
  return found;
}

/** A page's data with each card's thumbnail (its `gallery`, `curated` and `additional` cards). */
export function withThumbnails(page) {
  const cards = [...(page.gallery ?? []), ...(page.curated ?? []), ...(page.additional ?? []).flatMap((group) => group.examples)];
  const found = thumbnails(cards.map((card) => card.id));
  const add = (list) => list?.map((card) => ({ ...card, thumbnail: found[card.id] }));
  return { ...page, gallery: add(page.gallery), curated: add(page.curated),
    additional: page.additional?.map((group) => ({ ...group, examples: add(group.examples) })) };
}
