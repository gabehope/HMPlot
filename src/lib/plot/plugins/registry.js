// @ts-check
/**
 * The plugin registry (TODO 138.2; library.js holds the library's one, behind registerPlugin, 138.3). A plugin is
 * JavaScript only: `export default definePlugin({ name, apiVersion: 1, setup(hm) })`. setup gets
 * the running library's own three.js, TSL and jax (a plugin never imports its own: two three.js
 * copies cannot share a node graph) and declares its effects, shades and transforms through
 * hm.effect, hm.shade and hm.transform, each with a parameter schema (parameters.js). A plot that
 * names a kind no plugin has registered gets a plugin.missing diagnostic and draws without it.
 *
 * Diagnostics (utils/diagnostics.js's shape): plugin.failed (a definition or setup that throws,
 * an API version this library does not have; nothing of the plugin registers), plugin.conflict
 * (a name, or an effect, shade or transform kind, another plugin registered first) and
 * plugin.missing.
 */
import { diagnostic } from "../utils/diagnostics.js";
import { checkSchema } from "./parameters.js";

export const PLUGIN_API_VERSION = 1;
/** What a plugin declares, by the hm method that declares it. */
export const PLUGIN_STAGES = Object.freeze([
  "effect",
  "shade",
  "transform",
  "layout",
]);
/** The plugins definePlugin checked: register trusts these, and checks any other object. */
const DEFINED = new WeakSet();
const NAME = /^[a-z][a-z0-9]*(?:[-.][a-z0-9]+)*$/;

/**
 * @typedef {{ name: string, apiVersion: number, version?: string, setup: (hm: any) => void }} Plugin
 * @typedef {{ parameters?: import("./parameters.js").ParameterSchema, [key: string]: unknown }} Definition
 */

/**
 * The library's own effects and presentation hooks (utils/presentation.js): no plugin's kind. The
 * sky and the atmosphere are first-party plugins' kinds (src/lib/plugins, TODO 138.5), which the
 * bundles register first, so another plugin declaring one is a plugin.conflict.
 */
const RESERVED_EFFECTS = Object.freeze(["bloom", "fog", "glow"]);
/** What an effect's stage may be, with the function of that name its definition gives. */
const EFFECT_STAGES = Object.freeze({
  linear: "returning { rgb, alpha }",
  display: "returning { rgb, alpha }",
  object: "returning { object, set, update, dispose }",
});

/** Validate the execution declaration before publishing any part of a plugin.
 * This module deliberately depends on neither the numerical runner nor rendering libraries.
 * @param {string} kind @param {any} definition
 */
function checkTransform(kind, definition) {
  if (
    definition.categoryAxis !== undefined &&
    typeof definition.categoryAxis !== "function"
  )
    throw Error(
      `Transform "${kind}": categoryAxis must be a function of its parameters.`,
    );
  if (
    definition.perGroup !== undefined &&
    typeof definition.perGroup !== "boolean"
  )
    throw Error(`Transform "${kind}": perGroup must be true or false.`);
  if (!["rows", "padded", "grid"].includes(definition.reads))
    throw Error(
      `Transform "${kind}": reads must be "rows", "padded" or "grid".`,
    );
  if (
    typeof definition.output !== "function" &&
    !["sameRows", "subset", "newRows", "graph"].includes(definition.output)
  )
    throw Error(
      `Transform "${kind}": output must be "sameRows", "subset", "newRows", "graph" or a function of { params, grid }.`,
    );
  if (typeof definition.run !== "function")
    throw Error(`Transform "${kind}": pass a run(inputs) function.`);
  if (
    definition.inspect !== undefined &&
    typeof definition.inspect !== "function"
  )
    throw Error(
      `Transform "${kind}": inspect must be a function of { resources, params }.`,
    );
  if (
    definition.outputs !== undefined &&
    typeof definition.outputs !== "function"
  )
    throw Error(
      `Transform "${kind}": outputs must be a function of its parameters.`,
    );
}

/** Layouts publish both graph relations through the existing one-shot host.
 * @param {string} kind @param {any} definition
 */
