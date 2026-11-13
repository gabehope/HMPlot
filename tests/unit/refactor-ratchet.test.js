// The refactor ratchet (docs/REFACTOR-PLAN-2026-10-09.md, "Ratchet metrics"). Each count is a
// proxy for a band-aid the plan retires, measured over the source with regular expressions.
// Comments don't count, except in the two metrics about names that must disappear entirely
// (the column-ownership flags and the Axis's legacy props).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const LIB = readdirSync(new URL("../../src/lib", import.meta.url), {
  recursive: true,
})
  .filter((path) => /\.(js|ts|svelte)$/.test(path))
  .map((path) => `src/lib/${path.replaceAll("\\", "/")}`);
const SOURCE = Object.fromEntries(LIB.map((path) => [path, read(path)]));
const NAMED_MARK = "src/lib/plot/bound/namedMark.svelte";
// namedMark's update decisions (Stage 118.1): their kind checks count as namedMark's did.
const UPDATE_PLAN = "src/lib/plot/utils/markUpdatePlan.js";
// namedMark's feature controllers (Stage 118.3): kind checks moved there still count.
const CONTROLLERS = [
  "endpointController",
  "connectionController",
  "feedbackOpacity",
  "markTooltip",
  "markDomainPublisher",
].map((name) => `src/lib/plot/utils/${name}.js`);
const KIND_FILES = [
  NAMED_MARK,
  ...["namedData", "mapping", "proceduralChannels"].map(
    (name) => `src/lib/plot/utils/${name}.js`,
  ),
  "src/lib/plot/binding/preparationDependencies.js",
  UPDATE_PLAN,
  ...CONTROLLERS,
];

// Drops // and /* */ comments that start a line or follow whitespace, and Svelte's <!-- -->.
const code = (text) =>
  text.replace(/(^|\s)(?:\/\/.*|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->)/gm, "$1");
const count = (text, pattern) => text.match(pattern)?.length ?? 0;
const lines = (paths, pattern) =>
  paths
    .flatMap((path) => SOURCE[path].split("\n"))
    .filter((line) => pattern.test(line)).length;
const files = (paths, pattern) =>
  paths.filter((path) => pattern.test(code(SOURCE[path]))).length;
const distinct = (texts, pattern) =>
  new Set(
    texts.flatMap((text) =>
      [...text.matchAll(pattern)].map((match) => match[1]),
    ),
  ).size;
// The braces of `function name(...) { ... }`; the metric's definition moves with the function.
function body(text, name) {
  const start = text.indexOf(`function ${name}(`);
  assert.ok(
    start >= 0,
    `${name} is gone: point its ratchet metric at the code that replaced it`,
  );
  const open = text.indexOf("{", start);
  let depth = 0,
    end = open;
  do depth += { "{": 1, "}": -1 }[text[end++]] ?? 0;
  while (depth > 0 && end < text.length);
  return text.slice(open, end);
}

// A mark kind (capitalized) compared with something named *kind, or a kind list's membership test.
const KIND_CHECK =
  /[kK]ind\s*[!=]==?\s*["'][A-Z]|["'][A-Z]\w*["']\s*[!=]==?\s*[\w.?]*[kK]ind\b|\.(?:includes|has)\(\s*[\w.?]*[kK]ind\s*\)/g;
