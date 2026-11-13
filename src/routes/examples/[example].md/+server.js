// A gallery example's page as Markdown, beside its HTML page (R2.5): /examples/violin.md.
import { error } from "@sveltejs/kit";
import { examples } from "../catalog.js";
import { pythonExamples } from "../pythonExamples.js";
import { exampleMarkdown, withBase } from "../docsMarkdown.server.js";
import { base } from "$app/paths";
export const prerender = true;
export const entries = () => examples.map(({ id }) => ({ example: id }));
export function GET({ params }) {
  const text = exampleMarkdown(params.example, { pythonExamples });
  if (!text) error(404, "Unknown example");
  return new Response(withBase(text, base), { headers: { "content-type": "text/markdown; charset=utf-8" } });
}