function checkLayout(kind, definition) {
  if (typeof definition.run !== "function")
    throw Error(
      `Layout "${kind}": pass a run({ graph, params, signal }) function.`,
    );
  if (
    definition.hierarchy !== undefined &&
    typeof definition.hierarchy !== "boolean"
  )
    throw Error(`Layout "${kind}": hierarchy must be true or false.`);
  for (const name of ["nodeOutputs", "edgeOutputs"])
    if (
      definition[name] !== undefined &&
      typeof definition[name] !== "function"
    )
      throw Error(
        `Layout "${kind}": ${name} must be a function of its parameters.`,
      );
}

/**
 * An effect's definition (TODO 138.3): its stage ("linear", "display" or "object", TODO 138.5) and
 * the function of that name, its optional order, cameras and export, as utils/presentation.js's
 * hooks take them, and its optional check(values, context).
 * @param {string} kind @param {any} definition
 */
function checkEffect(kind, definition) {
  const { stage, order, cameras, export: exported } = definition;
  if (RESERVED_EFFECTS.includes(kind))
    throw Error(
      `effect "${kind}" is the name of a built-in effect (${RESERVED_EFFECTS.join(", ")}); name it after the plugin ("acme.${kind}").`,
    );
  if (!Object.hasOwn(EFFECT_STAGES, stage))
    throw Error(
      `effect "${kind}" has stage ${JSON.stringify(stage)}; an effect's stage is "linear", "display" or "object".`,
    );
  if (typeof definition[stage] !== "function")
    throw Error(
      `effect "${kind}" is ${stage === "object" ? "an" : "a"} ${stage} effect without a ${stage}(inputs) function ${EFFECT_STAGES[/** @type {keyof typeof EFFECT_STAGES} */ (stage)]}.`,
    );
  if (definition.check !== undefined && typeof definition.check !== "function")
    throw Error(
      `effect "${kind}" has a check that is not a function of its values.`,
    );
  if (order !== undefined && !Number.isFinite(order))
    throw Error(
      `effect "${kind}" has order ${JSON.stringify(order)}, not a number.`,
    );
  if (cameras !== undefined && cameras !== "any" && cameras !== "perspective")
    throw Error(
      `effect "${kind}" has cameras ${JSON.stringify(cameras)}, not "any" or "perspective".`,
    );
  if (exported !== undefined && exported !== "raster" && exported !== "none")
    throw Error(
      `effect "${kind}" has export ${JSON.stringify(exported)}, not "raster" or "none".`,
    );
}

/**
 * A plugin, checked: a lowercase name ("hatch", "acme.vignette"), the plugin API version it was
 * written for and its setup function.
 * @param {Plugin} plugin
 * @returns {Readonly<Plugin>}
 */
export function definePlugin(plugin) {
  const { name, apiVersion, setup } = plugin ?? {};
  if (typeof name !== "string" || !NAME.test(name))
    throw diagnostic(
      "plugin.failed",
      `definePlugin: name is lowercase letters and digits, joined by "-" or "." ("hatch", "acme.vignette"); got ${JSON.stringify(name)}.`,
    );
  if (!Number.isInteger(apiVersion))
    throw diagnostic(
      "plugin.failed",
      `Plugin "${name}": apiVersion is the plugin API version it was written for (apiVersion: ${PLUGIN_API_VERSION}); got ${JSON.stringify(apiVersion)}.`,
    );
  if (typeof setup !== "function")
    throw diagnostic(
      "plugin.failed",
      `Plugin "${name}": setup is a function of hm that declares its effects, shades and transforms.`,
    );
  const defined = Object.freeze({ ...plugin });
  DEFINED.add(defined);
  return defined;
}

/**
 * A registry: `register(plugin)` runs its setup and records what it declares, or throws a
 * diagnostic and records nothing; `get(stage, kind)` is a declared definition; `missing(stage,
 * kind)` the diagnostic for a kind none declares; `subscribe(listener)` hears each registration
 * (a plot waiting on a kind draws it when it arrives).
 * @param {{ three?: unknown, tsl?: unknown, jax?: unknown }} libraries what setup's hm passes on
 */
