/**
 * The plot's presentation step (TODO 37): what the scene pass's color becomes on the canvas or
 * in a PNG. Sky, fog and glow are composited here, after the scene pass, and never added to the
 * scene: the picking pass, the minimap, surface textures and document-export rasters render the
 * scene themselves, and a sky or a glow there would be read as data or drawn twice.
 *
 * The order (docs/RENDERING.md "Sky, fog and glow"): fog blends the scene's color toward the fog
 * color by its depth; the blurred glow is added, with coverage of its own; the output conversion
 * (tone mapping, color space) runs; and the sky goes beneath, in display space, so an image shows
 * its file's colors and a gradient its CSS colors.
 *
 * Each effect is a hook at one stage (TODO 138.1), so the render loop names none of them:
 *   attachment: a named scene-pass MRT output from a per-object input, present only while the
 *     scene asks for it (`wanted(scene)`, checked every frame); `build(scenePass)` makes what the
 *     later stages read from it (glow: its bloom), disposed with the scene pass.
 *   linear: after the scene pass, before tone mapping: ({ rgb, alpha, scenePass, attachments })
 *     to { rgb, alpha } (fog; glow's composite, which needs its attachment).
 *   display: after tone mapping, in display space: ({ rgb, alpha }) to { rgb, alpha, opaque }
 *     (the sky beneath). `beforeRender(camera)` runs before each render that shows it.
 *   object: an Object3D in the plot's scene (addObject: a Frame's object effect,
 *     scenes/presentationObject.svelte); only exports ask for it.
 * Each hook names its effect as an export message does (`name`), its `order` in its stage, its
 * `cameras` ("any", or "perspective": a 3D plot only) and its `export`: "raster" (SVG and PDF draw
 * the plot as one image while it shows) or "none". `key()` names the variant it builds (the sky's
 * kind): a change of key rebuilds the presentation, anything else is a uniform.
 *
 * A Plot's `effects` (TODO 138.3, utils/effects.js) turn the built-ins on and add plugins'
 * effects (setPluginEffects): a plugin's linear or display effect is a hook like the built-ins',
 * its number, color and vector parameters uniforms the presentation creates and updates, its
 * image parameters textures it loads (TODO 138.5). The sky and the atmosphere are first-party
 * plugins (src/lib/plugins), which this module does not name.
 */
import { resolveColor } from "./shade.js";
import { BlendMode, ClampToEdgeWrapping, Color, LinearFilter, MaterialBlending, Matrix4, NoColorSpace, RepeatWrapping, SRGBColorSpace, Texture, Vector2, Vector3, Vector4 } from "three/webgpu";
import { mix, mrt, output, renderOutput, screenUV, texture, uniform, vec4 } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { loadImageFile } from "./imageFiles.js";
import { withDefaults } from "../plugins/parameters.js";
import { diagnostic } from "./diagnostics.js";
import { BLOOM_DEFAULTS } from "./effects.js";

export { BLOOM_PARAMETERS, BLOOM_DEFAULTS, fogProblem } from "./effects.js";
/** The context key of a Plot's Presentation (viewCore.svelte sets it; a Frame's object effects read it). */
export const PRESENTATION_CONTEXT = Symbol("hmplot-presentation");
/** Fog's distances when the settings pane turns it on (camera world units; the box spans 100). */
export const FOG_DEFAULTS = Object.freeze({ near: 100, far: 300 });

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const show = (value) => {
  if (typeof value === "string" || (value && typeof value === "object" && !(value instanceof Blob)))
    try { return JSON.stringify(value); } catch { /* cyclic: as a string */ }
  return String(value);
};

/** The problem with a mark's `glow`, or "" (finite and at least 0). */
export function glowProblem(component, glow) {
  return glow === undefined || (finite(glow) && glow >= 0) ? ""
    : `${component}: glow is a number of at least 0 (0, the default, does not glow); got ${show(glow)}.`;
}

/**
 * A texture of a decoded image parameter: sampled as stored (display space), without mipmaps;
 * `wrap` "repeat" filters across its width's ends (a panorama's longitude seam).
 */
export function imageTexture(image, wrap = "clamp") {
  const result = new Texture(image);
  result.colorSpace = NoColorSpace;
  result.generateMipmaps = false;
  result.minFilter = LinearFilter;
  result.magFilter = LinearFilter;
  result.wrapS = wrap === "repeat" ? RepeatWrapping : ClampToEdgeWrapping;
  result.needsUpdate = true;
  return result;
}

