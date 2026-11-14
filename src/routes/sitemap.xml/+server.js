// sitemap.xml for search engines (2026-11-14): the docs pages a reader lands on, as absolute URLs
// at the site's address (package.json homepage's origin, then kit.paths.base: on GitHub Pages
// https://gabehope.github.io/HMPlot/sitemap.xml, to submit in Google Search Console). The
// reference lists each page in the languages it has, without aliases or hidden entries; the
// guide is listed once it is published (guide.js).
import { base } from "$app/paths";
import pkg from "../../../package.json" with { type: "json" };
import { apiDocs } from "../examples/docsManifest.js";
import { examples } from "../examples/catalog.js";
import { guideSections, guidePublished } from "../examples/guide.js";
export const prerender = true;
export function GET() {
  const origin = new URL(pkg.homepage).origin;
  const reference = apiDocs.filter((entry) => !entry.hidden && !entry.aliasOf);
  const paths = ["/", "/examples",
    ...(guidePublished() ? guideSections.map(({ id }) => `/docs/${id}`) : []),
    ...[["svelte", "python"], ["python", "js"]].flatMap(([language, other]) =>
      reference.filter((entry) => entry.languages !== other).map(({ id }) => `/reference/${language}/${id}`)),
    ...examples.map(({ id }) => `/examples/${id}`)];
  const urls = paths.map((path) => `  <url><loc>${origin}${base}${path}</loc></url>`).join("\n");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { "content-type": "application/xml; charset=utf-8" } });
}
