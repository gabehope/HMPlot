// recipes.md: the tested Python recipes (TODO 136.5; docsMarkdown.server.js).
import { recipesMarkdown, withBase } from "../examples/docsMarkdown.server.js";
import { base } from "$app/paths";
export const prerender = true;
export const GET = () => new Response(withBase(recipesMarkdown(), base), { headers: { "content-type": "text/markdown; charset=utf-8" } });
