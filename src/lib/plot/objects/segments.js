import { jointProjection } from "../utils/mapProjections.js";
import {ensureCurves,curved} from "../utils/curves.js";
import {
  spherical,
  angularFactor,
  MERCATOR_LIMIT,
} from "../utils/coordinates.js";
import {
  pathPointNode,
  pathPosition,
  chainedCoordinates,
} from "../utils/coordinateNodes.js";
import { BasePlotObject } from "./base.js";
import { LineNodeMaterial } from "../../threeExtensions/materials/lines.js";
import { arrowGeometry } from "../../threeExtensions/materials/arrowCap.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { applyScale } from "../../threeExtensions/materials/materials.js";
import { vec3, float, uint, instanceIndex, mix, mod, attribute, uniform } from "three/tsl";
import { uniformTransition } from "../utils/animation.js";
import { BufferGeometry, Float32BufferAttribute, Vector4 } from "three/webgpu";
import { BufferedField } from "../utils/proputils.js";
import { interleaveGeometry, segmentVertexBufferFields } from "../utils/vertexBuffers.js";
import { DashDistances } from "../utils/dashDistances.js";
import {
  ColorType,
  FillType,
  PositionType,
  WidthType,
  ScalarType,
  SelectType,
  Vector4Type,
} from "./types.js";
import { always, isFinitePoint } from "../utils/mappedValidity.js";
import { coordinateView } from "../utils/viewContext.js";
import { frameEdgesSupported, frameEdgeData } from "../utils/frameEdges.js";

/**
 * A segment's quad, then a quad for its start's bar and one for its end's (capKind 0, 1, 2),
 * unindexed: one instance draws a segment with its caps (materials/lines.js).
 */
function cappedQuads() {
  const source = new LineSegmentsGeometry().toNonIndexed(), g = new BufferGeometry();
  for (const [name, a] of Object.entries(source.attributes)) {
    const data = new Float32Array(a.array.length * 3);
    for (let i = 0; i < 3; i++) data.set(a.array, i * a.array.length);
    g.setAttribute(name, new Float32BufferAttribute(data, a.itemSize));
  }
  const n = source.attributes.position.count;
  g.setAttribute("capKind", new Float32BufferAttribute([...Array(n).fill(0), ...Array(n).fill(1), ...Array(n).fill(2)], 1));
  source.dispose();
  return g;
}

// A refined piece shorter than this (in its row's parameter) is a cut's sliver: hidden, and never joined.
const SLIVER = 1e-6;

export class Segments extends BasePlotObject {
  static componentName = "Segments";
  static sampleable = true;
  static curvedPaths = true;
  constructor(options, view, invalidate, material, isLine = false) {
    super(options, view, invalidate);
    this.material =
      material == null ? new LineNodeMaterial({ transparent: true }) : material;
    this.isConnectedPath = isLine;
    this.exportKind = isLine ? "line" : "segments";
    this.material.connected = isLine;

    this.progress = undefined;
    this.transitionStart = undefined;
    ensureCurves(options);
    this.setup();
  }

  set count(value) {
    const count = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    this._count = count;
    if (this.geometry) this.geometry.instanceCount = count;
  }

  get count() {
    return this._count ?? 0;
  }

  /** Rebuild when the blend decision (blended()) no longer matches the compiled material. */
  refreshBlend() {
    if (!this.isReady || !this.material) return;
    if (this.blended() !== this.material.transparent) {
      this.build();
      this.invalidate();
    }
  }

  /**
   * Whether each segment ends in bars (cap="bar", TODO 130.1): capSize CSS pixels across the
   * stroke at its true ends, as ErrorBars draws them. A connected Line has no caps.
   */
  get capActive() {
    return !this.isConnectedPath && this.options?.get("cap") === "bar";
  }

  get arrowActive() {
    return this.material instanceof LineNodeMaterial && !this.isConnectedPath && this.options?.get("cap") === "arrow";
  }

