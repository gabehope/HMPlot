import test from "node:test";
import assert from "node:assert/strict";
import { controlStyle, createTheme, inheritText, markTheme, mergeThemes, partialLayer, resolveHostText, themeInherits, themeOptionValues, validateTheme } from "../../src/lib/plot/utils/theme.js";
import { PARTIAL_SECTIONS, themePartials } from "../../src/lib/plot/utils/themePresets.js";
import { themes } from "../../src/lib/plot/utils/themePresets.js";
import { createDataScope } from "../../src/lib/plot/utils/categorical.js";

test("themes merge by section and arrays replace", () => {
  const merged = mergeThemes(
    { typography: { fontSize: 11, color: "black" }, palette: ["red"] },
    { typography: { fontSize: 14 }, palette: ["blue", "green"] },
  );
  assert.deepEqual(merged.typography, { fontSize: 14, color: "black" });
  assert.deepEqual(merged.palette, ["blue", "green"]);
  assert.deepEqual(markTheme({ typography: { fontSize: 13 }, marks: { default: { opacity: 0.8 }, Line: { width: 2 } } }, "Line"), { opacity: 0.8, width: 2 });
  assert.deepEqual(markTheme({ typography: { fontSize: 13, color: "navy" } }, "Text"), { color: "navy", size: 13 });
});

// TODO 134.29: a callout's text is in the theme's one type scale, Text's (and so rule and band labels').
test("Callout takes Text's theme entry and the typography; its own entry wins", () => {
  const theme = { typography: { fontSize: 15, color: "navy" }, marks: { Text: { size: 16 } } };
  assert.deepEqual(markTheme(theme, "Callout"), { color: "navy", size: 16 });
  assert.deepEqual(markTheme({ ...theme, marks: { ...theme.marks, Callout: { size: 10 } } }, "Callout"), { color: "navy", size: 10 });
  assert.equal(themeOptionValues(theme).plot.annotationFontSize, 16);
});

// TODO 69.17: no preset has 3D entries, and Points3D drew its raw green.
test("3D marks take only the color of their flat counterpart's theme entry; their own entry wins", () => {
  const theme = {
    typography: { color: "#111111", fontSize: 13 },
    marks: {
      default: { opacity: 0.9 },
      Points: { fill: "#4c78a8", size: 12, shape: "star", outlineWidth: 0.2 },
      Arrows: { color: "#e45756", width: 2 },
    },
  };
  assert.deepEqual(markTheme(theme, "Points3D"), { opacity: 0.9, fill: "#4c78a8" });
  assert.deepEqual(markTheme(theme, "Arrows3D"), { opacity: 0.9, color: "#e45756" });
  // Text3D: the Text color, from the typography when Text has no entry; not its pixel size.
  assert.deepEqual(markTheme(theme, "Text3D"), { opacity: 0.9, color: "#111111" });
  assert.deepEqual(markTheme({ ...theme, marks: { ...theme.marks, Points3D: { fill: "#000000", size: 4 } } }, "Points3D"),
    { opacity: 0.9, fill: "#000000", size: 4 });
  for (const preset of [themes.minimal, themes.dark, themes.notebook])
    assert.equal(markTheme(preset, "Points3D").fill, preset.marks.Points.fill);
  assert.deepEqual(markTheme({}, "Points3D"), {});
  assert.equal(markTheme({palette:["blue"],marks:{Text:{color:"transparent"}}},"Text3D").color,"transparent");
});

test("Rect and Prism fill with the palette's first color, under the theme's other entries", () => {
  const palette = ["#e45756", "#4c78a8"];
  assert.deepEqual(markTheme({ palette }, "Rect"), { fill: "#e45756" });
  assert.deepEqual(markTheme({ palette, marks: { Points: { fill: "#000000" } } }, "Prism"), { fill: "#e45756" });
  assert.equal(markTheme({ palette, marks: { default: { fill: "#111111" } } }, "Rect").fill, "#111111");
  assert.deepEqual(markTheme({ palette, marks: { Prism: { fill: "#222222", lit: true } } }, "Prism"), { fill: "#222222", lit: true });
  // Not the compounds' own layers, which come after a Mapping's: their parts carry it.
  assert.deepEqual(markTheme({ palette }, "Bar"), {});
  assert.deepEqual(markTheme({}, "Rect"), {});
  // In every preset the color stands out from the background (WCAG contrast above 2).
  const luminance = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  for (const [name, preset] of Object.entries(themes)) {
    const [a, b] = [luminance(markTheme(preset, "Rect").fill), luminance(preset.view.background)];
    assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) > 2, name);
  }
  assert.equal(Object.keys(themes).length, 32);
});

