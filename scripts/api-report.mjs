// The public API report (R2.2): every name each package entry point exports, with its type, from
// the TypeScript checker, written to api/hmplot.api.md. It is committed, so a change to the
// public surface shows in review; `--check` fails when the file is out of date, and
// scripts/check-api-changelog.mjs fails when it changed without a CHANGELOG entry.
//   node scripts/api-report.mjs          write api/hmplot.api.md
//   node scripts/api-report.mjs --check  compare instead
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const output = path.join(root, "api", "hmplot.api.md");

// package.json's exports map dist files; the sources are the same paths under src/lib.
const entries = Object.entries(pkg.exports).map(([subpath, spec]) => {
  const dist = spec.svelte ?? spec.default;
  const base = path.join(root, dist.replace(/^\.\/dist\//, "src/lib/").replace(/\.js$/, ""));
  const file = [".ts", ".js"].map((ext) => base + ext).find((candidate) => fs.existsSync(candidate));
  if (!file) throw Error(`No source for ${subpath} (${dist}).`);
  return { name: subpath === "." ? pkg.name : `${pkg.name}/${subpath.slice(2)}`, file };
});

const program = ts.createProgram(entries.map((entry) => entry.file), {
  allowJs: true, skipLibCheck: true, noEmit: true, target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
});
const checker = program.getTypeChecker();
const FLAGS = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseSingleQuotesForStringLiteralType |
  ts.TypeFormatFlags.WriteArrowStyleSignature;
const text = (type, node) => checker.typeToString(type, node, FLAGS);

/** The function-like node behind a declaration: a function, or a const bound to one. */
function functionNode(declaration) {
  if (ts.isFunctionDeclaration(declaration)) return declaration;
  const init = ts.isVariableDeclaration(declaration) ? declaration.initializer : null;
  return init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) ? init : null;
}

/**
 * A call signature. A return type the source does not declare (a TypeScript annotation or a
 * JSDoc @returns) is inferred from the body, so it changes with internal refactors: it is shown
 * as "…", and the parameters alone are the API.
 */
function signatureText(signature, declaration) {
  const full = checker.signatureToString(signature, declaration, FLAGS);
  const node = functionNode(declaration);
  if (node && (node.type || ts.getJSDocReturnType(node))) return full;
  let depth = 0;
  for (let i = 0; i < full.length; i++) {
    const c = full[i];
    if ("([{<".includes(c)) depth++;
    else if (")]}>".includes(c) && full[i - 1] !== "=") depth--;
    else if (depth === 0 && full.startsWith(" => ", i)) return full.slice(0, i) + " => …";
  }
  return full;
}

/** The module an export specifier re-exports from, if it names one. */
function reexportSource(symbol) {
  const declaration = symbol.declarations?.[0];
  const clause = declaration && ts.isExportSpecifier(declaration) ? declaration.parent.parent : null;
  return clause?.moduleSpecifier && ts.isStringLiteral(clause.moduleSpecifier) ? clause.moduleSpecifier.text : null;
}

function describe(name, symbol) {
  const from = reexportSource(symbol);
  // Svelte components are .svelte modules, which the checker does not read: listed by name. Their
  // props are the exported *Props types, listed with their members.
  if (from?.endsWith(".svelte")) return [`component ${name}`];
  const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const declaration = target.declarations?.[0];
  if (!declaration) return [`unknown ${name}`];
  if (target.flags & ts.SymbolFlags.Interface) {
    const type = checker.getDeclaredTypeOfSymbol(target);
    const members = checker.getPropertiesOfType(type).map((property) => {
      const optional = property.flags & ts.SymbolFlags.Optional ? "?" : "";
      return `  ${property.name}${optional}: ${text(checker.getTypeOfSymbolAtLocation(property, declaration), declaration)};`;
    });
    const indexes = [checker.getIndexInfoOfType(type, ts.IndexKind.String)].filter(Boolean)
      .map((info) => `  [key: string]: ${text(info.type, declaration)};`);
    return [`interface ${name} {`, ...members.sort(), ...indexes, "}"];
  }
  if (target.flags & ts.SymbolFlags.TypeAlias)
    return [`type ${name} = ${checker.typeToString(checker.getDeclaredTypeOfSymbol(target), declaration, FLAGS | ts.TypeFormatFlags.InTypeAlias)}`];
  if (target.flags & ts.SymbolFlags.Class) {
    const type = checker.getTypeOfSymbolAtLocation(target, declaration);
    const construct = type.getConstructSignatures().map((signature) => `  constructor${checker.signatureToString(signature, declaration, FLAGS)}`);
    const instance = checker.getDeclaredTypeOfSymbol(target);
    const members = checker.getPropertiesOfType(instance)
      .filter((property) => !property.name.startsWith("_") && !property.name.startsWith("#"))
      .map((property) => `  ${property.name}: ${text(checker.getTypeOfSymbolAtLocation(property, declaration), declaration)};`);
    return [`class ${name} {`, ...construct, ...members.sort(), "}"];
  }
  const type = checker.getTypeOfSymbolAtLocation(target, declaration);
  const calls = type.getCallSignatures();
  if (target.flags & ts.SymbolFlags.Function && calls.length)
    return calls.map((signature) => `function ${name}${signatureText(signature, declaration)}`);
  // A const bound to a function (or made by a factory): its call signature, the same way.
  if (calls.length && !type.getProperties().some((property) => !property.name.startsWith("__")))
    return calls.map((signature) => `const ${name}: ${signatureText(signature, declaration)}`);
  return [`const ${name}: ${text(type, declaration)}`];
}

const lines = [
  "# HMPlot public API",
  "",
  "Generated by `node scripts/api-report.mjs` from the TypeScript declarations of each entry point",
  "in package.json's exports. Do not edit: a change here is a change to the public API, and needs",
  "a CHANGELOG entry (scripts/check-api-changelog.mjs). The Python API is in",
  "python/hmplot/signatures.json and registry.json.",
];
for (const entry of entries) {
  const source = program.getSourceFile(entry.file);
  lines.push("", `## ${entry.name}`, "", "```ts");
  // An entry that only re-exports a package (hmplot/jax) is that package, pinned. A relative
  // `export *` (the generated charts) lists its exports with the entry's own.
  const reexports = source.statements.filter((statement) => ts.isExportDeclaration(statement) && !statement.exportClause
    && !statement.moduleSpecifier.text.startsWith("."));
  for (const statement of reexports) {
    const module = statement.moduleSpecifier.text;
    const version = JSON.parse(fs.readFileSync(path.join(root, "node_modules", module, "package.json"), "utf8")).version;
    lines.push(`export * from "${module}"; // ${version}`);
  }
  const moduleSymbol = checker.getSymbolAtLocation(source);
  const exports = moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : [];
  const own = reexports.length ? exports.filter((symbol) => reexportSource(symbol) !== null || symbol.declarations?.[0]?.getSourceFile() === source) : exports;
  for (const symbol of [...own].sort((a, b) => a.name.localeCompare(b.name)))
    lines.push(...describe(symbol.name, symbol));
  lines.push("```");
}
// Types from other modules print as import("../publicTypes.js").Name: the name is enough.
// A unique symbol prints with the checker's internal id (__@minimapBrand@4478), which shifts
// with unrelated edits: the report leaves it out.
const report = lines.join("\n").replace(/import\("[^"]*"\)\./g, "").replace(/(__@\w+)@\d+/g, "$1") + "\n";

if (process.argv.includes("--check")) {
  const current = fs.existsSync(output) ? fs.readFileSync(output, "utf8") : "";
  if (current !== report) {
    console.error("api/hmplot.api.md is out of date: run `node scripts/api-report.mjs` and add a CHANGELOG entry.");
    process.exit(1);
  }
  console.log("The API report is current.");
} else {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, report);
  console.log(`Wrote ${path.relative(root, output)} (${lines.length} lines).`);
}