  updateGeometry(doInvalidate = true) {
    const oldGeometry = this.geometry;
    // The quad's position and uv share one vertex buffer (WebGPU allows 8 per pipeline); with
    // caps, the quad is followed by one for each end's bar (capKind 1 and 2), in that buffer too.
    const next = interleaveGeometry(this.arrowActive ? arrowGeometry() : this.capActive ? cappedQuads() : new LineSegmentsGeometry());
    if (this.arrowActive) this.exportKind = "billboard-arrows";
    else if (this.exportKind === "billboard-arrows") this.exportKind = "segments";
    // A mounted mark (cap toggled) keeps its geometry and swaps its attributes, so the data
    // buffers the material references survive (base.js replaceGeometry).
    if (oldGeometry) this.replaceGeometry(next);
    else this.geometry = next;
    this.geometry.instanceCount = this.count;
    if (doInvalidate) {
      this.invalidate();
    }
  }

  setup() {
    this.updateGeometry(false);
    this.option("curve",false,()=>{for(const f of this.fields.values())f.rebind?.();this.build();this.invalidate();});
    // The mark components read curveAlpha for their CPU control points; no shader does.
    this.option("curveAlpha", false, () => {});

    // Options requiring re-compilation when changed
    // Uniforms, not rebuilds: switching them needs no new shader (17.5).
    this.quantizeFlag = this.flagOption("quantize");
    this.scaleChannelOptions("value");
    this.scaleChannelOptions("width");
    this.option("xTransform");
    this.option("yTransform");
    this.option("zTransform");
    this.option("transparent");
    this.option("depthtest", false, (value) => {
      this.material.depthTest = value;
      this.invalidate();
    });
    this.option("dashed");
    this.capKind = this.options?.get("cap") ?? "none";
    this.option("cap", new SelectType({ defaultValue: "none", options: ["none", "bar", "arrow"], ui: false }), false, (value) => {
      if (value === this.capKind) return;
      this.capKind = value;
      this.updateGeometry(false);
      this.build();
      this.invalidate();
    });
    this.capSizeNode = uniform(this.options?.get("capSize") ?? 6);
    this.option("capSize", new ScalarType({ defaultValue: 6, min: 0 }), false, (value) => {
      uniformTransition(this, "capSize", this.capSizeNode, value);
      this.invalidate();
    });
    if (this.material instanceof LineNodeMaterial) {
      this.option("headLength", new ScalarType({ defaultValue: 10, min: 0 }), true);
      this.option("headWidth", new ScalarType({ defaultValue: 8, min: 0 }), true);
    }
    this.option("dashSize", true);
    this.option("gapSize", true);

    // Options managed in shader without re-compilation
    this.option("cmapIndex", true);
    this.option("opacity", true);
    this.option("fillColor", true);
    this.option("levels", true);

    this.option("valueBounds", true);
    this.option("valueRange", true);
    this.option("xbounds", true);
    this.option("xrange", true);
    this.option("ybounds", true);
    this.option("yrange", true);
    this.option("zbounds", true);
    this.option("zrange", true);
    this.option("widthBounds", true);
    this.option("widthRange", true);

    // Data channels (external management needed)

    // Ends at the frame edge (utils/frameEdges.js): each end's codes, and the frame's visible
    // domain [xmin, xmax, ymin, ymax], set from the camera before each draw.
    this.frameEdges = null;
    this.frameEdgesBuilt = false;
    this.frameEdgeNode = uniform(new Vector4(NaN, NaN, NaN, NaN));

    this.isReady = false;
    this.valueNode = null;
    this.startNode = null;
    this.endNode = null;
    this.widthNode = null;
    this.widthLiteral = false;

    const rebuild = () => {
      if (this.isReady) this.build();
    };

    this.manager.registerField(
      new BufferedField(
        new PositionType({ targetNodes: ["startNode"] }),
        this,
        {
          onCount: (count) => {
            this.setSegmentCount(count);
          },
          onDirty: rebuild,
        },
      ),
      "start",
    );

    this.manager.registerField(
      new BufferedField(new PositionType({ targetNodes: ["endNode"] }), this, {
        onCount: (count) => {
          this.setSegmentCount(count);
        },
        onDirty: rebuild,
      }),
      "end",
    );

    this.manager.registerField(
      new BufferedField(
        new ScalarType({ targetNodes: ["distanceNode"] }),
        this,
        {
          onDirty: rebuild,
        },
      ),
      "distance",
    );

    this.manager.registerField(
      new BufferedField(new WidthType(), this, { onDirty: rebuild }),
    );

    this.manager.registerField(
      new BufferedField(
        new FillType({ targetNodes: ["lineColorNode"] }),
        this,
        { onDirty: rebuild },
      ),
      "color",
    );
    if (this.isConnectedPath)
      for (const key of ["previous", "next"])
        this.manager.registerField(
          new BufferedField(
            new PositionType({ targetNodes: [key + "Node"] }),
            this,
            { onDirty: rebuild },
          ),
          key,
        );
    this.manager.registerField(new BufferedField(new ColorType({targetNodes:["categoryColorNode"]}),this,{onDirty:rebuild}), "categoryColor");
    for(const key of ['control1','control2'])this.manager.registerField(new BufferedField(new PositionType({targetNodes:[key+'Node']}),this,{onDirty:rebuild}),key);
    // Connection-backed marks: each row's start and end offsets in CSS pixels (x, y, x, y),
    // gathered from displaced point endpoints (Dodge). Read only while endpointOffsetActive.
    this.endpointOffsetActive = false;
    this.manager.registerField(new BufferedField(new Vector4Type({ defaultValue: [0, 0, 0, 0], targetNodes: ["endpointOffsetNode"], ui: false }), this, { onDirty: rebuild }), "endpointOffset");
    this.isReady = true;
    this.build();
  }