/** Free an image texture and the bitmap it was decoded into. */
function release(image) {
  image.dispose();
  image.image?.close?.();
}

/** A uniform holding a vector parameter's value (2, 3 or 4 numbers). */
const vectorUniform = (length) => uniform(length === 2 ? new Vector2() : length === 3 ? new Vector3() : new Vector4());

/**
 * One Plot's presentation state: the uniforms its effects read (shared by the live pipeline and
 * every export, so a setting changes a value and compiles nothing), the glow attachment's MRT and
 * the plugins' effects its `effects` list.
 */
export class Presentation {
  constructor() {
    // A drawn object's glow, read per object as the beauty pass draws it: a mark's `glow`
    // (objects/base.js), 0 for everything else. Changing it compiles nothing.
    this.glowAmount = uniform(0).onObjectUpdate(({ object }) => object?.plotGlow ?? 0);
    // The scene pass writes the mark's own linear color times its glow beside its color, with
    // the material's blending: an opaque mark without glow in front writes 0 and hides a glow
    // behind it, and a translucent one dims it.
    this.glowMRT = mrt({ output, glow: vec4(output.rgb.mul(this.glowAmount), output.a) })
      .setBlendMode("glow", new BlendMode(MaterialBlending));
    this.fogNear = uniform(0);
    this.fogFar = uniform(1);
    this.fogColor = uniform(new Color(1, 1, 1));
    this.bloom = { ...BLOOM_DEFAULTS };
    this.bloomNodes = new Set();
    // The plot camera's inverse projection, world matrix and up, as a plugin's effect reads them
    // (a view direction per pixel; the sky's up).
    this.projectionInverse = uniform(new Matrix4());
    this.cameraWorld = uniform(new Matrix4());
    this.cameraUp = uniform(new Vector3(0, 1, 0));
    // Fog's settings (setFog): null while it is off.
    this.fog = null;
    // The Object3Ds of object hooks (addObject), by effect name, with their export rule.
    this.objects = new Map();
    /** Hold the plot's settle until `work` (an image parameter's load) is done: the Plot's. */
    this.track = (work) => work;
    /** Decode an image parameter's value (a URL, a bitmap, an element or a Blob). */
    this.loadImage = loadImageFile;
    this.builtIns = this.builtInHooks();
    this.hooks = this.builtIns;
    // The plugins' effects (setPluginEffects), by kind, and the message of each that failed to build.
    this.plugins = new Map();
    this.failures = new Map();
    /**
     * Where an effect's settings go ("bloom", its values by its parameters' names):
     * presentationOptions.svelte.ts sets the Plot's options, which the settings pane edits.
     */
    this.onSettings = null;
    this.listeners = new Set();
  }

  /** Called when an effect's state or settings change (a setting, an image loading, one coming or going). */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  changed() {
    for (const listener of this.listeners) listener();
  }

  /** The problems of the plugins' effects: an image that failed to load. */
  problems() {
    return [...this.plugins.values()].flatMap((effect) => effect.problems());
  }
  /** Release the plugins' effects (their images); the Plot is gone. */
  dispose() {
    for (const effect of this.plugins.values()) effect.dispose();
    this.plugins = new Map();
    this.hooks = this.builtIns;
  }

  /**
   * The bloom's strength and radius (uniforms of every bloom built from this presentation).
   * @param {{ strength?: number, radius?: number }} [settings]
   */
  setBloom({ strength = BLOOM_DEFAULTS.strength, radius = BLOOM_DEFAULTS.radius } = {}) {
    this.bloom = { strength, radius };
    for (const node of this.bloomNodes) {
      node.strength.value = strength;
      node.radius.value = radius;
    }
    this.changed();
  }
  /** A bloom of the scene pass's glow attachment, at this presentation's settings. */
  bloomOf(scenePass) {
    const node = bloom(scenePass.getTextureNode("glow"), this.bloom.strength, this.bloom.radius, 0);
    this.bloomNodes.add(node);
    const dispose = node.dispose.bind(node);
    node.dispose = () => { this.bloomNodes.delete(node); dispose(); };
    return node;
  }

  /** Fog's distances (camera world units) and CSS color, or null to turn it off. */
  setFog(fog) {
    this.fog = fog ?? null;
    if (fog) {
      this.fogNear.value = fog.near;
      this.fogFar.value = fog.far;
      this.fogColor.value.setStyle(fog.color);
    }
    this.changed();
  }