test("theme resources update subscribers and reject data properties", () => {
  const theme = createTheme({ name: "Paper", marks: { Line: { width: 1.5 } } });
  let updates = 0;
  const off = theme.subscribe(() => updates++);
  theme.update({ axes: { lineWidth: 0.75 } });
  assert.equal(theme.version, 2);
  assert.equal(theme.snapshot().axes.lineWidth, 0.75);
  assert.equal(updates, 1);
  off();
  assert.throws(() => validateTheme({ marks: { Line: { x: "time" } } }), /unsupported theme property/i);
  assert.throws(() => validateTheme({ marks: { Unknown: { width: 1 } } }), /mark kind/i);
});

test("inferred data scales adopt and update the active palette", () => {
  const scope = createDataScope();
  scope.update({ group: ["a", "b"] });
  const scale = scope.scale("group", ["#111111", "#222222"]);
  scale.include(["a", "b"]);
  assert.equal(scale.value(0), "#111111");
  assert.equal(scope.scale("group", ["#abcdef"]).value(0), "#abcdef");
  scope.dispose();
});


test("curated theme presets are valid immutable starting definitions", () => {
  assert.deepEqual(Object.keys(themes), [
    "538", "hmplot", "minimal", "ink", "paper", "presentation", "colorblind", "dark",
    "financeTerminal", "pastel", "graph", "sea", "sunset", "ggplot",
    "seabornDark", "notebook", "graphingCalculator", "observable", "wesAnderson",
    "ghibli", "yellowGlow", "8bit", "vaporwave", "blueprint", "bubblegum", "spooky",
    "treasureMap", "bureau", "journal", "bauhaus", "risograph", "tufte",
  ]);
  for (const definition of Object.values(themes)) {
    assert.doesNotThrow(() => validateTheme(definition));
    assert.equal(Object.isFrozen(definition), true);
    assert.equal(Object.isFrozen(definition.palette), true);
  }
  const customized = createTheme(themes.paper).update({ marks: { Line: { width: 3 } } });
  assert.equal(customized.snapshot().marks.Line.width, 3);
  assert.equal(themes.paper.marks.Line.width, 1.75);
  assert.equal(themes.paper.marks.Points.size, 8);
});

// TODO 73.3: theme.missing colors the missing values of every colormapped channel under the theme
// (the root option the marks inherit), unless a scale sets its own.
test("theme.missing reaches the marks' missing color and must be a color", () => {
  assert.equal(themeOptionValues(validateTheme({ missing: "#123456" })).root.valueMissing, "#123456");
  assert.equal(themeOptionValues(themes.minimal).root.valueMissing, undefined, "presets keep the default");
  assert.throws(() => validateTheme({ missing: 7 }), /theme.missing must be a CSS color/);
});

test("theme.title styles the title block, and its values are checked (TODO 132.1)", () => {
  const title = { align: "center", fontSize: 22, fontWeight: 700, subtitleFontSize: 14, captionFontSize: 10, spacing: 12 };
  assert.deepEqual(themeOptionValues(validateTheme({ title })).root, {
    titleAlign: "center", titleFontSize: 22, titleFontWeight: 700, subtitleFontSize: 14, captionFontSize: 10, titleSpacing: 12,
  });
  assert.throws(() => validateTheme({ title: { align: "middle" } }), /theme.title.align must be "left", "center" or "right"/);
  assert.throws(() => validateTheme({ title: { fontSize: 0 } }), /theme.title.fontSize must be a positive number/);
  assert.throws(() => validateTheme({ title: { fontWeight: 950 } }), /theme.title.fontWeight must be a whole number from 100 to 900/);
  assert.throws(() => validateTheme({ title: { color: "red" } }), /Unsupported theme property theme.title.color/);
});

