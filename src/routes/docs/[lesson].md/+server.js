// A guide page as Markdown, beside its HTML page (R2.5): /docs/start.md.
import { error } from "@sveltejs/kit";
import { guideSections, guidePublished } from "../../examples/guide.js";
import { guideMarkdown, withBase } from "../../examples/docsMarkdown.server.js";
import { base } from "$app/paths";
export const prerender = true;
export const entries = () => guideSections.map(({ id }) => ({ lesson: id }));
export function GET({ params }) {
  const text = !guideSections.some(({ id }) => id === params.lesson) ? null
    : guidePublished() ? guideMarkdown(params.lesson)
    : `# User guide\n\nThe user guide is under construction. The reference (${base}/llms.txt lists its pages) and the examples cover every component.\n`;
  if (!text) error(404, "Unknown lesson");
  return new Response(withBase(text, base), { headers: { "content-type": "text/markdown; charset=utf-8" } });
}
