// A reference page as Markdown, beside its HTML page (R2.5): /reference/python/points.md.
import { error } from "@sveltejs/kit";
import { referenceEntries, referenceMarkdown, withBase } from "../../../examples/docsMarkdown.server.js";
import { base } from "$app/paths";
export const prerender = true;
export const entries = () => ["svelte", "python"].flatMap((language) => referenceEntries().map(({ id: entry }) => ({ language, entry })));
export function GET({ params }) {
  const text = referenceMarkdown(params.entry, params.language);
  if (!text) error(404, "Unknown API entry");
  return new Response(withBase(text, base), { headers: { "content-type": "text/markdown; charset=utf-8" } });
}
