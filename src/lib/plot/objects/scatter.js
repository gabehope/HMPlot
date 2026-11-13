import { installOutlineChannels, outlinePaint, outlineWidth } from "./outlines.js";
import { onShapeRegistered } from "../utils/shapes.js";
import { aspect3dSource } from "../utils/aspect3d.js";
import { symbolDistance, symbolCodeDistance, fieldShape } from "../utils/symbols.js";
import { shapeFieldGeneration } from "../utils/shapeFields.js";
import { BasePlotObject } from "./base.js";
import { collapsed } from "../utils/mappedValidity.js";
import { PointsNodeMaterial } from "three/webgpu";
import * as THREE from "three/webgpu";
import {
  uniform,
  float,
  vec2,
  vec3,
  vec4,
  length,
  fwidth,
  smoothstep,
  uv,
  cameraProjectionMatrix,
  cameraViewMatrix,
  viewportSize,
  screenDPR,
  reference,
  Fn,
} from "three/tsl";
import { BufferedField } from "../utils/proputils.js";
import { frameDimensionStages } from "../utils/frameMapping.js";
import { polar, spherical } from "../utils/coordinates.js";
import { placedFrame } from "../utils/framePlacement.js";
import { buildCoordinateOperations } from "../utils/coordinateOperations.js";
import {
  ColorType,
  FillType,
  PositionType,
  SizeType,
  ScalarType,
  BooleanType,
} from "./types.js";
import { coordinateView } from "../utils/viewContext.js";

export class Scatter extends BasePlotObject {
  static sampleable = true;
  static componentName = "Points";
  constructor(options, view, invalidate, material) {
    super(options, view, invalidate);
    this.material = material || new PointsNodeMaterial({});
    this.pixelSizeNode = undefined;
    if (["Points", "Points3D"].includes(this.constructor.componentName))
      this.option("depthWrite", new BooleanType({ defaultValue: true }));
    this.setup();
    // A newly registered shape replaces the square a not-yet-registered literal shape name was
    // drawn as. Per-point shapes read the distance-field texture, which the registration has
    // already filled: they rebuild only when it grew into a new texture (TODO 55).
    this.unregister.push(onShapeRegistered((name, names = [name]) => {
      if (names.includes(this.options?.get("shape")) ||
        (this.fieldGeneration !== undefined && this.fieldGeneration !== shapeFieldGeneration())) this.build();
      if (this.fieldGeneration !== undefined) this.invalidate();
    }));
  }

  /** Point beauty passes may omit depth writes; picking keeps its own depth policy. */
  applyBlend(transparent) {
    const result = super.applyBlend(transparent);
    if (this.material && ["Points", "Points3D"].includes(this.constructor.componentName))
      this.material.depthWrite = (this.options?.get?.("blend") ?? "normal") === "normal" &&
        this.options?.get?.("depthWrite") !== false;
    return result;
  }

  /** Rebuild when the blend decision no longer matches the compiled material. Only this
   * class's build() sets fringeDiscarded: a subclass build without fringe discards has none. */
  refreshBlend() {
    if (!this.isReady || !this.material) return;
    if (this.blended() !== this.material.transparent || this.fringeDiscard() !== (this.fringeDiscarded ?? false)) {
      this.build();
      this.invalidate();
    }
  }

  /**
   * Blended sprites in 3D drop fragments outside half coverage: antialiased fringes would
   * otherwise write depth and cut halos into the points behind them (instances are not
   * depth-sorted, so depth writes must stay on for opaque rows).
   */
  fringeDiscard() {
    return false;
  }

  /** Point-size units to width units for this class's geometry: the 2D geometry spans two
   * size units, so it is halved; the sprite quad spans one. */
  get dataSizeFactor() {
    return 0.5;
  }

