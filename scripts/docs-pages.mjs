// R2.0b.6: Markdown owns guide navigation and paired programs. Generated files are caches.
import { compile as markdown } from "mdsvex";
import { compile as svelte } from "svelte/compiler";
import { fromMarkdown } from "mdast-util-from-markdown";
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { referenceLink } from "../src/routes/examples/referenceLinks.js";

export { referenceLink };
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const guideDir = "src/routes/content/guide";
const sections = ["introduction", "tutorial", "guides"];
function fail(file, line, message) { throw Error(`${file}:${line}: ${message}`); }
function highlighted(meta, file, line) {
  const match = /\{([^}]+)\}/.exec(meta ?? "");
  if (!match) return [];
  const result = new Set();
  for (const part of match[1].split(",")) {
    const range = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!range) fail(file, line, "Use line highlights such as {2,4-6}.");
    const start = Number(range[1]), end = Number(range[2] ?? start);
    if (start < 1 || end < start || end > 10000) fail(file, line, "Invalid highlighted line range.");
    for (let n = start; n <= end; n++) result.add(n);
  }
  return [...result];
}
export async function parsePage(source, file) {
  const front = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(source);
  if (!front) fail(file, 1, "Add front matter with title, section and order.");
  const metadata = (await markdown(front[0])).data.fm;
  if (typeof metadata.title !== "string" || !metadata.title.trim()) fail(file, 2, "title must be a nonempty string.");
  if (!sections.includes(metadata.section)) fail(file, 2, `section must be ${sections.join(", ")}.`);
  if (!Number.isFinite(metadata.order)) fail(file, 2, "order must be a number.");
  const id = path.basename(file).replace(/\.(md|svx)$/, "");
  if (!/^[a-z][a-z0-9-]*$/.test(id)) fail(file, 1, "Use a lowercase, hyphenated page filename.");
  // Blank the front matter to retain the author's line numbers in every diagnostic.
  const body = front[0].replace(/[^\r\n]/g, " ") + source.slice(front[0].length);
  const tree = fromMarkdown(body), examples = [];
  function visit(parent) {
    for (let i = 0; i < (parent.children?.length ?? 0); i++) {
      const node = parent.children[i];
      if (node.type === "code" && node.lang === "python" && /^example(?:\s|$)/.test(node.meta ?? "")) {
        const next = parent.children[++i];
        if (next?.type !== "code" || next.lang !== "svelte") fail(file, node.position.start.line, "A python example fence needs a following svelte fence.");
        const exampleId = `docs--${id}--${examples.length + 1}`;
        try { svelte(next.value, { filename: file, generate: false }); }
        catch (error) { fail(file, next.position.start.line + (error.start?.line ?? 1), `Svelte: ${error.message}`); }
        examples.push({ id: exampleId, python: node.value + "\n", svelte: next.value + "\n", file,
          pythonLine: node.position.start.line + 1, svelteLine: next.position.start.line + 1,
          highlights: { python: highlighted(node.meta, file, node.position.start.line), svelte: highlighted(next.meta, file, next.position.start.line) } });
      } else if (node.children) visit(node);
    }
  }
  visit(tree);
  remarkDocs()(tree, {filename:file});
  return { id, title: metadata.title, section: metadata.section, order: metadata.order, summary: metadata.summary ?? "", file, examples };
}
// `base`: the site's path under its host (svelte.config.js kit.paths.base), which the pages'
// root-relative links and images ([Points], [export](/docs/export)) take when they compile.
export function remarkDocs({ base = "" } = {}) {
  return (tree, file) => {
    const filename = String(file.filename ?? file.path ?? "page");
    const isGuide = /content[\\/]guide[\\/]/.test(filename);
    const id = path.basename(filename).replace(/\.(md|svx)$/, "");
    let count = 0;
    const definitions = new Set(), slugs = new Set();
    // Headings get ids from their text, so links like [Frame axis titles](frame#axis-titles) land
    // (the prerendered site checks every link's fragment, TODO 68.1).
    const text = (node) => node.value ?? node.children?.map(text).join("") ?? "";
    function anchor(node) {
      const base = text(node).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section";
      let id = base;
      for (let n = 1; slugs.has(id); n++) id = `${base}-${n}`;
      slugs.add(id);
      node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id } };
    }
    function collect(node) { if (node.type === "definition") definitions.add(node.identifier); node.children?.forEach(collect); }
    collect(tree);
    function visit(parent) {
      for (let i = 0; i < (parent.children?.length ?? 0); i++) {
        const node = parent.children[i];
        if (node.type === "code" && node.lang === "python" && /^example(?:\s|$)/.test(node.meta ?? "")) {
          const next = parent.children[i + 1];
          if (next?.type !== "code" || next.lang !== "svelte") fail(filename, node.position.start.line, "A python example fence needs a following svelte fence.");
          const highlights = { python: highlighted(node.meta, filename, node.position.start.line), svelte: highlighted(next.meta, filename, next.position.start.line) };
          parent.children.splice(i, 2, { type: "html", value: `<Example id="docs--${id}--${++count}" highlights={${JSON.stringify(highlights)}} />` });
        } else if (node.type === "heading") {
          anchor(node);
          visit(node);
        } else if (node.type === "linkReference" && isGuide && !definitions.has(node.identifier)) {
          const name = node.label ?? node.children?.map(child => child.value ?? "").join("") ?? node.identifier;
          if (!/^[A-Za-z_][\w.]*(?: [A-Za-z_]+)*$/.test(name)) continue;
          const url = referenceLink(name);
          if (!url) fail(filename, node.position?.start.line ?? 1, `Unknown API name [${name}]. Use a full Markdown link for other destinations.`);
          parent.children[i] = {type:"link",url,children:node.children};
        } else if (node.type === "text" && isGuide && parent.type !== "link") {
          const expression = /\[([A-Za-z_][\w.]*(?: [A-Za-z_]+)*)\]/g;
          const parts = []; let start = 0;
          for (const match of node.value.matchAll(expression)) {
            const url = referenceLink(match[1]);
            if (!url) fail(filename, node.position?.start.line ?? 1, `Unknown API name [${match[1]}]. Use a full Markdown link for other destinations.`);
            parts.push({type:"text", value:node.value.slice(start, match.index)}, {type:"link", url, children:[{type:"text",value:match[1]}]});
            start = match.index + match[0].length;
          }
          if (parts.length) { parts.push({type:"text", value:node.value.slice(start)}); parent.children.splice(i,1,...parts); i += parts.length-1; }
        } else if (node.children) visit(node);
      }
    }
    visit(tree);
    function prefix(node) {
      if (base && /^(link|image|definition)$/.test(node.type) && /^\/(?!\/)/.test(node.url)) node.url = base + node.url;
      node.children?.forEach(prefix);
    }
    prefix(tree);
  };
}
export const docsComponents = {
  markup({ content, filename }) {
    if (!/content[\\/](guide|reference)[\\/].*\.(md|svx)$/.test(filename ?? "")) return;
    const imports = ['Example','Columns','Note','Warning','Math'].filter(name => new RegExp(`<${name}(?:\\s|>)`).test(content) || name === 'Example' && /python example/.test(content))
      .filter(name => !new RegExp(`import\\s+${name}\\b`).test(content))
      .map(name => `import ${name} from "$lib/docs/${name}.svelte";`).join("\n");
    if (!imports) return;
    // Append imports so fenced <script> examples remain untouched and line numbers stay stable.
    const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
    if (/^\s*<script(?:\s[^>]*)?>/.test(body)) return { code: content.replace(/<script(?:\s[^>]*)?>/, match => `${match}\n${imports}\n`) };
    return { code: `${content}\n<script>\n${imports}\n</script>\n` };
  },
};
function write(file, text) {
  const target = path.join(root, file);
  if (existsSync(target) && readFileSync(target, "utf8") === text) return;
  mkdirSync(path.dirname(target), {recursive:true}); writeFileSync(target, text);
}
export async function prepareDocs() {
  const pages = [];
  for (const name of readdirSync(path.join(root, guideDir)).filter(name => /\.(svx|md)$/.test(name))) {
    const file = `${guideDir}/${name}`;
    pages.push(await parsePage(readFileSync(path.join(root,file), "utf8"),file));
  }
  pages.sort((a,b) => sections.indexOf(a.section)-sections.indexOf(b.section) || a.order-b.order || a.id.localeCompare(b.id));
  if (new Set(pages.map(p=>p.id)).size !== pages.length) throw Error("Guide pages must have unique filenames, including across .md and .svx.");
  const ids = new Set();
  for (const page of pages) for (const example of page.examples) {
    ids.add(example.id);
    const folder = `src/examples/${example.id}`;
    write(`${folder}/${example.id}.py`, example.python);
    write(`${folder}/${example.id}.svelte`, example.svelte);
    write(`${folder}/.origin.json`, JSON.stringify({file:page.file,pythonLine:example.pythonLine,svelteLine:example.svelteLine}));
  }
  for (const name of readdirSync(path.join(root,"src/examples")))
    if (name.startsWith("docs--") && !ids.has(name)) rmSync(path.join(root,"src/examples",name),{recursive:true,force:true});
  write("src/lib/docs/pages.generated.json", JSON.stringify(pages.map(({examples,...page})=>({...page,examples:examples.map(({id})=>id)})),null,2)+"\n");
  return pages;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await prepareDocs();
