import { mdsvex } from 'mdsvex';
import { prepareDocs, docsComponents, remarkDocs } from "./scripts/docs-pages.mjs";
await prepareDocs();

import adapter from '@sveltejs/adapter-static';

// svelte-package (npm run package) copies src/lib's Markdown as it is (the font's LICENSE.md):
// only the site compiles Markdown pages.
const packaging = process.argv.some((arg) => /svelte-package/.test(arg));
// The site's path under its host: BASE_PATH=/HMPlot builds it for GitHub Pages
// (https://gabehope.github.io/HMPlot/); unset, it is served at the root (dev, the tests).
const base = process.env.BASE_PATH ?? "";
if (base && !/^\/[^/].*[^/]$|^\/[^/]$/.test(base)) throw Error(`BASE_PATH must start with / and not end with one, such as /HMPlot (got ${JSON.stringify(base)}).`);

export default {
  extensions: packaging ? ['.svelte'] : ['.svelte', '.svx', '.md'],
  preprocess: [docsComponents, mdsvex({ extensions: ['.svx', '.md'], remarkPlugins: [[remarkDocs, { base }]] })],
	kit: {
		// Links and asset URLs take `base` from $app/paths; the Markdown pages' links are prefixed
		// when they compile (remarkDocs), the .md and llms.txt routes' when they are served. Not
		// relative: a page's links are /docs/... (/HMPlot/docs/...) in its HTML too, not ../docs/....
		paths: { base, relative: false },
		// The docs' example files (src/examples) import the package as a user does: "hmplot" and
		// its subpaths are the library's sources here.
		alias: {
			'hmplot/charts': 'src/lib/charts/index.ts',
			'hmplot/stats': 'src/lib/stats/index.ts',
			'hmplot/compound': 'src/lib/compound/index.ts',
			'hmplot/templates': 'src/lib/templates/index.ts',
			'hmplot/jax': 'src/lib/jax.js',
			'hmplot/tiles': 'src/lib/tiles.js',
			'hmplot/video': 'src/lib/video.js',
			// Vite matches prefixes in order: subpaths precede the package root.
			hmplot: 'src/lib/index.ts',
		},
		// Every docs route is prerendered with its content (TODO 68.1); the client-side app answers
		// any other path from 404.html, which static hosts serve for a missing file (index.html is
		// the prerendered home page).
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: '404.html',
			precompress: false,
			strict: false,
		})
	}
};
