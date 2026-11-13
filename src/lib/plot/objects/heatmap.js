import {
  spherical,
  angularFactor,
  angularPeriod,
  jointProjectionOf,
  MERCATOR_LIMIT,
} from "../utils/coordinates.js";
import { coordinatePoint, hemisphereOpacity, orthographicFacing, chainedCoordinates } from "../utils/coordinateNodes.js";
import { createSurfaceGeometry, createGridGeometry, surfaceDetail } from "../utils/surfaceGeometry.js";
import { buildCoordinateOperations, affineAncestors } from "../utils/coordinateOperations.js";
import { nonlinearFrame } from "../utils/frameMapping.js";
import { aspect3dPositionNode } from "../utils/frameNodes.js";
import { placedFrame } from "../utils/framePlacement.js";
import { sphericalAncestor } from "../utils/frameMarks.js";
import { BasePlotObject } from "./base.js";
import { isFinitePoint } from "../utils/mappedValidity.js";
import * as THREE from "three/webgpu";
import {
  cross,
  positionView,
  positionWorld,
  cameraViewMatrix,
  positionLocal,
  uv,
  vec2,
  vec3,
  vec4,
  float,
  max,
  instanceIndex,
  reference,
  uniform,
} from "three/tsl";
import { TextureField } from "../utils/proputils.js";
import {
  applyContourNode,
  applyGrid,
  derivScale,
  scaleValid,
  applyScale,
} from "../../threeExtensions/materials/materials.js";
import {
  FillType,
} from "./types.js";
import { unitOpacity } from "../utils/opacity.js";
import { coordinateView } from "../utils/viewContext.js";

export class Heatmap extends BasePlotObject {
  static componentName = "Heatmap";
  constructor(
    options,
    view,
    invalidate,
    material,
    image = false,
    pixelated = undefined,
  ) {
    super(options, view, invalidate);
    this.coordinateGeometry = () => this.updateGeometry(false);
    this.image = image;
    this.pixelated = pixelated;
    // A plain grid's cell bounds along x and y (TODO 134.15; setCellExtent), uniforms: unset, it
    // spans its bounds.
    /** @type {Record<string, number[] | null>} */
    this.cellExtent = { x: null, y: null };
    this.cellExtentNodes = { x: uniform(new THREE.Vector2(0, 1)), y: uniform(new THREE.Vector2(0, 1)) };
    this.cellExtentFlags = { x: uniform(0), y: uniform(0) };
    this.ownMaterial = !material;
    this.material =
      material ||
      (image
        ? new THREE.MeshBasicNodeMaterial({ toneMapped: false })
        : new THREE.MeshStandardNodeMaterial({}));
    this.material.side = THREE.DoubleSide;
    this.setup();
    for (const k of ["xbounds", "ybounds"])
      this.unregister.push(
        options.on(() => {
          if (spherical(options)) this.updateGeometry();
        }, k),
      );
  }