  setSegmentCount(count) {
    this.segmentCount = count;
    this.count = Math.min(count, this.drawLimit ?? Infinity);
  }

  /**
   * Draw at most this many segments (undefined: all). A Line over a padded view's valid-first
   * rows draws only its valid segments (TODO 17.3b); a draw count is not a shader change.
   */
  setDrawLimit(limit) {
    if (this.drawLimit === limit) return;
    this.drawLimit = limit;
    if (this.segmentCount !== undefined) this.setSegmentCount(this.segmentCount);
  }

  /** The start (`which` = "start") or end pixel offset of a connection-backed row, applied to a world position. */
  applyEndpointOffset(positionNode, which) {
    if (!this.endpointOffsetActive || !this.endpointOffsetNode) return positionNode;
    const offset = this.endpointOffsetNode;
    return which === "start"
      ? this.applyPixelOffset(positionNode, offset.x, offset.y)
      : this.applyPixelOffset(positionNode, offset.z, offset.w);
  }

  applyWidth(widthNode) {
    let scaleNode = this.widthNode ? this.widthNode.r : null;
    // Scalar widths are already CSS-pixel values. Only array/field widths use
    // the configurable mapping; otherwise width={2} maps to a 40px stroke.
    if (scaleNode && !this.widthLiteral && this.widthBoundsNode && this.widthTransform) {
      scaleNode = applyScale({
        valueNode: scaleNode,
        valueTransform: this.widthTransformCode ?? this.widthTransform,
        boundsNode: this.widthBoundsNode,
        outputRangeNode: this.widthRangeNode,
        constantNode: this.widthConstantNode,
        midpointNode: this.widthMidpointNode,
      });
    }
    if (scaleNode) {
      widthNode = widthNode.mul(scaleNode);
    }
    // A row whose color or width is outside its transform's domain is missing (TODO 39.1).
    const validity = this.scaleValidity();
    if (validity) widthNode = widthNode.mul(validity);
    if (spherical(this.options) || !this.sampling) return widthNode.mul(this.displayScaleNode);
    return this.sampling.index
      .lessThan(4294967040)
      .select(widthNode.mul(this.displayScaleNode), float(0));
  }

