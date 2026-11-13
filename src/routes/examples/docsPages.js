// The docs pages' data (TODO 68.1): a docs route's server load returns docsPage(...) with its
// examples' data (exampleData.server.js, withExamples), and DocsPage.svelte renders it. The
// manifests (api.js and the options table, catalog.js, the guide's pages) are read here, so a
// docs page's JavaScript carries none of them; its HTML and __data.json carry only what it shows:
// its entry, its navigation (with the reference search's text), its options and its related
// examples. Client-only test routes call it in the browser.
import { error } from "@sveltejs/kit";
import { apiDocs, apiGroups, curatedExamples, additionalExamples, guideSections, homeExamples } from "./docsManifest.js";
import { examples as catalog } from "./catalog.js";
import { pythonExamples } from "./pythonExamples.js";
import { componentOptions } from "../../lib/scene/options.js";
import { referenceOptions } from "./referenceOptions.js";
import { guidePublished } from "./guide.js";
import pkg from "../../../package.json" with { type: "json" };

// The home page's install commands (the public alpha, 2026-11-13): the GitHub release's assets,
// until the packages are on npm and PyPI. The release is tagged v<version>; the wheel's name
// spells the version as PEP 440 normalizes it (0.1.0-alpha.1 is 0.1.0a1).
export function installAssets(version = pkg.version) {
  const repository = pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");
  const python = version.replace(/-alpha\.?/, "a").replace(/-beta\.?/, "b").replace(/-rc\.?/, "rc");
  const download = `${repository}/releases/download/v${version}`;
  return { version, repository, release: `${repository}/releases/tag/v${version}`,
    wheel: `${download}/hmplot-${python}-py3-none-any.whl`, tarball: `${download}/hmplot-${version}.tgz` };
}

// Whether src/examples/<id>/ has a program pair (or a Python-only component's program).
const programs = import.meta.glob("/src/examples/*/*.py", { query: "?raw", import: "default" });
const isExample = (id) => Boolean(programs[`/src/examples/${id}/${id}.py`]);

const guideNavigation = () => guideSections.map(({ id, title, section }) => ({ id, title, section }));

// The reference's navigation: each page's names, group and languages, and the text its search
// matches (its names, summary, group, options and parameters).
let referenceNavigation;
function apiNavigation() {
  referenceNavigation ??= apiDocs.filter((entry) => !entry.hidden).map((entry) => ({
    id: entry.id, title: entry.title, pythonTitle: entry.pythonTitle, group: entry.group, languages: entry.languages,
    search: `${entry.title} ${entry.pythonTitle} ${entry.summary} ${entry.group} ${entry.component ? componentOptions(entry.component).map((o) => `${o.name} ${o.python}`).join(" ") : ""} ${(entry.props ?? []).map((p) => p.name).join(" ")}`.toLowerCase(),
  }));
  return referenceNavigation;
}

const card = ({ id, title, description, tags }) => ({ id, title, description, tags });
// The additional examples' groups on the examples page, in this order (others after them).
const GROUPS = ["Marks", "Composition", "Combinations", "Interaction", "Time", "Maps", "Surfaces"];
function grouped(list) {
  const names = [...new Set(list.map((entry) => entry.group))].sort((a, b) =>
    (GROUPS.indexOf(a) + 1 || GROUPS.length + 1) - (GROUPS.indexOf(b) + 1 || GROUPS.length + 1));
  return names.map((name) => ({ name, examples: list.filter((entry) => entry.group === name).map(card) }));
}

/**
 * A docs page's data: `mode` is "home", "guide", "api", "examples" or "example". `item` is its
 * entry, `nav` its section navigation, `exampleIds` the examples it shows, and per mode:
 * `groups`, `options` (js and python) and `related` (api); `curated` and `additional` (examples:
 * cards, the additional ones in groups, {name, examples}); `gallery` (home: cards); `paired` (api,
 * example: whether its example is a program pair with a build, rather than a gallery program).
 * Cards are {id, title, description, tags}; a server load adds each one's thumbnail
 * (exampleData.server.js withThumbnails). Throws SvelteKit's 404 for an unknown page.
 */
export function docsPage({ mode, id, language }) {
  if (mode === "home") return { mode, exampleIds: ["penguins"], gallery: homeExamples.map(card), install: installAssets() };
  if (mode === "guide") {
    const item = guideSections.find((entry) => entry.id === id);
    if (!item) error(404, "Unknown lesson");
    // Unpublished (guide.js): the page is the notice, with none of the guide's prose or examples.
    if (!guidePublished()) return { mode, id, item: { id, title: "User guide" }, nav: [], exampleIds: [], unpublished: true };
    return { mode, id, item, nav: guideNavigation(), exampleIds: item.examples };
  }
  if (mode === "api") {
    const item = apiDocs.find((entry) => entry.id === id);
    if (!["svelte", "python"].includes(language) || !item) error(404, "Unknown API entry");
    const example = `${item.aliasOf ?? item.id}-basic`, paired = isExample(example);
    return { mode, id, language, item, nav: apiNavigation(), groups: apiGroups, paired,
      options: { js: referenceOptions(item, "js"), python: referenceOptions(item, "python") },
      related: (item.examples ?? []).map((name) => ({ id: name, title: catalog.find((entry) => entry.id === name)?.title ?? name })),
      exampleIds: paired ? [example] : [] };
  }
  if (mode === "examples") return { mode, curated: curatedExamples.map(card), additional: grouped(additionalExamples), exampleIds: [] };
  const item = catalog.find((entry) => entry.id === id);
  if (!item) error(404, "Unknown example");
  const paired = isExample(id);
  // A gallery program without a pair shows its Python equivalent, when it has one, as source.
  const shown = paired ? item : { ...item, python: pythonExamples[id] ?? item.python };
  return { mode, id, item: shown, paired, nav: curatedExamples.map(({ id, title }) => ({ id, title })), exampleIds: [id] };
}
