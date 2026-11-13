import { placedFrame, resolvePlacement } from "../utils/framePlacement.js";
import { framePoint } from "../utils/frameNodes.js";
import { FieldType, ScalarType, SelectType } from "./types.js";
import { BufferedField, markCapacity } from "../utils/proputils.js";
import { registryFor } from "../utils/guides.js";
import {
  ensureAnimation,
  animationClock,
  animatedOptions,
  uniformTransition,
} from "../utils/animation.js";
import { CurvedPaths } from "../utils/curvedPaths.js";
import {
  NormalBlending, AdditiveBlending, SubtractiveBlending, MultiplyBlending, CustomBlending,
  AddEquation, OneFactor, OneMinusSrcColorFactor, OneMinusSrcAlphaFactor,
} from "three/webgpu";
import {
  ensureCoordinates,
  coordinateKeys,
} from "../utils/coordinates.js";
import { hemisphereOpacity } from "../utils/coordinateNodes.js";
import { SampledBuffers } from "../utils/sampledBuffers.js";
import { releaseAttribute } from "../../threeExtensions/array/attributeRelease.js";
import { InstancedMesh, InstancedBufferAttribute, Matrix4, Vector2, Color } from "three/webgpu";
import { BufferManager } from "../utils/proputils.js";
import {
  applyColorMapNode,
  applyScale,
  scaleValid,
  transformCode,
} from "../../threeExtensions/materials/materials.js";
import { reference, uniform, float, vec3, vec4, viewportSize, screenDPR, cameraProjectionMatrix } from "three/tsl";
import { reportDataError } from "../utils/dataErrors.js";
import { glowProblem } from "../utils/presentation.js";
import { createShade, readShade } from "../utils/shade.js";
import { plugins } from "../plugins/library.js";
import { installAxisMask } from "../utils/axisMask.js";
import { unitOpacity } from "../utils/opacity.js";
import { always, isPlaced } from "../utils/mappedValidity.js";

/**
 * Every node within +-1e30: a missing value reaches the shaders as a huge sentinel (or NaN,
 * which fails the test too), and a row with one draws nothing (TODO 32.8: one helper for the
 * copies in the mesh marks).
 */
export const drawable = (...values) =>
  values.map((value) => value.abs().lessThan(1e30)).reduce((all, next) => all.and(next));
import { vertexBufferIssue, geometryVertexBuffers, DEFAULT_MAX_VERTEX_BUFFERS } from "../utils/vertexBuffers.js";
import { onColormapOverflow } from "../../threeExtensions/materials/colormaps.js";
import { colormapKey, MISSING_COLOR, normalizeColormap } from "../utils/colormap.js";
import { diagnostic } from "../utils/diagnostics.js";
import { onCoordinateView, coordinateView } from "../utils/viewContext.js";