test("theme.guides styles legends, and its values are checked (TODO 132.2)", () => {
  const guides = { position: "top", layout: "inline", swatchSize: 16, swatchShape: "square", titleFontSize: 13, titleFontWeight: 600 };
  const values = themeOptionValues(validateTheme({ guides }));
  assert.deepEqual(values.root, {
    legendLayout: "inline", legendSwatchSize: 16, legendSwatchShape: "square", legendTitleFontSize: 13, legendTitleFontWeight: 600,
  });
  assert.equal(values.plot.legendPosition, "top");
  assert.throws(() => validateTheme({ guides: { position: "center" } }), /theme.guides.position must be "top", "bottom", "left" or "right"/);
  assert.throws(() => validateTheme({ guides: { layout: "grid" } }), /theme.guides.layout must be "auto", "inline" or "stacked"/);
  assert.throws(() => validateTheme({ guides: { swatchShape: "star" } }), /theme.guides.swatchShape must be/);
  assert.throws(() => validateTheme({ guides: { swatchSize: 0 } }), /theme.guides.swatchSize must be a positive number/);
  assert.throws(() => validateTheme({ guides: { titleFontWeight: 50 } }), /theme.guides.titleFontWeight must be a whole number/);
});

test("theme.numbers.format is the number format below explicit ones, and must be a d3-format string (TODO 132.4)", () => {
  assert.equal(themeOptionValues(validateTheme({ numbers: { format: "$,.0f" } })).root.numberFormat, "$,.0f");
  assert.equal(themeOptionValues(themes.hmplot).root.numberFormat, undefined, "presets keep the readable default");
  assert.throws(() => validateTheme({ numbers: { format: "%Y" } }), /theme.numbers.format must be a d3-format string/);
  assert.throws(() => validateTheme({ numbers: { currency: "EUR" } }), /Unsupported theme property theme.numbers.currency/);
});

test("theme.controls styles inputs: accent (else palette[0]), text size, the typography's font (TODO 132.3)", () => {
  assert.equal(controlStyle(validateTheme({ extends: "hmplot", controls: { accentColor: "#0f766e", fontSize: 13 } })),
    `--hm-theme-accent:#0f766e;--hm-theme-font:${themes.hmplot.typography.fontFamily};--hm-theme-font-size:13px`);
  assert.equal(controlStyle({ palette: ["#123456"], typography: { fontFamily: "inherit", fontSize: 12 } }),
    "--hm-theme-accent:#123456;--hm-theme-font-size:12px", "an inherited font is the host's");
  const resolved = { typography: { fontFamily: "Georgia" } };
  assert.equal(controlStyle(resolved, { typography: { fontFamily: "inherit" } }), "", "an input inherits its own host's font, not the Theme's parent's");
  assert.throws(() => validateTheme({ controls: { accentColor: "" } }), /theme.controls.accentColor must be a CSS color/);
  assert.throws(() => validateTheme({ controls: { fontSize: -1 } }), /theme.controls.fontSize must be a positive number/);
  assert.throws(() => validateTheme({ controls: { height: 30 } }), /Unsupported theme property theme.controls.height/);
});

test("theme shapes check names with the registerShape rules, prefixed by theme.shapes.<name>", () => {
  const kite = [[0, 1], [0.5, 0], [0, -1], [-0.5, 0]];
  const message = (shapes) => { try { validateTheme({ shapes }); } catch (error) { return error.message; } };
  assert.equal(message({ star: kite }), "theme.shapes.star: star is a built-in shape and cannot be redefined.");
  assert.equal(message({ sphere: kite }), "theme.shapes.sphere: sphere is a 3D shape name and cannot be registered.");
  assert.equal(message({ "bad name": kite }), "theme.shapes.bad name: Shape names must start with a letter and contain letters, digits, _ or -.");
  assert.equal(message({ "pentágono": kite }), "theme.shapes.pentágono: Shape names must start with a letter and contain letters, digits, _ or -.");
  assert.equal(message({ flat: [[0, 0], [0.5, 0.5], [1, 1]] }), "theme.shapes.flat: Shape flat has zero area; its vertices are collinear.");
  assert.deepEqual(validateTheme({ shapes: { "theme_kite-2": kite } }).shapes["theme_kite-2"], kite);
});

