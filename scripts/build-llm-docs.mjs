// The docs agents read, as files (TODO 144): llms.txt, llms-full.txt, recipes.md, the API page
// and every guide, reference and example page as Markdown, from the same functions the site's
// routes serve them with (docsMarkdown.server.js). `--style fluent` writes the chained-pipeline
// doc set (fluentDocs.js). The eval's hmplot-standard and hmplot-fluent conditions read
// build-llm/standard and build-llm/fluent: npm run build:llm-docs writes both.
//   node scripts/build-llm-docs.mjs [--style standard|fluent] [--out build-llm/<style>]
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";

register("./raw-loader.mjs", import.meta.url);
const argument = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : fallback;
};
const style = argument("style", "standard");
if (!["standard", "fluent"].includes(style)) throw Error(`--style is standard or fluent; received ${style}.`);
const out = argument("out", `build-llm/${style}`);
process.env.HMPLOT_DOCS_STYLE = style;

const docs = await import("../src/routes/examples/docsMarkdown.server.js");
const { guideSections } = await import("../src/routes/examples/guide.js");
const { examples } = await import("../src/routes/examples/catalog.js");
const { pythonExamples } = await import("../src/routes/examples/pythonExamples.js");

rmSync(out, { recursive: true, force: true });
const write = (file, text) => {
  if (!text) return;
  const target = path.join(out, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, text);
};
write("llms.txt", docs.llmsIndex());
write("llms-full.txt", docs.llmsFull());
write("recipes.md", docs.recipesMarkdown());
write("reference/api.md", docs.apiMarkdown());
for (const language of ["python", "svelte"])
  for (const { id } of docs.referenceEntries()) write(`reference/${language}/${id}.md`, docs.referenceMarkdown(id, language));
for (const { id } of guideSections) write(`docs/${id}.md`, docs.guideMarkdown(id));
for (const { id } of examples) write(`examples/${id}.md`, docs.exampleMarkdown(id, { pythonExamples }));
console.log(`${style} docs: ${out}`);
