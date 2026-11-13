// The API on one page (R2.5): each component's Python signature and Svelte props, from the Python
// package's registry.json and signatures.json.
import { apiMarkdown, withBase } from "../../examples/docsMarkdown.server.js";
import { base } from "$app/paths";
export const prerender = true;
export const GET = () => new Response(withBase(apiMarkdown(), base), { headers: { "content-type": "text/markdown; charset=utf-8" } });