// theme.marks kinds are checked in JavaScript and Python; Python reads the renderer's list from
// the generated registry, and a built-in template's theme kind is among them (TODO 130.2).
test("the JavaScript and Python theme kinds and packaged presets agree", async () => {
  const { MARK_KINDS } = await import("../../src/lib/plot/utils/theme.js");
  const { readFileSync, readdirSync } = await import("node:fs");
  const registry = JSON.parse(readFileSync(new URL("../../python/hmplot/registry.json", import.meta.url), "utf8"));
  assert.deepEqual(registry.themeKinds, [...MARK_KINDS].sort());
  for (const kind of ["Lollipop", "Ecdf", "Points"]) assert.ok(MARK_KINDS.has(kind), kind);
  for (const directory of ["", "partials/"]) {
    const canonical = new URL(`../../src/lib/plot/themes/${directory}`, import.meta.url);
    for (const file of readdirSync(canonical).filter((name) => name.endsWith(".json"))) {
      const packaged = new URL(`../../python/hmplot/themes/${directory}${file}`, import.meta.url);
      assert.deepEqual(JSON.parse(readFileSync(packaged, "utf8")),
        JSON.parse(readFileSync(new URL(file, canonical), "utf8")),
        `${directory}${file}: run python3 scripts/sync-themes.py`);
    }
  }
});


test("theme axis positioning reaches each axis and presets use readable defaults", () => {
  const axes = { arrow: "both", arrowSize: 5, titlePosition: "start", titleAngle: 30, titlePlacement: "inside", titleOffset: 9,
    tickLabelAngle: 45, tickLabelAlign: "end", tickLabelPlacement: "inside", tickLabelOffset: 6 };
  const values = themeOptionValues(validateTheme({ axes })).plot;
  for (const axis of ["X", "Y", "Z"])
    for (const [key, value] of Object.entries(axes))
      assert.equal(values[`axis${axis}${key[0].toUpperCase()}${key.slice(1)}`], value);
  for (const [name, theme] of Object.entries(themes)) {
    if (["minimal", "notebook", "observable", "journal", "bureau"].includes(name)) continue;
    assert.equal(theme.axes.titlePlacement, "outside");
    assert.equal(theme.axes.titlePosition, "middle");
    assert.ok(theme.axes.fontSize >= 14 && theme.guides.fontSize >= 14);
    assert.ok(theme.marks.Points.size >= 8);
  }
});


test("HMPlot, Minimal and Ink keep distinct identities and every preset supplies continuous colors", () => {
  assert.equal(themes.hmplot.name, "HMPlot");
  assert.equal(markTheme(themes.hmplot, "Line").color, themes.hmplot.palette[0]);
  assert.equal(markTheme(themes.ink, "Line").color, themes.ink.palette[0]);
  assert.equal(themes.minimal.typography.fontSize, 14);
  assert.equal(themes.minimal.marks.Points.size, 9);
  assert.equal(themes.minimal.axes.titlePlacement, "outside");
  assert.equal(themes.minimal.axes.line, false);
  assert.equal(themes.minimal.axes.mask, false);
  for (const [name, theme] of Object.entries(themes)) {
    assert.ok(theme.colormap, name);
    assert.equal(themeOptionValues(theme).root.cmapIndex, theme.colormap);
    assert.equal(theme.axes.frame, ["journal", "graph", "blueprint"].includes(name));
    if (theme.axes.frame) assert.equal(theme.axes.arrow, "none");
  }
  for (const axes of [{ticks: 1}, {line: "false"}, {tickDirection: "up"}, {gridDash: [-1]},
    {titleFontWeight: 1200}, {threeD: {style: "sphere"}}])
    assert.throws(() => validateTheme({axes}));
});

