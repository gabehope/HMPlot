// @ts-check
// The library's built-in templates (TODO 130.2): the tables keyed by mark kind (theme kinds,
// description nouns, ...) are derived from these declarations, so a converted mark is listed
// once. Pure data, so the Python signature generator reads it in Node.
import arrows from "../compound/arrows.js";
import bar from "../compound/bar.js";
import boxPlot from "../compound/boxPlot.js";
import callout from "../compound/callout.js";
import crosshair from "../compound/crosshair.js";
import densityBands from "../compound/densityBands.js";
import densityContour from "../compound/densityContour.js";
import ecdf from "../compound/ecdf.js";
import errorBars from "../compound/errorBars.js";
import histogram from "../compound/histogram.js";
import lollipop from "../compound/lollipop.js";
import pie from "../compound/pie.js";
import marginals from "../figures/marginals.js";
import focusContext from "../figures/focusContext.js";
import ruleX from "../compound/ruleX.js";
import ruleY from "../compound/ruleY.js";
import smooth from "../compound/smooth.js";
import swarm from "../compound/swarm.js";
import violin from "../compound/violin.js";

/** @type {import("./define.js").TemplateDefinition[]} */
export const TEMPLATES = [arrows, bar, boxPlot, callout, crosshair, densityBands, densityContour, ecdf, errorBars, focusContext, histogram, lollipop, marginals, pie, ruleX, ruleY, smooth, swarm, violin];