  /** Screen pixels per source X unit at this row, after the full frame chain. */
  pixelsPerDataUnit() {
    const stage = frameDimensionStages(this.options, "x")[0];
    const own = stage.source === this.options;
    const bounds = own ? this.xboundsNode : reference("xbounds", "vec2", stage.source.transformed);
    const range = own ? this.xrangeNode : reference(stage.rangeKey, "vec2", stage.source.transformed);
    const curved = polar(this.options) || spherical(this.options),
      needsLocal = curved || buildCoordinateOperations(this.options).some(op =>
        op.kind !== "scale") ||
        frameDimensionStages(this.options, "x").length > 1 ||
        (stage.source.get("xTransform") ?? "linear") !== "linear" || !!placedFrame(this.options);
    if (needsLocal && coordinateView(this.options) === "2d" &&
        this.coordinatesNode && !this.surface) {
      const unit = this.options.get("angleUnit"),
        period = unit === "custom" ? reference("anglePeriod", "float", this.options.transformed)
          : unit === "extent" ? bounds.y.sub(bounds.x).abs()
          : float(unit === "radians" ? 2 * Math.PI : 360),
        source = vec3(this.coordinatesNode),
        // The source coordinates are float32 on the GPU. A fixed tiny step
        // rounds back to the original value when X is far from zero.
        epsilon = (curved ? period.mul(1e-4)
          : bounds.y.sub(bounds.x).abs().mul(1e-3))
          .max(source.x.abs().mul(1e-6)).max(1e-7),
        // Each probe with whether the chain maps it (the validity contract, TODO 136.11).
        center = this.mapPosition(vec3(0), source),
        plus = this.mapPosition(vec3(0), source.add(vec3(epsilon, 0, 0))),
        minus = this.mapPosition(vec3(0), source.sub(vec3(epsilon, 0, 0)));
      const screen = ({ position: point }) => {
        const clip = cameraProjectionMatrix.mul(cameraViewMatrix.mul(vec4(point, 1)));
        return clip.xy.div(clip.w.abs().max(1e-12));
      };
      const at = screen(center), ahead = screen(plus), behind = screen(minus),
        delta = center.valid.and(plus.valid).select(ahead.sub(at),
          center.valid.and(minus.valid).select(at.sub(behind), vec2(0)));
      return length(vec2(delta.x.mul(viewportSize.x), delta.y.mul(viewportSize.y)))
        .div(screenDPR.mul(2).mul(epsilon));
    }
    let worldPerData = range.y.sub(range.x).div(bounds.y.sub(bounds.x)).abs();
    const metric = !placedFrame(this.options) && aspect3dSource(this.options);
    if (metric) {
      const input = reference("xbounds", "vec2", metric.transformed),
        output = reference("xrange", "vec2", metric.transformed);
      worldPerData = worldPerData.mul(output.y.sub(output.x).div(input.y.sub(input.x)).abs());
    }
    // The pixel ratio is a uniform: another ratio (a moved window, an export) compiles nothing.
    const pixelsPerWorld = cameraProjectionMatrix.element(0).x.mul(viewportSize.x)
      .div(screenDPR.mul(2));
    return worldPerData.mul(pixelsPerWorld);
  }

  /**
   * A literal circle rasterizes a disc (fewer discarded fragments); everything else, and any
   * per-point shape channel, needs the full 2 x 2 quad the SDFs are defined over.
   */
  updateGeometry(doInvalidate = true) {
    let nextGeometry;
    if (!this.symbolCodeActive && this.options?.get("shape") == "circle") {
      nextGeometry = new THREE.CircleGeometry(
        1,
        Math.min(100, Math.max(3, this.options?.get("detail") ?? 10)),
      );
    } else if (!this.symbolCodeActive && this.options?.get("shape") == "square") {
      nextGeometry = new THREE.PlaneGeometry(
        2,
        2,
        Math.min(100, Math.max(3, this.options?.get("detail") ?? 10)),
        Math.min(100, Math.max(3, this.options?.get("detail") ?? 10)),
      );
    } else {
      nextGeometry = new THREE.PlaneGeometry(2, 2);
    }

    this.replaceGeometry(nextGeometry);
    if (doInvalidate) {
      this.invalidate();
    }
  }