  /**
   * Where each drawn piece starts along its path for dashes, in viewport heights (TODO 73.2), and
   * where it ends when the vertex shader cannot measure it ([start, null]: the material adds the
   * piece's screen length). A refined piece's comes from the refinement pass, a connected Line's
   * from its screen-space prefix sum (utils/dashDistances.js; a sampled Line's pieces each start
   * over); a segment of its own starts at 0.
   */
  getDistanceNode() {
    if (this.curvedBuilt && this.curvedPaths) return [this.curvedPaths.meta.w, null];
    if (!this.dashDistances) return [float(0), null];
    const node = this.dashDistances.node;
    // A surface's pieces are drawn on it: their share of the row's length, start and end alike.
    if (this.surface) return [node.x, node.y];
    return [this.sampling ? this.sampling.enabled.greaterThan(0).select(float(0), node.x) : node.x, null];
  }

  setValues(
    startNode,
    endNode,
    colorNode,
    widthNode,
    distanceStartNode,
    distanceEndNode,
  ) {
    this.material.startNode = startNode;
    this.material.endNode = endNode;
    this.material.lineColorNode = colorNode.rgb;
    this.material.opacityNode = colorNode.a;
    this.material.distanceStartNode = distanceStartNode;
    this.material.distanceEndNode = distanceEndNode;
    if (widthNode != null) {
      this.material.lineWidthNode = widthNode;
    }
  }

  /** The bars at each segment's ends (capActive), read by the line material. */
  applyCaps() {
    this.material.arrowHead = this.arrowActive ? {
      length: this.headLengthNode.mul(this.displayScaleNode),
      width: this.headWidthNode.mul(this.displayScaleNode),
      last: this.curvedPieces ? this.curvedPieces.t1.greaterThanEqual(.999999).select(1, 0) : float(1),
      valid: (this.pieceValid?.select(1, 0) ?? float(1)).mul(this.scaleValidity() ?? 1),
    } : null;
    if (!this.capActive) {
      this.material.capKindNode = this.material.capSizeNode = null;
      return;
    }
    this.material.capKindNode = attribute("capKind", "float");
    this.material.capSizeNode = this.capSizeNode.mul(this.displayScaleNode);
    if (!this.curvedPieces) return;
    // A refined segment caps only its true ends (t = 0 and t = 1), never a cut or a join, and
    // each cap stands across the local tangent: its short segment runs from the end to a nearby
    // point on the same piece.
    const { at, t0, t1, shift } = this.curvedPieces,
      kind = this.material.capKindNode,
      startCap = kind.greaterThan(0.5).and(kind.lessThan(1.5)),
      endCap = kind.greaterThan(1.5),
      capPoint = at(startCap.select(t0.add(1e-3).min(t1), t1.sub(1e-3).max(t0))),
      probe = shift ? capPoint.position.sub(vec3(shift, 0, 0)) : capPoint.position,
      start = this.material.startNode,
      end = this.material.endNode;
    this.material.startNode = endCap.select(probe, start);
    this.material.endNode = startCap.select(probe, end);
    // A cap whose probe does not map is hidden (the validity contract, TODO 136.11).
    const hidden = startCap.and(t0.greaterThan(0)).or(endCap.and(t1.lessThan(1)))
      .or(startCap.or(endCap).and(capPoint.valid.not()));
    this.material.lineWidthNode = hidden.select(float(0), this.material.lineWidthNode);
  }

  /** Per-row channels past the vertex buffer budget are read as storage by instance
   * (vertexBuffersExceeded; TODO 136.11): a segment's instance is its buffer row, as its
   * instanced vertex attributes read it. */
  get storageOverflow() { return true; }

