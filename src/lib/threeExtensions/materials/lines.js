import { NodeMaterial, LineDashedMaterial, NormalBlending } from "three/webgpu";
import { setupArrowMaterial } from "./arrowCap.js";
import {
  uv,
  dashSize,
  gapSize,
  varyingProperty,
  attribute,
  bufferAttribute,
  cameraProjectionMatrix,
  cameraNear,
  materialColor,
  materialLineScale,
  materialLineDashSize,
  materialLineGapSize,
  materialLineDashOffset,
  materialLineWidth,
  materialOpacity,
  modelViewMatrix,
  modelWorldMatrix,
  positionGeometry,
  positionLocal,
  mix,
  smoothstep,
  Fn,
  float,
  vec2,
  vec3,
  vec4,
  If,
  instanceIndex,
  viewport,
  screenDPR,
  viewportOpaqueMipTexture,
  uniform,
} from "three/tsl";

const _defaultValues = /*@__PURE__*/ new LineDashedMaterial();

/**
 * This node material can be used to render lines with a size larger than one
 * by representing them as instanced meshes. Modifyed from THREE.Line2NodeMaterial in three.js examples.
 *
 * @augments NodeMaterial
 */
export class LineNodeMaterial extends NodeMaterial {
  static get type() {
    return "Line2NodeMaterial";
  }

  /**
   * Constructs a new node material for wide line rendering.
   *
   * @param {Object} [parameters={}] - The configuration parameter.
   */
  constructor(parameters = {}) {
    super();

    /**
     * This flag can be used for type testing.
     *
     * @type {boolean}
     * @readonly
     * @default true
     */
    this.isLine2NodeMaterial = true;

    this.setDefaultValues(_defaultValues);

    /**
     * Defines the start positions.
     *
     * @type {?import("three/webgpu").Node}
     * @default null
     */
    this.startNode = null;

    /**
     * A mark's shade (utils/shade.js, TODO 138.3): the line's output color in, the shaded color
     * out. This material sets its own outputNode, so it applies the shade there. A copy (the
     * picking material) leaves it out.
     *
     * @type {?(color: import("three/webgpu").Node) => import("three/webgpu").Node}
     * @default null
     */
    this.shadeOutput = null;

    /**
     * Defines the end positions.
     *
     * @type {?import("three/webgpu").Node}
     * @default null
     */
    this.endNode = null;

    /**
     * Defines the start distances.
     *
     * @type {?import("three/webgpu").Node}
     * @default null
     */
    this.distanceStartNode = null;

    /**
     * Defines the end distances.
     *
     * @type {?import("three/webgpu").Node}
     * @default null
     */
    this.distanceEndNode = null;

    /**
     * Defines the line width.
     *
     * @type {?import("three/webgpu").Node}
     * @default null
     */
    this.lineWidthNode = null;

    /**
     * Defines the lines color.
     *
     * @type {?import("three/webgpu").Node}
     * @default null
     */
    this.lineColorNode = null;

    /**
     * Whether vertex colors should be used or not.
     *
     * @type {boolean}
     * @default false
     */
    this.vertexColors = parameters.vertexColors;

    /**
     * The dash offset.
     *
     * @type {number}
     * @default 0
     */
    this.dashOffset = 0;

    /**
     * Defines the lines color.
     *
     * @type {?import("three/webgpu").Node}
     * @default null
     */
    this.lineColorNode = null;

    /**
     * Defines the offset.
     *
     * @type {?import("three/webgpu").Node}
     * @default null
     */
    this.offsetNode = null;

    /**
     * Defines the dash scale.
     *
     * @type {?import("three/webgpu").Node}
     * @default null
     */
    this.dashScaleNode = null;

    /**
     * Defines the dash size.
     *
     * @type {?import("three/webgpu").Node}
     * @default null
     */
    this.dashSizeNode = null;

    /**
     * Defines the gap size.
     *
     * @type {?import("three/webgpu").Node}
     * @default null
     */
    this.gapSizeNode = null;

    /**
     * Use ordinary alpha blending for transparent strokes.
     *
     * @type {number}
     * @default 0
     */
    this.blending = NormalBlending;

    this._useDash = parameters.dashed;
    this._useAlphaToCoverage = true;
    this._useWorldUnits = false;

    /**
     * The vertex stage never applies the InstancedMesh instance matrix (see setupPosition), so
     * it takes no vertex buffer; BasePlotObject.vertexBuffersExceeded reads this.
     *
     * @type {boolean}
     * @readonly
     */
    this.instanceTransform = false;

    this.setValues(parameters);
  }

