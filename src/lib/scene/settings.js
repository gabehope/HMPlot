import { axisSetting } from "../plot/utils/axisFrame.js";
import { colorChannel, settingProp, removedOffsetProp } from "../plot/utils/scaleProps.js";
import { scalarAppearance } from "../plot/utils/markKinds.js";
import registry from "./registry.json" with { type: "json" };
import { TEMPLATES } from "../templates/builtins.js";
import { mainKind } from "../templates/instantiate.js";

const accepted = new Map(Object.entries(registry.components).map(([kind, spec]) =>
  [kind, new Set([...(spec.properties ?? []), ...(spec.runtimeOptions ?? [])])]));
const frames = new Set(["Plot", "Frame", "Facet"]);
// A template's settings are its main part's (TODO 130.2): its options read as that mark's (an
// Ecdf's color is its Line's), while the edits stay the template's own props.
// A chart's main kind is in its registry entry, which the generator writes (TODO 130.4).
const MAIN_KINDS = new Map([...TEMPLATES.map((definition) => [definition.kind, mainKind(definition)]),
  ...Object.entries(registry.components).filter(([, spec]) => spec.mainKind).map(([kind, spec]) => [kind, spec.mainKind])]);
// Main-part edits that are not the template's props of the same name (a Smooth line's opacity).
const OMITTED = new Map(TEMPLATES.map((definition) => [definition.kind, new Set(definition.mainSettings?.omit ?? [])]));

/** Check protocol props against the same component contract as Python. */
export function validateSceneProps(kind, props) {
  const allowed = accepted.get(kind);
  for (const name of Object.keys(props ?? {})) {
    // The prop Python's positional arguments set (the registry's positional) is a protocol field
    // even where no keyword sets it: LinkViews' plots, its positional references.
    if (name === registry.components[kind]?.positional) continue;
    // A Template's contract (TODO 130.2): its main part's id, written by Python and
    // PortableTemplate for its other marks to follow; no keyword sets it.
    if (kind === "Template" && name === "contract") continue;
    if (!allowed?.has(name))
      throw Error(removedOffsetProp(kind, name) ?? `${kind}: unknown property '${name}'. Pass a declared ${kind} property or setting.`);
  }
}


/** The viewer's edits (the user layer, TODO 136.7) as the component's public props: a renaming.
 * Settings keys become prop names (a Plot's `plot.` prefix, a mark's cmapIndex as its
 * colormap, an axis's keys into its grouped x/y/z prop, dash and the legend into theirs).
 * An edit with no prop of its own is dropped: a channel bound to data, an expression or a scale
 * resource keeps its source. A prepared mark tells a column from a CSS color of the same name.
 * Unknown/internal settings stay local; they never widen a component's public API. */
export function settingsProps(kind, settings, props = {}, mark = null) {
  const allowed = accepted.get(kind) ?? new Set(), next = {};
  const values = Object.fromEntries(Object.entries(settings).map(([key, value]) => [key.replace(/^plot\./, ""), value]));
  const markKind = MAIN_KINDS.get(kind) ?? kind, channel = colorChannel(markKind);
  for (const [option, value] of Object.entries(values)) {
    // A Plot's unprefixed `legend` is its marks' group default (each mark's own entry), not the
    // Plot's legend: that is plot.legendEnabled and plot.legendPosition, below (TODO 133.1).
    if (kind === "Plot" && (option === "legend" || option === "legendPosition")) continue;
    // A camera edit made in 3D is not a 2D Plot's prop (it warns that it applies only to 3D).
    if (kind === "Plot" && values.type === "2d" && ["cameraFov", "cameraNear", "cameraFar"].includes(option)) continue;
    if (kind === "Plot" && option === "legendEnabled") {
      const position = values.legendPosition ?? "bottom";
      // Switched back on where the Plot set no legend: its default legend (TODO 136.17).
      if (value && position === "bottom" && props.legend == null) continue;
      next.legend = value ? (position === "bottom" ? true : { position }) : false;
      continue;
    }
    if (frames.has(kind)) {
      // Frame handles emit grouped axes; Plot handles also inherit Mapping's
      // primitive coordinate channels. Only the grouped objects are axis edits.
      if (["x", "y", "z"].includes(option)) {
        if (kind === "Frame" && value && typeof value === "object" && !Array.isArray(value))
          next[option] = { ...props[option], ...next[option], ...value };
        continue;
      }
      const axis = axisSetting(option);
      if (axis) {
        const [name, field] = axis;
        (next[name] ??= { ...props[name] })[field] = value;
        continue;
      }
    }
    if (option === "fillColor") {
      if (!allowed.has(channel)) continue;
      // A Bar's series is its fill, else its color column: a uniform fill would replace it.
      if (kind === "Bar" && props.fill == null && props.color != null) continue;
      const source = props[channel], field = mark?.fields?.get(channel);
      const mapped = mark?.categoryColorActive || field?.isBufferNode;
      // Expressions and columns retain their encoding. A uniform fallback color is not
      // a replacement for it, even when that fallback is edited in the settings pane.
      if (mapped || source === "transparent" || source != null && !Object.hasOwn(Object(source), "$literal") &&
          (typeof source !== "number" && (typeof source !== "string" || !mark))) continue;
      next[channel] = { $literal: value };
      continue;
    }
    const name = settingProp(kind, option);
    // A scale resource owns its channel's colors: a colormap beside it would configure a second
    // scale. Quantize and levels conflict with either color scale ("colorScale conflicts with
    // quantize", TODO 134.7).
    if (name === "colormap" && props[`${channel}Scale`] != null) continue;
    if ((name === "quantize" || name === "levels") && (props.fillScale != null || props.colorScale != null)) continue;
    // An edit to a channel bound to data or an expression is not a new definition of it.
    const source = props[name];
    const numericAppearance = name === "opacity" || scalarAppearance(markKind, name) && !["fill", "color"].includes(name);
    if (mark?.fields?.get(name)?.isBufferNode || name === "shape" && mark?.symbolCodeActive ||
        name === "outlineColor" && mark?.categoryOutlineActive || numericAppearance &&
        source != null && typeof source !== "number" && !Object.hasOwn(Object(source), "$literal")) continue;
    if (allowed.has(name)) next[name] = value;
  }
  if (allowed.has("dash") && ["dashed", "dashSize", "gapSize"].some((key) => Object.hasOwn(values, key))) {
    const prior = props.dash, size = Array.isArray(prior) ? prior[0] : typeof prior === "number" ? prior : 4,
      gap = Array.isArray(prior) ? prior[1] : size;
    next.dash = (values.dashed ?? !!prior) ? [values.dashSize ?? size, values.gapSize ?? gap] : false;
  }
  const omitted = OMITTED.get(kind);
  return Object.fromEntries(Object.entries(next).filter(([name]) => allowed.has(name) && !omitted?.has(name)));
}