  /** The per-row fields build() binds as vertex buffers, for the budget (vertexBuffersExceeded). */
  vertexBufferFields() {
    return segmentVertexBufferFields({
      curved: !!this.curvedPaths && curved(this.options),
      connected: this.isConnectedPath,
      categoryColor: this.categoryColorActive,
      endpointOffset: this.endpointOffsetActive,
    });
  }

  /** Whether this build would exceed the vertex buffer limit (then it reports a render error). */
  vertexBufferLimitExceeded() {
    const { channels, positions } = this.vertexBufferFields();
    return this.vertexBuffersExceeded(channels, positions);
  }

  /** Set which end components are the frame edge ({start: [x, y], end: [x, y]}, or null). */
  setFrameEdges(codes) {
    if (JSON.stringify(codes ?? null) === JSON.stringify(this.frameEdges)) return;
    this.frameEdges = codes ?? null;
    if (this.isReady) this.build();
    this.invalidate();
  }

  /** Whether the last build reads the frame edges in the shader (utils/frameEdges.js). */
  frameEdgesInShader() {
    return this.frameEdgesBuilt;
  }

  /** The frame's visible domain through the camera of this draw (base.js onBeforeRender). */
  updateFrameEdges(camera) {
    if (!this.frameEdgesBuilt) return;
    const edges = frameEdgeData(this.options, camera);
    if (edges) this.frameEdgeNode.value.set(edges[0], edges[1], edges[2], edges[3]);
  }

