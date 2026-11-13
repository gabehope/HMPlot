// @ts-check
// Points spread across a categorical axis so none overlap (a template since TODO 130.3): a Dodge
// lays them out (along the axis the wrapper's rule picks: the orientation's, or across the one
// categorical position) and one Points draws them, taking the Dodge's offsets itself.
import { defineTemplate, option, node, param, prop, rest } from "../templates/define.js";

export default defineTemplate({
  kind: "Swarm",
  signature: {
    tier: "charts",
    summary: "A beeswarm: points along a categorical axis, moved aside so none overlap.",
    extraProps: true,
    use: ["mark", "maxInstancesOption", "rotationOption", "shapeOptions", "sizeUnitsOption", "markSettings", "detail", "lit", "transparent"],
    omit: ["rows"],
    options: {
      x: option("column", "The categories along x for a vertical swarm, or the values for a horizontal one.", { input: false, required: true }),
      y: option("column", "The values for a vertical swarm, or the categories along y for a horizontal one.", { input: false, required: true }),
      orientation: option('"horizontal" | "vertical"', "A vertical swarm spreads its points sideways from categories on x; a horizontal one spreads them up and down from categories on y.", { defaultText: "from which of x and y is categorical" }),
      padding: option("number", "The gap kept between neighboring points.", { default: 1, units: "px" }),
      seed: option("number", "The seed of the random order the points are placed in: another seed arranges the same points differently.", { default: 42 }),
      data: option("table", "A table for this mark alone: a mark with data displays on its own, in a Plot of its own.", { languages: "python" }),
    },
  },
  params: { x: undefined, y: undefined, padding: 1, seed: 42 },
  theme: { kind: "Swarm" },
  describe: { noun: "swarm plot", units: ["point", "points"] },
  root: node("Dodge", { name: prop("name"), x: param("x"), y: param("y"), as: "__swarmOffset", padding: param("padding"), seed: param("seed") }, [
    node("Points", { x: param("x"), y: param("y"), ...rest({ omit: ["name"] }) }),
  ]),
});