  /**
   * An object hook's Object3D (`name`: the effect's, as an export names it; `exported`: its export
   * rule): while it is visible in the scene and its rule is "raster", exports report the effect.
   * Returns its release.
   */
  addObject(name, object, exported = "raster") {
    const objects = this.objects.get(name) ?? new Map();
    this.objects.set(name, objects.set(object, exported));
    return () => objects.delete(object);
  }

  /** The built-in effects' hooks, in the order an export names their effects. */
  builtInHooks() {
    const anyGlowing = (scene) => {
      let found = false;
      scene.traverseVisible((object) => { if (object.plotGlow > 0) found = true; });
      return found;
    };
    return [
      {
        name: "fog", stage: "linear", order: 0, cameras: "perspective", export: "raster",
        key: () => (this.fog ? "on" : null),
        linear: ({ rgb, alpha, scenePass }) => {
          // Positive camera-space depth; empty pixels sit at the far plane but keep alpha 0.
          const depth = scenePass.getViewZNode().negate();
          const amount = depth.sub(this.fogNear).div(this.fogFar.sub(this.fogNear).max(1e-6)).clamp(0, 1);
          return { rgb: mix(rgb, this.fogColor, amount), alpha };
        },
      },
      {
        name: "glow", stage: "attachment", order: 0, cameras: "any", export: "raster",
        attachment: "glow", wanted: anyGlowing,
        mrt: this.glowMRT,
        build: (scenePass) => this.bloomOf(scenePass),
      },
      {
        name: "glow", stage: "linear", order: 1, cameras: "any", export: "raster",
        // The composite of the glow attachment's bloom: present with the attachment.
        reads: "glow",
        linear: ({ rgb, alpha, attachments }) => {
          // The glow has no coverage of its own outside its mark: its brightest channel is.
          const light = attachments.glow.rgb;
          const coverage = alpha.max(light.r.max(light.g).max(light.b)).min(1);
          return { rgb: rgb.mul(alpha).add(light).div(coverage.max(1e-8)), alpha: coverage };
        },
      },
    ];
  }

  /**
   * The plugins' effects a Plot's `effects` lists ({ kind, definition, values }, utils/effects.js),
   * in its order. A kind already present keeps its uniforms: a new value of one compiles nothing.
   */
  setPluginEffects(entries) {
    const next = new Map();
    for (const { kind, definition, values } of entries) {
      let effect = this.plugins.get(kind);
      if (effect?.definition !== definition) effect = this.pluginEffect(kind, definition);
      effect.set(values);
      next.set(kind, effect);
    }
    for (const kind of this.failures.keys()) if (next.get(kind) !== this.plugins.get(kind)) this.failures.delete(kind);
    for (const [kind, effect] of this.plugins) if (next.get(kind) !== effect) effect.dispose();
    this.plugins = next;
    this.hooks = [...this.builtIns, ...[...next.values()].map((effect) => effect.hook)];
    this.changed();
  }