test("HMPlot and Ink follow palette edits while explicit mark colors keep precedence", () => {
  const channels = { Line: "color", Points: "fill", Points3D: "fill", Area: "fill",
    ErrorBars: "color", Segments: "color", Arrows: "color", Arrows3D: "color" };
  for (const name of ["hmplot", "ink"]) {
    const theme = createTheme({ extends: name, palette: ["#ff0000", "#00ff00"] });
    assert.equal(markTheme(theme.snapshot(), "Area").opacity, 1, "ordinary fills remain solid");
    for (const [kind, channel] of Object.entries(channels))
      assert.equal(markTheme(theme.snapshot(), kind)[channel], "#ff0000", kind);
    theme.update({ palette: ["#0000ff"] });
    assert.equal(markTheme(theme.snapshot(), "Line").color, "#0000ff");
    theme.update({ marks: { default: { color: "black" }, Points: { fill: "orange" } } });
    assert.equal(markTheme(theme.snapshot(), "Line").color, "black");
    assert.equal(markTheme(theme.snapshot(), "Points3D").fill, "orange");
    theme.update({ marks: { Line: { color: "purple" } }, palette: ["pink"] });
    assert.equal(markTheme(theme.snapshot(), "Line").color, "purple");
    // A full preset also clears fixed colors inherited from an enclosing theme.
    const nested = mergeThemes(themes.paper, themes[name], { palette: ["#123456"] });
    assert.equal(markTheme(nested, "Line").color, "#123456");
  }
  for (const [name, preset] of Object.entries(themes)) {
    if (name === "hmplot" || name === "ink") continue;
    const edited = mergeThemes(preset, { palette: ["#abcdef"] });
    for (const [kind, channel] of Object.entries(channels))
      assert.equal(markTheme(edited, kind)[channel],
        kind === "Points3D" && preset.marks.Points.fill === "transparent" ? "#abcdef" : markTheme(preset, kind)[channel], `${name}.${kind}`);
  }
});

test('"inherit" fonts and text colors take the host\'s, reaching sections a base theme set (TODO 132.5)', () => {
  // Built on a preset, whose legends and Text marks set their own font and color.
  const own = mergeThemes(themes.dark, { typography: { fontFamily: "inherit", color: "inherit" } });
  const merged = mergeThemes(themes.hmplot, own);
  inheritText(merged);
  assert.equal(themes.hmplot.guides.fontFamily.includes("Source Sans 3"), true, "the base is not changed");
  assert.equal(themeInherits(merged), true);
  const host = { fontFamily: "Georgia, serif", color: "rgb(170, 20, 60)" };
  const resolved = resolveHostText(merged, host);
  assert.deepEqual([resolved.typography.fontFamily, resolved.axes.fontFamily, resolved.guides.fontFamily, resolved.marks.Text.font],
    Array(4).fill("Georgia, serif"));
  assert.deepEqual([resolved.typography.color, resolved.axes.textColor, resolved.guides.textColor, resolved.marks.Text.color],
    Array(4).fill("rgb(170, 20, 60)"));
  assert.equal(themeOptionValues(resolved).root.legendFontFamily, "Georgia, serif");
  // Before the host is known the parent theme's values apply, never "inherit".
  const pending = resolveHostText(merged, null, themes.hmplot);
  assert.equal(pending.guides.fontFamily, themes.hmplot.guides.fontFamily);
  assert.equal(pending.guides.textColor, themes.hmplot.guides.textColor);
  assert.equal(themeInherits(pending), false);
  assert.equal(themeInherits(resolveHostText(merged, null)), false);
  assert.equal(resolveHostText(themes.hmplot, host), themes.hmplot, "a theme without inherit is unchanged");
});

