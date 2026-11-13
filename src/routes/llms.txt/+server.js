// llms.txt: one line per docs page, each linking its Markdown (R2.5; docsMarkdown.server.js).
import { llmsIndex, withBase } from "../examples/docsMarkdown.server.js";
import { base } from "$app/paths";
import { guidePublished } from "../examples/guide.js";
export const prerender = true;
export const GET = () => new Response(withBase(llmsIndex({ guide: guidePublished() }), base), { headers: { "content-type": "text/plain; charset=utf-8" } });