  /**
   * The local position, without the instance transform. The vertex node below places each
   * segment from startNode/endNode and never reads positionLocal, but the base setup would
   * still bind the mark's instance matrix (always identity here), as a vertex buffer once it
   * outgrows a uniform buffer. Skipping it leaves that slot to per-row channels: WebGPU
   * allows 8 vertex buffers.
   *
   * @return {Node<vec3>} The position in local space.
   */
  setupPosition() {
    return positionLocal;
  }

  /**
   * Setups the vertex and fragment stage of this node material.
   *
   * @param {NodeBuilder} builder - The current node builder.
   */
  setup(builder) {
    if (this.arrowHead) {
      setupArrowMaterial(this);
      super.setup(builder);
      return;
    }
    const { renderer } = builder;

    const useAlphaToCoverage = this._useAlphaToCoverage;
    const vertexColors = this.vertexColors;
    const useDash = this._useDash;
    const useWorldUnits = this._useWorldUnits;

    const trimSegment = Fn(({ start, end }) => {
      const nearEstimate = cameraNear.negate();

      const alpha = nearEstimate.sub(start.z).div(end.z.sub(start.z));

      return vec4(mix(start.xyz, end.xyz, alpha), end.w);
    }).setLayout({
      name: "trimSegment",
      type: "vec4",
      inputs: [
        { name: "start", type: "vec4" },
        { name: "end", type: "vec4" },
      ],
    });

    this.vertexNode = Fn(() => {
      const instanceStart = this.startNode
        ? vec3(this.startNode)
        : attribute("instanceStart", "vec3");
      const instanceEnd = this.endNode
        ? vec3(this.endNode)
        : attribute("instanceEnd", "vec3");
      const lineWidthNode = this.lineWidthNode
        ? float(this.lineWidthNode)
        : materialLineWidth;

      // The world point under each fragment of the segment body (caps hold
      // their endpoint). Picking reads it: positionWorld is the template quad.
      varyingProperty("vec3", "pickWorld").assign(modelWorldMatrix.mul(vec4(
        positionGeometry.y.lessThan(0.5).select(instanceStart, instanceEnd), 1.0)).xyz);

      // camera space

      const start = vec4(modelViewMatrix.mul(vec4(instanceStart, 1.0))).toVar(
        "start",
      );
      const end = vec4(modelViewMatrix.mul(vec4(instanceEnd, 1.0))).toVar(
        "end",
      );

      if (useWorldUnits) {
        varyingProperty("vec3", "worldStart").assign(start.xyz);
        varyingProperty("vec3", "worldEnd").assign(end.xyz);
      }

      const aspect = viewport.z.div(viewport.w);

      // special case for perspective projection, and segments that terminate either in, or behind, the camera plane
      // clearly the gpu firmware has a way of addressing this issue when projecting into ndc space
      // but we need to perform ndc-space calculations in the shader, so we must address this issue directly
      // perhaps there is a more elegant solution -- WestLangley

      const perspective = cameraProjectionMatrix
        .element(2)
        .element(3)
        .equal(-1.0); // 4th entry in the 3rd column

      If(perspective, () => {
        If(start.z.lessThanEqual(cameraNear.negate()).and(end.z.greaterThan(cameraNear.negate())), () => {
          end.assign(trimSegment({ start: start, end: end }));
        }).ElseIf(
          end.z.lessThanEqual(cameraNear.negate()).and(start.z.greaterThan(cameraNear.negate())),
          () => {
            start.assign(trimSegment({ start: end, end: start }));
          },
        );
      });

      // clip space
      const clipStart = cameraProjectionMatrix.mul(start).toVar();
      const clipEnd = cameraProjectionMatrix.mul(end).toVar();
      if(this.capKindNode && this.capSizeNode) {
        If(this.capKindNode.greaterThan(0),()=>{
          const direction=clipEnd.xy.div(clipEnd.w).sub(clipStart.xy.div(clipStart.w)).mul(viewport.zw).toVar();
          direction.assign(direction.div(direction.length().max(1e-7)));
          const center=this.capKindNode.lessThan(1.5).select(clipStart,clipEnd).toVar();
          const offset=vec2(direction.y.negate(),direction.x).mul(this.capSizeNode).mul(screenDPR).div(viewport.zw).mul(center.w);
          clipStart.assign(vec4(center.xy.sub(offset),center.zw));
          clipEnd.assign(vec4(center.xy.add(offset),center.zw));
        });
      }

      // ndc space
      const ndcStart = clipStart.xyz.div(clipStart.w);
      const ndcEnd = clipEnd.xyz.div(clipEnd.w);


      // direction
      const dir = ndcEnd.xy.sub(ndcStart.xy).toVar();

      // account for clip-space aspect ratio
      dir.x.assign(dir.x.mul(aspect));
      dir.assign(dir.div(dir.length().max(1e-7)));

      const clip = vec4().toVar();

      if (
        this.connected &&
        this.previousNode &&
        this.nextNode &&
        !useWorldUnits
      ) {
        const a = ndcStart.xy.mul(vec2(aspect, 1)),
          b = ndcEnd.xy.mul(vec2(aspect, 1));
        const project = (p, fallback) => {
          const view = modelViewMatrix.mul(vec4(p, 1));
          const clip = cameraProjectionMatrix.mul(view);
          // A neighbor behind the near plane cannot define a projected join:
          // dividing by negative/near-zero w flips or explodes its tangent.
          const valid = perspective.not().or(
            view.z.lessThanEqual(cameraNear.negate()).and(clip.w.greaterThan(1e-7)),
          );
          return valid.select(
            clip.xy.div(clip.w.max(1e-7)).mul(vec2(aspect, 1)),
            fallback,
          );
        };
        // Continue the visible segment straight at a clipped boundary. These
        // synthetic neighbors do not add false endpoint caps at clipping cuts.
        const previous = project(this.previousNode, a.sub(b.sub(a))),
          next = project(this.nextNode, b.add(b.sub(a)));
        const atStart = positionGeometry.y.lessThan(0.5);
        const before = atStart.select(previous, a),
          at = atStart.select(a, b),
          after = atStart.select(b, next);
        const rawIn = at.sub(before),
          rawOut = after.sub(at);
        const missingIn = rawIn.length().greaterThanEqual(1e-7).not(),
          missingOut = rawOut.length().greaterThanEqual(1e-7).not();
        const incoming = missingIn.select(
          dir,
          rawIn.div(rawIn.length().max(1e-7)),
        );
        const outgoing = missingOut.select(
          dir,
          rawOut.div(rawOut.length().max(1e-7)),
        );
        const n0 = vec2(incoming.y, incoming.x.negate()),
          n1 = vec2(outgoing.y, outgoing.x.negate());
        const sum = n0.add(n1),
          miter = sum.div(sum.length().max(1e-7));
        const denominator = miter
          .dot(vec2(dir.y, dir.x.negate()))
          .abs()
          .max(1e-7);
        const bevel = denominator.lessThan(0.25); // miter limit 4
        const sign = positionGeometry.x.lessThan(0).select(float(-1), float(1));
        const turn = incoming.x.mul(outgoing.y).sub(incoming.y.mul(outgoing.x));
        const outer = sign.mul(turn).greaterThanEqual(0);
        const normal = vec2(dir.y, dir.x.negate());
        const offset = miter.div(denominator).mul(sign).toVar();
        If(bevel, () => {
          offset.assign(outer.select(normal.mul(sign), vec2(0)));
          // The ending cap quad becomes the bevel wedge. Its inner vertices
          // collapse to the join center; the next segment begins on this edge.
          If(atStart.not().and(positionGeometry.y.greaterThan(1)), () => {
            offset.assign(outer.select(n1.mul(sign), vec2(0)));
          });
        });
        // An error bar cap is its own short segment and never joins.
        const cap = this.capKindNode && this.capSizeNode
          ? this.capKindNode.greaterThan(0) : float(0).greaterThan(1);
        const endpoint = atStart.select(missingIn, missingOut).or(cap);
        varyingProperty("float", "pathEndpoint").assign(endpoint.select(1, 0));
        If(endpoint, () => {
          offset.assign(normal.mul(sign));
          If(positionGeometry.y.lessThan(0), () => {
            offset.subAssign(dir);
          }).ElseIf(positionGeometry.y.greaterThan(1), () => {
            offset.addAssign(dir);
          });
        });
        offset.x.divAssign(aspect);
        offset.mulAssign(lineWidthNode.div(viewport.w.div(screenDPR)));
        clip.assign(atStart.select(clipStart, clipEnd));
        clip.addAssign(vec4(offset.mul(clip.w), 0, 0));
      } else if (useWorldUnits) {
        // get the offset direction as perpendicular to the view vector

        const worldDir = end.xyz.sub(start.xyz).normalize();
        const tmpFwd = mix(start.xyz, end.xyz, 0.5).normalize();
        const worldUp = worldDir.cross(tmpFwd).normalize();
        const worldFwd = worldDir.cross(worldUp);

        const worldPos = varyingProperty("vec4", "worldPos");

        worldPos.assign(positionGeometry.y.lessThan(0.5).select(start, end));

        // height offset
        const hw = lineWidthNode.mul(0.5);
        worldPos.addAssign(
          vec4(
            positionGeometry.x
              .lessThan(0.0)
              .select(worldUp.mul(hw), worldUp.mul(hw).negate()),
            0,
          ),
        );

        // don't extend the line if we're rendering dashes because we
        // won't be rendering the endcaps
        if (!useDash) {
          // cap extension
          worldPos.addAssign(
            vec4(
              positionGeometry.y
                .lessThan(0.5)
                .select(worldDir.mul(hw).negate(), worldDir.mul(hw)),
              0,
            ),
          );

          // add width to the box
          worldPos.addAssign(vec4(worldFwd.mul(hw), 0));

          // endcaps
          If(
            positionGeometry.y
              .greaterThan(1.0)
              .or(positionGeometry.y.lessThan(0.0)),
            () => {
              worldPos.subAssign(vec4(worldFwd.mul(2.0).mul(hw), 0));
            },
          );
        }

        // project the worldpos
        clip.assign(cameraProjectionMatrix.mul(worldPos));

        // shift the depth of the projected points so the line
        // segments overlap neatly
        const clipPose = vec3().toVar();

        clipPose.assign(
          positionGeometry.y.lessThan(0.5).select(ndcStart, ndcEnd),
        );
        clip.z.assign(clipPose.z.mul(clip.w));
      } else {
        const offset = vec2(dir.y, dir.x.negate()).toVar("offset");

        // undo aspect ratio adjustment
        dir.x.assign(dir.x.div(aspect));
        offset.x.assign(offset.x.div(aspect));

        // sign flip
        offset.assign(
          positionGeometry.x.lessThan(0.0).select(offset.negate(), offset),
        );

        // endcaps
        If(positionGeometry.y.lessThan(0.0), () => {
          offset.assign(offset.sub(dir));
        }).ElseIf(positionGeometry.y.greaterThan(1.0), () => {
          offset.assign(offset.add(dir));
        });

        // adjust for linewidth
        offset.assign(offset.mul(lineWidthNode));

        // adjust for clip-space to screen-space conversion // maybe resolution should be based on viewport ...
        offset.assign(offset.div(viewport.w.div(screenDPR)));

        // select end
        clip.assign(
          positionGeometry.y.lessThan(0.5).select(clipStart, clipEnd),
        );

        // back to clip space
        offset.assign(offset.mul(clip.w));

        clip.assign(clip.add(vec4(offset, 0, 0)));
      }

      // A dash is measured in CSS pixels along the drawn path (TODO 73.2): the piece's distance
      // along its path where it starts (distanceStartNode, in viewport heights: the mark's
      // screen-space prefix sum, 0 for a segment of its own) plus how far along the piece's
      // direction on screen this vertex lies. That is affine in screen position, so a miter's or
      // a cap's corner gets its own exact value and dashes end square to the line. Dashes keep
      // their length whatever the zoom, the frame chain or the export's resolution.
      if (useDash) {
        const dashScaleNode = this.dashScaleNode
          ? float(this.dashScaleNode)
          : materialLineScale;
        const offsetNode = this.offsetNode
          ? float(this.offsetNode)
          : materialLineDashOffset;
        const pixels = viewport.w.div(screenDPR);
        const perUnit = vec2(viewport.z, viewport.w).div(screenDPR).mul(0.5);
        const a = ndcStart.xy.mul(perUnit), b = ndcEnd.xy.mul(perUnit);
        const chord = b.sub(a), length = chord.length();
        const along = clip.xy.div(clip.w).mul(perUnit).sub(a).dot(chord.div(length.max(1e-6)));
        const start = (this.distanceStartNode ? float(this.distanceStartNode) : float(0)).mul(pixels);
        // A piece whose end the mark measures (on a surface) stretches its pattern to it.
        const stretch = this.distanceEndNode
          ? float(this.distanceEndNode).mul(pixels).sub(start).div(length.max(1e-6)) : float(1);
        const lineDistance = start.add(along.mul(stretch)).mul(dashScaleNode).add(offsetNode);
        // Screen-space distances interpolate linearly on screen: the varying is premultiplied by
        // w and divided again per fragment (perspective-correct interpolation undone).
        varyingProperty("float", "lineDistance").assign(lineDistance.mul(clip.w));
        varyingProperty("float", "lineW").assign(clip.w);
      }

      return clip;
    })();

    const closestLineToLine = Fn(({ p1, p2, p3, p4 }) => {
      const p13 = p1.sub(p3);
      const p43 = p4.sub(p3);

      const p21 = p2.sub(p1);

      const d1343 = p13.dot(p43);
      const d4321 = p43.dot(p21);
      const d1321 = p13.dot(p21);
      const d4343 = p43.dot(p43);
      const d2121 = p21.dot(p21);

      const denom = d2121.mul(d4343).sub(d4321.mul(d4321));
      const numer = d1343.mul(d4321).sub(d1321.mul(d4343));

      const mua = numer.div(denom).clamp();
      const mub = d1343.add(d4321.mul(mua)).div(d4343).clamp();

      return vec2(mua, mub);
    });

    this.colorNode = Fn(() => {
      const vUv = uv();
      const dashAlpha = float(1).toVar();

      if (useDash) {
        const dashSizeNode = this.dashSizeNode
          ? float(this.dashSizeNode)
          : materialLineDashSize;
        const gapSizeNode = this.gapSizeNode
          ? float(this.gapSizeNode)
          : materialLineGapSize;

        dashSize.assign(dashSizeNode);
        gapSize.assign(gapSizeNode);

        const vLineDistance = varyingProperty("float", "lineDistance").div(varyingProperty("float", "lineW"));

        vUv.y
          .lessThan(-1.0)
          .or(vUv.y.greaterThan(1.0))
          .and(
            this.connected
              ? varyingProperty("float", "pathEndpoint").greaterThan(0.5)
              : float(1).greaterThan(0),
          )
          .discard(); // discard endcaps
        if (useAlphaToCoverage && renderer.currentSamples > 0) {
          const period = dashSize.add(gapSize).max(1e-6);
          const center = vLineDistance
            .sub(dashSize.mul(0.5))
            .add(period.mul(0.5))
            .mod(period)
            .sub(period.mul(0.5));
          const distance = center.abs().sub(dashSize.mul(0.5));
          const aa = vLineDistance.fwidth().max(1e-6);
          dashAlpha.assign(smoothstep(aa.negate(), aa, distance).oneMinus());
        } else
          vLineDistance
            .mod(dashSize.add(gapSize).max(1e-6))
            .greaterThan(dashSize)
            .discard();
      }

      const alpha = float(1).toVar("alpha");

      if (useWorldUnits) {
        const worldStart = varyingProperty("vec3", "worldStart");
        const worldEnd = varyingProperty("vec3", "worldEnd");

        // Find the closest points on the view ray and the line segment
        const rayEnd = varyingProperty("vec4", "worldPos")
          .xyz.normalize()
          .mul(1e5);
        const lineDir = worldEnd.sub(worldStart);
        const params = closestLineToLine({
          p1: worldStart,
          p2: worldEnd,
          p3: vec3(0.0, 0.0, 0.0),
          p4: rayEnd,
        });

        const p1 = worldStart.add(lineDir.mul(params.x));
        const p2 = rayEnd.mul(params.y);
        const delta = p1.sub(p2);
        const len = delta.length();
        const norm = len.div(lineWidthNode);

        if (!useDash) {
          if (useAlphaToCoverage && renderer.currentSamples > 0) {
            const dnorm = norm.fwidth();
            alpha.assign(
              smoothstep(
                dnorm.negate().add(0.5),
                dnorm.add(0.5),
                norm,
              ).oneMinus(),
            );
          } else {
            norm.greaterThan(0.5).discard();
          }
        }
      } else {
        // round endcaps

        if (useAlphaToCoverage && renderer.currentSamples > 0) {
          const a = vUv.x;
          const b = vUv.y
            .greaterThan(0.0)
            .select(vUv.y.sub(1.0), vUv.y.add(1.0));

          const len2 = a.mul(a).add(b.mul(b));

          const dlen = float(len2.fwidth()).toVar("dlen");

          If(
            vUv.y
              .abs()
              .greaterThan(1.0)
              .and(
                this.connected
                  ? varyingProperty("float", "pathEndpoint").greaterThan(0.5)
                  : float(1).greaterThan(0),
              ),
            () => {
              alpha.assign(
                smoothstep(dlen.oneMinus(), dlen.add(1), len2).oneMinus(),
              );
            },
          );
        } else {
          If(
            vUv.y
              .abs()
              .greaterThan(1.0)
              .and(
                this.connected
                  ? varyingProperty("float", "pathEndpoint").greaterThan(0.5)
                  : float(1).greaterThan(0),
              ),
            () => {
              const a = vUv.x;
              const b = vUv.y
                .greaterThan(0.0)
                .select(vUv.y.sub(1.0), vUv.y.add(1.0));
              const len2 = a.mul(a).add(b.mul(b));

              len2.greaterThan(1.0).discard();
            },
          );
        }
      }

      let lineColorNode;

      if (this.lineColorNode) {
        lineColorNode = this.lineColorNode;
      } else {
        if (vertexColors) {
          const instanceColorStart = attribute("instanceColorStart");
          const instanceColorEnd = attribute("instanceColorEnd");

          const instanceColor = positionGeometry.y
            .lessThan(0.5)
            .select(instanceColorStart, instanceColorEnd);

          lineColorNode = instanceColor.mul(materialColor);
        } else {
          lineColorNode = materialColor;
        }
      }

      return vec4(lineColorNode, alpha.mul(dashAlpha));
    })();

    const opacity = this.opacityNode
      ? float(this.opacityNode)
      : materialOpacity;
    const lineOutput = vec4(this.colorNode.rgb, this.colorNode.a.mul(opacity));
    this.outputNode = this.shadeOutput ? this.shadeOutput(lineOutput) : lineOutput;

    super.setup(builder);
  }