// The kind checks that stay (Stage 118.5): each is one kind's own behavior, not a decision other
// kinds share, so it has no markKinds.js capability. An entry names its file, the lines it covers
// (the first entry whose pattern a check's line matches takes it), how many checks those are,
// and why the check is the kind's own. Checks that were capabilities moved to markKinds.js
// (gridTable, regions, strokeWidth; rows, points, symbols, curves and series), proven
// equivalent for every kind in the table.
const UTILS = (name) => `src/lib/plot/utils/${name}.js`;
const KIND_ALLOWLIST = [
  {
    file: NAMED_MARK,
    line: /kind !== "Text"\) return;/,
    checks: 1,
    why: "Text measures with the label atlas: a web font's load prepares it again",
  },
  {
    file: NAMED_MARK,
    line: /kind === "Prism"/,
    checks: 1,
    why: "a Prism with a rectangle footprint in a 2D view refines as a flat Rect",
  },
  {
    file: "src/lib/plot/utils/connectionController.js",
    line: /kind === "Anchor" && anchorPickingProps/,
    checks: 1,
    why: "an Anchor draws nothing, so it takes no picking props",
  },
  {
    file: NAMED_MARK,
    line: /kind === "Area"/,
    checks: 1,
    why: "an Area's value axis is lower and upper: it brushes along its positions (x, or y when horizontal)",
  },
  {
    file: UTILS("mapping"),
    line: /kind === 'Area'/,
    checks: 1,
    why: "a Mapping's x or y reaches an Area along its orientation (a horizontal one reads y as its positions)",
  },
  {
    file: UTILS("namedData"),
    line: /kind === "Points3D"/,
    checks: 1,
    why: "Points3D shapes are geometry (sphere or cube), never a column",
  },
  {
    file: UTILS("namedData"),
    line: /kind === "Text3D"/,
    checks: 1,
    why: "Text3D draws one label at its position, so x, y and z are not its props",
  },
  {
    file: UTILS("namedData"),
    line: /kind === "Prism"/,
    checks: 1,
    why: "the Prism's own shape names",
  },
  {
    file: UTILS("namedData"),
    line: /kind === "Area" && props\.axis/,
    checks: 1,
    why: 'an Area with axis="x" plots its x on the y dimension',
  },
  {
    file: UTILS("namedData"),
    line: /kind === "Heatmap" && output\.fill !==|kind === "Image" && output\.data !==/,
    checks: 2,
    why: "a Heatmap colors one value per cell; an Image takes [height, width, 3 or 4] colors",
  },
  {
    file: UTILS("namedData"),
    line: /kind === "Image"|kind === "Heatmap" && !output\.image/,
    checks: 5,
    why: "on a grid table (TODO 51) an Image's field is RGB colors drawn as its data, a Heatmap's values to color",
  },
  {
    file: UTILS("namedData"),
    line: /kind [!=]== "Heatmap"/,
    checks: 6,
    why: "a categorical Heatmap draws its categories as an RGBA image, hidden ones transparent",
  },
  {
    file: UTILS("namedData"),
    line: /\]\.includes\(kind\)/,
    checks: 1,
    why: "the kinds whose fields validateFields checks against their position's rows",
  },
  {
    file: UTILS("namedData"),
    line: /kind === "(?:Area|ErrorBars)"/,
    checks: 2,
    why: "each uncertainty mark validates its own bounds (validateUncertainty)",
  },
  {
    file: UTILS("mapping"),
    line: /kind==='Text'\|\|path/,
    checks: 1,
    why: "Text takes color, not fill",
  },
  {
    file: UTILS("mapping"),
    line: /\['Points','Text'\]\.includes\(kind\)/,
    checks: 2,
    why: "Points' and Text's label and symbol channels, and Text's box and leader",
  },
  {
    file: UTILS("mapping"),
    line: /kind === 'Anchor'/,
    checks: 1,
    why: "an Anchor draws nothing: only positions and animation timing apply",
  },
  {
    file: UTILS("mapping"),
    line: /\['Rect','Prism','Area','ErrorBars'\]\.includes\(kind\)/,
    checks: 1,
    why: "the interval and box marks' bound channels",
  },
  {
    file: UTILS("proceduralChannels"),
    line: /kind === "ErrorBars"/,
    checks: 1,
    why: "ErrorBars build their bars from x, y, lower and upper when they prepare",
  },
  {
    file: UTILS("markTooltip"),
    line: /kind === "(?:Image|Heatmap|Surface)"/,
    checks: 6,
    why: "a raster's tooltip reads its own cells: an Image's RGBA data, a Heatmap's fill, a Surface's z",
  },
  {
    file: UTILS("markDomainPublisher"),
    line: /kind [!=]== "Points"/,
    checks: 2,
    why: 'Points with sizeUnits="data" widen their domains by their sizes',
  },
  {
    file: UTILS("markDomainPublisher"),
    line: /kind === "(?:Heatmap|Image)"/,
    checks: 4,
    why: "a Heatmap (an Image placed by a grid table) sets its domains from its bounds",
  },
  {
    file: UTILS("markDomainPublisher"),
    line: /kind [!=]== "Text"/,
    checks: 2,
    why: "Text's label footprints widen its domains",
  },
];