  /** A 2D Heatmap or Image whose chain bends it (a polar operation, an
   * orthographic ancestor, a nested log/sqrt parent) or places it maps every grid vertex's source point
   * through the whole chain, and its texture follows by UV. A Cartesian root
   * and linear ranged frames keep the direct quad. */
  warped() {
    const o = this.options;
    if (this.surfaceMode || this.gridMesh) return false;
    // In 3D a flat Heatmap or Image in a nested or placed frame (a planet's ring: an image in a
    // polar frame placed in the scene) maps its grid through the chain as in 2D; a globe has its
    // own sphere path, and a root heatmap stays a surface.
    if (coordinateView(o) !== "2d") return !spherical(o) && chainedCoordinates(o);
    // Its own spherical frame warps when nested with affine ancestors (a
    // ranged globe child, a placed map inset); a root map keeps its path.
    if (spherical(o)) return chainedCoordinates(o) && affineAncestors(o);
    try {
      return !!placedFrame(o) || nonlinearFrame(o) || buildCoordinateOperations(o).some((operation) =>
        operation.kind === "polar" || operation.kind.startsWith("spherical"));
    } catch { return false; }
  }
  /** Grid cells per side of a warped mesh, from its screen curvature
   * (warpDetail in utils/surfaceGeometry.js, run by the component). */
  setWarpDetail(value) {
    const next = Math.max(8, Math.min(256, 2 ** Math.ceil(Math.log2(Math.max(1, value)))));
    if (next === this.warpDetail) return;
    this.warpDetail = next;
    if (this.warpGeometry) this.updateGeometry();
  }
  /** A warped vertex, and (on an orthographic ancestor) the facing of its
   * point there: that operation maps unclipped, and build() discards the
   * fragments behind its horizon. Orthographic projection is linear in 3D and
   * the rest of the chain is affine (frameCompatibility), so the interpolated
   * facing's zero is the cell chord's crossing. */
  warpedPosition(q) {
    const ex = this.extentNode("x"), ey = this.extentNode("y");
    const p = vec3(q.x.mul(ex.y.sub(ex.x)).add(ex.x), q.y.mul(ey.y.sub(ey.x)).add(ey.x), 0);
    // A spherical grid maps unwrapped: its bounds are one longitude extent. A
    // chart's grid on a repeating root map keeps that map's longitude
    // unwrapped too, so a chart across the antimeridian stays one piece.
    const horizon = {}, local = spherical(this.options) ? { unwrap: true } : null;
    // A chart on a placed map inset draws three copies, one longitude period
    // apart; each is clipped to the map's extent, so the part past the
    // antimeridian appears at the other edge, as the map's Lines do.
    const seam = this.wrapCopies > 1 ? { shift: float(instanceIndex).sub(1).mul(2 * Math.PI) } : null;
    const { position, valid } = this.mapPosition(vec3(0), p, { tolerant: true, horizon, local, unwrapRoot: true, seam });
    return { position, valid, facing: horizon.facing ?? null, seamX: seam?.x ?? null };
  }
  updateGeometry(doInvalidate = true) {
    let nextGeometry;
    // A curvilinear grid table's own cells (TODO 51; setGridMesh).
    if (this.gridMesh) {
      this.warpGeometry = false;
      this.replaceGeometry(createGridGeometry(this.gridMesh.rows, this.gridMesh.columns, this.renderer.backend?.device?.limits, this.gridMesh.values));
      if (doInvalidate) this.invalidate();
      return;
    }
    this.warpGeometry = this.warped();
    if (this.warpGeometry) {
      this.replaceGeometry(createSurfaceGeometry(this.warpDetail ?? 16, this.renderer.backend?.device?.limits));
      if (doInvalidate) this.invalidate();
      return;
    }
    const shape = spherical(this.options)
      ? "square"
      : (this.options?.get("shape") ?? "circle");
    const detail = Math.min(
      this.surfaceMode || spherical(this.options) ? 2048 : 100,
      Math.max(
        spherical(this.options) ? 96 : 3,
        this.options?.get("detail") ?? 10,
      ),
    );
    if (shape == "circle") {
      nextGeometry = createSurfaceGeometry(detail, this.renderer.backend?.device?.limits, "circle");
    } else if (shape == "square") {
      nextGeometry = createSurfaceGeometry(detail, this.renderer.backend?.device?.limits);
    } else {
      nextGeometry = createSurfaceGeometry(detail, this.renderer.backend?.device?.limits, "circle");
    }

    if (
      spherical(this.options) &&
      coordinateView(this.options) === "2d" &&
      this.options.get("projection") === "mercator"
    ) {
      const bounds = this.options.get("ybounds"),
        f = angularFactor(this.options),
        lo = Math.max(-MERCATOR_LIMIT, Math.min(MERCATOR_LIMIT, bounds[0] * f)),
        hi = Math.max(-MERCATOR_LIMIT, Math.min(MERCATOR_LIMIT, bounds[1] * f)),
        uvs = nextGeometry.getAttribute("uv");
      for (let i = 0; i < uvs.count; i++)
        uvs.setY(
          i,
          ((lo + (hi - lo) * uvs.getY(i)) / f - bounds[0]) /
            (bounds[1] - bounds[0]),
        );
    }
    this.replaceGeometry(nextGeometry);
    if (doInvalidate) {
      this.invalidate();
    }
  }