// TODO 132.7: `extends` as a list, merged left to right, in one plain-order cascade: bases and
// partials in list order, the theme's own keys, then a nested Theme (merged over its parent).
// Objects merge; lists replace. (A mark's own props win over all of it, as before.)
test("extends takes a list merged left to right, under the theme's own keys and a nested theme", () => {
  const theme = validateTheme({
    extends: ["paper", "axes/minimal", { palette: ["#111111", "#222222"], axes: { tickSize: 5 } }, "legend/inlineTop"],
    name: "Mine", guides: { layout: "stacked" },
  });
  assert.equal(theme.name, "Mine");
  assert.equal(theme.view.background, themes.paper.view.background, "the first base's keys stay");
  assert.equal(theme.axes.grid, "off", "a partial later in the list wins over the base");
  assert.equal(theme.axes.tickSize, 5, "a definition after the partial wins over it");
  assert.equal(theme.axes.color, themes.paper.axes.color, "objects merge key by key");
  assert.deepEqual(theme.palette, ["#111111", "#222222"], "lists replace");
  assert.deepEqual([theme.guides.position, theme.guides.layout], ["top", "stacked"], "the theme's own keys come last");
  assert.equal(validateTheme({ extends: ["paper", "title/centered"] }).name, "Paper", "a partial lends its section, not its name");
  // A nested Theme merges over its parent (theme.svelte compose).
  const nested = mergeThemes(theme, validateTheme({ extends: "numbers/currency", palette: ["#333333"] }));
  assert.deepEqual([nested.palette, nested.numbers.format, nested.axes.grid], [["#333333"], "$,.0f", "off"]);
  assert.throws(() => validateTheme({ extends: ["paper", "axes/nope"] }), /unknown partial theme "axes\/nope"; choose from axes\/minimal/);
  assert.throws(() => validateTheme({ extends: ["paper", 3] }), /or a list of them/);
});

test("shipped partial themes each set one section; a partial setting others warns once", (t) => {
  for (const [name, partial] of Object.entries(themePartials)) {
    const section = PARTIAL_SECTIONS[name.split("/")[0]];
    assert.deepEqual(Object.keys(partial), ["name", section], name);
    validateTheme(partial);
  }
  const warn = t.mock.method(console, "warn", () => {});
  const house = { name: "axes/house", axes: { grid: "major" }, palette: ["#ff0000"] };
  validateTheme({ extends: ["hmplot", house] });
  validateTheme({ extends: ["hmplot", house] });
  assert.equal(warn.mock.callCount(), 1);
  assert.match(warn.mock.calls[0].arguments[0], /"axes\/house" sets theme.palette, outside its section \(theme.axes\)/);
  validateTheme({ extends: ["hmplot", { name: "axes/tidy", axes: { grid: "off" } }, { name: "Light/Dark", palette: ["#000000"] }] });
  assert.equal(warn.mock.callCount(), 1, "a partial within its section, and a name with an unknown group, do not warn");
});

test("a partial lends only its section: through its own extends, a resource, or a nested Theme", (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  // A partial that extends a full preset takes that preset's section, and lends only it.
  const house = { name: "axes/house", extends: "paper", axes: { grid: "major" } };
  const theme = validateTheme({ extends: ["dark", house] });
  assert.deepEqual([theme.name, theme.view, theme.palette], [themes.dark.name, themes.dark.view, themes.dark.palette]);
  assert.deepEqual([theme.axes.grid, theme.axes.color], ["major", themes.paper.axes.color]);
  assert.deepEqual(Object.keys(validateTheme(house)).sort(), ["axes", "name"]);
  // Theme resources in the list; a partial resource's snapshot does not warn about keys it never set.
  const night = createTheme({ extends: "dark", palette: ["#123456"] }), legend = createTheme({ name: "legend/house", guides: { position: "left" } });
  const listed = validateTheme({ extends: ["paper", night, legend] });
  assert.deepEqual([listed.name, listed.palette, listed.view, listed.guides.position], [themes.dark.name, ["#123456"], themes.dark.view, "left"]);
  validateTheme(createTheme(house));
  assert.equal(warn.mock.callCount(), 0);
  // A nested Theme's partial (theme.svelte compose) keeps the page theme's name and other keys.
  assert.deepEqual(partialLayer({ name: "title/house", title: { align: "center" }, palette: ["#000000"] }), { title: { align: "center" } });
  assert.equal(partialLayer(themes.paper), themes.paper);
  // A cycle through a list, and a name with more parts than a partial's.
  const loop = { palette: ["#000000"] };
  loop.extends = ["paper", loop];
  assert.throws(() => validateTheme(loop), /cycle of extends/);
  assert.throws(() => validateTheme({ extends: ["axes/minimal/typo"] }), /unknown partial theme/);
});


