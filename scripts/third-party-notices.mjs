// THIRD_PARTY_NOTICES.md's list of the code bundled into the Python package's widget.js and
// standalone.js (R1.5), from the bundles' own module graphs, so it stays what they contain.
//
// `bundledPackages(name)` is a Vite plugin (vite.notebook.config.js, vite.standalone.config.js):
// it records every module with code in the bundle and its inlined workers, and writes the
// packages they come from to build/third-party/<name>.json. `npm run build:python` then runs
//   node scripts/third-party-notices.mjs
// which rewrites the generated section of THIRD_PARTY_NOTICES.md (between the BEGIN and END
// comments; the rest is written by hand) and copies the file beside the bundles, so the wheel
// ships it (hmplot/static/THIRD_PARTY_NOTICES.md). CI fails when the committed file differs from
// what the build writes. A license file inside a package (three.js's example fonts) or inside
// this repository (the Source Sans 3 font) is listed as a part of its own.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lists = path.join(root, "build", "third-party");
const BUNDLES = ["widget", "standalone"];
const NOTICES = path.join(root, "THIRD_PARTY_NOTICES.md");
const BEGIN = "<!-- BEGIN bundled packages: written by scripts/third-party-notices.mjs -->";
const END = "<!-- END bundled packages -->";
// LICENSE, LICENSE.md, LICENSE-MIT, NOTICE.txt, COPYING ... (not "LICENSE 2", a sync conflict copy).
const LICENSE_FILE = /^(licen[sc]e|copying|notice)([-._][\w.-]*)?$/i;

const licenseFiles = (dir) =>
  fs.readdirSync(dir).filter((file) => LICENSE_FILE.test(file) && fs.statSync(path.join(dir, file)).isFile()).sort();

// The package a module file belongs to: the nearest package.json with a name (nested ones that
// only set "type" are skipped), and the nearest folder below it with a license file of its own.
function owner(file) {
  let part = null;
  for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
    const manifest = path.join(dir, "package.json");
    if (fs.existsSync(manifest)) {
      const pkg = JSON.parse(fs.readFileSync(manifest, "utf8"));
      if (pkg.name) return { dir, pkg, part };
    }
    if (!part && licenseFiles(dir).length) part = dir;
    if (dir === path.dirname(dir)) return null;
  }
}