  setup() {
    this.updateGeometry(false);

    // Options requiring re-compilation when changed
    // Uniforms, not rebuilds: switching them needs no new shader (17.5).
    this.quantizeFlag = this.flagOption("quantize");
    this.scaleChannelOptions("value");
    this.scaleChannelOptions("scale");
    this.option("xTransform");
    this.option("yTransform");
    this.option("zTransform");
    this.option("lit");
    this.option("transparent");
    this.option("sizeAttenuation");
    this.option("sizeUnits");

    this.option("shape", false, () => {
      this.updateGeometry();
      this.build();
    });
    this.option("detail", false, () => {
      this.updateGeometry();
    });

    // Options managed in shader without re-compilation
    this.option("cmapIndex", true);
    this.option("levels", true);

    this.option("valueBounds", true);
    this.option("valueRange", true);
    this.option("xbounds", true);
    this.option("xrange", true);
    this.option("ybounds", true);
    this.option("yrange", true);
    this.option("zbounds", true);
    this.option("zrange", true);
    this.option("scaleBounds", true);
    this.option("scaleRange", true);
    this.option("opacity", true);
    this.option("fillColor", true);
    this.option("outlineColor", true);
    this.option("outlineWidth", true);
    this.option("rotation", true);

    // Data channels (external management needed)

    this.isReady = false;
    this.valueNode = null;
    this.coordinatesNode = null;
    this.scaleNode = null;

    const rebuild = () => {
      if (this.isReady) this.build();
    };

    this.manager.registerField(
      new BufferedField(
        new PositionType({ targetNodes: ["coordinatesNode"] }),
        this,
        {
          onCount: (count) => {
            this.count = count;
          },
          onDirty: rebuild,
        },
      ),
    );
    this.manager.registerField(
      new BufferedField(new SizeType({ targetNodes: ["scaleNode"] }), this, {
        onDirty: rebuild,
      }),
    );
    this.manager.registerField(
      new BufferedField(new FillType(), this, { onDirty: rebuild }),
    );
    this.manager.registerField(
      new BufferedField(
        new ScalarType({ targetNodes: ["symbolCodeNode"] }),
        this,
        { onDirty: rebuild },
      ),
      "symbolCode",
    );
    this.manager.registerField(
      new BufferedField(
        new ColorType({ targetNodes: ["categoryColorNode"] }),
        this,
        { onDirty: rebuild },
      ),
      "categoryColor",
    );
    // Per-point outline colors for categorical outlineColor (flat point marks).
    this.manager.registerField(
      new BufferedField(
        new ColorType({ targetNodes: ["categoryOutlineNode"] }),
        this,
        { onDirty: rebuild },
      ),
      "categoryOutline",
    );
    for (const key of ["dx", "dy"])
      this.manager.registerField(
        new BufferedField(
          new ScalarType({ targetNodes: [key + "Node"] }),
          this,
          { onDirty: rebuild },
        ),
        key,
      );
    if (this.constructor.outlines) installOutlineChannels(this);
    this.isReady = true;
    // A subclass that replaces build() and registers its own fields first builds once, at the
    // end of its own constructor (TODO 32.8); built here too, it built twice, before its setup.
    if (!this.constructor.buildsItself) this.build();
  }

  setValues(positionNode, colorNode, sizeNode) {
    if (this.lit) {
      this._colorNode = colorNode.rgb;
      this._emissiveNode = vec3(0);
    } else {
      this._colorNode = vec3(0);
      this._emissiveNode = colorNode.rgb;
    }
    this._opacityNode = colorNode.a;
    this._positionNode = positionNode;
    this._sizeNode = sizeNode;

    this.material.positionNode = positionNode;
    this.material.colorNode = this._colorNode;
    this.material.emissiveNode = this._emissiveNode;
    this.material.opacityNode = this._opacityNode;
    if (sizeNode != null) {
      this.material.sizeNode = sizeNode.mul(this.displayScaleNode);
    }
  }

