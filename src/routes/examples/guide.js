// Generated from guide front matter by scripts/docs-pages.mjs; never maintain a second manifest.
import pages from "../../lib/docs/pages.generated.json" with { type: "json" };
export const guideSections = pages;
export const guideNavigation = pages.map(({id,title,section})=>({id,title,section}));
// The user guide is under construction (2026-11-13, the public alpha): the site shows a notice in
// its pages' place, and llms.txt leaves it out, unless HMPLOT_DOCS_GUIDE=1 (a dev server for
// writing it, and the browser tests' server). Read where the pages are rendered: on the server.
export const guidePublished = () => globalThis.process?.env?.HMPLOT_DOCS_GUIDE === "1";
