function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Curated presentation presets. Pass one directly to `<Theme>` or use it as
 * the starting value for `createTheme()`.
 *
 * @type {Readonly<Record<import("../publicTypes.js").ThemePresetName, import("../publicTypes.js").ThemeDefinition>>}
 */
import hmplot from "../themes/hmplot.json" with { type: "json" };
import ink from "../themes/ink.json" with { type: "json" };
import minimal from "../themes/minimal.json" with { type: "json" };
import paper from "../themes/paper.json" with { type: "json" };
import presentation from "../themes/presentation.json" with { type: "json" };
import colorblind from "../themes/colorblind.json" with { type: "json" };
import dark from "../themes/dark.json" with { type: "json" };
import fiveThirtyEight from "../themes/538.json" with { type: "json" };
import financeTerminal from "../themes/finance-terminal.json" with { type: "json" };
import pastel from "../themes/pastel.json" with { type: "json" };
import graph from "../themes/graph.json" with { type: "json" };
import sea from "../themes/sea.json" with { type: "json" };
import sunset from "../themes/sunset.json" with { type: "json" };
import ggplot from "../themes/ggplot.json" with { type: "json" };
import seabornDark from "../themes/seaborn-dark.json" with { type: "json" };
import notebook from "../themes/notebook.json" with { type: "json" };
import graphingCalculator from "../themes/graphing-calculator.json" with { type: "json" };
import observable from "../themes/observable.json" with { type: "json" };
import wesAnderson from "../themes/wes-anderson.json" with { type: "json" };
import ghibli from "../themes/ghibli.json" with { type: "json" };
import yellowGlow from "../themes/yellow-glow.json" with { type: "json" };
import eightBit from "../themes/8bit.json" with { type: "json" };
import vaporwave from "../themes/vaporwave.json" with { type: "json" };
import blueprint from "../themes/blueprint.json" with { type: "json" };
import bubblegum from "../themes/bubblegum.json" with { type: "json" };
import spooky from "../themes/spooky.json" with { type: "json" };
import treasureMap from "../themes/treasure-map.json" with { type: "json" };
import bureau from "../themes/bureau.json" with { type: "json" };
import journal from "../themes/journal.json" with { type: "json" };
import bauhaus from "../themes/bauhaus.json" with { type: "json" };
import risograph from "../themes/risograph.json" with { type: "json" };
import tufte from "../themes/tufte.json" with { type: "json" };
import axesPartials from "../themes/partials/axes.json" with { type: "json" };
import legendPartials from "../themes/partials/legend.json" with { type: "json" };
import titlePartials from "../themes/partials/title.json" with { type: "json" };
import controlPartials from "../themes/partials/controls.json" with { type: "json" };
import numberPartials from "../themes/partials/numbers.json" with { type: "json" };
import markPartials from "../themes/partials/marks.json" with { type: "json" };
import animationPartials from "../themes/partials/animation.json" with { type: "json" };
export const themes = deepFreeze({
  hmplot, minimal, ink, paper, presentation, colorblind, dark, "538": fiveThirtyEight,
  financeTerminal, pastel, graph, sea, sunset, ggplot, seabornDark, notebook,
  graphingCalculator, observable, wesAnderson, ghibli, yellowGlow,
  "8bit": eightBit, vaporwave, blueprint, bubblegum, spooky, treasureMap,
  bureau, journal, bauhaus, risograph, tufte,
});

/** A preset by name, ignoring case and punctuation ("financeTerminal", "finance-terminal"). */
const presetKey = (name) => String(name).toLowerCase().replace(/[^a-z0-9]/g, "");
export function themePreset(name) {
  const key = presetKey(name);
  return Object.entries(themes).find(([preset]) => presetKey(preset) === key)?.[1];
}

/**
 * Partial themes (TODO 132.7): "<group>/<name>", each setting one section, which `extends`
 * lists after a full theme (["paper", "axes/minimal", "legend/inline-top"]). A group names its
 * section; a theme definition whose name starts with a group is a partial too, and warns when
 * it sets keys outside that section. Each file in themes/partials holds one group's sections.
 */
export const PARTIAL_SECTIONS = Object.freeze({ axes: "axes", legend: "guides", title: "title", controls: "controls", numbers: "numbers", animation: "animation", marks: "marks" });
const partialFiles = { axes: axesPartials, legend: legendPartials, title: titlePartials, controls: controlPartials, numbers: numberPartials, animation: animationPartials, marks: markPartials };
export const themePartials = deepFreeze(Object.fromEntries(Object.entries(partialFiles).flatMap(([group, entries]) =>
  Object.entries(entries).map(([name, section]) => [`${group}/${name}`, { name: `${group}/${name}`, [PARTIAL_SECTIONS[group]]: section }]))));

/** A partial theme by name, ignoring case and punctuation in each part ("legend/inlineTop"). */
export function themePartial(name) {
  // Split at the first "/" only, so "axes/minimal/typo" names no partial.
  const split = (text) => [text.slice(0, text.indexOf("/")), text.slice(text.indexOf("/") + 1)].map(presetKey);
  const [group, rest] = split(String(name));
  return Object.entries(themePartials).find(([partial]) => {
    const [g, n] = split(partial);
    return g === group && n === rest;
  })?.[1];
}