  /** Per-row fields past the vertex buffer budget are read as storage (vertexBuffersExceeded). */
  get storageOverflow() { return true; }

  /** The per-row fields build() reads, for the vertex buffer budget (vertexBuffersExceeded). */
  vertexBufferFields() {
    const size = this.sizeUnits === "data" || !this.pixelSizeNode;
    return ["position", ...(size ? ["size"] : []), this.categoryColorActive ? "categoryColor" : "fill",
      ...(this.symbolCodeActive ? ["symbolCode"] : []), ...(this.categoryOutlineActive ? ["categoryOutline"] : []),
      "dx", "dy", "interactionOpacity", ...(this.hasOutlines ? ["outlineWidth", "outlineOpacity"] : [])];
  }

  build() {
    if (this.vertexBuffersExceeded(this.vertexBufferFields())) return;
    const valueNode = this.getValueNode();
    const fill = this.getColorNode(valueNode);
    const p = uv().sub(0.5).mul(2);
    const shape = this.options?.get("shape") ?? "circle", rotation = this.rotationNode ?? uniform(0);
    // Per-point codes may name any registered shape: one distance-field read covers them all.
    const codes = this.symbolCodeActive && this.symbolCodeNode;
    const distance = codes ? symbolCodeDistance(this.symbolCodeNode.toVarying(), p, rotation)
      : symbolDistance(shape, p, rotation);
    this.fieldGeneration = codes || fieldShape(shape) ? shapeFieldGeneration() : undefined;
    const aa = fwidth(distance).max(0.00001);
    // The outline is CSS pixels, as every mark's (TODO 133.5): in the sprite's radius units,
    // the width times the display scale and DPR, over the device pixels a unit of p spans.
    const borderWidth = outlineWidth(this)
      .mul(this.displayScaleNode ?? float(1))
      .mul(screenDPR)
      .mul(fwidth(p.x).max(1e-6))
      .min(1);
    const edge = smoothstep(
      borderWidth.negate().sub(aa),
      borderWidth.negate().add(aa),
      distance,
    ).mul(borderWidth.greaterThan(0));
    let coverage = smoothstep(aa.negate(), aa, distance).oneMinus();
    this.fringeDiscarded = this.fringeDiscard();
    if (this.fringeDiscarded) {
      const soft = coverage;
      coverage = Fn(() => { soft.lessThan(0.5).discard(); return soft; })();
    }
    const outline = outlinePaint(this, fill.rgb, edge);
    // fill="transparent" (fillTransparent): a hollow point, its outline alone (TODO 64).
    const colorNode = vec4(
      this.fillTransparent ? outline.border : outline.color,
      fill.a.mul(coverage).mul(this.fillTransparent ? outline.coverage : 1),
    );
    this.material.alphaTest = 0.001;

    // Data units bypass the pixel scale range: the sprite is `size` data units wide, so a
    // size-1 square tiles a unit grid.
    let sizeNode = this.sizeUnits === "data"
      ? vec3(this.scaleNode ?? 1).rg.mul(this.pixelsPerDataUnit()).mul(this.dataSizeFactor)
      : this.pixelSizeNode
        ? vec3(this.pixelSizeNode).rg
        : this.applyScale(vec3(1)).rg;
    // A point the chain cannot map draws nothing: no size, at the origin (TODO 136.11).
    let { position: positionNode, valid } = this.mapPosition(vec3(0));
    if (this.surface && this.coordinatesNode) {
      const point = this.coordinatesNode;
      ({ position: positionNode, valid } = this.surface.attachPoint(point, point.z.add(0.12)));
    }
    positionNode = collapsed(valid, this.applyPixelOffset(positionNode, this.dxNode, this.dyNode));
    this.setValues(positionNode, colorNode, sizeNode.mul(valid.select(float(1), float(0))));
    this.applyBlend(this.blended());
    this.material.sizeAttenuation = this.sizeAttenuation;
    this.material.needsUpdate = true;
  }
}