  /**
   * A plugin's effect as a hook. Its number, color and vector parameters (unless structural) are
   * uniforms the hook's nodes read; an image parameter is a texture node, loaded here (the plot's
   * settle waits for it, and the effect is drawn once it has loaded); the rest are plain values.
   * A parameter without a default that is left out is null in `params`. A change of a plain
   * value, or of which parameters are given, rebuilds (its key); `shown(values)` false leaves the
   * effect out (not drawn, not exported).
   */
  pluginEffect(kind, definition) {
    const schema = definition.parameters ?? {}, stage = definition.stage;
    if (stage !== "linear" && stage !== "display")
      throw Error(`Plot.effects: ${kind} has stage ${JSON.stringify(stage)}; a plugin's effect is "linear" or "display".`);
    const uniforms = {}, images = {};
    for (const [name, parameter] of Object.entries(schema)) {
      if (parameter.type === "image")
        images[name] = { node: texture(new Texture()), wrap: parameter.wrap, source: undefined, texture: null, error: "", abort: null };
      else if (!parameter.structural && (parameter.type === "number" || parameter.type === "color" || parameter.type === "vector"))
        uniforms[name] = parameter.type === "number" ? uniform(parameter.default ?? 0)
          : parameter.type === "color" ? uniform(new Color()) : vectorUniform(parameter.length);
    }
    let plain = {}, key = "{}", shown = true;
    const camera = { projectionInverse: this.projectionInverse, world: this.cameraWorld, up: this.cameraUp };
    const build = (inputs) => {
      const nodes = Object.fromEntries(Object.entries(uniforms).filter(([name]) => plain[name] !== null));
      for (const [name, image] of Object.entries(images)) nodes[name] = image.texture ? image.node : null;
      const result = definition[stage]({ ...inputs, uv: screenUV, params: { ...plain, ...nodes }, camera });
      // Nodes, checked here: a plain value would fail later, in the shader's compile, and take the plot with it.
      if (!result?.rgb?.isNode || !result?.alpha?.isNode)
        throw Error(`its ${stage} returned ${result ? `{ ${Object.keys(result).join(", ")} }` : String(result)}, not { rgb, alpha } nodes`);
      return result;
    };
    // Drawn while shown and every given image has loaded.
    const ready = () => shown && Object.values(images).every((image) => image.source == null || image.texture);
    const load = (name, image, source) => {
      image.abort?.abort();
      if (image.texture) release(image.texture);
      Object.assign(image, { source, texture: null, error: "", abort: null });
      if (source == null) return;
      const abort = (image.abort = new AbortController());
      const work = new Promise((resolve) => resolve(this.loadImage(source, abort.signal, `Plot.effects: ${kind} ${name}`))).then(
        (decoded) => {
          if (abort.signal.aborted) decoded?.close?.();
          else { image.texture = imageTexture(decoded, image.wrap); image.node.value = image.texture; this.changed(); }
        },
        (error) => {
          if (!abort.signal.aborted) { image.error = error?.message ?? String(error); this.changed(); }
        },
      );
      this.track(work);
    };
    const hook = {
      name: kind, stage, order: definition.order ?? 0, cameras: definition.cameras ?? "any",
      export: definition.export ?? "raster", plugin: true, key: () => (ready() ? key : null),
      beforeRender: (camera) => this.updateCamera(camera),
      [stage]: stage === "linear"
        ? ({ rgb, alpha, scenePass }) => build({ rgb, alpha, depth: scenePass.getViewZNode().negate() })
        : ({ rgb, alpha }) => build({ rgb, alpha }),
    };
    return {
      definition, hook,
      set: (values) => {
        const full = withDefaults(schema, values);
        for (const [name, node] of Object.entries(uniforms)) {
          const value = full[name];
          if (value == null) continue;
          if (schema[name].type === "number") node.value = value;
          else if (schema[name].type === "vector") node.value.fromArray(value);
          // A display effect works in display space: its colors as given, not linearized.
          else node.value.setStyle(resolveColor(String(value)), stage === "display" ? NoColorSpace : SRGBColorSpace);
        }
        for (const [name, image] of Object.entries(images)) if (full[name] !== image.source) load(name, image, full[name]);
        // Given parameters' plain values, and null for those left out (a uniform's or an image's too).
        plain = Object.fromEntries(Object.keys(schema).flatMap((name) =>
          full[name] == null ? [[name, null]] : name in uniforms || name in images ? [] : [[name, full[name]]]));
        key = JSON.stringify(plain);
        shown = definition.shown ? definition.shown(full) !== false : true;
      },
      problems: () => Object.values(images).filter((image) => image.error).map((image) => image.error),
      dispose: () => { for (const image of Object.values(images)) load("", image, undefined); },
    };
  }

  /** A plugin effect that failed to build: the plot draws without it, and reports it once. */
  fail(hook, error) {
    const message = `Plot.effects: ${hook.name} failed, and the plot draws without it: ${error?.message ?? error}`;
    if (this.failures.get(hook.name)?.message === message) return;
    this.failures.set(hook.name, diagnostic("plugin.failed", message, { component: "Plot", property: "effects" }));
    queueMicrotask(() => this.changed());
  }

  /** The attachments `scene` asks for this frame, as a key ("" for none): a change rebuilds the scene pass. */
  attachmentsFor(scene) {
    return this.hooks.filter((hook) => hook.stage === "attachment" && hook.wanted(scene))
      .map((hook) => hook.attachment).join(" ");
  }
  /**
   * The scene pass's attachments (`key`, from attachmentsFor): sets its MRT and builds what the
   * later stages read, by attachment name. `dispose()` releases them.
   */
  attach(scenePass, key) {
    const names = key ? key.split(" ") : [], hooks = this.hooks.filter((hook) => names.includes(hook.attachment));
    const attachments = {};
    if (hooks.length === 1) scenePass.setMRT(hooks[0].mrt);
    else if (hooks.length) throw Error(`Presentation: one scene-pass attachment at a time; got ${names.join(", ")}.`);
    for (const hook of hooks) attachments[hook.attachment] = hook.build(scenePass);
    return { attachments, dispose: () => { for (const node of Object.values(attachments)) node.dispose(); } };
  }