  /**
   * Whether the lines should sized in world units or not.
   * When set to `false` the unit is pixel.
   *
   * @type {boolean}
   * @default false
   */
  get worldUnits() {
    return this._useWorldUnits;
  }

  set worldUnits(value) {
    if (this._useWorldUnits !== value) {
      this._useWorldUnits = value;
      this.needsUpdate = true;
    }
  }

  /**
   * Whether the lines should be dashed or not.
   *
   * @type {boolean}
   * @default false
   */
  get dashed() {
    return this._useDash;
  }

  set dashed(value) {
    if (this._useDash !== value) {
      this._useDash = value;
      this.needsUpdate = true;
    }
  }

  /**
   * Whether alpha to coverage should be used or not.
   *
   * @type {boolean}
   * @default true
   */
  get alphaToCoverage() {
    return this._useAlphaToCoverage && !this.transparent;
  }

  set alphaToCoverage(value) {
    if (this._useAlphaToCoverage !== value) {
      this._useAlphaToCoverage = value;
      this.needsUpdate = true;
    }
  }

  /**
   * Copies the properties of the given material to this instance.
   *
   * @param {Line2NodeMaterial} source - The material to copy.
   * @return {Line2NodeMaterial} A reference to this material.
   */
  copy(source) {
    super.copy(source);
    this.arrowHead = source.arrowHead;
    this.capKindNode=source.capKindNode; this.capSizeNode=source.capSizeNode;

    this.connected = source.connected;
    this.previousNode = source.previousNode;
    this.nextNode = source.nextNode;
    this.startNode = source.startNode;
    this.endNode = source.endNode;
    this.distanceStartNode = source.distanceStartNode;
    this.distanceEndNode = source.distanceEndNode;
    this.lineWidthNode = source.lineWidthNode;
    this.vertexColors = source.vertexColors;
    this.dashOffset = source.dashOffset;

    this.lineColorNode = source.lineColorNode;
    this.offsetNode = source.offsetNode;
    this.dashScaleNode = source.dashScaleNode;
    this.dashSizeNode = source.dashSizeNode;
    this.gapSizeNode = source.gapSizeNode;

    this._useDash = source._useDash;
    this._useAlphaToCoverage = source._useAlphaToCoverage;
    this._useWorldUnits = source._useWorldUnits;

    return this;
  }
}