// Points larger than this (CSS pixels) blend their edges in 2D (ScatterSprite.blended).
const LARGE_POINT = 16;

export class ScatterSprite extends Scatter {
  static outlines = true;
  static componentName = "Points";
  constructor(options, view, invalidate, material = new THREE.PointsNodeMaterial({ alphaTest: 0.5, alphaToCoverage: true })) {
    super(
      options,
      view,
      invalidate,
      material,
    );
    this.exportKind = "points";
    // Size and outlines determine edge blending; updates to the size field call refreshBlend.
    for (const key of ["sizeUnits", "scaleRange", "outlineWidth"])
      if (this.options?.has(key)) this.unregister.push(this.options.on(() => this.refreshBlend(), key));
  }

  get dataSizeFactor() {
    return 1;
  }

  /**
   * The largest point this mark draws, in CSS pixels, as far as the host knows: a constant size,
   * or a size scale's range. Data units grow with zoom and unscaled per-row sizes are unknown:
   * both Infinity.
   */
  maxPointSize() {
    if (this.sizeUnits === "data") return Infinity;
    const field = this.fields?.get("size");
    if (field && !field.isBufferNode && typeof field.data === "number") return field.data;
    const range = this.options?.get("scaleRange");
    if (field?.isBufferNode && this.scaleBoundsNode && this.scaleTransform && Array.isArray(range)) return Math.max(...range.map(Number));
    return Infinity;
  }

  /**
   * In 2D, large or outlined points blend their antialiased edges. Alpha-to-coverage turns edge
   * coverage into few MSAA sample levels, which Apple GPUs dither: large circles and small
   * contrasting outlines had frayed edges. Blending costs fill rate (1M overlapping 24 px
   * points at a device pixel ratio of 2: 101 ms a frame against 85), so small unoutlined points
   * keep alpha-to-coverage. 2D marks layer in declaration order in one queue whether they blend
   * or not (utils/layerOrder.js). 3D keeps alpha-to-coverage for opaque points: blended fringes
   * lose per-sample depth.
   */
  blended() {
    return (coordinateView(this.options) !== "3d" &&
      (this.maxPointSize() > LARGE_POINT || Number(this.options?.get("outlineWidth") ?? 0) > 0)) || super.blended();
  }

  fringeDiscard() {
    return this.blended() && coordinateView(this.options) === "3d";
  }

  /** Alpha-to-coverage draws any nonzero alpha fully opaque, so translucent points must blend. */
  build() {
    super.build();
    const blend = this.blended();
    if (this.material.alphaToCoverage === blend) {
      this.material.alphaToCoverage = !blend;
      this.material.needsUpdate = true;
    }
  }

  setValues(positionNode, colorNode, sizeNode) {
    if (this.lit) {
      this._colorNode = colorNode.rgb;
      this._emissiveNode = vec3(0);
    } else {
      this._colorNode = vec3(0);
      this._emissiveNode = colorNode.rgb;
    }
    this._opacityNode = colorNode.a;
    this._positionNode = positionNode;
    this._sizeNode = sizeNode;
    if (this.mask != null) {
      this._opacityNode = this._opacityNode.mul(this.mask);
    }

    this.material.positionNode = positionNode;
    this.material.colorNode = this._colorNode;
    this.material.emissiveNode = this._emissiveNode;
    this.material.opacityNode = this._opacityNode;

    if (sizeNode != null) {
      this.material.sizeNode = sizeNode.mul(this.displayScaleNode);
    }
  }

  updateGeometry(doInvalidate = true) {
    let nextGeometry;
    nextGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);

    this.mask = null; // The shared signed boundary also controls picking.

    this.replaceGeometry(nextGeometry);
    if (doInvalidate) {
      this.build();
      this.invalidate();
    }
  }
}