// TODO 132.7: theme.animation, the Plot's animation timing and a mark's enter and exit effects
// where they set none; the animation/* partials set it.
test("theme.animation sets animation timing and enter and exit effects; bad values say what to pass", async () => {
  const { easings } = await import("../../src/lib/plot/utils/animation.js");
  const { THEME_EASINGS } = await import("../../src/lib/plot/utils/theme.js");
  assert.deepEqual(THEME_EASINGS, easings);
  const theme = validateTheme({ extends: ["hmplot", "animation/slow", "animation/fade"], animation: { easing: "linear" } });
  assert.deepEqual(theme.animation, { duration: 600, easing: "linear", enter: "fade", exit: "fade" });
  const values = themeOptionValues(theme);
  assert.deepEqual([values.root.animationDuration, values.root.animationEasing], [600, "linear"]);
  assert.deepEqual([values.root.enterEffect, values.root.exitEffect], ["fade", "fade"]);
  validateTheme({ animation: { enter: { effect: "fade", duration: 200, easing: "quad-out" }, exit: false } });
  for (const [animation, message] of [[{ duration: -1 }, /animation.duration must be a nonnegative/], [{ easing: "bounce" }, /animation.easing must be one of "linear"/],
    [{ enter: "slide" }, /animation.enter must be true, false, "fade"/], [{ exit: { effect: "slide" } }, /animation.exit.effect must be "fade"/],
    [{ delay: 10 }, /theme.animation.delay/]])
    assert.throws(() => validateTheme({ animation }), message);
});


test("neutral presets differ in structure and retain readable text independently of palettes", () => {
  const names = ["paper", "journal", "presentation", "notebook", "minimal", "ink", "bureau", "observable"];
  const looks = names.map(name => {
    const t = themes[name];
    return JSON.stringify([t.title, t.axes, t.guides, t.marks.Points, t.marks.Line.width], (key, value) => /color|fill|fontFamily/i.test(key) ? undefined : value);
  });
  assert.equal(new Set(looks).size, names.length);
  assert.ok(themes.presentation.axes.fontSize > themes.paper.axes.fontSize);
  assert.ok(themes.presentation.marks.Points.size > themes.paper.marks.Points.size);
  const luminance = hex => [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255)
    .map(c => c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4).reduce((sum,c,i) => sum+c*[.2126,.7152,.0722][i],0);
  for (const name of names) {
    const t = themes[name], background = luminance(t.view.background);
    for (const color of [t.typography.color, t.guides.textColor]) {
      const text = luminance(color);
      assert.ok((Math.max(text,background)+.05)/(Math.min(text,background)+.05) >= 4.5, `${name}: ${color}`);
      // Captions are rendered at 0.7 opacity; compare their composited color as well.
      if(color===t.guides.textColor) {
        const composed = '#'+[1,3,5].map(i => Math.round(.7*parseInt(color.slice(i,i+2),16)+.3*parseInt(t.view.background.slice(i,i+2),16)).toString(16).padStart(2,'0')).join('');
        const caption=luminance(composed);
        assert.ok((Math.max(caption,background)+.05)/(Math.min(caption,background)+.05)>=4.5, `${name} caption`);
      }
    }
  }
});


test("mark partials compose narrowly in list and nested scope order, preserving palettes and 3D points", () => {
  const t = validateTheme({ extends: ["paper", "marks/points-dense", "marks/lines-fine", "marks/points-open"] });
  assert.equal(t.name, "Paper");
  assert.deepEqual(t.palette, themes.paper.palette);
  assert.deepEqual(t.marks.ErrorBars, themes.paper.marks.ErrorBars);
  assert.equal(markTheme(t, "Points").fill, "transparent");
  assert.equal(markTheme(t, "Points").opacity, 1);
  assert.equal(markTheme(t, "Line").width, 1);
  assert.equal(markTheme(t, "Points3D").fill, t.palette[0]);
  assert.equal(markTheme({...t, marks:{...t.marks,Points3D:{fill:"red"}}}, "Points3D").fill, "red");
  const nested = mergeThemes(t, partialLayer(validateTheme({extends:"marks/points-dense"})));
  assert.equal(markTheme(nested,"Points").size,4);
  assert.equal(markTheme(nested,"Line").width,1);
  const own = validateTheme({extends:["marks/points-dense"],marks:{Points:{size:13}}});
  assert.equal(markTheme(own,"Points").size,13);
  assert.throws(() => validateTheme({marks:{Bar:{bandFraction:.6}}}), /Unsupported theme property/);
});