// A plot-prefixed property, through any name: `x.plotName`, a string key ("plotName", as
// Object.defineProperty or brackets take it) or a declared or object-literal member (`plotName?:`).
// The renderer's fields were reached through other names (`active.`, `view.`, a defined
// property's string), which a `renderer.` pattern missed (Stage 121.1).
const PLOT_PROPERTY =
  /(?:\??\.|["'`])(plot[A-Z]\w*)\b|\b(plot[A-Z]\w*)\??\s*:(?!:)/g;
// The plot-prefixed properties that are not the renderer's, and what carries each.
const NOT_RENDERER = {
  plotOptions:
    "a view controller's host and the plot description: the Plot's options",
  plotHost: "a view controller's host: the Plot's element",
  plotRect: "a 2D camera's userData: its frame's canvas rectangle",
  plotBasemap:
    "a drawn object: a VectorTile basemap layer (and its layer plugin's name)",
  plotGround: "a drawn object: a live VectorTile's ground",
  plotGlow: "a mark object: how much it glows",
  plotTileStorage: "a mark object: its fields live in tile storage",
  plotDefault:
    "TOOLTIP_CONTEXT and createMarkTooltip: the Plot's tooltip default",
  plotLayer: "the layer slot's plugin name",
};
const plotProperties = (texts) =>
  new Set(
    texts.flatMap((text) =>
      [...text.matchAll(PLOT_PROPERTY)].map((match) => match[1] ?? match[2]),
    ),
  );

const TEXT_CHECK =
  /[kK]ind\s*[!=]==?\s*["']Text["']|["']Text["']\s*[!=]==?\s*[\w.?]*[kK]ind\b/g;

const METRICS = [
  {
    name: "lines naming ownsResolved, virtualColumnsBorrowed or ownsVirtualColumn",
    proxy: "three spellings of who owns an @ column",
    recorded: 0,
    lowers: "P4b",
    measure: () =>
      lines(LIB, /ownsResolved|virtualColumnsBorrowed|ownsVirtualColumn/),
  },
  {
    // Any plot-prefixed property but those NOT_RENDERER names, through whatever name reaches
    // it, declared (PlotRenderer) or defined (Object.defineProperty) as well as read or written,
    // the view-services module included (Stage 121.1). Before, `renderer.plot*` only, outside
    // that module: 19 where this counts 20 (plotTimeFrozen, defined by attachClockScope).
    name: "distinct renderer.plot* properties, declared, defined, read or written",
    proxy: "renderer.plot* as an untyped service bus",
    recorded: 0,
    lowers: "P5a",
    measure: () =>
      [...plotProperties(LIB.map((path) => code(SOURCE[path])))].filter(
        (name) => !(name in NOT_RENDERER),
      ).length,
  },
  {
    name: "distinct mark.<field> assignments in namedMark.svelte",
    proxy: "the three.js mark object as a message bus",
    recorded: 0,
    lowers: "P5b",
    measure: () =>
      distinct(
        [code(SOURCE[NAMED_MARK])],
        /\bmark\.(\w+)\s*(?:\?\?|\|\||&&|[-+*/%])?=(?!=)/g,
      ),
  },
  {
    name: "kind checks in namedMark (and its controllers), namedData, mapping, proceduralChannels, liveGeometry and markUpdatePlan",
    proxy: "per-kind special cases instead of markKinds.js capabilities",
    recorded: 45,
    lowers: "P6a, P6d",
    measure: () =>
      KIND_FILES.reduce(
        (sum, path) => sum + count(code(SOURCE[path]), KIND_CHECK),
        0,
      ),
  },
  {
    // canReuseStaticText became canReuseStatic in Stage 118.2 (static reuse is a capability).
    name: 'kind === "Text" checks in markUpdatePlan\'s canWriteLive and canReuseStatic',
    proxy: "Text-only live and reuse paths",
    recorded: 0,
    lowers: "P6a",
    measure: () =>
      ["canWriteLive", "canReuseStatic"].reduce(
        (sum, name) =>
          sum + count(body(code(SOURCE[UPDATE_PLAN]), name), TEXT_CHECK),
        0,
      ),
  },
  {
    // Stage 118.5: namedMark reached a raw mark without getMark through its legend handle
    // (guideObject), which a mark outside a guide registry does not have.
    name: "raw mark components (plot/marks) that do not export getMark",
    proxy: "raw-mark access outside the rendering component's boundary",
    recorded: 0,
    lowers: "P6d",
    measure: () =>
      files(
        LIB.filter((path) => /^src\/lib\/plot\/marks\/\w+\.svelte$/.test(path)),
        /^(?![\s\S]*\bexport\s+const\s+getMark\s*=)/,
      ),
  },
  {
    name: "lines in namedMark.svelte",
    proxy: "every mark decision living in one component",
    // Strict preparation adds visible contracts and invariant annotations, not mark decisions.
    // Scoped animation correspondence integration: rationale in REFACTOR-PLAN-2026-10-09.md.
    // 2379: TODO 145.2 resolves select and hover in utils/inputWriters.js (selections or inputs).
    // 2376: the inside-a-Plot guard lives in utils/plotRenderer.js (2026-10-22).
    // 2377: the legend leaves out conditional colors (utils/literalColors.js legendCategories).
    recorded: 2377,
    lowers: "P6b-P6d",
    measure: () => count(SOURCE[NAMED_MARK], /\n/g),
  },
  {
    name: "lines of axis.svelte naming its legacy or legacyProps props",
    proxy: "the legacy root Axis inside every Plot",
    recorded: 0,
    lowers: "P7c",
    measure: () => lines(["src/lib/plot/axis.svelte"], /\blegacy/),
  },
  {
    name: "files importing pendingRootContent",
    proxy: "root-frame promotion reaching into content components",
    recorded: 9,
    lowers: "P7c",
    measure: () =>
      files(
        LIB,
        /\b(?:import|export)\s*\{[^}]*\bpendingRootContent\b[^}]*\}\s*from/,
      ),
  },
  {
    name: "components writing their own status subscribe",
    proxy: "copied status/subscribe blocks",
    recorded: 0,
    lowers: "P1b",
    measure: () =>
      files(
        LIB.filter((path) => path.endsWith(".svelte")),
        /export\s+function\s+subscribe\b|export\s+(?:const|let)\s+subscribe\s*=[^;]*?=>\s*\{/,
      ),
  },
  {
    name: "cache fields disposeTransformCache reads",
    proxy: "generic cleanup knowing each transform's private cache layout",
    recorded: 0,
    lowers: "P2c",
    measure: () => {
      const text = code(read("src/lib/plot/utils/transforms/common.js"));
      const cache = /function disposeTransformCache\((\w+)/.exec(text)?.[1];
      return distinct(
        [body(text, "disposeTransformCache")],
        new RegExp(`\\b${cache}\\.(\\w+)`, "g"),
      );
    },
  },
  {
    name: "files importing evaluateTransientExpression under another name",
    proxy: "two expression entry points under one name",
    recorded: 0,
    lowers: "P4c",
    measure: () => files(LIB, /\bevaluateTransientExpression\s+as\s+\w+/),
  },
  {
    // The effects attach through presentation.js's hooks (TODO 138.1): the render loop names
    // none. The 3 left are viewCore's Plot `fog` prop and its handoff, until 138.3 makes fog an
    // effect. Glow is a mark prop and Frame's atmosphere a keyword, so objects/base.js and
    // frame.svelte keep theirs (TODO 138.0's baseline: interactive 62, viewCore 7).
    name: "effect names (sky, bloom, glow, fog, atmosphere) in interactive.svelte and viewCore.svelte",
    proxy: "the render loop special-casing each presentation effect",
    recorded: 3,
    lowers: "138.1",
    measure: () =>
      ["src/lib/plot/scenes/interactive.svelte", "src/lib/plot/viewCore.svelte"]
        .map((path) =>
          count(code(SOURCE[path]), /sky|bloom|glow|fog|atmosphere/gi),
        )
        .reduce((a, b) => a + b, 0),
  },
  {
    name: "strictly checked modules (internal/focused Svelte configs, or // @ts-check)",
    proxy: "type-checked contracts",
    recorded: 146,
    lowers: "every contract stage",
    floor: true,
    measure: () =>
      new Set([
        ...[
          "tsconfig.internal.json",
          "tsconfig.preparation.json",
          "tsconfig.frames.json",
        ].flatMap((config) => {
          const { files = [], include = [] } = JSON.parse(read(config));
          return [...files, ...include].map((path) =>
            path.replace(/^\.\//, ""),
          );
        }),
        ...LIB.filter((path) => /^\s*\/\/\s*@ts-check\b/m.test(SOURCE[path])),
      ]).size,
  },
];

test("ratchet: every kind check is a named kind-specific case (KIND_ALLOWLIST)", () => {
  const taken = new Map(KIND_ALLOWLIST.map((entry) => [entry, 0]));
  for (const path of KIND_FILES)
    for (const line of code(SOURCE[path]).split("\n")) {
      const checks = count(line, KIND_CHECK);
      if (!checks) continue;
      const entry = KIND_ALLOWLIST.find(
        (entry) => entry.file === path && entry.line.test(line),
      );
      assert.ok(
        entry,
        `${path}: ${line.trim()} is a kind check outside KIND_ALLOWLIST: make it a markKinds.js capability, or name it there with its reason.`,
      );
      taken.set(entry, taken.get(entry) + checks);
    }
  for (const [entry, checks] of taken)
    assert.equal(
      checks,
      entry.checks,
      `${entry.file} ${entry.line}: ${checks} checks, allowlisted ${entry.checks} (${entry.why})`,
    );
});

test("ratchet: NOT_RENDERER names plot-prefixed properties that are not the renderer's", () => {
  const found = plotProperties(LIB.map((path) => code(SOURCE[path])));
  for (const [name, carrier] of Object.entries(NOT_RENDERER)) {
    assert.ok(
      found.has(name),
      `${name} (${carrier}) is gone: remove it from NOT_RENDERER`,
    );
    for (const path of LIB)
      assert.doesNotMatch(
        code(SOURCE[path]),
        new RegExp(`\\brenderer\\??\\.${name}\\b`),
        `${path}: ${name} is on the renderer: it is a renderer field, not ${carrier}`,
      );
  }
});

for (const { name, proxy, recorded, lowers, measure, floor } of METRICS) {
  test(`ratchet: ${name}`, (t) => {
    const measured = measure();
    const rule = floor
      ? "It may only rise: a change that raises it raises the recorded value in the same change, and a fall means a module left the strict scope."
      : "A change that lowers it lowers the recorded value in the same change; a rise means removing the new instance or justifying it in docs/REFACTOR-PLAN-2026-10-09.md.";
    const message = `${name}, a proxy for ${proxy} (${lowers}), is ${measured}; recorded ${recorded}. ${rule}`;
    assert.ok(floor ? measured >= recorded : measured <= recorded, message);
    if (measured !== recorded) t.diagnostic(message);
  });
}

// Stage 126: the core and its features (docs/CORE.md). A core file reaches a feature through the
// feature's extension point; every other import of one of its modules is counted, per feature,
// and each count may only fall (TODO 126.0). A module is its path under src/lib/plot without
// its extension, as its importers name it (".js" for a .ts file).
const PLOT = (path) => `src/lib/plot/${path}`;
const CORE_FILES = [
  ...[
    "bound/namedMark.svelte",
    "viewCore.svelte",
    "plot.svelte",
    "transform.svelte",
    "axis.svelte",
    "frame.svelte",
    "scenes/interactive.svelte",
    "objects/base.js",
    ...[
      "dataView.js",
      "categorical.js",
      "namedData.js",
      "markUpdatePlan.js",
      "markKinds.js",
      "interaction.js",
      "expressions.js",
      "expressionPlans.js",
      "frameModel.ts",
      "viewServices.ts",
      "proputils.js",
      "markDomains.js",
      "transforms/runner.js",
      "data.js",
    ].map((name) => `utils/${name}`),
  ].map(PLOT),
  ...LIB.filter((path) =>
    /^src\/lib\/plot\/(?:binding|rendering)\//.test(path),
  ),
];
// A module is "utils/name" or "name" (a component), and a trailing "*" takes every module whose
// path starts so, so a feature's new file joins it. A module that re-exports one of a feature's
// modules is the feature's too, unless it also re-exports core modules (a barrel): a re-export
// is not a boundary. A module that imports a feature's module and wraps it is not caught.
const FEATURES = [
  {
    name: "connections",
    modules: ["utils/connection*", "utils/endpoint*"],
    extensionPoints: ["utils/endpointController", "utils/connectionController"],
    recorded: 0,
    lowers: "126.1",
  },
  {
    name: "Dodge",
    modules: ["utils/dodge*", "dodge", "utils/markPlacement"],
    extensionPoints: ["utils/markPlacement"],
    recorded: 0,
    lowers: "126.3",
  },
  {
    name: "Force and graph layouts",
    modules: [
      "utils/force*",
      "utils/graph*",
      "utils/hierarchyLayouts",
      "utils/layout*",
      "utils/tree*",
      "force*",
      "graph*",
      "tree*",
      "dag",
      "sankey",
      "pack",
      "flow",
    ],
    extensionPoints: ["utils/forceContext"],
    recorded: 0,
    lowers: "126.2",
  },
  {
    name: "drag editing",
    modules: [
      "utils/dragSession",
      "utils/dragRouter",
      "dragInteraction",
      "dragController",
      "utils/dragController.svelte",
      "interaction/channelWriteback",
    ],
    extensionPoints: ["dragController", "utils/dragController.svelte"],
    recorded: 0,
    lowers: "126.2",
  },
  {
    name: "Facet and Partition",
    modules: [
      "utils/facet*",
      "utils/embeddedFacets",
      "utils/partition",
      "utils/series",
      "facet*",
      "partition*",
    ],
    extensionPoints: ["utils/facetService"],
    recorded: 1,
    lowers: "126.5",
  },
  {
    // The sky and the atmosphere are first-party plugins outside src/lib/plot (TODO 138.5); a
    // Frame's object effect attaches through scenes/presentationObject.
    name: "presentation effects (sky, bloom, glow, fog, atmosphere)",
    modules: [
      "utils/presentation*",
      "utils/effects",
      "scenes/presentationObject",
    ],
    extensionPoints: ["utils/presentation", "scenes/presentationObject"],
    recorded: 1,
    lowers: "138.1, 138.5",
  },
  {
    name: "minimap and overview",
    modules: ["utils/minimap*", "minimap", "scenes/overview"],
    recorded: 3,
    lowers: "126 as touched",
  },
  {
    name: "maps and vector tiles",
    modules: [
      "utils/coordinateFrame",
      "utils/coordinateArrays",
      "utils/mapFit",
      "utils/mapProjections",
      "utils/mapGuides",
      "utils/vectorTile*",
      "utils/tilePublication",
      "vectorTile*",
    ],
    extensionPoints: ["utils/coordinateFrame", "utils/coordinateArrays"],
    recorded: 0,
    lowers: "126.6",
  },
  {
    name: "mark-side tween bookkeeping",
    modules: [
      "utils/tweenState",
      "utils/markMotion",
      "utils/markAnimation",
      "utils/displayedFrames",
      "utils/channelAnimation",
    ],
    extensionPoints: [
      "utils/markMotion",
      "utils/displayedFrames",
      "utils/channelAnimation",
    ],
    recorded: 3,
    lowers: "126.7",
  },
];
const withoutExtension = (path) => path.replace(/\.(?:js|ts|svelte)$/, "");
const moduleOf = (path) => withoutExtension(path.slice("src/lib/plot/".length));
const PLOT_MODULES = LIB.filter((path) => path.startsWith("src/lib/plot/"));
const CORE_MODULES = new Set(CORE_FILES.map(moduleOf));
/** A path's relative imports or re-exports (`pattern`'s first group), as modules under src/lib/plot. */
const specifiers = (path, pattern) => {
  const folder = moduleOf(path).split("/").slice(0, -1);
  return [
    ...new Set(
      [...code(SOURCE[path]).matchAll(pattern)].map(([, specifier]) => {
        const parts = [...folder];
        for (const part of specifier.split("/"))
          if (part === "..") parts.pop();
          else if (part !== ".") parts.push(part);
        return withoutExtension(parts.join("/"));
      }),
    ),
  ];
};
const IMPORT = /\b(?:from|import)\s*\(?\s*["'](\.[^"']+)["']/g;
const REEXPORT = /\bexport\s[^;]*?\bfrom\s*["'](\.[^"']+)["']/g;
/** Each feature's modules: its patterns' matches, then every module that re-exports one. */
const FEATURE_MODULES = new Map(
  FEATURES.map(({ name, modules: patterns }) => {
    const own = new Set(
      PLOT_MODULES.map(moduleOf).filter(
        (module) =>
          !CORE_MODULES.has(module) &&
          patterns.some((pattern) =>
            pattern.endsWith("*")
              ? module.startsWith(pattern.slice(0, -1)) &&
                !module.slice(pattern.length - 1).includes("/")
              : module === pattern,
          ),
      ),
    );
    for (let grew = true; grew;) {
      grew = false;
      for (const path of PLOT_MODULES) {
        const module = moduleOf(path);
        if (own.has(module) || CORE_MODULES.has(module)) continue;
        const targets = specifiers(path, REEXPORT);
        // A barrel (index.ts, composition.js) also re-exports core modules: it is no bridge.
        if (
          targets.some((target) => own.has(target)) &&
          !targets.some((target) => CORE_MODULES.has(target))
        )
          (own.add(module), (grew = true));
      }
    }
    return [name, own];
  }),
);
/** "core file -> module" for each import of a feature's module outside its extension points. */
const featureImports = ({ name, extensionPoints = [] }) =>
  CORE_FILES.flatMap((path) =>
    specifiers(path, IMPORT)
      .filter(
        (module) =>
          FEATURE_MODULES.get(name).has(module) &&
          !extensionPoints.includes(module),
      )
      .map((module) => `${moduleOf(path)} -> ${module}`),
  );

test("ratchet: the core files exist, and each feature's patterns and extension points name its modules (docs/CORE.md)", () => {
  for (const path of CORE_FILES)
    assert.ok(
      path in SOURCE,
      `${path} is gone: update CORE_FILES and docs/CORE.md`,
    );
  const modules = new Set(PLOT_MODULES.map(moduleOf));
  for (const { name, modules: patterns, extensionPoints = [] } of FEATURES) {
    for (const pattern of patterns)
      assert.ok(
        [...FEATURE_MODULES.get(name)].some((module) =>
          pattern.endsWith("*")
            ? module.startsWith(pattern.slice(0, -1))
            : module === pattern,
        ),
        `${name}: ${pattern} matches no module: update FEATURES and docs/CORE.md`,
      );
    for (const point of extensionPoints)
      assert.ok(
        modules.has(point) && FEATURE_MODULES.get(name).has(point),
        `${name}: its extension point ${point} is not one of its modules`,
      );
  }
});

for (const feature of FEATURES)
  test(`ratchet: core imports of ${feature.name} outside its extension points`, () => {
    const imports = featureImports(feature);
    const message = `${imports.length} imports of ${feature.name} into core files outside ${feature.extensionPoints?.join(", ") || "an extension point"} (TODO ${feature.lowers}); recorded ${feature.recorded}. The count only falls: a change that lowers it lowers the recorded value in the same change, and a new import goes through the feature's extension point (docs/CORE.md).\n  ${imports.join("\n  ")}`;
    assert.equal(imports.length, feature.recorded, message);
  });

// First-party algorithms must use the same contract as third-party plugins (TODO 138.8).
test("ratchet: the first-party plugins and src/lib/plot do not import each other", () => {
  const crossing = LIB.flatMap((path) => {
    const core = path.startsWith("src/lib/plot/");
    const plugin =
      path.startsWith("src/lib/plugins/") &&
      !path.endsWith("plugins/index.js") &&
      !path.startsWith("src/lib/plugins/generated/");
    if (!core && !plugin) return [];
    return [
      ...code(SOURCE[path]).matchAll(
        /\b(?:from|import)\s*\(?\s*["']([^"']+)["']/g,
      ),
    ]
      .filter(([, specifier]) => {
        if (!specifier.startsWith(".")) return false;
        const target = new URL(specifier, `file:///${path}`).pathname;
        // Generated component props refer to public types in both directions; algorithms cannot.
        if (
          path === "src/lib/plot/publicTypes.ts" &&
          target === "/src/lib/plugins/generated/types.js"
        )
          return false;
        return core
          ? target.startsWith("/src/lib/plugins/")
          : target.startsWith("/src/lib/") &&
              !target.startsWith("/src/lib/plugins/");
      })
      .map(([, specifier]) => `${path} -> ${specifier}`);
  });
  assert.deepEqual(crossing, []);
});