function optionPropertyName(name) {
  return String(name)
    .split(/[.-]/)
    .map((part, index) =>
      index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join("");
}

/** Mark blend modes: how a mark's fragments composite with what is already drawn. */
export const BLEND_MODES = Object.freeze(["normal", "additive", "multiply", "screen", "subtractive"]);
const BLENDINGS = { normal: NormalBlending, additive: AdditiveBlending, multiply: MultiplyBlending, subtractive: SubtractiveBlending };

export class BasePlotObject extends InstancedMesh {
  /**
   * @param {any} options The mark's options node.
   * @param {import("../utils/internalTypes.js").ViewServices} view The view it draws in; its
   *   renderer draws it.
   * @param {() => void} invalidate
   */
  constructor(options, view, invalidate) {
    const renderer = view.renderer;
    const maxElements = options?.get("maxElements") ?? 1;
    super(undefined, undefined, maxElements);
    this.isPlotObject = true;
    /** @type {string | undefined} Component named in messages (else the class's static componentName). */
    this.componentName = undefined;
    this.exportKind = "raster";
    this.guideHandle = undefined;
    this.categoryColorActive = false;
    this.categoryOutlineActive = false;
    this.symbolCodeActive = false;
    this.manualAnimation = false;
    /** @type {"world" | undefined} "world": positions are already mapped (connection-backed marks; see mapPosition). */
    this.positionSpace = undefined;
    this.unregister = [];
    this.options = options;
    options.ensure(
      "_categoryTopology",
      new FieldType({ defaultValue: "", ui: false }),
    );
    ensureCoordinates(options);
    ensureAnimation(options);
    this.longitudeShift = uniform(0);
    this.curvedPaths = this.constructor.curvedPaths
      ? new CurvedPaths(this)
      : null;
    let queued = false;
    let centeredProjection = options.get("projectionCenter") != null;
    options.ensure("_frameTopology", new FieldType({ defaultValue: "", ui: false }));
    /** @param {string} key */
    const coordinateChange = (key) => {
      if (key === "projectionCenter") {
        const next = options.get("projectionCenter") != null;
        if (next === centeredProjection) {
          this.coordinateGeometry?.();
          this.invalidate();
          return;
        }
        centeredProjection = next;
      } else if (key === "_projectionCenterLongitude" || key === "_projectionCenterLatitude") {
        this.coordinateGeometry?.();
        this.invalidate();
        return;
      } else if (this.constructor.numericCoordinateKeys?.has(key)) {
        this.coordinateGeometry?.();
        this.invalidate();
        return;
      }
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        if (!this.isDisposed && this.material) {
          for (const field of this.fields.values()) field.rebind?.();
          this.coordinateGeometry?.();
          this.build();
          this.invalidate();
        }
      });
    };
    for (const key of [...coordinateKeys, "_frameTopology"])
      this.unregister.push(options.on(() => coordinateChange(key), key));
    // 2D, 3D or a surface's chart (TODO 136.12: the view context, not an option).
    this.unregister.push(onCoordinateView(options, () => coordinateChange("view")));
    this.renderScaleNode = uniform(1);
    this.frameMatrixNode = uniform(new Matrix4());
    this.onBeforeRender = (renderer, scene, camera) => {
      this.updateFrameEdges?.(camera);
      const definition = placedFrame(this.options);
      if (!definition) return;
      const target = renderer.getRenderTarget();
      const ratio = renderer.getPixelRatio() * (this.renderScaleNode.value || 1);
      const width = (target?.width ?? renderer.domElement.width) / ratio;
      const height = (target?.height ?? renderer.domElement.height) / ratio;
      this.frameMatrixNode.value.copy(resolvePlacement(definition, camera, width, height));
    };
    const displayScale = uniform(options.get("displayScale") ?? 1);
    this.displayScaleNode = displayScale.mul(this.renderScaleNode);
    this.unregister.push(
      options.on((value) => {
        uniformTransition(this, "displayScale", displayScale, value);
        this.invalidate();
      }, "displayScale"),
    );
    this.sampling = this.constructor.sampleable
      ? new SampledBuffers(this)
      : null;
    /** The view it draws in (Stage 117.1): its errors and diagnostics go there. */
    this.view = view;
    this.renderer = renderer;
    this.unregister.push(animationClock(renderer).register(this));
    this.invalidate = () => {
      view.drawing.revision++;
      registryFor(options)?.notify();
      invalidate();
    };
    if (this.options)
      this.unregister.push(this.options.on(() => this.invalidate()));
    // How much the mark glows (TODO 37.3): the beauty pass reads `plotGlow` per drawn object
    // (utils/presentation.js), so changing it compiles nothing; 0 draws no glow.
    this.plotGlow = 0;
    if (this.options?.has("glow")) {
      const owner = {};
      const readGlow = (value) => {
        const problem = glowProblem(this.componentName ?? this.constructor.componentName ?? "Mark", value);
        reportDataError(view, owner, problem);
        this.plotGlow = problem ? 0 : Number(value ?? 0);
      };
      readGlow(this.options.get("glow"));
      this.unregister.push(this.options.on(readGlow, "glow"), () => reportDataError(view, owner, ""));
    }
    // A plugin's shade (TODO 138.3, utils/shade.js): applied to each material the mark builds
    // (applyBlend) and to the current one when it changes; a uniform's change compiles nothing.
    const named = () => this.componentName ?? this.constructor.componentName ?? "Mark";
    this.shade = createShade(named);
    this.shadeOwner = {};
    if (this.options?.has("shade")) {
      let spec = null, stop = null;
      const readShadeOption = (value) => {
        if (value == null && spec == null) return;
        spec = value;
        // A kind waiting on its plugin draws once it registers: heard while a shade is named.
        if (spec != null) stop ??= plugins.subscribe(() => readShadeOption(spec));
        else { stop?.(); stop = null; }
        this.applyShade();
        this.invalidate();
      };
      // Read here, so messages name the mark as it is named now (a Line's Segments, say).
      this.applyShade = () => {
        const read = readShade(spec, plugins, named());
        this.shade.set(read.problem ? null : read.entry);
        const applied = this.shade.apply(this.material);
        reportDataError(view, this.shadeOwner, read.problem || applied || "");
      };
      readShadeOption(this.options.get("shade"));
      this.unregister.push(
        this.options.on(readShadeOption, "shade"),
        () => stop?.(),
        () => reportDataError(view, this.shadeOwner, ""),
      );
    }
    this.manager = new BufferManager(
      renderer,
      maxElements,
      this.invalidate,
      options,
      undefined,
      view,
    );
    // Every mark composites through applyBlend(); a change rebuilds the material.
    if (this.options)
      this.option("blend", new SelectType({ defaultValue: "normal", options: [...BLEND_MODES] }));
    // Crossing opacity 1, or switching the view, changes blended(): marks that build with it
    // (those with a refreshBlend) recompile.
    if (this.options?.has("opacity")) this.unregister.push(this.options.on(() => this.refreshBlend?.(), "opacity"));
    if (this.options) this.unregister.push(onCoordinateView(this.options, () => this.refreshBlend?.()));
    // Most marks do not participate in selections. Allocate a per-instance
    // feedback buffer only when a mark actually opts into interaction.
    this.interactionOpacityNode = uniform(1);
    this.unregister.push(options.on((value) => this.growInstances(value), "maxElements"));
    // Guide-less marks (Anchor, `static guide = false`) never get a legend entry.
    if (this.constructor.guide !== false)
      this.unregister.push(registryFor(options)?.register(this) ?? (() => {}));
    this.count = 0;
    this.frustumCulled = false;
    this.unregister.push(installAxisMask(this));
  }

  /** An instance matrix of at least `value` instances (grown, never shrunk). */
  growInstances(value) {
    const capacity = Math.max(1, Math.floor(value));
    if (capacity <= this.instanceMatrix.count) return;
    const old = this.instanceMatrix;
    const data = new Float32Array(capacity * 16);
    data.set(old.array);
    for (let i = old.count; i < capacity; i++)
      for (const offset of [0, 5, 10, 15]) data[i * 16 + offset] = 1;
    this.instanceMatrix = new InstancedBufferAttribute(data, 16);
    this.manager.enqueue(() => {}, null, false, 0, () => releaseAttribute(this.renderer, old));
  }

  /**
   * Room for `rows` instances (TODO 29.2): maxElements is the initial allocation, and data past
   * it grows every field's buffer and the instance matrix to the next power of two, up to what
   * the device's storage buffers hold for the widest field (rows past that are cut, and the
   * field says so on the plot). Called before the fields are written (data.js updateFields), so
   * the refill a resize queues is superseded by the write. Returns the capacity.
   */
  ensureCapacity(rows) {
    const current = this.manager.maxElements;
    if (!(rows > current)) return current;
    const { next: capacity } = markCapacity({ allocated: current, fields: this.manager.fields.values(),
      limits: this.renderer?.backend?.device?.limits, rows });
    if (capacity <= current) return current;
    this.manager.setMaxElements(capacity);
    this.growInstances(capacity);
    return capacity;
  }

  setup() {
    // To be implemented by subclasses
  }

  /**
   * Whether the per-row fields a build would bind exceed the device's vertex buffer limit.
   * When they do, the mark reports a render error naming itself and its per-row channels, and
   * the caller skips the build instead of compiling a pipeline that draws nothing; the error
   * clears once the fields fit again.
   * @param {string[]} fieldNames fields the build reads per row when they hold buffers
   * @param {string[]} [positionFields] per-row fields every draw binds (a segment's endpoints):
   *   they count as fixed room, and the error names only `fieldNames`
   */
  vertexBuffersExceeded(fieldNames, positionFields = []) {
    const limits = this.renderer?.backend?.device?.limits;
    const matrix = this.instanceMatrix;
    // Three binds the instance matrix as a uniform buffer while it fits, else a vertex buffer;
    // a material that skips the instance transform (the line material) binds neither.
    const matrixBuffer = matrix && this.material?.instanceTransform !== false && !matrix.isStorageInstancedBufferAttribute &&
      matrix.count * 64 > (limits?.maxUniformBufferBindingSize ?? 65536) ? 1 : 0;
    const buffered = (names) => names.filter((name) => {
      const field = this.fields?.get(name);
      return !!field && !field.isChannelScalar && !field.deviceScalar && (field.isBufferNode || !!field.bufferMode);
    });
    const fixed = geometryVertexBuffers(this.geometry) + matrixBuffer + buffered(positionFields).length;
    const perRow = buffered(fieldNames);
    const markName = this.componentName ?? this.constructor.componentName ?? "Mark";
    const limit = limits?.maxVertexBuffers ?? DEFAULT_MAX_VERTEX_BUFFERS;
    // TODO 17.10: in a mark that reads each row once per instance (storageOverflow: points,
    // labels and segments, TODO 136.11), the per-row fields past the budget are read from their
    // buffers as storage buffers by instance instead of vertex buffers. The last fields in the
    // list go first (per-row opacity, offsets, outline colors); sampling and curved paths keep
    // a few storage bindings of their own, so only a large overflow still errors.
    const over = fixed + perRow.length - limit;
    const storageRoom = (limits?.maxStorageBuffersPerShaderStage ?? 8) - 4;
    const moved = this.storageOverflow && over > 0 && over <= storageRoom
      ? perRow.slice(perRow.length - over) : [];
    const before = [...(this.storageFields ?? [])].sort().join(), after = [...moved].sort().join();
    if (before !== after) {
      this.storageFields = moved.length ? new Set(moved) : null;
      for (const name of new Set([...before.split(","), ...moved])) this.fields?.get(name)?.rebind?.();
    }
    const message = moved.length ? "" : vertexBufferIssue(markName, fixed, perRow, limit);
    if (message && !this.vertexBufferOwner) {
      const owner = (this.vertexBufferOwner = {});
      this.unregister.push(() => reportDataError(this.view, owner, ""));
    }
    if (this.vertexBufferOwner) reportDataError(this.view, this.vertexBufferOwner, message);
    return !!message;
  }

  /**
   * Report a colormap the mark cannot draw as this plot's render error, instead of only a
   * console warning while the mark silently draws Viridis: an unknown name or an invalid spec
   * (TODO 136.13), or a custom colormap that found no free texture row (more custom maps on
   * screen at once than the texture holds). Clears when the map registers again or the mark's
   * colormap changes.
   */
  watchColormapOverflow() {
    if (this.colormapOverflowOwner || !this.options) return;
    // Named as the component is: a Line's Segments object is named "Line" by its wrapper, after
    // the constructor that registers cmapIndex, so the name is read when reporting.
    const mark = this, name = () => mark.componentName ?? mark.constructor.componentName ?? "Mark";
    const owner = (this.colormapOverflowOwner = { mark, get componentName() { return name(); } });
    const validate = () => {
      if (this.isDisposed || !this.options) return;
      let problem = null;
      try { normalizeColormap(this.options.get("cmapIndex") || "Viridis"); }
      catch (error) {
        problem = diagnostic("colormap.invalid", `${name()}.colormap: ${error.message}`, { component: name(), property: "colormap" });
      }
      reportDataError(this.view, owner, problem ?? "");
    };
    this.unregister.push(onColormapOverflow((key, message) => {
      let mine = false;
      try { mine = colormapKey(this.options.get("cmapIndex") ?? "Viridis") === key; } catch { /* invalid spec */ }
      if (mine) reportDataError(this.view, owner, message);
    }), () => reportDataError(this.view, owner, ""));
    if (this.options.has("cmapIndex")) this.unregister.push(this.options.on(validate, "cmapIndex"));
    queueMicrotask(validate);
  }

  ensureInteractionOpacity() {
    if (this.fields.has("interactionOpacity")) return;
    this.manager.registerField(
      new BufferedField(
        new ScalarType({ defaultValue: 1, targetNodes: ["interactionOpacityNode"], ui: false }),
        this,
        { onDirty: () => this.build(), stableRepresentation: true },
      ),
      "interactionOpacity",
    );
    this.build();
    this.invalidate();
  }

  /** A reduction's scalar opacity stays on the device, separate from row feedback. */
  /** @param {boolean} [translucent] */
  ensureChannelOpacity(translucent = undefined) {
    if (translucent !== undefined) this.channelOpacityTranslucent = translucent;
    if (this.fields.has("_channelOpacity")) { this.refreshBlend?.(); return; }
    this.manager.registerField(new BufferedField(
      new ScalarType({ defaultValue: 1, targetNodes: ["opacityNode"], ui: false }), this,
      { onDirty: () => this.build() }), "_channelOpacity");
    this.build();
    this.invalidate();
  }

  replaceGeometry(next) {
    const current = this.geometry;
    if (!current) {
      this.geometry = next;
      return;
    }
    // Three's geometry disposal also deletes instanced attributes referenced by
    // the material. Keep this geometry's lifetime, replacing only its own mesh
    // attributes so queued JAX uploads and the mark's data buffers remain valid.
    const retired = new Set([
      current.index,
      ...Object.values(current.attributes),
    ]);
    current.index = next.index;
    current.attributes = next.attributes;
    current.groups = next.groups;
    current.drawRange = { ...next.drawRange };
    current.boundingBox = next.boundingBox;
    current.boundingSphere = next.boundingSphere;
    current.parameters = next.parameters;
    current.type = next.type;
    if (this.material) this.material.needsUpdate = true;
    this.releaseGeometryAttributes(retired);
  }

  releaseGeometryAttributes(attributes) {
    for (const attribute of attributes) {
      if (!attribute) continue;
      releaseAttribute(this.renderer, attribute);
    }
  }

  build() {
    // Rebuilds geometry and material based on current options and data
    // To be implemented by subclasses
  }

  /**
   * A transform option (linear, log, sqrt, symlog) that selects its transform through a uniform
   * code instead of rebuilding the shader (17.5). `this[name]` still holds the name.
   */
  transformOption(name) {
    const node = uniform(transformCode(this.options?.get(name)));
    this.option(name, false, (value) => { node.value = transformCode(value); this.invalidate(); });
    return node;
  }
  /** A symlog constant option as a float uniform (1 when unset or invalid; TODO 39.1). */
  constantOption(name) {
    const read = (value) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 1);
    const node = uniform(read(this.options?.get(name)));
    this.option(name, false, (value) => { node.value = read(value); this.invalidate(); });
    return node;
  }
  /** A midpoint option as a vec2 uniform: (1, midpoint) when set, (0, 0) when not (TODO 39.2). */
  midpointOption(name) {
    const read = (value) => (typeof value === "number" && Number.isFinite(value) ? new Vector2(1, value) : new Vector2(0, 0));
    const node = uniform(read(this.options?.get(name)));
    this.option(name, false, (value) => { node.value = read(value); this.invalidate(); });
    return node;
  }
  /**
   * A scaled channel's uniforms (`prefix` value, scale or width): its transform code, symlog
   * constant and midpoint, so a scale's transform, constant or midpoint compiles nothing.
   */
  scaleChannelOptions(prefix) {
    this[prefix + "TransformCode"] = this.transformOption(prefix + "Transform");
    this[prefix + "ConstantNode"] = this.constantOption(prefix + "TransformConstant");
    this[prefix + "MidpointNode"] = this.midpointOption(prefix + "Midpoint");
  }
  /**
   * 1 where the mark's scaled channels (value, size, width) are inside their transforms'
   * domains, else 0 (TODO 39.1): such a row is missing, so its alpha is 0 (not drawn, not
   * picked). Null when no channel can be outside (linear and symlog have no bound).
   */
  scaleValidity() {
    const checks = [];
    const add = (node, prefix) => {
      const valid = scaleValid({ valueNode: node, valueTransform: this[prefix + "TransformCode"] ?? this[prefix + "Transform"] });
      if (valid) checks.push(valid);
    };
    if (this.valueNode && this.valueBoundsNode && this.valueTransform && !this.image) add(this.valueNode.r, "value");
    if (this.scaleNode && this.scaleBoundsNode && this.scaleTransform) add(this.scaleNode.x ?? this.scaleNode, "scale");
    if (this.widthNode && !this.widthLiteral && this.widthBoundsNode && this.widthTransform) add(this.widthNode.r, "width");
    if (!checks.length) return null;
    return checks.reduce((all, valid) => all.and(valid)).select(float(1), float(0));
  }
  /** A boolean option read by the shader through a uniform (1 or 0) instead of a rebuild. */
  flagOption(name) {
    const node = uniform(this.options?.get(name) ? 1 : 0);
    this.option(name, false, (value) => { node.value = value ? 1 : 0; this.invalidate(); });
    return node;
  }

  /**
   * Run `apply` (option changes) with the rebuilds they cause deferred to one build in a
   * microtask, which also covers other batches in the same task (a scale's transform and its
   * quantize arrive as two notifications). Rebuilds save node-graph CPU, not pipelines.
   */
  batchOptions(apply) {
    const outer = !this.batchingOptions;
    this.batchingOptions = true;
    try { apply(); } finally { if (outer) this.batchingOptions = false; }
  }
  queueBatchedBuild() {
    if (this.batchedBuildQueued) return;
    this.batchedBuildQueued = true;
    queueMicrotask(() => {
      this.batchedBuildQueued = false;
      if (this.isDisposed || !this.material) return;
      this.build();
      this.invalidate();
    });
  }

  /** Shade the current material (a mark with a `shade` option replaces this; utils/shade.js). */
  applyShade() {}

  /**
   * Apply the mark's `blend` option to its material, together with the class's own
   * transparency decision. Blending is a material property, so it cannot vary per row;
   * every mode but "normal" forces transparent (three ignores blending otherwise) and
   * stops depth writes, since order-independent modes should not occlude each other.
   * Returns the effective transparent flag.
   */
  applyBlend(transparent = false) {
    const material = this.material;
    if (!material) return !!transparent;
    const mode = this.options?.has?.("blend") ? this.options.get("blend") : "normal";
    if (!BLEND_MODES.includes(mode)) throw new Error(`Unknown blend mode ${JSON.stringify(mode)}; use ${BLEND_MODES.join(", ")}.`);
    material.transparent = !!transparent || mode !== "normal";
    if (mode === "screen") {
      material.blending = CustomBlending;
      material.blendEquation = AddEquation;
      material.blendSrc = OneFactor;
      material.blendDst = OneMinusSrcColorFactor;
      material.blendSrcAlpha = OneFactor;
      material.blendDstAlpha = OneMinusSrcAlphaFactor;
    } else material.blending = BLENDINGS[mode];
    if (mode !== "normal") material.depthWrite = false;
    material.needsUpdate = true;
    this.applyShade?.();
    return material.transparent;
  }

  /**
   * Whether the material must blend (points, Triangles, Segments, Lines and Arrows3D build with
   * it): an explicit transparent flag, a mark opacity below 1, a blend mode, or a per-row
   * opacity field. Unblended, these draw opaque or with alpha-to-coverage, which keeps the
   * fragment's alpha in each covered sample: a translucent Line drew at its opacity squared,
   * and Arrows3D ignored it. In 2D a mark with that field blends from the start: switching on
   * the first dimmed row would rebuild every such mark during the first hover, brush, or keyed
   * fade. In 3D a mark keeps alpha-to-coverage until a row is actually translucent (whoever
   * writes the field reports it through setInteractionTranslucent; unknown counts as
   * translucent), because blended 3D fringes lose per-sample depth; hover or selection on a 3D
   * plot where nothing is dimmed renders exactly like one without it.
   */
  blended() {
    const flat = coordinateView(this.options) !== "3d";
    return !!this.transparent || (this.fields?.has("_channelOpacity") && this.channelOpacityTranslucent !== false) || (this.options?.get("opacity") ?? 1) < 1 ||
      (!!this.fields?.has("interactionOpacity") && (flat || this.interactionTranslucent !== false)) ||
      (this.options?.get("blend") ?? "normal") !== "normal";
  }

  /**
   * Report whether the interactionOpacity field currently holds values strictly between 0 and 1
   * (it decides blending in 3D). The first translucent report switches the mark to
   * blending for good: switching back would rebuild the material, and compile pipelines, at
   * the end of every keyed fade, brush, or selection.
   */
  setInteractionTranslucent(value) {
    if (this.interactionTranslucent === value || this.interactionTranslucent === true) return;
    this.interactionTranslucent = value;
    this.refreshBlend?.();
  }

  /**
   * A mesh mark's blend (Prism, PolarRect, GeoJSON faces): includes ordinary row/channel
   * opacity and analytic edge coverage. In normal mode only opaque meshes write depth.
   */
  applyMeshBlend(blend = false) {
    this.applyBlend(blend || this.blended());
    if (this.options.get("blend") === "normal") this.material.depthWrite = !this.material.transparent;
  }

  /**
   * Whether the mark reads a categorical color channel: a change rebuilds its material (TODO
   * 32.9: the toggle was copied into each mark component). Returns whether it rebuilt.
   */
  setCategoryColor(active) {
    if (this.categoryColorActive === active) return false;
    this.categoryColorActive = active;
    this.build();
    return true;
  }

  /** A mesh mark's color node: shaded by the scene's lights when `lit`, else emitted as is. */
  applyMeshColor(color, lit) {
    this.material.colorNode = lit ? color : vec3(0);
    this.material.emissiveNode = lit ? vec3(0) : color;
  }

  get fields() {
    return this.manager.fields;
  }

  option(name, type = null, isUniform = false, onChange = null) {
    if (typeof type === "boolean") {
      onChange = arguments.length >= 3 ? isUniform : null;
      isUniform = type;
      type = null;
    }

    if (onChange == null) {
      onChange = () => {
        // Inside batchOptions, one build follows every change made in the same task.
        if (this.batchingOptions) { this.queueBatchedBuild(); return; }
        this.build();
        this.invalidate();
      };
    }

    if (this.options && !this.options.has(name)) {
      if (!type) {
        throw new Error(
          `Option ${name} has not been defined on ${this.options.name}`,
        );
      }
      this.options.ensure(name, type);
    }

    const resolvedType = this.options?.getType(name)?.type ?? type;
    if (!resolvedType) {
      throw new Error(`Need to specify type for ${name}`);
    }

    const propertyName = optionPropertyName(name);
    if (name === "cmapIndex") this.watchColormapOverflow();

    if (isUniform) {
      const defaultValue = resolvedType.getUniformData
        ? resolvedType.getUniformData(resolvedType.defaultValue)
        : resolvedType.defaultValue;
      const uniformNode = this.options?.has(name)
        ? reference(name, resolvedType.uniformType, this.options.transformed)
        : uniform(defaultValue, resolvedType.uniformType);
      this[`${propertyName}Node`] = uniformNode;
      if (animatedOptions.has(name)) {
        const shown = uniform(
          resolvedType.getUniformData(this.options.get(name)),
        );
        this[`${propertyName}Node`] = shown;
        this.animatedOptionNodes ??= new Map();
        this.animatedOptionNodes.set(name, shown);
        this.unregister.push(
          this.options.on((value) => {
            uniformTransition(
              this,
              name,
              shown,
              resolvedType.getUniformData(value),
            );
            this.invalidate();
          }, name),
        );
      }
      // Namespace values (for example grid widths) do not emit on the mark's
      // top-level node. Request a frame for these uniforms as well.
      if (this.options?.has(name)) {
        this.unregister.push(this.options.on(() => this.invalidate(), name));
      }
    } else if (this.options && this.options.has(name)) {
      this[`${propertyName}`] = this.options.getTransformed(name);
      this.unregister.push(
        this.options.on((val) => {
          this[`${propertyName}`] = val;
          onChange(val);
        }, name),
      );
    } else {
      this[`${propertyName}`] = resolvedType.getUniformData
        ? resolvedType.getUniformData(resolvedType.defaultValue)
        : resolvedType.defaultValue;
    }
  }

  dispose() {
    if (this.isDisposed) return;
    this.isDisposed = true;
    super.dispose();
    for (const unregister of this.unregister) {
      unregister();
    }
    this.unregister = [];
    this.sampling?.dispose();
    this.curvedPaths?.dispose();
    this.dashDistances?.dispose();
    this.manager?.dispose();
    this.material?.dispose();
    this.geometry?.dispose();
    if (this.geometry)
      this.releaseGeometryAttributes([
        this.geometry.index,
        ...Object.values(this.geometry.attributes),
      ]);
  }

  getValueNode(interpolateVertices = true) {
    let valueNode = this.valueNode ? this.valueNode.r : null;
    // Apply scaling to value and gradient if needed
    if (valueNode && this.valueBoundsNode && this.valueTransform) {
      valueNode = applyScale({
        valueNode,
        valueTransform: this.valueTransformCode ?? this.valueTransform,
        boundsNode: this.valueBoundsNode,
        outputRangeNode: this.valueRangeNode,
        constantNode: this.valueConstantNode,
        midpointNode: this.valueMidpointNode,
      });
    }
    return interpolateVertices ? (valueNode?.toVarying() ?? null) : valueNode;
  }

  /**
   * A row's alpha (TODO 32.2): the mark's opacity (`fallback` without one) times its row opacity,
   * the interactionOpacity field (hover dimming, responds, lifecycle fades, `opacity`
   * expressions, a padded view's hidden rows). Mesh materials use the same alpha; their
   * blending policy preserves fractional values instead of reducing them to visibility.
   */
  rowAlpha({ fallback = 1 } = {}) {
    const validity = this.scaleValidity();
    // Every opacity a mark reads is clamped to 0..1, and 0 where it is not finite (TODO 136.3:
    // an opacity expression above 1 speckled).
    const own = this.opacityNode ? unitOpacity(this.opacityNode) : float(fallback);
    const opacity = validity ? own.mul(validity) : own;
    if (!this.fields?.has("interactionOpacity")) return opacity;
    const row = unitOpacity(this.interactionOpacityNode);
    return opacity.mul(row);
  }

  /**
   * The color a missing value draws in (TODO 73.3): the option its scale's `missing` sets, else
   * the theme's `missing` color (#92989f by default), read each frame, so a new one compiles
   * nothing.
   */
  missingColorNode() {
    return this.options?.has?.("valueMissing")
      ? reference("valueMissing", "vec3", this.options.transformed)
      : vec3(uniform(new Color(MISSING_COLOR)));
  }

  getColorNode(valueNode) {
    let colorNode = this.fillColorNode;
    if (valueNode && this.cmapIndexNode) {
      colorNode = applyColorMapNode({
        valueNode: valueNode,
        cmapIndexNode: this.cmapIndexNode,
        levelsNode: this.levelsNode,
        quantize: this.quantizeFlag ?? this.quantize,
      });
      // A missing value (NaN, or the huge sentinel a missing number arrives as, which fail the
      // test alike) draws in the missing color, not the colormap's end color (TODO 73.3).
      colorNode = valueNode.abs().lessThan(1e30).select(colorNode, this.missingColorNode());
    }

    if (this.categoryColorActive && this.categoryColorNode)
      colorNode = this.categoryColorNode;
    const validity = this.scaleValidity();
    colorNode = vec4(
      colorNode,
      (this.opacityNode == null ? uniform(1) : unitOpacity(this.opacityNode))
        .mul(this.interactionOpacityNode ? unitOpacity(this.interactionOpacityNode) : uniform(1))
        .mul(hemisphereOpacity(this))
        .mul(validity ?? float(1)),
    );

    return colorNode;
  }

  applyScale(positionNode) {
    let scaleNode = this.scaleNode;
    if (scaleNode && this.scaleBoundsNode && this.scaleTransform) {
      scaleNode = applyScale({
        valueNode: scaleNode,
        valueTransform: this.scaleTransformCode ?? this.scaleTransform,
        boundsNode: this.scaleBoundsNode,
        outputRangeNode: this.scaleRangeNode,
        constantNode: this.scaleConstantNode,
        midpointNode: this.scaleMidpointNode,
      });
    }
    if (scaleNode) {
      positionNode = positionNode.mul(scaleNode);
    }
    return positionNode;
  }

  /**
   * Data coordinates to world, on the validity contract (utils/mappedValidity.js, TODO 136.11):
   * `positionNode` plus the mapped point, and whether it is one. A mark drops what it cannot
   * draw by `valid`, never by testing the position. With `positionSpace = "world"` (a
   * connection-backed mark, whose positions were mapped through each endpoint's own frame chain
   * when they were gathered) the frame mapping is skipped; only the placement of the frame the
   * mark is in still applies, since gathered positions stop at that placement; such a mark's
   * `valid` is isPlaced (mappedValidity.js).
   * @returns {import("../utils/mappedValidity.js").MappedPoint}
   */
  mapPosition(positionNode, coordinatesNode = this.coordinatesNode, { first = 0, tolerant = false, local = null, horizon = null,
    unwrapRoot = false, seam = null } = {}) {
    if (coordinatesNode && coordinatesNode.nodeType === "vec2")
      coordinatesNode = vec3(coordinatesNode, this.zIndexNode ?? 0);
    if (!coordinatesNode) return { position: positionNode, valid: always() };
    if (this.positionSpace === "world") {
      const position = positionNode.add(placedFrame(this.options)
        ? this.frameMatrixNode.mul(vec4(coordinatesNode, 1)).xyz
        : coordinatesNode);
      return { position, valid: isPlaced(coordinatesNode) };
    }
    const mapped = framePoint(this, coordinatesNode, { first, tolerant, local, horizon, unwrapRoot, seam });
    return { ...mapped, position: positionNode.add(mapped.position) };
  }

  /**
   * Displace a world position by a screen offset in CSS pixels (Dodge's dx/dy on
   * points; the gathered endpoint offsets of a connection-backed mark). `xNode`/`yNode` are
   * float nodes or null.
   */
  applyPixelOffset(positionNode, xNode = null, yNode = null) {
    if (!xNode && !yNode) return positionNode;
    // The pixel ratio is a uniform (screenDPR): another ratio compiles nothing.
    const ratio = screenDPR.mul(2);
    return positionNode.add(
      vec3(
        (xNode ?? uniform(0)).mul(ratio).div(viewportSize.x.mul(cameraProjectionMatrix.element(0).x)),
        (yNode ?? uniform(0)).mul(ratio).div(viewportSize.y.mul(cameraProjectionMatrix.element(1).y)),
        0,
      ),
    );
  }
}
