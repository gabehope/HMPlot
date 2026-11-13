// @ts-check
/**
 * A mark's `shade` (TODO 138.3): { kind, ...parameters }, a plugin's fragment hook. Its
 * `shade(inputs)` returns the color the mark draws, a vec4, from the color it would draw and the
 * inputs below; the core sets it as the material's outputNode (wrapping one the mark set; the
 * line material applies it to its own, lines.js). It cannot move or discard geometry, so
 * picking, domains, tooltips and legends are untouched, and the picking pass's output replaces
 * it. Number and color parameters are uniforms (changing one compiles nothing); the others are
 * part of the shade's key, and a new key rebuilds the material.
 *
 * Inputs: every mark's `color` (straight alpha, linear, before the plot's tone mapping),
 * `screenCoordinate` (device pixels), `screenUV` (0 to 1, down from the top), `time` (seconds;
 * the plot draws a frame only when something changes) and `params`. Marks with surface normals
 * (a lit material: Points3D, Prism, Surface, Arrows3D, GeoJSON's faces, a Heatmap, a lit Image)
 * add `normalView` and `positionView`; reading one on another mark is its error, naming the
 * marks that have it.
 */
import { Color, SRGBColorSpace } from "three/webgpu";
import {
  normalView,
  output,
  positionView,
  screenCoordinate,
  screenUV,
  time,
  uniform,
  vec4,
} from "three/tsl";
import { parameterProblem, withDefaults } from "../plugins/parameters.js";
import { diagnostic } from "./diagnostics.js";

/** The inputs only a mark with surface normals has. */
export const NORMAL_INPUTS = Object.freeze(["normalView", "positionView"]);
const NORMAL_MARKS =
  "Points3D, Prism, Surface, Arrows3D, GeoJSON (its faces), Heatmap and a lit Image";

/** A 1 x 1 canvas the browser draws a CSS color into (null outside one). */
let probe;
/**
 * `value`, any CSS color the browser draws (oklch(), color-mix(), ...), as "#rrggbb", which
 * three's Color.setStyle reads (it reads hex, rgb(), hsl() and names only). As given outside a
 * browser.
 * @param {string} value
 */