  /**
   * The linear and display hooks a render through `camera` shows with `attachments` (from
   * attach), each with its key, and their joint key: a change of key rebuilds the presentation.
   */
  activeFor(camera, attachments = {}) {
    const hooks = this.hooks.filter((hook) =>
      (hook.stage === "linear" || hook.stage === "display") &&
      (hook.cameras === "any" || camera.isPerspectiveCamera) &&
      (hook.reads ? hook.reads in attachments : hook.key() != null));
    const active = hooks.map((hook) => ({ hook, key: hook.key?.() ?? "on" }));
    return { active, key: active.map(({ hook, key }) => `${hook.name}:${hook.stage}:${key}`).join(" ") };
  }
  /** Before a render through `camera` with `active` (from activeFor). */
  beforeRender(camera, active) {
    for (const { hook } of active) hook.beforeRender?.(camera);
  }
  /**
   * The effects a render through `camera` shows in `scene` now that SVG and PDF cannot draw, as
   * an export message names them (utils/documentExport.js).
   */
  rasterEffects(camera, scene) {
    const attachments = Object.fromEntries(this.attachmentsFor(scene).split(" ").filter(Boolean).map((name) => [name, true]));
    const { active } = this.activeFor(camera, attachments);
    // A plugin effect that failed to build is not drawn, so not named.
    // Named beneath to above: the display stage (the sky), the linear, then the attachments.
    const rank = { display: 0, linear: 1, attachment: 2 };
    const names = this.hooks.filter((hook) => hook.export === "raster" && !(hook.plugin && this.failures.has(hook.name)) &&
      active.some((entry) => entry.hook === hook)).sort((a, b) => rank[a.stage] - rank[b.stage]).map((hook) => hook.name);
    // The object hooks' objects visible in the scene.
    const visible = new Set();
    if ([...this.objects.values()].some((objects) => objects.size)) scene.traverseVisible((object) => visible.add(object));
    for (const [name, objects] of this.objects)
      if ([...objects].some(([object, exported]) => exported === "raster" && visible.has(object))) names.push(name);
    return [...new Set(names)];
  }

  /**
   * The output node for `color` (the scene pass's premultiplied linear color, after SMAA if
   * any) of `scenePass`, with `active`'s hooks (from activeFor) over `attachments` (from attach).
   * `premultiplied`: the canvas's alpha; else straight alpha, as a PNG stores it.
   */
  output({ color, scenePass, attachments = {}, active = [], toneMapping, colorSpace, premultiplied }) {
    let alpha = color.a;
    let rgb = color.rgb.div(alpha.max(1e-8));
    const stage = (name) => active.filter(({ hook }) => hook.stage === name).sort((a, b) => a.hook.order - b.hook.order);
    // A plugin's hook that throws is left out (fail); a built-in's error is the library's.
    const apply = (hook, run) => {
      if (!hook.plugin) return run();
      try {
        const result = run();
        // Built again after a failure (a structural value changed): its warning goes.
        if (this.failures.delete(hook.name)) queueMicrotask(() => this.changed());
        return result;
      } catch (error) { this.fail(hook, error); return null; }
    };
    for (const { hook, key } of stage("linear"))
      ({ rgb, alpha } = apply(hook, () => hook.linear({ rgb, alpha, scenePass, attachments }, key)) ?? { rgb, alpha });
    const shown = renderOutput(vec4(rgb, alpha), toneMapping, colorSpace).rgb;
    let display = { rgb: shown, alpha, opaque: false };
    for (const { hook, key } of stage("display"))
      display = { opaque: display.opaque, ...(apply(hook, () => hook.display(display, key)) ?? display) };
    if (display.opaque) return vec4(display.rgb, 1);
    return premultiplied ? vec4(display.rgb.mul(display.alpha), display.alpha) : vec4(display.rgb, display.alpha);
  }

  /** Before each render with a plugin's effect: the camera it is seen through. */
  updateCamera(camera) {
    camera.updateMatrixWorld();
    this.projectionInverse.value.copy(camera.projectionMatrixInverse);
    this.cameraWorld.value.copy(camera.matrixWorld);
    this.cameraUp.value.copy(camera.up);
  }
}