export function createPluginRegistry(libraries = {}) {
  /** @type {Map<string, { plugin: Readonly<Plugin>, input: object }>} */
  const plugins = new Map();
  /** @type {Record<string, Map<string, { plugin: string, definition: Definition }>>} */
  const declared = Object.fromEntries(
    PLUGIN_STAGES.map((stage) => [stage, new Map()]),
  );
  /** @type {Map<string, string>} Built-in kinds use the same selector as plugin computations. */
  const reserved = new Map();
  const namespace = (/** @type {string} */ stage) =>
    stage === "layout" ? "transform" : stage;
  /** @type {Set<(plugin: Readonly<Plugin>) => void>} */
  const listeners = new Set();
  /** @param {string} name @param {string} message */
  const failed = (name, message) =>
    diagnostic("plugin.failed", `Plugin "${name}" failed: ${message}`, {
      component: "Plugin",
    });
  return {
    /** Register a built-in host's kinds without importing its implementation here.
     * @param {string} stage @param {Iterable<string>} kinds
     */
    reserve(stage, kinds) {
      for (const kind of kinds) {
        for (const [other, definitions] of Object.entries(declared))
          if (namespace(other) === namespace(stage) && definitions.has(kind))
            throw diagnostic(
              "plugin.conflict",
              `Built-in ${stage} "${kind}" conflicts with an already registered plugin; use a plugin-prefixed kind.`,
            );
        reserved.set(`${namespace(stage)}:${kind}`, stage);
      }
    },
    /** @param {Plugin} input */
    register(input) {
      const plugin = DEFINED.has(input) ? input : definePlugin(input);
      const { name } = plugin;
      const entry = plugins.get(name);
      if (entry?.input === input) return;
      const present = entry?.plugin;
      if (present)
        throw diagnostic(
          "plugin.conflict",
          `Plugin "${name}" is already registered${present.version ? ` (version ${present.version})` : ""}: register one copy of it.`,
          { component: "Plugin" },
        );
      if (plugin.apiVersion !== PLUGIN_API_VERSION)
        throw failed(
          name,
          `it was written for plugin API version ${plugin.apiVersion}, and this HMPlot has version ${PLUGIN_API_VERSION}.`,
        );
      /** @type {[string, string, Definition][]} */
      const staged = [];
      // A declaration's mistake fails the whole plugin, even one setup catches; and hm declares
      // only while setup runs (a later call would record nothing).
      /** @type {unknown[]} */
      const problems = [];
      let open = true;
      /** @param {string} stage */
      const declare =
        (stage) =>
        (/** @type {string} */ kind, /** @type {Definition} */ definition) => {
          if (!open)
            throw Error(
              `Plugin "${name}": hm.${stage}("${kind}") was called after setup returned; setup declares everything synchronously.`,
            );
          try {
            check(stage, kind, definition);
          } catch (error) {
            problems.push(error);
            throw error;
          }
          staged.push([stage, kind, Object.freeze({ ...definition })]);
        };
      /** @param {string} stage @param {unknown} kind @param {any} definition */
      const check = (stage, kind, definition) => {
        if (typeof kind !== "string" || !kind)
          throw Error(
            `hm.${stage} takes a kind (a name) and its definition; got ${JSON.stringify(kind)}.`,
          );
        if (!definition || typeof definition !== "object")
          throw Error(`hm.${stage}("${kind}") takes a definition object.`);
        if (definition.parameters !== undefined)
          checkSchema(`${kind}`, definition.parameters);
        if (
          ["effect", "shade"].includes(stage) &&
          Object.values(definition.parameters ?? {}).some(
            (parameter) => parameter.shape !== undefined,
          )
        )
          throw Error(
            `${stage} "${kind}": vector shape is for numerical transforms; use length for a vector uniform.`,
          );
        if (stage === "effect") checkEffect(kind, definition);
        if (stage === "transform") checkTransform(kind, definition);
        if (stage === "layout") checkLayout(kind, definition);
        if (stage === "transform" || stage === "layout") {
          const controls = new Set([
            "kind",
            "params",
            "name",
            "label",
            "by",
            "as",
            "children",
            "onconfigure",
          ]);
          const collision = Object.keys(definition.parameters ?? {}).find(
            (key) => controls.has(key) || key.startsWith("__"),
          );
          if (collision)
            throw Error(
              `${kind}: parameter "${collision}" is reserved by Transform; choose another parameter name.`,
            );
        }
        // Only an effect's presentation loads images (TODO 138.5).
        const image = Object.entries(definition.parameters ?? {}).find(
          ([, parameter]) => parameter?.type === "image",
        );
        if (image && stage !== "effect")
          throw Error(
            `${stage} "${kind}": parameter "${image[0]}" is an image, which only an effect takes.`,
          );
        if (stage === "shade" && typeof definition.shade !== "function")
          throw Error(
            `shade "${kind}" has no shade(inputs) function returning the mark's color, a vec4.`,
          );
        const builtIn = reserved.get(`${namespace(stage)}:${kind}`);
        if (builtIn)
          throw diagnostic(
            "plugin.conflict",
            `Plugin "${name}": "${kind}" is a built-in ${builtIn}; use a plugin-prefixed kind such as "${name}.${kind}".`,
          );
        const owner = Object.entries(declared)
          .find(
            ([other, definitions]) =>
              namespace(other) === namespace(stage) && definitions.has(kind),
          )?.[1]
          .get(kind)?.plugin;
        if (owner)
          throw diagnostic(
            "plugin.conflict",
            `Plugin "${name}": ${stage} "${kind}" is already registered by plugin "${owner}".`,
            { component: "Plugin" },
          );
        if (
          staged.some(
            ([other, otherKind]) =>
              namespace(other) === namespace(stage) && otherKind === kind,
          )
        )
          throw Error(`it declares the ${stage} "${kind}" twice.`);
      };
      const hm = Object.freeze({
        ...libraries,
        effect: declare("effect"),
        shade: declare("shade"),
        transform: declare("transform"),
        layout: declare("layout"),
      });
      try {
        const result = /** @type {unknown} */ (plugin.setup(hm));
        if (problems.length) throw problems[0];
        if (result && typeof (/** @type {any} */ (result).then) === "function")
          throw Error(
            "setup returned a promise: it declares its effects, shades and transforms synchronously.",
          );
      } catch (error) {
        if (/** @type {any} */ (error)?.code === "plugin.conflict") throw error;
        throw failed(
          name,
          /** @type {any} */ (error)?.message ?? String(error),
        );
      } finally {
        open = false;
      }
      plugins.set(name, { plugin, input });
      for (const [stage, kind, definition] of staged)
        declared[stage].set(kind, { plugin: name, definition });
      // A listener's error is its own: the plugin is registered, and the other listeners hear it.
      for (const listener of listeners)
        try {
          listener(plugin);
        } catch (error) {
          console.error(
            `Plugin "${name}": a registration listener failed.`,
            error,
          );
        }
    },
    /** @param {string} stage @param {string} kind */
    get(stage, kind) {
      return declared[stage]?.get(kind)?.definition;
    },
    /** The plugin that declared `kind`, or undefined. @param {string} stage @param {string} kind */
    owner(stage, kind) {
      return declared[stage]?.get(kind)?.plugin;
    },
    /** The kinds of `stage` registered plugins declare. @param {string} stage */
    kinds(stage) {
      return [...(declared[stage]?.keys() ?? [])];
    },
    /** The registered plugins' names. */
    names() {
      return [...plugins.keys()];
    },
    /**
     * A plot naming `kind` that no plugin declares: drawn without it, with this diagnostic.
     * `builtIn`: the library's own kinds of `stage`, which the message lists first.
     * @param {string} stage @param {string} kind @param {readonly string[]} [builtIn]
     */
    missing(stage, kind, builtIn = []) {
      const known = [...(declared[stage]?.keys() ?? [])];
      const listed = [
        builtIn.length ? `Built in: ${builtIn.join(", ")}.` : "",
        known.length
          ? `Registered: ${known.join(", ")}.`
          : `No ${stage} is registered.`,
      ]
        .filter(Boolean)
        .join(" ");
      return diagnostic(
        "plugin.missing",
        `No plugin registers the ${stage} "${kind}", so the plot draws without it. ${listed} A JavaScript app passes its plugin to registerPlugin(); Python installs its package.`,
        { component: "Plugin" },
      );
    },
    /** @param {(plugin: Readonly<Plugin>) => void} listener */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