export function resolveColor(value) {
  probe ??=
    globalThis.document
      ?.createElement("canvas")
      .getContext("2d", { willReadFrequently: true }) ?? null;
  if (!probe) return value;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "#000000";
  probe.fillStyle = value;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** @param {unknown} value */
const show = (value) => {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

/**
 * @typedef {{ kind: string, definition: any, values: Record<string, unknown> }} ShadeEntry
 * @typedef {{ entry: ShadeEntry | null, problem: Error | string }} ReadShade
 */

/**
 * What a mark's `shade` asks for: its kind's definition and values (defaults filled in), or the
 * problem: not { kind, ...parameters }, a parameter its schema refuses, or a kind no plugin
 * registers (plugin.missing; the mark draws unshaded, and shaded once the plugin arrives).
 * @param {unknown} shade the prop: null or undefined for none
 * @param {{ get(stage: string, kind: string): any, missing(stage: string, kind: string): Error }} registry
 * @param {string} component the mark, as messages name it
 * @param {(value: string) => boolean} [isColor]
 * @returns {ReadShade}
 */
export function readShade(shade, registry, component, isColor) {
  if (shade == null || shade === false) return { entry: null, problem: "" };
  if (
    typeof shade !== "object" ||
    Array.isArray(shade) ||
    typeof (/** @type {any} */ (shade).kind) !== "string" ||
    !(/** @type {any} */ (shade).kind)
  )
    return {
      entry: null,
      problem: `${component}.shade is { kind, ...parameters }, as shade={{ kind: "hatch", spacing: 6 }}; got ${show(shade)}.`,
    };
  const { kind, ...values } = /** @type {{ kind: string }} */ (shade);
  const definition = registry.get("shade", kind);
  if (!definition) {
    const missing = registry.missing("shade", kind);
    missing.message = `${component}.shade: ${missing.message}`;
    return { entry: null, problem: missing };
  }
  const schema = definition.parameters ?? {};
  const problem = parameterProblem(kind, schema, values, isColor);
  if (problem)
    return {
      entry: null,
      problem: `${component}.shade: ${kind} ${problem.slice(kind.length + 2)}`,
    };
  return {
    entry: { kind, definition, values: withDefaults(schema, values) },
    problem: "",
  };
}

/**
 * A mark's shade: `set(entry)` takes readShade's entry (null for none) and says whether its
 * material must be shaded again (a new kind or plain value); `apply(material)` shades it, or
 * restores it, and returns the problem ("" for none).
 * @param {() => string} named the mark, as messages name it (a mark may be renamed after it is made)
 */
export function createShade(named) {
  /** @type {ShadeEntry | null} */
  let entry = null;
  /** @type {Record<string, any>} */
  let uniforms = {};
  /** @type {Record<string, unknown>} */
  let plain = {};
  let key = "";
  /** Whether the last apply shaded its material (an export draws it as an image then). */
  let applied = false;
  /** The material's own output, its shaded output and the key it was built with. */
  const shaded = new WeakMap();

  /** @param {ShadeEntry} next */
  const setValues = (next) => {
    const schema = next.definition.parameters ?? {};
    const full = withDefaults(schema, next.values);
    for (const [name, node] of Object.entries(uniforms))
      if (full[name] == null) continue;
      else if (schema[name].type === "number") node.value = full[name];
      else
        node.value.setStyle(resolveColor(String(full[name])), SRGBColorSpace);
    // A parameter without a default that is left out is null, a uniform's too (TODO 138.5):
    // giving it or leaving it out is a new key.
    plain = Object.fromEntries(
      Object.keys(schema).flatMap(
        (name) =>
          /** @type {[string, unknown][]} */ (
            full[name] == null
              ? [[name, null]]
              : name in uniforms
                ? []
                : [[name, full[name]]]
          ),
      ),
    );
  };

  /** The shade's output over `color`, or throws (a diagnostic naming the mark). */
  const build = (/** @type {any} */ material, /** @type {any} */ color) => {
    const component = named();
    const normals = !!material.isMeshStandardNodeMaterial;
    /** @type {Record<string, unknown>} */
    const inputs = {
      color,
      screenCoordinate,
      screenUV,
      time,
      params: {
        ...plain,
        ...Object.fromEntries(
          Object.entries(uniforms).filter(([name]) => plain[name] !== null),
        ),
      },
      ...(normals ? { normalView, positionView } : {}),
    };
    const kind = entry?.kind;
    const guarded = new Proxy(inputs, {
      get(target, name) {
        if (
          typeof name === "string" &&
          NORMAL_INPUTS.includes(name) &&
          !(name in target)
        )
          throw diagnostic(
            "plugin.input",
            `${component}.shade: ${kind} reads ${name}, and ${component} has no surface normals. The marks that have it: ${NORMAL_MARKS}.`,
            { component, property: "shade" },
          );
        return target[/** @type {string} */ (name)];
      },
    });
    let result;
    try {
      result = entry?.definition.shade(guarded);
    } catch (error) {
      if (/** @type {any} */ (error)?.code === "plugin.input") throw error;
      throw diagnostic(
        "plugin.failed",
        `${component}.shade: ${kind} failed, and ${component} draws unshaded: ${/** @type {any} */ (error)?.message ?? error}`,
        { component, property: "shade" },
      );
    }
    if (!result?.isNode)
      throw diagnostic(
        "plugin.failed",
        `${component}.shade: ${kind} returned ${show(result)}, not a vec4 node; ${component} draws unshaded.`,
        { component, property: "shade" },
      );
    return vec4(result);
  };

  /** @param {any} material */
  const restore = (material) => {
    const state = shaded.get(material);
    if (!state) return;
    shaded.delete(material);
    if ("shadeOutput" in material) material.shadeOutput = null;
    else if (material.outputNode === state.shaded)
      material.outputNode = state.base;
    material.needsUpdate = true;
  };

  return {
    get kind() {
      return entry?.kind ?? null;
    },
    /** The current shade's key: its kind and plain values ("" for none). */
    get key() {
      return key;
    },
    /** Whether the mark draws shaded: a shade is set and its last apply succeeded. */
    get applied() {
      return applied && entry !== null;
    },
    /** @param {ShadeEntry | null} next */
    set(next) {
      if (!next) {
        const had = entry !== null;
        entry = null;
        uniforms = {};
        key = "";
        return had;
      }
      if (next.definition !== entry?.definition) {
        uniforms = {};
        for (const [name, parameter] of Object.entries(
          next.definition.parameters ?? {},
        ))
          if (
            !parameter.structural &&
            (parameter.type === "number" || parameter.type === "color")
          )
            uniforms[name] =
              parameter.type === "number"
                ? uniform(parameter.default ?? 0)
                : uniform(new Color());
      }
      entry = next;
      setValues(next);
      const nextKey = `${next.kind}:${JSON.stringify(plain)}`;
      const changed = nextKey !== key;
      key = nextKey;
      return changed;
    },
    /**
     * Shade `material` with the current shade (or restore it without one). A material the mark
     * set an outputNode on keeps it beneath; the line material shades its own (shadeOutput).
     * @param {any} material
     * @returns {Error | string} the problem, "" for none (the material is then unshaded)
     */
    apply(material) {
      if (!material?.isNodeMaterial) return "";
      if (!entry) {
        applied = false;
        restore(material);
        return "";
      }
      const state = shaded.get(material);
      const own = "shadeOutput" in material;
      const base =
        state && material.outputNode === state.shaded
          ? state.base
          : material.outputNode;
      if (state && state.key === key && (own || state.base === base)) {
        applied = true;
        return "";
      }
      try {
        // Built once here, so a problem is the mark's now, not the shader compile's.
        const node = build(material, own ? output : (base ?? output));
        if (own)
          material.shadeOutput = (/** @type {any} */ color) =>
            build(material, color);
        else material.outputNode = node;
        shaded.set(material, {
          base: own ? null : base,
          shaded: own ? null : node,
          key,
        });
        material.needsUpdate = true;
        applied = true;
        return "";
      } catch (error) {
        applied = false;
        restore(material);
        return /** @type {Error} */ (error);
      }
    },
    /** @param {any} material */
    restore,
  };
}