  build() {
    if (this.vertexBufferLimitExceeded()) return;
    this.material.connected=this.isConnectedPath||curved(this.options);

    const valueNode = this.getValueNode();
    const colorNode = this.getColorNode(valueNode);

    let widthNode = this.applyWidth(float(1));
    // Each end and neighbor comes with whether it is a position (the validity contract,
    // utils/mappedValidity.js): a row the chain cannot map, or the NaN row that ends a series.
    const mapped = (node) => this.mapPosition(vec3(0), node);
    // An end at the frame edge takes the frame's visible domain from the camera's uniform.
    this.frameEdgesBuilt = Boolean(this.frameEdges) && this.positionSpace !== "world" && !this.surface &&
      frameEdgesSupported(this.options);
    const edges = this.frameEdgesBuilt ? this.frameEdges : null;
    const edged = (node, codes) => {
      if (!codes?.some(Boolean)) return node;
      const bound = (axis, code) => this.frameEdgeNode[["x", "y", "z", "w"][2 * axis + code - 1]];
      return vec3(codes[0] ? bound(0, codes[0]) : node.x, codes[1] ? bound(1, codes[1]) : node.y, node.z);
    };
    const start = mapped(edged(this.startNode, edges?.start)), end = mapped(edged(this.endNode, edges?.end));
    let startNode = this.applyEndpointOffset(start.position, "start");
    let endNode = this.applyEndpointOffset(end.position, "end");
    // An endpoint offset that is not a number makes its end invalid too.
    let startValid = start.valid.and(isFinitePoint(startNode)), endValid = end.valid.and(isFinitePoint(endNode));
    // A neighbor's own offset is not at hand: joins use this row's (exact where offsets agree).
    let previousNode = null, nextNode = null, previousValid = always(), nextValid = always();
    if (this.isConnectedPath) {
      const previous = mapped(this.previousNode), next = mapped(this.nextNode);
      previousNode = this.applyEndpointOffset(previous.position, "start");
      nextNode = this.applyEndpointOffset(next.position, "end");
      previousValid = previous.valid.and(isFinitePoint(previousNode));
      nextValid = next.valid.and(isFinitePoint(nextNode));
    }
    this.curvedBuilt = curved(this.options);
    this.curvedPieces = null;
    if (this.curvedBuilt && this.curvedPaths && this.startNode && this.endNode) {
      const meta = this.curvedPaths.meta,
        a = this.startNode,
        b = this.endNode,
        dt = meta.z.sub(meta.y);
      const last = this.progress
          ? meta.x.greaterThanEqual(this.transitionStart)
          : float(0).greaterThan(1),
        t0 = last.select(meta.y.min(this.progress ?? 1), meta.y),
        t1 = last.select(meta.z.min(this.progress ?? 1), meta.z);
      // A sliver a cut leaves at a vertex exactly on a horizon has no
      // direction to draw; it is hidden like an empty piece.
      widthNode = t1.sub(t0).greaterThan(SLIVER).select(widthNode, 0);
      const middle = t0.add(t1).mul(0.5), atPoint = (t) => pathPosition(this, a, b, t, middle);
      // A subclass that decorates pieces (error bar caps) reads them here, on the contract.
      this.curvedPieces = { at: atPoint, t0, t1 };
      const first = atPoint(t0), second = atPoint(t1);
      startNode = first.position;
      endNode = second.position;
      startValid = first.valid;
      endValid = second.valid;
      // Join both sides using the actual adjacent tessellated chords, not a
      // tiny tangent probe. Adjacent source paths may use different detail.
      const slot = instanceIndex.mod(this.curvedPaths.sourceCount);
      const before = this.curvedPaths.node.element(slot.max(1).sub(1));
      const after = this.curvedPaths.node.element(
        slot.add(1).min(this.curvedPaths.sourceCount.sub(1)),
      );
      const previousStep = before.z.sub(before.y);
      const nextStep = after.z.sub(after.y);
      // Pieces join only where they share an exact parameter. A piece cut at a
      // horizon, seam or invalid radius ends there without a join, and so does
      // one whose neighbor is a hidden sliver (a bisection that stepped just
      // past a horizon lying exactly on a subdivision vertex).
      const joinedBefore = slot.greaterThan(0).and(before.x.equal(meta.x)).and(before.z.equal(meta.y))
        .and(before.z.sub(before.y).greaterThan(SLIVER));
      const joinedAfter = slot.add(1).lessThan(this.curvedPaths.sourceCount)
        .and(after.x.equal(meta.x)).and(after.y.equal(meta.z))
        .and(after.z.sub(after.y).greaterThan(SLIVER));
      // Across source vertices too: a neighbor piece that is a hidden sliver (a vertex exactly on
      // a seam, cut to nothing on one side) is a cut, not a join (its tangent points across the map).
      const hasPrevious = this.previousNode
        ? this.previousNode.sub(a).length().greaterThan(0)
            .and(slot.greaterThan(0))
            .and(before.x.add(1).equal(meta.x))
            .and(before.z.equal(1)).and(meta.y.equal(0))
            .and(previousStep.greaterThan(SLIVER))
        : float(0).greaterThan(1);
      const hasNext = this.nextNode
        ? this.nextNode.sub(b).length().greaterThan(0)
            .and(slot.add(1).lessThan(this.curvedPaths.sourceCount))
            .and(after.x.equal(meta.x.add(1)))
            .and(after.y.equal(0)).and(meta.z.equal(1))
            .and(nextStep.greaterThan(SLIVER))
        : float(0).greaterThan(1);
      // Read the neighboring source interval, including its own Bézier controls.
      // Reflecting a chord from this interval estimates a different join on each
      // side of the vertex and leaves cracks in thick curves.
      const neighborPoint = (piece, t) => {
        const neighbor = Object.create(this);
        const field = (name) => {
          const value = this.fields.get(name);
          return value?.isBufferNode
            ? this.curvedPaths.field(value, uint(piece.x))
            : this[name + "Node"];
        };
        neighbor.control1Node = field("control1");
        neighbor.control2Node = field("control2");
        return pathPosition(neighbor, field("start"), field("end"), t, piece.y.add(piece.z).mul(0.5));
      };
      const previousPoint = this.previousNode ? neighborPoint(before, before.y) : { position: startNode, valid: always() };
      const nextPoint = this.nextNode ? neighborPoint(after, after.z) : { position: endNode, valid: always() };
      const joinedPrevious = atPoint(before.y), joinedNext = atPoint(after.z);
      // An unjoined piece end inside the path is a cut (a horizon, seam or
      // invalid radius): a straight synthetic neighbor ends it flat, as a
      // clipping cut does, instead of capping it past the cut. The path's
      // true ends (0 and 1) keep their caps.
      const cutStart = meta.y.greaterThan(0), cutEnd = meta.z.lessThan(1);
      previousNode = joinedBefore.select(
        joinedPrevious.position,
        hasPrevious.select(previousPoint.position, cutStart.select(startNode.mul(2).sub(endNode), startNode)),
      );
      nextNode = joinedAfter.select(
        joinedNext.position,
        hasNext.select(nextPoint.position, cutEnd.select(endNode.mul(2).sub(startNode), endNode)),
      );
      // A synthetic neighbor (a cut, a true end) is built from this piece: valid with it.
      previousValid = joinedBefore.and(joinedPrevious.valid)
        .or(joinedBefore.not().and(hasPrevious).and(previousPoint.valid))
        .or(joinedBefore.not().and(hasPrevious.not()));
      nextValid = joinedAfter.and(joinedNext.valid)
        .or(joinedAfter.not().and(hasNext).and(nextPoint.valid))
        .or(joinedAfter.not().and(hasNext.not()));
      if (this.surface) {
        const attached = (t) =>
          this.surface.attachPoint(pathPointNode(this, a, b, t));
        ({ position: startNode, valid: startValid } = attached(t0));
        ({ position: endNode, valid: endValid } = attached(t1));
        ({ position: previousNode, valid: previousValid } = attached(meta.y.sub(dt).max(0)));
        ({ position: nextNode, valid: nextValid } = attached(meta.z.add(dt).min(1)));
      }
      if (spherical(this.options) && !chainedCoordinates(this.options) &&
          coordinateView(this.options) !== "3d" && this.options.get("projection") !== "orthographic" &&
          !jointProjection(this.options.get("projection"))) {
        // A pole has no unique longitude. Never draw a spurious horizontal
        // bridge across its projected discontinuity.
        widthNode = endNode.x
          .sub(startNode.x)
          .abs()
          .greaterThan(Math.PI / 2)
          .select(0, widthNode);
        if (
          coordinateView(this.options) === "2d" &&
          this.options.get("projection") === "mercator"
        )
          widthNode = pathPointNode(this, a, b, t0.add(t1).mul(0.5))
            .y.mul(angularFactor(this.options))
            .abs()
            .greaterThan(MERCATOR_LIMIT)
            .select(0, widthNode);
        const shift = startNode.x
          .sub(this.longitudeShift)
          .add(Math.PI)
          .div(2 * Math.PI)
          .floor()
          .mul(2 * Math.PI);
        startNode = startNode.sub(vec3(shift, 0, 0));
        endNode = endNode.sub(vec3(shift, 0, 0));
        // Caps probe the piece (applyCaps): in the same shifted longitudes.
        this.curvedPieces.shift = shift;
        previousNode = previousNode.sub(vec3(shift, 0, 0));
        nextNode = nextNode.sub(vec3(shift, 0, 0));
        previousNode = vec3(
          startNode.x.add(
            mod(previousNode.x.sub(startNode.x).add(Math.PI), 2 * Math.PI).sub(
              Math.PI,
            ),
          ),
          previousNode.yz,
        );
        nextNode = vec3(
          endNode.x.add(
            mod(nextNode.x.sub(endNode.x).add(Math.PI), 2 * Math.PI).sub(
              Math.PI,
            ),
          ),
          nextNode.yz,
        );
      }
      const drawnTo = last.and(meta.z.greaterThanEqual(this.progress ?? 1));
      nextNode = drawnTo.select(endNode, nextNode);
      nextValid = drawnTo.or(nextValid);
    } else if (this.surface && this.startNode && this.endNode) {
      const index = instanceIndex.mod(64).toFloat(),
        last = instanceIndex.greaterThanEqual(this.transitionStart);
      const a = last.select(index.div(64).min(this.progress), index.div(64));
      const b = last.select(
        index.add(1).div(64).min(this.progress),
        index.add(1).div(64),
      );
      ({ position: startNode, valid: startValid } = this.surface.attachPoint(
        mix(this.startNode, this.endNode, a),
      ));
      ({ position: endNode, valid: endValid } = this.surface.attachPoint(
        mix(this.startNode, this.endNode, b),
      ));
      if (this.isConnectedPath && this.previousNode && this.nextNode) {
        const before = index
          .greaterThan(0)
          .select(
            mix(this.startNode, this.endNode, a.sub(1 / 64).max(0)),
            mix(this.previousNode, this.startNode, 63 / 64),
          );
        const after = index
          .lessThan(63)
          .select(
            mix(this.startNode, this.endNode, b.add(1 / 64).min(1)),
            mix(this.endNode, this.nextNode, 1 / 64),
          );
        ({ position: previousNode, valid: previousValid } = this.surface.attachPoint(before));
        const ending = last.and(b.greaterThanEqual(this.progress)), afterPoint = this.surface.attachPoint(after);
        nextNode = ending.select(endNode, afterPoint.position);
        nextValid = ending.select(endValid, afterPoint.valid);
      }
      const visible = b
        .greaterThan(a)
        .and(endNode.sub(startNode).length().greaterThan(1e-7));
      widthNode = visible.select(widthNode, float(0));
      endNode = visible.select(endNode, startNode.add(vec3(1e-5, 0, 0)));
    }
    // A row a coordinate chain cannot map, or the NaN row that ends a series on a log axis
    // (TODO 135.8), is not valid: a piece reaching it is dropped, and a neighbor there is no
    // join, rather than a line drawn toward the far corner (TODO 136.11: by the frame's valid
    // bit, not a test of the position against the 1e20 sentinel).
    // Arrows' heads read it too (their head is not sized by the width).
    this.pieceValid = startValid.and(endValid);
    widthNode = this.pieceValid.select(widthNode, float(0));
    if (previousNode) previousNode = previousValid.select(previousNode, startNode);
    if (nextNode) nextNode = nextValid.select(nextNode, endNode);
    // A dashed connected Line measures its path on screen (TODO 73.2); a refined one in the
    // refinement pass.
    const screenDashes = !!this.dashed && this.isConnectedPath && !this.curvedBuilt;
    if (screenDashes && !this.dashDistances) this.dashDistances = new DashDistances(this);
    else if (!screenDashes && this.dashDistances) { this.dashDistances.dispose(); this.dashDistances = null; }
    const [distanceStartNode, distanceEndNode] = this.getDistanceNode();
    this.setValues(
      startNode,
      endNode,
      colorNode,
      widthNode,
      distanceStartNode,
      distanceEndNode,
    );
    this.material.previousNode = previousNode;
    this.material.nextNode = nextNode;
    this.applyCaps();
    this.material.dashed = this.dashed;
    this.material.dashSizeNode = this.dashSizeNode.mul(this.displayScaleNode);
    this.material.gapSizeNode = this.gapSizeNode.mul(this.displayScaleNode);
    this.applyBlend(this.blended());
    // Rows at zero row opacity (a padded view's invalid rows, TODO 17.3b) are dropped, even
    // unblended; marks without a row-opacity field are unchanged.
    this.material.alphaTest = this.fields?.has("interactionOpacity") ? 0.001 : 0;
    this.material.needsUpdate = true;
  }
}