export function bundledPackages(name) {
  const modules = new Set();
  const collect = (bundle) => {
    for (const chunk of Object.values(bundle))
      if (chunk.type === "chunk")
        for (const [id, module] of Object.entries(chunk.modules)) if (module.renderedLength > 0) modules.add(id);
  };
  const plugin = {
    name: "bundled-packages",
    generateBundle(_, bundle) { collect(bundle); },
    writeBundle() {
      const packages = new Map();
      for (const id of modules) {
        if (id.startsWith("\0")) continue;
        let file;
        try { file = fs.realpathSync(id.replace(/\?.*$/, "")); } catch { continue; }
        const found = owner(file);
        if (!found) continue;
        const { dir, pkg, part } = found;
        const key = `${pkg.name}@${pkg.version ?? ""}`;
        const entry = packages.get(key) ?? {
          name: pkg.name, version: pkg.version ?? "", license: typeof pkg.license === "string" ? pkg.license : pkg.license?.type ?? "",
          repository: typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url ?? pkg.homepage ?? "",
          description: pkg.description ?? "",
          own: dir === root, dir, files: licenseFiles(dir), parts: [],
        };
        if (part) {
          const relative = path.relative(dir, part);
          if (!entry.parts.includes(relative)) entry.parts.push(relative);
        }
        packages.set(key, entry);
      }
      fs.mkdirSync(lists, { recursive: true });
      const sorted = [...packages.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
      for (const entry of sorted) entry.parts.sort();
      fs.writeFileSync(path.join(lists, `${name}.json`), JSON.stringify(sorted, null, 1) + "\n");
    },
  };
  // Inlined workers are bundles of their own; their modules count toward this one.
  return { plugin, worker: () => [{ name: "bundled-packages-worker", generateBundle(_, bundle) { collect(bundle); } }] };
}

// A repository as a link: "git+https://...git", "git@github.com:a/b", "github:a/b" and "a/b".
const clean = (repository) =>
  repository.replace(/^git\+/, "").replace(/^git:\/\//, "https://").replace(/^git@github\.com:/, "https://github.com/")
    .replace(/^github:/, "https://github.com/").replace(/^([\w.-]+\/[\w.-]+)$/, "https://github.com/$1").replace(/\.git$/, "");

function section() {
  const entries = new Map();
  for (const bundle of BUNDLES) {
    const file = path.join(lists, `${bundle}.json`);
    if (!fs.existsSync(file)) throw Error(`${path.relative(root, file)} is missing: run npm run build:python.`);
    for (const entry of JSON.parse(fs.readFileSync(file, "utf8"))) {
      const key = `${entry.name}@${entry.version}`;
      const known = entries.get(key);
      if (known) known.parts = [...new Set([...known.parts, ...entry.parts])].sort();
      else entries.set(key, entry);
    }
  }
  const all = [...entries.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  // Each distinct license text once, after the packages that carry it.
  const texts = new Map();
  const cite = (label, file) => {
    const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").trim();
    if (!texts.has(text)) texts.set(text, []);
    texts.get(text).push(label);
  };
  const rows = [];
  for (const entry of all) {
    const from = entry.own ? "this repository" : `${entry.name} ${entry.version}`;
    if (!entry.own) {
      const files = entry.files.length ? entry.files.join(", ") : "none (license from its package.json)";
      rows.push(`| ${entry.name} | ${entry.version} | ${entry.license || "see its license file"} | ${entry.repository ? clean(entry.repository) : entry.description} | ${files} |`);
      for (const file of entry.files) cite(`${entry.name} ${entry.version} (${file})`, path.join(entry.dir, file));
    }
    for (const part of entry.parts) {
      const dir = path.join(entry.dir, part);
      const files = licenseFiles(dir);
      rows.push(`| ${entry.own ? part.split(path.sep).join("/") : `${entry.name}/${part.split(path.sep).join("/")}`} | ${entry.own ? "" : entry.version} | see its files | ${from} | ${files.join(", ")} |`);
      for (const file of files) cite(`${entry.own ? "" : `${entry.name}/`}${part.split(path.sep).join("/")}/${file}`, path.join(dir, file));
    }
  }
  const lines = [
    BEGIN, "",
    `${all.filter((entry) => !entry.own).length} packages, and the parts of packages (and of this repository) that carry license files of their own:`,
    "",
    "| Package or part | Version | License | Source | License files |",
    "|---|---|---|---|---|",
    ...rows,
    "",
    "### Their license texts",
    "",
    "Each text once, after the packages and parts that carry it.",
    "",
  ];
  for (const [text, labels] of texts) {
    lines.push(`#### ${labels.join(", ")}`, "", "```text", text.replace(/```/g, "'''"), "```", "");
  }
  lines.push(END);
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const current = fs.readFileSync(NOTICES, "utf8");
  const start = current.indexOf(BEGIN), end = current.indexOf(END);
  if (start < 0 || end < start) throw Error(`THIRD_PARTY_NOTICES.md needs the ${BEGIN} and ${END} lines.`);
  const next = current.slice(0, start) + section() + current.slice(end + END.length);
  if (next !== current) fs.writeFileSync(NOTICES, next);
  const target = path.join(root, "python", "hmplot", "static");
  fs.mkdirSync(target, { recursive: true });
  fs.copyFileSync(NOTICES, path.join(target, "THIRD_PARTY_NOTICES.md"));
  console.log(`THIRD_PARTY_NOTICES.md: ${next === current ? "current" : "updated"}; copied to python/hmplot/static.`);
}
