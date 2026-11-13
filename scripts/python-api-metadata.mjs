import { expressionParameters } from "../src/lib/plot/plugins/parameters.js";
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/** Read literal API metadata without evaluating modules that initialize the renderer. */
function literal(node) {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) return node.kind === ts.SyntaxKind.TrueKeyword;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node))
    return Object.fromEntries(node.properties.map((p) => [p.name.text, literal(p.initializer)]));
  if (ts.isCallExpression(node) && node.expression.getText() === 'Object.freeze') return literal(node.arguments[0]);
  throw Error(`API metadata must be a literal, received ${node.getText()}.`);
}

export function apiMetadata(root, table, pluginSchemas = {}) {
  const src = path.join(root, 'src/lib');
  const read = (file) => ts.createSourceFile(file, fs.readFileSync(path.join(src, file), 'utf8'), ts.ScriptTarget.Latest, true);
  const constant = (file, name) => {
    const declaration = read(file).statements.filter(ts.isVariableStatement)
      .flatMap((s) => [...s.declarationList.declarations]).find((d) => d.name.getText() === name);
    if (!declaration) throw Error(`${file} has no ${name} declaration.`);
    return literal(declaration.initializer);
  };
  const modules = new Map();
  for (const entry of ['index.ts', 'charts/index.ts', 'stats/index.ts'])
  for (const statement of read(entry).statements) {
    if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier || !statement.exportClause ||
        !ts.isNamedExports(statement.exportClause)) continue;
    for (const member of statement.exportClause.elements) {
      if (member.propertyName?.text !== 'default') continue;
      const name = member.name.text, module = './' + path.posix.normalize(path.posix.join(path.posix.dirname(entry), statement.moduleSpecifier.text));
      if (module.endsWith('.svelte') && !table.components[name])
        throw Error(`${name} is exported from ${module} but has no component metadata. Add ${name} to src/lib/scene/options.json, or give its built-in template a signature (src/lib/compound/*.js).`);
      if (table.components[name]) modules.set(name, module);
    }
  }
  for (const [name, spec] of Object.entries(table.components))
    if (spec.module && !modules.has(name)) modules.set(name, spec.module);
  // Preserve the public barrel's order, followed by scene-only components.
  const names = [...modules.keys(), ...Object.keys(table.components).filter((name) => !modules.has(name))];
  const components = Object.fromEntries(names.map((name) => {
    const spec = table.components[name], module = modules.get(name);
    if (!module && spec.languages !== 'python') throw Error(`${name} has no exported component or scene module.`);
    return [name, { ...(module ? { module } : {}), container: !!spec.container,
      ...(spec.tier ? { tier: spec.tier } : {}),
      ...(spec.languages ? { languages: spec.languages } : {}),
      ...(spec.layout ? { layout: true } : {}), ...(spec.passthrough ? { passthrough: true } : {}),
      ...(spec.figure ? { figure: true } : {}),
      ...(spec.positional ? { positional: spec.positional } : {}),
      // A chart's main part (TODO 130.4), whose settings its own read as (scene/settings.js).
      ...(spec.mainKind ? { mainKind: spec.mainKind } : {}) }];
  }));
  const positions = read('plot/publicTypes.ts').statements.find((s) => ts.isTypeAliasDeclaration(s) && s.name.text === 'LegendPosition');
  // Each transform's expression parameters (TODO 138.2): its definition's parameter schema, read
  // through transforms/index.js's definitions table.
  const index = read('plot/utils/transforms/index.js');
  const sources = new Map(index.statements.filter(ts.isImportDeclaration).flatMap((statement) =>
    (statement.importClause?.namedBindings?.elements ?? []).map((element) =>
      [element.name.text, { file: path.posix.join('plot/utils/transforms', statement.moduleSpecifier.text),
        exported: (element.propertyName ?? element.name).text }])));
  const entries = index.statements.filter(ts.isVariableStatement).flatMap((s) => [...s.declarationList.declarations])
    .find((d) => d.name.getText() === 'definitions').initializer.arguments[0].elements;
  const schemas = entries.map((entry) => {
    const [kind, identifier] = entry.elements;
    const source = sources.get(identifier.text);
    const declaration = source && read(source.file).statements.filter(ts.isVariableStatement)
      .flatMap((s) => [...s.declarationList.declarations]).find((d) => d.name.getText() === source.exported);
    // The generator reads definitions without running them: each is an object literal, so its
    // parameters are not lost to a spread or a factory.
    if (!declaration?.initializer || !ts.isObjectLiteralExpression(declaration.initializer))
      throw Error(`The ${kind.text} transform's definition (${identifier.text}) is not an object literal imported into transforms/index.js; the Python registry reads its parameters statically.`);
    const parameters = declaration.initializer.properties?.find((p) => p.name?.text === 'parameters');
    return [kind.text, parameters ? literal(parameters.initializer) : {}];
  });
  const expressionParams = Object.fromEntries([...schemas, ...Object.entries(pluginSchemas)]
    .map(([kind, schema]) => [kind, Object.keys(expressionParameters(schema))])
    .filter(([, props]) => props.length));
  return {
    protocol: 1,
    library: JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version,
    components,
    properties: [],
    expressionParams: Object.fromEntries(Object.entries(expressionParams).map(([name, props]) => [name, props.sort()])),
    colormaps: constant('plot/utils/colormap.js', 'COLORMAP_NAMES'),
    shapes: {
      builtin: constant('plot/utils/shapes.js', 'BUILTIN_SHAPES'),
      maxSegments: constant('plot/utils/shapePaths.js', 'MAX_SHAPE_SEGMENTS'),
      maxShapes: constant('plot/utils/shapes.js', 'MAX_SHAPES'),
    },
    legendChannels: constant('plot/utils/guides.js', 'LEGEND_CHANNELS'),
    legendPositions: positions.type.types.map((t) => literal(t.literal)),
  };
}
