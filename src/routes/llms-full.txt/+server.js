// llms-full.txt: every guide and reference page as Markdown, in one file (R2.5).
import { llmsFull, withBase } from "../examples/docsMarkdown.server.js";
import { base } from "$app/paths";
import { guidePublished } from "../examples/guide.js";
export const prerender = true;
export const GET = () => new Response(withBase(llmsFull({ guide: guidePublished() }), base), { headers: { "content-type": "text/plain; charset=utf-8" } });