  setup() {
    this.updateGeometry(false);

    // Options requiring re-compilation when changed
    this.option("surfaceMode");
    this.option("surface3d");
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
    this.option("depthtest");

    this.option("shape", false, () => {
      this.updateGeometry();
    });
    this.option("detail", false, () => {
      this.updateGeometry();
      this.build();
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
    this.option("zScale", true);
    this.option("scaleBounds", true);
    this.option("scaleRange", true);
    this.option("fillColor", true);
    this.option("contour-enabled");
    this.option("contour-width", true);
    this.option("contour-feather", true);
    this.option("contour-color", true);
    this.option("contour-strength", true);
    this.option("grid-enabled");
    this.option("grid-polar");
    this.option("grid-offset", true);
    this.option("grid-cells", true);
    this.option("grid-cellsWidth", true);
    this.option("grid-cellColor", true);
    this.option("grid-sections", true);
    this.option("grid-sectionsWidth", true);
    this.option("grid-sectionColor", true);
    this.option("grid-strength", true);
    this.option("opacity", true);

    // Data channels (external management needed)

    this.isReady = false;
    this.valueNode = null;
    this.coordinatesNode = null;
    this.scaleNode = null;

    const rebuild = () => {
      if (this.isReady) this.build();
    };

    this.manager.registerField(
      new TextureField(new FillType(), this, {
        image: this.image,
        pixelated: this.pixelated,
        onCount: (count) => {
          this.count = count > 0 ? (this.wrapCopies ?? 1) : 0;
        },
        onDirty: rebuild,
      }),
    );

    this.isReady = true;
    this.count = 1;
    this.build();
  }

  /** A grid table's remap tables for the fill texture's axes (TODO 51; utils/gridMarks.js). */
  setGridRemap(remap) {
    this.fields.get("fill")?.setRemap?.(remap);
  }

  /**
   * A curvilinear grid table's cells (TODO 51): { corners (a device array [(rows + 1) *
   * (columns + 1), 2] of data x and y), rows, columns }, or null. The mesh is the grid's own,
   * each vertex placed by its corner through the frame chain (maps and the globe included); the
   * fill texture is sampled over the cells by their indices.
   */
  async setGridMesh(mesh) {
    if (mesh?.corners === this.gridMesh?.corners) return;
    const token = (this.gridMeshToken = (this.gridMeshToken ?? 0) + 1);
    // The corners are computed on the device from the grid's positions and read once per grid,
    // into the mesh's own vertices.
    const corners = mesh ? Float32Array.from(await mesh.corners.ref.data()) : null;
    if (token !== this.gridMeshToken) return;
    this.gridMesh = mesh && { rows: mesh.rows, columns: mesh.columns, corners: mesh.corners, values: corners };
    this.updateGeometry(false);
    this.build();
    this.invalidate();
  }
  /** A curvilinear vertex's data point: its corner, the vertex's position. */
  curvilinearPoint() {
    return vec3(positionLocal.x, positionLocal.y, 0);
  }
  /** A curvilinear vertex mapped through the chain, as a flat grid's or a globe's vertex is, and
   * whether it maps (the validity contract). */
  curvilinearPosition(point, unclipped) {
    if (spherical(this.options) && !chainedCoordinates(this.options)) {
      const mapped = coordinatePoint(this, point, { unwrap: true, unclipped });
      return { ...mapped, position: mapped.position.add(
        coordinateView(this.options) === "3d" ? vec3(0) : vec3(0, 0, -0.001)) };
    }
    return this.mapPosition(vec3(0), point, { tolerant: true, local: spherical(this.options) ? { unwrap: true } : null });
  }

  dataUV(point) {
    const ex = this.extentNode("x"), ey = this.extentNode("y");
    return vec2(point.x.sub(ex.x).div(ex.y.sub(ex.x)), point.y.sub(ey.x).div(ey.y.sub(ey.x)));
  }
  /** The surface point and whether the chain maps it (the validity contract, mappedValidity.js,
   * TODO 136.11): the grid's own vertices (build) and attached marks (attachPoint).
   * `unclipped`: the heatmap's own grid keeps an orthographic back vertex's
   * projection and cuts at the horizon by its facing (build()); attached
   * marks keep the clipped mapping. */
  surfacePoint(q, offset = 0, { unclipped = false } = {}) {
    if (spherical(this.options)) {
      const vertex = (q) => {
        const value = this.valueNode?.sample
          ? this.valueNode.sample(q).level(0).r
          : float(0);
        const relief =
          this.surfaceMode && !this.image
            ? value
                .sub(this.valueBoundsNode.x)
                .div(
                  this.valueBoundsNode.y.sub(this.valueBoundsNode.x).max(1e-12),
                )
                .clamp(0, 1)
                .mul(
                  this.zScaleNode,
                )
            : float(0);
        const p = vec3(
          q.x
            .mul(this.xboundsNode.y.sub(this.xboundsNode.x))
            .add(this.xboundsNode.x),
          q.y
            .mul(this.yboundsNode.y.sub(this.yboundsNode.x))
            .add(this.yboundsNode.x),
          relief.add(offset * 0.001),
        );
        // A globe in a nested or placed frame (a planet placed in a 3D scene) maps through the
        // whole chain, placement included, as its points do; a root globe keeps its own mapping.
        if (coordinateView(this.options) === "3d" && chainedCoordinates(this.options))
          return this.mapPosition(vec3(0), p, { tolerant: true, local: { unwrap: true } });
        // A root joint map (TODO 39.5): three copies one longitude period apart, each cut to the
        // map's one extent by build(), so a raster across the seam shows on both edges.
        if (this.jointSeam) {
          const shifted = vec3(p.x.add(float(instanceIndex).sub(1).mul(angularPeriod(this.options))), p.y, p.z);
          return coordinatePoint(this, shifted, { unwrap: true, unclipped: true, joint: this.jointSeam });
        }
        const mapped = coordinatePoint(this, p, { unwrap: true, unclipped });
        return { ...mapped, position: mapped.position.add(
          coordinateView(this.options) === "3d"
            ? vec3(0)
            : vec3(0, 0, -0.001),
        ) };
      };
      if (coordinateView(this.options) !== "3d") return vertex(q);
      const cells = this.geometry.parameters.widthSegments ?? 96,
        scaled = q.clamp(0, 1).mul(cells),
        cell = scaled.floor().min(cells - 1),
        f = scaled.sub(cell),
        a = vertex(cell.div(cells)),
        b = vertex(cell.add(vec2(1, 0)).div(cells)),
        c = vertex(cell.add(vec2(0, 1)).div(cells)),
        d = vertex(cell.add(vec2(1, 1)).div(cells));
      // The cell's point, valid where the corners that weigh in its triangle map (a grid vertex
      // takes its own corner alone, so a cut stays one cell wide).
      const [pa, pb, pc, pd] = [a, b, c, d].map((corner) => corner.position),
        lower = f.x.add(f.y).lessThanEqual(1),
        weighs = (corner, weight) => corner.valid.or(weight.lessThan(1e-4));
      return {
        position: lower.select(
          pa.add(pb.sub(pa).mul(f.x)).add(pc.sub(pa).mul(f.y)),
          pd.add(pc.sub(pd).mul(f.x.oneMinus())).add(pb.sub(pd).mul(f.y.oneMinus())),
        ),
        valid: lower.select(
          weighs(a, f.x.add(f.y).oneMinus()).and(weighs(b, f.x)).and(weighs(c, f.y)),
          weighs(d, f.x.add(f.y).sub(1)).and(weighs(c, f.x.oneMinus())).and(weighs(b, f.y.oneMinus())),
        ),
      };
    }
    // Every attached mark samples the same tessellated scalar surface.
    const cells = this.geometry.parameters.heightSegments ?? surfaceDetail(this.options.get("detail") ?? 64);
    const scaled = q.clamp(0, 1).mul(cells),
      cell = scaled.floor().min(cells - 1),
      f = scaled.sub(cell);
    const sample = (d) =>
      this.valueNode?.sample
        ? this.valueNode.sample(cell.add(d).div(cells)).level(0).r
        : float(0);
    const a = sample(vec2(0, 0)),
      b = sample(vec2(1, 0)),
      c = sample(vec2(0, 1)),
      d = sample(vec2(1, 1));
    const lower = a.add(b.sub(a).mul(f.x)).add(c.sub(a).mul(f.y));
    const upper = d
      .add(c.sub(d).mul(f.x.oneMinus()))
      .add(b.sub(d).mul(f.y.oneMinus()));
    const value = f.x.add(f.y).lessThanEqual(1).select(lower, upper);
    const scale = (axis, input, boundsNode, outputRangeNode) => applyScale({
      valueNode: input, valueTransform: this[axis + "Transform"] ?? "linear", boundsNode, outputRangeNode,
      constantNode: reference(axis + "TransformConstant", "float", this.options.transformed),
    });
    const normalized = scale("z", value, this.valueBoundsNode, vec2(0, 1)).clamp(0, 1);
    const ex = this.extentNode("x"), ey = this.extentNode("y");
    const x = scale("x", q.x.mul(ex.y.sub(ex.x)).add(ex.x), this.xboundsNode, this.xrangeNode);
    const y = scale("y", q.y.mul(ey.y.sub(ey.x)).add(ey.x), this.yboundsNode, this.yrangeNode);
    const position = aspect3dPositionNode(this.options, this.surface3d || coordinateView(this.options) === "3d"
      ? vec3(x, normalized.mul(this.zScaleNode).add(offset), y.negate())
      : vec3(x, y, float(offset)));
    // A scaled axis has no sentinel: a value outside its transform's domain is NaN.
    return { position, valid: isFinitePoint(position) };
  }
  /** An attached mark's point on the surface and whether it maps (the validity contract). */
  attachPoint(point, offset = 0.04) {
    return this.surfacePoint(this.dataUV(point), offset);
  }
  dataPoint(q) {
    const x = this.cellExtent.x ?? this.options.get("xbounds"),
      y = this.cellExtent.y ?? this.options.get("ybounds");
    return [x[0] + q.x * (x[1] - x[0]), y[0] + q.y * (y[1] - y[0])];
  }

  getGradNode() {
    let valueNode = this.valueNode ? this.valueNode.r : null;
    let gradNode = this.valueNode ? this.valueNode.gb : null;

    if (valueNode && gradNode && this.valueBoundsNode && this.valueTransform) {
      gradNode = derivScale({
        valueNode,
        derivativeNode: gradNode,
        valueTransform: this.valueTransformCode ?? this.valueTransform,
        boundsNode: this.valueBoundsNode,
        constantNode: this.valueConstantNode,
        midpointNode: this.valueMidpointNode,
      });
    }
    return gradNode?.mul(this.valueRangeNode.y.sub(this.valueRangeNode.x));
  }

  applyNormals(gradNode) {
    if (!gradNode) return null;

    const xlength = this.xrangeNode.y.sub(this.xrangeNode.x);
    const ylength = this.yrangeNode.y.sub(this.yrangeNode.x);
    const zlength = this.zrangeNode.y
      .sub(this.zrangeNode.x)
      .add(this.zScaleNode.mul(2));

    return cross(
      vec3(1, 0, gradNode.x.div(xlength).mul(zlength).mul(0.5)),
      vec3(0, 1, gradNode.y.div(ylength).mul(zlength).mul(0.5)),
    ).normalize();
  }

  /** A 3D globe's view-space normal. A plain sphere (no relief), at the root or placed, shades
   * smoothly with its analytic normal, the direction from its center (the world origin, or the
   * placement's); relief and other chains take the surface's own slope, per triangle. */
  globeNormal() {
    const placed = !!placedFrame(this.options), chained = chainedCoordinates(this.options);
    if (this.surfaceMode || (chained && !placed))
      return positionView.dFdx().cross(positionView.dFdy()).normalize();
    const center = placed ? this.frameMatrixNode.mul(vec4(0, 0, 0, 1)).xyz : vec3(0);
    return cameraViewMatrix.mul(vec4(positionWorld.sub(center).normalize(), 0)).xyz.normalize();
  }

  setValues(positionNode, colorNode, sizeNode, normalNode) {
    // Images use an unlit basic material, which already outputs the color: adding it again
    // as emissive drew every image at twice its linear intensity.
    if (this.lit || this.image) {
      this._colorNode = colorNode.rgb;
      this._emissiveNode = vec3(0);
    } else {
      this._colorNode = colorNode.rgb;
      this._emissiveNode = colorNode.rgb;
    }
    this._opacityNode = colorNode.a.mul(hemisphereOpacity(this));
    this._positionNode = positionNode;
    this._sizeNode = sizeNode;

    this.material.positionNode = positionNode;
    this.material.colorNode = this._colorNode;
    this.material.emissiveNode = this._emissiveNode;
    this.material.opacityNode = this._opacityNode;
    if (sizeNode != null) {
      this.material.sizeNode = sizeNode;
    }
    this.material.normalNode = normalNode;
  }

  /** An image shows its exact colors with an unlit basic material. A lit one (a textured
   * planet) takes the Plot's lights with a standard material, swapped in when `lit` changes. */
  syncImageMaterial() {
    if (!this.image || !this.ownMaterial || !!this.lit === !!this.material.isMeshStandardNodeMaterial) return;
    const previous = this.material;
    this.material = this.lit
      ? new THREE.MeshStandardNodeMaterial({})
      : new THREE.MeshBasicNodeMaterial({ toneMapped: false });
    this.material.side = previous.side;
    previous.dispose();
  }

  /**
   * A scalar grid's sharp cells (TODO 134.15): `pixelated` true, false or undefined (automatic),
   * and whether a grid table's field is drawn. The texture's `sharp` uniform switches, with no
   * shader rebuild (cellUV).
   */
  setPixelated(value, gridTable = false) {
    if (this.image) return;
    this.pixelated = value;
    this.gridTable = gridTable;
    this.fields.get("fill")?.setPixelated?.(this.cellMode());
  }

  /**
   * A plain grid's cell bounds along `axis` (TODO 134.15; markDomainPublisher.js placeCells):
   * [lo, hi] in that axis's domain, where the grid's cells sit on their indices beside other
   * marks; null spans its bounds (fills its frame). Uniforms: nothing rebuilds.
   * @param {string} axis @param {number[] | null} bounds
   */
  setCellExtent(axis, bounds) {
    const own = bounds ? [bounds[0], bounds[1]] : null, previous = this.cellExtent[axis];
    if (previous === own || (previous && own && previous[0] === own[0] && previous[1] === own[1])) return;
    this.cellExtent[axis] = own;
    if (own) this.cellExtentNodes[axis].value.set(own[0], own[1]);
    this.cellExtentFlags[axis].value = own ? 1 : 0;
    this.invalidate();
  }

  /** The data extent the grid spans along `axis`: its cell bounds when set, else its bounds. */
  extentNode(axis) {
    return this.cellExtentFlags[axis].greaterThan(0.5).select(this.cellExtentNodes[axis], this[axis + "boundsNode"]);
  }

  /**
   * The fill texture's cell mode (TODO 134.15): `pixelated` when set; otherwise automatic
   * (sharpCells in arraytexture.js), except that a grid table's field, relief (surfaceMode or a
   * 3D view) and contours, which read the field between cell centres, blend.
   */
  cellMode() {
    if (this.pixelated !== undefined) return this.pixelated;
    const blend = this.gridTable || this.surfaceMode || this.contourEnabled ||
      coordinateView(this.options) === "3d";
    return blend ? false : undefined;
  }

  /**
   * Where a fragment samples a scalar texture (TODO 134.15): with sharp cells (the texture's
   * `sharp`, sharpCells in arraytexture.js), the centre texel of the cell it is in (of the texel
   * it is in on a grid table's remapped axis), so cell edges stay sharp at any size on screen;
   * otherwise its own texture coordinate.
   */
  cellUV(texture) {
    const r = float(texture.texResolution), q = uv();
    const snap = (u, size, remapped) => {
      const n = float(size);
      const centre = remapped.greaterThan(0.5).select(u, u.mul(n).floor().clamp(0, n.sub(1)).add(0.5).div(n));
      return centre.mul(r).floor().clamp(0, r.sub(1)).add(0.5).div(r);
    };
    return texture.sharp.greaterThan(0.5).select(
      vec2(snap(q.x, texture.sourceWidth, texture.remapX), snap(q.y, texture.sourceHeight, texture.remapY)), q);
  }

  build() {
    this.syncImageMaterial();
    this.surfaceVersion = (this.surfaceVersion ?? 0) + 1;
    this.fields.get("fill")?.setPixelated?.(this.cellMode());
    const field = this.valueNode;
    if (!this.image && field?.isTextureNode && field.value?.sharp)
      this.valueNode = field.sample(this.cellUV(field.value));
    // Sample scalar textures per fragment; interpolating mesh vertices loses
    // density detail independently of the uploaded texture resolution.
    const valueNode = this.getValueNode(false);
    let colorNode =
      this.image && this.valueNode
        ? vec4(this.valueNode.rgb, this.valueNode.a.mul(unitOpacity(this.opacityNode)))
        : this.getColorNode(valueNode);
    const gradNode = this.getGradNode();
    // An image's channels are colors, not a value and its slope: a lit image takes its
    // surface's own normal, whatever the chain maps it through.
    const normalNode = !this.lit ? null
      : this.image ? positionView.dFdx().cross(positionView.dFdy()).normalize()
      : this.applyNormals(gradNode);

    if (this.gridEnabled) {
      colorNode = applyGrid({
        colorNode,
        uvNode: uv(),
        polar: this.gridPolar,
        offsetNode: this.gridOffsetNode,
        cellsNode: this.gridCellsNode,
        cellsWidthNode: this.gridCellsWidthNode,
        cellColorNode: this.gridCellColorNode,
        sectionsNode: this.gridSectionsNode,
        sectionsWidthNode: this.gridSectionsWidthNode,
        sectionColorNode: this.gridSectionColorNode,
        gridStrengthNode: this.gridStrengthNode,
      });
    }

    if (this.contourEnabled && valueNode) {
      colorNode = applyContourNode({
        colorNode,
        valueNode: valueNode,
        gradNode: gradNode,
        levelsNode: this.levelsNode,
        lineWidthNode: this.contourWidthNode,
        lineFeatherNode: this.contourFeatherNode,
        contourColorNode: this.contourColorNode,
        contourStrengthNode: this.contourStrengthNode,
      });
    }
    if (this.finalAlphaNode) {
      colorNode = vec4(colorNode.rgb, colorNode.a.mul(this.finalAlphaNode));
    }

    const xlength = this.xrangeNode.y.sub(this.xrangeNode.x);
    const ylength = this.yrangeNode.y.sub(this.yrangeNode.x);
    const zlength = this.zrangeNode.y.sub(this.zrangeNode.x);
    const centerNode = vec3(
      this.xrangeNode.x.add(this.xrangeNode.y).div(2),
      this.yrangeNode.x.add(this.yrangeNode.y).div(2),
      this.zrangeNode.x.add(this.zrangeNode.y).div(2),
    );

    // The value relief is 3D only: in 2D a raised cell would cover marks declared after the
    // heatmap whatever their order (Stage 22). Seen from above, the pixels are the same.
    const relief = valueNode && !this.image && coordinateView(this.options) === "3d";
    // The quad spans the range (-1 to 1), or its cell bounds' place in the bounds (TODO 134.15).
    const place = (axis, p) => {
      const e = this.extentNode(axis), b = this[axis + "boundsNode"];
      const placed = p.add(1).div(2).mul(e.y.sub(e.x)).add(e.x).sub(b.x).div(b.y.sub(b.x)).mul(2).sub(1);
      return this.cellExtentFlags[axis].greaterThan(0.5).select(placed, p);
    };
    let positionNode = vec3(place("x", positionLocal.x), place("y", positionLocal.y), positionLocal.z)
      .add(relief ? vec3(0, 0, valueNode) : vec3(0));
    positionNode = positionNode.mul(vec3(xlength, ylength, zlength).div(2));
    positionNode = positionNode.add(centerNode);
    // Color values are normalized on the GPU. Lower valleys while leaving the
    // maximum at its original height; zero preserves the legacy flat heatmap.
    if (relief) {
      positionNode = positionNode.add(
        vec3(0, 0, valueNode.clamp(0, 1).sub(1).mul(this.zScaleNode)),
      );
    }

    // A root orthographic map's back vertices keep their projection; the
    // mask below cuts at the horizon, as a warped grid on a globe does. A curvilinear grid's
    // vertices are its cells' corners (TODO 51).
    const meshPoint = this.gridMesh ? this.curvilinearPoint() : null;
    const horizon = spherical(this.options) ? orthographicFacing(this, meshPoint ?? vec3(
      uv().x.mul(this.xboundsNode.y.sub(this.xboundsNode.x)).add(this.xboundsNode.x),
      uv().y.mul(this.yboundsNode.y.sub(this.yboundsNode.x)).add(this.yboundsNode.x), 0)) : null;
    const warped = this.warped();
    // A root joint map collects each vertex's longitude from the center and the projection's
    // output (surfacePoint), for the seam and off-map cuts below.
    this.jointSeam = !warped && !meshPoint && coordinateView(this.options) === "2d" && jointProjectionOf(this.options) ? {} : null;
    // Whether the chain maps each vertex (the validity contract, TODO 136.11): a cell with a
    // corner it cannot map is cut, rather than stretched toward a sentinel.
    let mapped = null;
    if (meshPoint) ({ position: positionNode, valid: mapped } = this.curvilinearPosition(meshPoint, !!horizon));
    else if (this.surfaceMode || spherical(this.options))
      ({ position: positionNode, valid: mapped } = this.surfacePoint(uv(), 0, { unclipped: !!horizon }));
    if (warped !== !!this.warpGeometry) this.updateGeometry(false);
    let facing = null, seamX = null;
    this.wrapCopies = warped && sphericalAncestor(this.options) === "seam" || this.jointSeam ? 3 : 1;
    if (this.count > 0) this.count = this.wrapCopies;
    if (warped) ({ position: positionNode, valid: mapped, facing, seamX } = this.warpedPosition(uv()));
    else if (!meshPoint && !this.surfaceMode && !spherical(this.options))
      positionNode = aspect3dPositionNode(this.options, positionNode);
    facing ??= horizon;
    const front = facing ? facing.toVarying().greaterThanEqual(0) : null;
    let inside = seamX ? seamX.toVarying().abs().lessThanEqual(Math.PI) : null;
    if (this.jointSeam?.lambda) {
      // One extent around the center longitude; a cell is drawn where all its corners are on the
      // map and (albers-usa) in the same inset: each inset's indicator interpolates to 1 there.
      const onMap = this.jointSeam.xy.z.greaterThan(0.5), inset = this.jointSeam.xy.w;
      const insets = vec3(...[0, 1, 2].map((i) => onMap.and(inset.equal(i)).select(float(1), float(0)))).toVarying();
      inside = this.jointSeam.lambda.toVarying().abs().lessThanEqual(Math.PI)
        .and(max(insets.x, max(insets.y, insets.z)).greaterThan(0.999));
    }
    // A value outside its transform's domain is missing (TODO 39.1): that texel is cut.
    const valid = this.valueNode && !this.image && this.valueBoundsNode && this.valueTransform
      ? scaleValid({ valueNode: this.valueNode.r, valueTransform: this.valueTransformCode ?? this.valueTransform }) : null;
    // A grid table's missing or hidden cells (TODO 51): the texture's alpha is the share of valid
    // cells around a texel, cut at one half (the cells' edges).
    const covered = this.valueNode && !this.image ? this.valueNode.a.greaterThanEqual(0.5) : null;
    const whole = mapped ? mapped.select(float(1), float(0)).toVarying().greaterThan(0.999) : null;
    this.material.maskNode = [front, inside, valid, covered, whole].filter(Boolean).reduce((all, mask) => (all ? all.and(mask) : mask), null);
    this.valueNode = field;
    if (this.childTextureNode) {
      const child = this.childTextureNode.sample(
        vec2(uv().x, uv().y.oneMinus()),
      );
      colorNode = vec4(
        colorNode.rgb.mul(child.a.oneMinus()).add(child.rgb),
        colorNode.a.add(child.a.mul(colorNode.a.oneMinus())),
      );
    }
    this.setValues(
      positionNode,
      colorNode,
      null,
      spherical(this.options) && coordinateView(this.options) === "3d"
        ? this.globeNormal()
        : this.surfaceMode
          ? null
          : normalNode,
    );
    this.surfaceListeners?.forEach((fn) => fn());
    this.applyBlend(this.transparent);
    this.material.depthTest = this.depthtest;
    this.material.needsUpdate = true;
  }
}
