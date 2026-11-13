// @ts-check
import { cameraMatrixKey } from "./camera.js";
import { PROJECTION_CODES } from "./mapProjections.js";
import { placedFrame, resolvePlacement } from "./framePlacement.js";
import { frameMappingSnapshot } from "./frameMapping.js";
import { refinesPieces, interpolationOf } from "./curves.js";
import { StorageBufferAttribute, Matrix4 } from "three/webgpu";
import {
  storage,
  instanceIndex,
  uniform,
  uint,
  float,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { Reservoir, instanceLimit } from "./sampling.js";
import { sphericalPathSamplingShader as pathSamplingShader } from "./pathSampling.js";
import {
  curvedPathShader,
  PATH_PARAMS_BYTES,
  PATH_PARAMS_LAYOUT,
} from "./curvedPathShader.js";
import {
  resolveCoordinateOperations,
  repeatingRootMap,
  pathOperationFlags,
} from "./coordinateOperations.js";
import { packOperationTable, MAP_FLAGS } from "./operationTable.js";
import { spherical, angularFactor, longitudeOrigin } from "./coordinates.js";
import { releaseAttribute } from "../../threeExtensions/array/attributeRelease.js";
import { pathBudget, MAX_PATHS } from "./sphericalBudget.js";
import { reportDataError } from "./dataErrors.js";
import { LIMITS, limitError } from "./limits.js";
import { coordinateView } from "./viewContext.js";
/** The component a curved mark is, named in its errors. @param {object} mark @returns {string} */
const markName = (mark) => {
  const named =
    /** @type {{ componentName?: string, constructor: { componentName?: string } }} */ (
      mark
    );
  return named.componentName ?? named.constructor.componentName ?? "Line";
};
/**
 * @typedef {import("./curvedPathTypes.js").CurveMark} CurveMark
 * @typedef {import("./curvedPathTypes.js").CurveField} CurveField
 * @typedef {import("./curvedPathTypes.js").CurveBufferField} CurveBufferField
 * @typedef {import("./curvedPathTypes.js").CurveRequest} CurveRequest
 * @typedef {import("./curvedPathTypes.js").CurvePass} CurvePass
 * @typedef {import("./curvedPathTypes.js").CurveBackend} CurveBackend
 * @typedef {import("./curvedPathTypes.js").CurveSceneObject} CurveSceneObject
 * @typedef {import("./curvedPathTypes.js").RefinesCurveObject} RefinesCurveObject
 * @typedef {import("./curvedPathTypes.js").FieldStorageNode} FieldStorageNode
 * @typedef {import("./curvedPathTypes.js").FieldStorageFactory} FieldStorageFactory
 * @typedef {import("./curvedPathTypes.js").FieldComponents} FieldComponents
 * @typedef {import("./curvedPathTypes.js").UintUniformFactory} UintUniformFactory
 * @typedef {import("./curvedPathTypes.js").LogicalRowNode} LogicalRowNode
 * @typedef {import("three/webgpu").Camera} Camera
 * @typedef {import("three/webgpu").Object3D} Object3D
 * @typedef {import("three/webgpu").WebGPURenderer & {backend: CurveBackend}} CurveRenderer
 * @typedef {import("./coordinateOperations.js").CoordinateOptions} CoordinateOptions
 * @typedef {import("./coordinateOperations.js").ResolvedCoordinateOperation} ResolvedCoordinateOperation
 */

/** Ancestor coordinate parameters (a parent's center, radius or fit) change
 * the refined pieces as much as the mark's own options do. */
/** @param {CoordinateOptions} options */
function operationKey(options) {
  try {
    return JSON.stringify(
      resolveCoordinateOperations(options, { includePlacement: false }),
    );
  } catch (error) {
    return "error: " + /** @type {Error} */ (error).message;
  }
}
/** One mark's refinement owner. Requests may advance while an older topology remains
 * drawable; only a completed count/fill pair publishes new piece metadata. */
export class CurvedPaths {
  /** @param {CurveMark} mark */
  constructor(mark) {
    this.mark = mark;
    /** @type {Map<string, CurvedPaths>} */
    this.views = new Map();
    this.rows = new Reservoir();
    this.indices = new StorageBufferAttribute(new Uint32Array(1), 1);
    // Named bindings: an unnamed one is NodeBuffer_<node id>, a new shader per mark (17.6).
    this.indicesNode = storage(this.indices, "uint", 1).setName(
      "hmCurveIndices",
    );
    this.selectionCount = /** @type {UintUniformFactory} */ (uniform)(
      0,
      "uint",
    );
    this.buffer = new StorageBufferAttribute(1, 4);
    this.node = storage(this.buffer, "vec4", 1).setName("hmCurveMeta");
    /** @type {WeakMap<import("./curvedPathTypes.js").CurveStorage, FieldStorageNode>} */
    this.fieldNodes = new WeakMap();
    this.drawCount = 0;
    this.capacity = 1;
    this.key = "";
    this.pending = false;
    this.version = 0;
    this.sourceCount = /** @type {UintUniformFactory} */ (uniform)(1, "uint");
    this.meta = this.node.element(instanceIndex.mod(this.sourceCount));
  }
  /** @param {string} [name] @param {LogicalRowNode} [logical] */
  sourceIndex(name = "start", logical = uint(this.meta.x)) {
    const offset =
      name === "end" || name === "control2"
        ? 2
        : name === "previous"
          ? 3
          : name === "next"
            ? 4
            : 0;
    return this.selectionCount
      .greaterThan(0)
      .select(
        this.indicesNode.element(this.selectionCount.mul(offset).add(logical)),
        logical,
      );
  }
  /** @param {CurveBufferField} field
   * @param {LogicalRowNode} [logical] */
  field(field, logical) {
    const buffer = field.bufferNodeSource,
      channels = field.channels;
    // One named binding per source buffer (a field read twice shares it; see the constructor).
    let source = this.fieldNodes.get(buffer);
    if (!source) {
      source = /** @type {FieldStorageFactory} */ (storage)(
        buffer,
        buffer.itemSize === 4
          ? "vec4"
          : buffer.itemSize === 3
            ? "vec3"
            : buffer.itemSize === 2
              ? "vec2"
              : "float",
        buffer.count,
        // Named by the field's registration key, unique within a mark (several fields share the
        // channel name "position").
      ).setName(
        `hmCurve_${String(field._samplingName ?? field.name).replace(/\W/g, "_")}`,
      );
      this.fieldNodes.set(buffer, source);
    }
    return /** @type {FieldComponents} */ (
      source.element(
        this.sourceIndex(field._samplingName ?? field.name, logical),
      )
    )[
      channels === 3
        ? "xyz"
        : channels === 2
          ? "xy"
          : channels === 1
            ? "x"
            : "xyzw"
    ];
  }
  get index() {
    const i = float(this.sourceIndex());
    return this.mark.options.get("curve") === "basis" ? i.div(3).floor() : i;
  }
  /** @param {number} cap */
  topologyKey(cap) {
    const m = this.mark,
      [lower, upper] = m.curvedFields ?? ["start", "end"];
    // Piece metadata names logical rows and parameter intervals, not source buffer versions.
    // Moving an existing row can reuse those intervals; changing row counts/layout cannot.
    return JSON.stringify([
      cap,
      m.options.get("curve"),
      m.curvedFields,
      !!m.band,
      !!m.curvedPatch,
      [
        lower,
        upper,
        ...(m.band
          ? ["previous", "next"]
          : m.curvedPatch
            ? []
            : ["control1", "control2"]),
      ].map((k) => {
        const f = m.fields.get(k);
        return [k, f?.count, f?.bufferNodeSource?.itemSize];
      }),
    ]);
  }
  /** Coalesce camera/geometry requests and queue one refinement after field uploads.
   * Returns whether the current published topology can already be drawn.
   * @param {Camera} camera @param {number} width
   * @param {number} height @param {number | null} [limit] */
  prepare(camera, width, height, limit = null) {
    const m = this.mark;
    if (!refinesPieces(m)) return true;
    const [lowerName, upperName] = m.curvedFields ?? ["start", "end"];
    const lower = m.fields.get(lowerName),
      upper = m.fields.get(upperName);
    // Ends that failed to upload never become buffers: the mark is settled, its error on the
    // plot (TODO 136.2: a curved mark waited for them forever).
    if (!lower?.isBufferNode || !upper?.isBufferNode)
      return !m.count || Boolean(lower?.failed || upper?.failed);
    const cap = Math.min(
      instanceLimit(limit),
      instanceLimit(m.options.get("maxInstances")),
    );
    const geometryKey = JSON.stringify([
      cap,
      [
        ...new Set([
          lowerName,
          upperName,
          ...(m.band
            ? ["previous", "next"]
            : m.curvedPatch
              ? [m.curvedFields?.[2]]
              : ["control1", "control2"]),
        ]),
      ]
        .filter(Boolean)
        .map((k) => {
          const f = m.fields.get(k);
          return [k, f?.version, f?.animationVersion];
        }),
    ]);
    const dataKey = JSON.stringify([
      cap,
      frameMappingSnapshot(m.options),
      placedFrame(m.options)?.matrix.elements,
      operationKey(m.options),
      // Refinement depends on geometry, not width, color or opacity updates.
      geometryKey,
      ...[
        "curve",
        "curveAlpha",
        "xbounds",
        "ybounds",
        "zbounds",
        "xrange",
        "yrange",
        "zrange",
        "xTransform",
        "yTransform",
        "zTransform",
        "angleUnit",
        "anglePeriod",
        "polarAxis",
        "baseRadius",
        "radialScale",
        "projection",
        "projectionCenter",
        "_projectionCenterLongitude",
        "_projectionCenterLatitude",
        "sphericalView",
        "interpolation",
        "subdivisionTolerance",
        "rotation",
      ].map((k) => m.options.get(k)),
      coordinateView(m.options),
      m.turnActive,
    ]);
    const key = JSON.stringify([
      dataKey,
      cameraMatrixKey(camera),
      width,
      height,
    ]);
    const topology = this.topologyKey(cap);
    /** @type {CurveRequest} */
    this.request = {
      camera: camera.clone(),
      width,
      height,
      cap,
      key,
      topology,
    };
    // Render current coordinates through the last complete refinement while positions or
    // the view move. Requiring an exact data version prevents every draw of a live Force.
    const usable = this.publishedTopology === topology;
    if (key === this.key) return true;
    if (key === this.failedKey) return false;
    if (this.pending) return usable;
    this.pending = true;
    const epoch = ++this.version;
    const work = async () => {
      try {
        await m.manager.chain;
        if (m.isDisposed || this.disposed || epoch !== this.version) return;
        // A queued mark starts at the latest requested view, rather than an obsolete camera.
        const request = /** @type {CurveRequest} */ (this.request);
        const result = await this.build(
          request.camera,
          request.width,
          request.height,
          epoch,
          request.cap,
          request.topology,
        );
        if (result !== false && !m.isDisposed && epoch === this.version) {
          this.key = request.key;
          this.publishedTopology = request.topology;
        }
      } catch (e) {
        if (!m.isDisposed) {
          this.error = /** @type {Error} */ (e).message;
          // Keyed by this refinement, so its recovery clears only its own error.
          reportDataError(m.view, this, /** @type {Error} */ (e).message);
          /** @type {string | undefined} */
          this.failedKey = key;
          console.error("Spherical paths:", e);
        }
      } finally {
        this.pending = false;
        if (!m.isDisposed) m.invalidate();
      }
    };
    const { lifecycle } = m.view;
    lifecycle.geometryQueue = (
      lifecycle.geometryQueue ?? Promise.resolve()
    ).then(work);
    return usable;
  }
  /** Freeze source geometry, count pieces, allocate, then fill metadata.
   * A superseded epoch/topology returns false before publication.
   * @param {Camera} camera @param {number} width
   * @param {number} height @param {number} epoch @param {number} cap @param {string} topology
   * @returns {Promise<false | void>} */
  async build(camera, width, height, epoch, cap, topology) {
    // 1. Resolve source rows and the device/subdivision budget.
    const m = this.mark,
      r = /** @type {CurveRenderer} */ (m.renderer),
      d = r.backend.device,
      [lowerName, upperName, turnName] = m.curvedFields ?? ["start", "end"],
      start = /** @type {CurveBufferField} */ (m.fields.get(lowerName))
        .bufferNodeSource,
      end = /** @type {CurveBufferField} */ (m.fields.get(upperName))
        .bufferNodeSource,
      total = Math.min(
        /** @type {CurveBufferField} */ (m.fields.get(lowerName)).count,
        /** @type {CurveBufferField} */ (m.fields.get(upperName)).count,
      ),
      // A sampled path (fewer rows than its source) selects on one GPU thread: at most a batch.
      n = cap < total ? Math.min(cap, MAX_PATHS) : total;
    if (!n) {
      this.drawCount = 0;
      return;
    }
    const budget = pathBudget(
      n,
      width,
      height,
      m.options.get("subdivisionTolerance"),
    );
    // Each batch's work is bounded by its budget; the pieces of all batches by storage and the
    // registry (a piece's slot is an f32 in the shader, exact to 2^24; metadata is CPU-backed).
    const limit = Math.min(
      LIMITS.curvedPieces.value,
      Math.floor(d.limits.maxStorageBufferBindingSize / 16),
    );
    if (
      n * 32 > d.limits.maxStorageBufferBindingSize ||
      Math.ceil(n / 256) > d.limits.maxComputeWorkgroupsPerDimension
    )
      throw limitError("storage", {
        component: markName(m),
        what: "its curved path index",
        count: n * 32,
        limit: Math.min(
          d.limits.maxStorageBufferBindingSize,
          d.limits.maxComputeWorkgroupsPerDimension * 256 * 32,
        ),
      });
    // 2. Create reusable count/scan/fill resources, then grow row scratch as needed.
    if (!this.pipelines) {
      const module = d.createShaderModule({ code: curvedPathShader });
      /** @type {Partial<Record<CurvePass, GPUComputePipeline>>} */
      this.pipelines = {};
      const layout = d.createBindGroupLayout({
        entries: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((binding) => ({
          binding,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type:
              binding === 5
                ? "uniform"
                : binding < 2 || binding >= 6
                  ? "read-only-storage"
                  : "storage",
          },
        })),
      });
      this.layout = layout;
      const pipelineLayout = d.createPipelineLayout({
        bindGroupLayouts: [layout],
      });
      for (const entryPoint of /** @type {const} */ ([
        "countPaths",
        "scanBlocks",
        "scanTops",
        "scanRows",
        "fillPaths",
      ]))
        this.pipelines[entryPoint] = d.createComputePipeline({
          layout: pipelineLayout,
          compute: { module, entryPoint },
        });
      this.params = d.createBuffer({
        size: PATH_PARAMS_BYTES,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }
    if (!this.counts || this.counts.size < n * 32) {
      this.counts?.destroy();
      this.counts = d.createBuffer({
        size: 2 ** Math.ceil(Math.log2(n * 32)),
        usage: GPUBufferUsage.STORAGE,
      });
    }
    // The result, then one scan total per block of 256 paths.
    const results = 16 + Math.ceil(n / 256) * 16;
    if (!this.result || this.result.size < results) {
      this.result?.destroy();
      this.result = d.createBuffer({
        size: 2 ** Math.ceil(Math.log2(results)),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      });
    }
    this.select(total, n);
    if (!r.backend.has(this.buffer))
      r.backend.createStorageAttribute(this.buffer);
    // 3. Pack this request's camera, coordinates and flags into the shared shader layout.
    const bytes = new ArrayBuffer(PATH_PARAMS_BYTES),
      f = new Float32Array(bytes),
      u = new Uint32Array(bytes),
      o = m.options,
      L = PATH_PARAMS_LAYOUT;
    new Matrix4()
      .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      .toArray(f, L.matrix / 4);
    // Placement is camera-dependent (pixel-sized 2D insets): resolve it for this pass.
    const ratio = r.getPixelRatio(),
      operations = resolveCoordinateOperations(o, {
        matrixFor: (definition) =>
          resolvePlacement(definition, camera, width / ratio, height / ratio),
      }),
      mode = spherical(o)
        ? coordinateView(o) === "3d"
          ? o.get("sphericalView") === "projected"
            ? 4
            : 3
          : 2
        : o.get("coordinates") === "polar"
          ? 5
          : 0,
      rootMap = repeatingRootMap(operations);
    // A Rect patch refines like a band between its corners (curvedPathShader.js).
    const patch = !!m.curvedPatch,
      rotation = patch
        ? /** @type {() => number | null} */ (m.patchRotation)()
        : 0,
      turn =
        patch && rotation === null && !!m.fields.get(turnName)?.isBufferNode;
    f.set(
      [width, height, o.get("subdivisionTolerance"), m.band || patch ? 1 : 0],
      L.viewport / 4,
    );
    f.set(
      [angularFactor(o), o.get("baseRadius"), o.get("radialScale"), mode],
      L.config / 4,
    );
    f.set(
      [
        (o.get("curve") ?? "linear") === "linear"
          ? ["great-circle", "angular", "cartesian"].indexOf(interpolationOf(m))
          : o.get("curve").startsWith("step")
            ? 4 + ["step", "step-before", "step-after"].indexOf(o.get("curve"))
            : 3,
        coordinateView(o) === "chart"
          ? 0
          : (PROJECTION_CODES[
              /** @type {keyof typeof PROJECTION_CODES} */ (o.get("projection"))
            ] ?? 0),
        rotation ?? 0,
        longitudeOrigin(o),
      ],
      L.settings / 4,
    );
    // A piece's distance is on screen, in viewport heights (a dash's), or in world units for a
    // mark that sizes along the path in world units (an arrowhead's cap; TODO 136.1).
    u.set(
      [rootMap ? 1 : 0, patch ? 1 : 0, turn ? 1 : 0, m.worldDistances ? 1 : 0],
      L.flags / 4,
    );
    // A fill (a band or a patch) keeps its first orthographic map unclipped: its
    // pieces run on behind the horizon, and its material discards the back by
    // the interpolated facing, exactly at the limb (objects/prism.js, uncertainty.js).
    const baseFlags = pathOperationFlags(operations),
      firstOrthographic =
        m.band || patch
          ? operations.findIndex(
              (operation) =>
                operation.kind === "spherical-map2d" &&
                operation.projection === "orthographic",
            )
          : -1;
    packOperationTable(
      operations,
      u,
      f,
      {
        count: L.operationCount / 4,
        kinds: L.operationKinds / 4,
        data: L.operationData / 4,
      },
      /** @param {ResolvedCoordinateOperation} operation
       * @param {number} index */
      (operation, index) =>
        (baseFlags(operation, index) ?? 0) |
        (index === firstOrthographic ? MAP_FLAGS.unclipped : 0),
    );
    u.set([n, start.itemSize, budget, n < total ? n : 0], L.source / 4);
    d.queue.writeBuffer(/** @type {GPUBuffer} */ (this.params), 0, bytes);
    const [second, third] = m.band
      ? ["previous", "next"]
      : patch
        ? [turnName, null]
        : ["control1", "control2"];
    const sourceBuffers = [
      start,
      end,
      m.fields.get(second)?.isBufferNode
        ? /** @type {CurveBufferField} */ (m.fields.get(second))
            .bufferNodeSource
        : start,
      third && m.fields.get(third)?.isBufferNode
        ? /** @type {CurveBufferField} */ (m.fields.get(third)).bufferNodeSource
        : end,
    ];
    // Count and fill are separated by a 16-byte allocation readback. Freeze their geometry
    // on the GPU so an intervening animation/Force upload cannot change seam counts and
    // overrun the metadata allocation. The draw still evaluates current field coordinates.
    this.snapshots ??= [];
    const snapshot = d.createCommandEncoder();
    const buffers = sourceBuffers.map((attribute, i) => {
      const source = r.backend.get(attribute).buffer;
      const size = Math.max(
        4,
        Math.min(source.size, total * attribute.itemSize * 4),
      );
      if (
        !(/** @type {GPUBuffer[]} */ (this.snapshots)[i]) ||
        /** @type {GPUBuffer[]} */ (this.snapshots)[i].size < size
      ) {
        /** @type {GPUBuffer[]} */ (this.snapshots)[i]?.destroy();
        /** @type {GPUBuffer[]} */ (this.snapshots)[i] = d.createBuffer({
          size: 2 ** Math.ceil(Math.log2(size)),
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
      }
      snapshot.copyBufferToBuffer(
        source,
        0,
        /** @type {GPUBuffer[]} */ (this.snapshots)[i],
        0,
        size,
      );
      return /** @type {GPUBuffer[]} */ (this.snapshots)[i];
    });
    d.queue.submit([snapshot.finish()]);
    const group = () =>
      d.createBindGroup({
        layout: /** @type {GPUBindGroupLayout} */ (this.layout),
        entries: [
          buffers[0],
          buffers[1],
          /** @type {GPUBuffer} */ (this.counts),
          r.backend.get(this.buffer).buffer,
          /** @type {GPUBuffer} */ (this.result),
          /** @type {GPUBuffer} */ (this.params),
          r.backend.get(this.indices).buffer,
          buffers[2],
          buffers[3],
        ].map((buffer, binding) => ({ binding, resource: { buffer } })),
      });
    /** @param {GPUCommandEncoder} enc @param {CurvePass} name */
    const dispatch = (enc, name) => {
      const pass = enc.beginComputePass();
      pass.setPipeline(
        /** @type {GPUComputePipeline} */ (
          /** @type {Partial<Record<CurvePass, GPUComputePipeline>>} */ (
            this.pipelines
          )[name]
        ),
      );
      pass.setBindGroup(0, group());
      pass.dispatchWorkgroups(
        name === "scanTops"
          ? 1
          : name === "scanBlocks" || name === "scanRows"
            ? Math.ceil(n / 256)
            : Math.ceil(Math.min(MAX_PATHS, n - first) / 64),
      );
      pass.end();
    };
    // Count and fill go in batches of MAX_PATHS paths, a submission each, so the work of
    // one is bounded however many paths there are (TODO 136.11). The batch is in the params.
    let first = 0;
    /** @param {CurvePass} name */
    const batches = (name) => {
      for (first = 0; first < n; first += MAX_PATHS) {
        u.set(
          [first, Math.min(n, first + MAX_PATHS)],
          L.operationCount / 4 + 1,
        );
        d.queue.writeBuffer(
          /** @type {GPUBuffer} */ (this.params),
          L.operationCount + 4,
          u,
          L.operationCount / 4 + 1,
          2,
        );
        const batch = d.createCommandEncoder();
        dispatch(batch, name);
        d.queue.submit([batch.finish()]);
      }
    };
    // 4. Count against frozen sources; the small readback determines metadata capacity.
    batches("countPaths");
    const enc = d.createCommandEncoder();
    dispatch(enc, "scanBlocks");
    dispatch(enc, "scanTops");
    dispatch(enc, "scanRows");
    const read = d.createBuffer({
      size: 16,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    enc.copyBufferToBuffer(
      /** @type {GPUBuffer} */ (this.result),
      0,
      read,
      0,
      16,
    );
    d.queue.submit([enc.finish()]);
    let count, overflow, rows;
    try {
      await read.mapAsync(GPUMapMode.READ);
      [count, overflow, rows] = new Uint32Array(read.getMappedRange()).slice();
    } finally {
      if (read.mapState === "mapped") read.unmap();
      read.destroy();
    }
    // 5. Accept only a current topology, grow metadata, then fill and publish draw state.
    if (
      m.isDisposed ||
      epoch !== this.version ||
      this.topologyKey(cap) !== topology
    )
      return false;
    // A total past u32 saturates; it is past any limit, with no count to report.
    const counted = !overflow && count !== 0xffffffff;
    if (counted && count > LIMITS.curvedPieces.value)
      throw limitError("curvedPieces", { component: markName(m), count });
    // A saturated count is not a count of detail: an endpoint the refinement cannot place (a
    // missing or infinite coordinate) makes its subdivisions unbounded. Zooming out cannot fix it.
    if (!counted)
      throw limitError("curvedDetail", {
        component: markName(m),
        what: `the detail of curved segments (${budget} subdivisions each)`,
        limit,
        property: "subdivisionTolerance",
        hint: "The total of its pieces overflowed; draw fewer paths, or raise subdivisionTolerance.",
      });
    if (count > limit)
      throw limitError("curvedDetail", {
        component: markName(m),
        what: `the detail of curved segments (${budget} subdivisions each)`,
        count: counted ? count : undefined,
        limit,
        property: "subdivisionTolerance",
      });
    if (count > this.capacity) {
      const old = this.buffer;
      this.capacity = Math.min(limit, 2 ** Math.ceil(Math.log2(count)));
      this.buffer = new StorageBufferAttribute(this.capacity, 4);
      this.node.value = this.buffer;
      this.node.bufferCount = this.capacity;
      r.backend.createStorageAttribute(this.buffer);
      // Three's storage binding follows node.value and rebuilds its bind group when the
      // attribute changes. The runtime-sized WGSL array needs no shader rebuild.
      releaseAttribute(r, old);
    }
    batches("fillPaths");
    this.drawCount = count;
    // Bands refine across as well: every piece shares one row count, so
    // neighboring pieces split their shared edges alike and never crack.
    this.crossRows = rows || 1;
    if (m.band || patch) m.setCrossRows?.();
    this.sourceCount.value = Math.max(1, count);
    this.error = null;
    reportDataError(m.view, this, "");
  }
  /** @param {number} total @param {number} count */
  select(total, count) {
    const m = this.mark,
      r = /** @type {CurveRenderer} */ (m.renderer),
      d = r.backend.device;
    this.selectionCount.value = count < total ? count : 0;
    if (count < total) {
      const size = Math.max(1, count * 5);
      if (size * 4 > d.limits.maxStorageBufferBindingSize)
        throw limitError("storage", {
          component: markName(m),
          what: "its curved path selection",
          count: size * 4,
          limit: d.limits.maxStorageBufferBindingSize,
        });
      if (this.indices.count < size) {
        const old = this.indices;
        this.indices = new StorageBufferAttribute(
          new Uint32Array(2 ** Math.ceil(Math.log2(size))),
          1,
        );
        this.indicesNode.value = this.indices;
        this.indicesNode.bufferCount = this.indices.count;
        r.backend.createStorageAttribute(this.indices);
        releaseAttribute(r, old);
      }
      if (!r.backend.has(this.indices))
        r.backend.createStorageAttribute(this.indices);
      if (m.isConnectedPath) {
        if (!this.samplePipeline) {
          this.samplePipeline = d.createComputePipeline({
            layout: "auto",
            compute: {
              module: d.createShaderModule({ code: pathSamplingShader }),
              entryPoint: "main",
            },
          });
          this.sampleParams = d.createBuffer({
            size: 64,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          });
        }
        if (!this.sampleScratch || this.sampleScratch.size < (count + 1) * 8) {
          this.sampleScratch?.destroy();
          this.sampleScratch = d.createBuffer({
            size: 2 ** Math.ceil(Math.log2((count + 1) * 8)),
            usage: GPUBufferUsage.STORAGE,
          });
        }
        const [lowerName, upperName] = m.curvedFields ?? ["start", "end"],
          start = /** @type {CurveBufferField} */ (m.fields.get(lowerName))
            .bufferNodeSource,
          end = /** @type {CurveBufferField} */ (m.fields.get(upperName))
            .bufferNodeSource;
        const sampleBytes = new ArrayBuffer(64),
          sampleU32 = new Uint32Array(sampleBytes),
          sampleF32 = new Float32Array(sampleBytes);
        sampleU32.set([
          count,
          count,
          1,
          total,
          start.itemSize,
          4,
          0,
          1,
          2,
          3,
          0,
          0,
        ]);
        sampleF32[12] = spherical(m.options) ? angularFactor(m.options) : 0;
        sampleF32[13] = longitudeOrigin(m.options);
        d.queue.writeBuffer(
          /** @type {GPUBuffer} */ (this.sampleParams),
          0,
          sampleBytes,
        );
        const buffers = [
            r.backend.get(start).buffer,
            r.backend.get(end).buffer,
            r.backend.get(this.indices).buffer,
            /** @type {GPUBuffer} */ (this.sampleScratch),
            /** @type {GPUBuffer} */ (this.sampleParams),
          ],
          group = d.createBindGroup({
            layout: this.samplePipeline.getBindGroupLayout(0),
            entries: buffers.map((buffer, binding) => ({
              binding,
              resource: { buffer },
            })),
          }),
          encoder = d.createCommandEncoder(),
          pass = encoder.beginComputePass();
        pass.setPipeline(this.samplePipeline);
        pass.setBindGroup(0, group);
        pass.dispatchWorkgroups(1);
        pass.end();
        d.queue.submit([encoder.finish()]);
      } else {
        const rows = this.rows.sample(total, count),
          indices = new Uint32Array(count * 5);
        for (let f = 0; f < 5; f++) indices.set(rows, f * count);
        d.queue.writeBuffer(r.backend.get(this.indices).buffer, 0, indices);
      }
    } else if (!r.backend.has(this.indices))
      r.backend.createStorageAttribute(this.indices);
  }
  /** Temporarily borrow a published refinement; the returned callback restores all bindings.
   * @param {CurvedPaths} [source] */
  draw(source = this) {
    const m = this.mark,
      old = m.count,
      instanced = m.isInstancedMesh,
      geometryInstanced = m.geometry.isInstancedBufferGeometry,
      buffer = this.node.value,
      indices = this.indicesNode.value,
      count = this.sourceCount.value,
      selection = this.selectionCount.value;
    this.node.value = source.buffer;
    this.indicesNode.value = source.indices;
    this.sourceCount.value = Math.max(1, source.drawCount);
    this.selectionCount.value = source.selectionCount.value;
    m.count = source.drawCount;
    m.isInstancedMesh = false;
    m.geometry.isInstancedBufferGeometry = true;
    m.geometry.instanceCount = source.drawCount;
    return () => {
      m.count = old;
      m.isInstancedMesh = instanced;
      m.geometry.isInstancedBufferGeometry = geometryInstanced;
      this.node.value = buffer;
      this.indicesNode.value = indices;
      this.sourceCount.value = count;
      this.selectionCount.value = selection;
    };
  }

  dispose() {
    this.disposed = true;
    this.version++;
    reportDataError(this.mark.view, this, "");
    for (const v of this.views.values()) v.dispose();
    this.views.clear();
    releaseAttribute(this.mark.renderer, this.indices);
    this.sampleParams?.destroy();
    this.sampleScratch?.destroy();
    releaseAttribute(this.mark.renderer, this.buffer);
    this.params?.destroy();
    this.result?.destroy();
    this.counts?.destroy();
    this.snapshots?.forEach((buffer) => buffer.destroy());
  }
}
/** A field reads rows by refined piece, and a shader draws pieces, only while
 * its mark is curved. That can change without an option edit of the mark
 * itself: an ancestor becoming polar or spherical (root promotion, a parent's
 * coordinate mode) bends a Cartesian child. Rebind and rebuild before the
 * pieces are prepared. */
/** @param {CurveMark} mark */
function syncCurvedFields(mark) {
  const now = refinesPieces(mark);
  // The shader chose pieces or whole intervals when it was last built.
  let changed = mark.curvedBuilt !== undefined && mark.curvedBuilt !== now;
  for (const field of mark.fields?.values() ?? [])
    if (
      field.isBufferNode &&
      field.curvedBinding !== undefined &&
      field.curvedBinding !== now
    ) {
      field.rebind();
      changed = true;
    }
  if (changed) {
    mark.build();
    mark.invalidate();
  }
}
/** @param {Object3D} scene @param {Camera} camera
 * @param {number} width @param {number} height @param {number | null} [limit] @param {string} [slot] */
export function prepareCurves(
  scene,
  camera,
  width,
  height,
  limit = null,
  slot = "main",
) {
  let ready = true;
  scene.traverse(
    /** @param {CurveSceneObject} o */ (o) => {
      if (o.visible && o.curvedPaths && !o.isDisposed) {
        if (slot === "main")
          syncCurvedFields(/** @type {CurveMark & Object3D} */ (o));
        let c = o.curvedPaths;
        if (slot !== "main") {
          if (!c.views.has(slot))
            c.views.set(
              slot,
              new CurvedPaths(/** @type {CurveMark & Object3D} */ (o)),
            );
          c = /** @type {CurvedPaths} */ (c.views.get(slot));
        }
        // A mark whose refinement failed is settled: the frame draws without it and its
        // error is on the plot (TODO 136.2: the frame waited for it forever).
        if (!c.prepare(camera, width, height, limit) && !c.error) ready = false;
      }
      // A dashed Line's screen-space dash distances for this render's camera (TODO 73.2).
      if (o.visible && o.dashDistances && !o.isDisposed)
        o.dashDistances.prepare(camera, width, height);
    },
  );
  return ready;
}
/** @template T @param {Object3D} scene @param {() => T} render
 * @param {string} [slot] @returns {T} */
export function curveRender(scene, render, slot = "main") {
  /** @type {(() => void)[]} */
  const restores = [];
  try {
    scene.traverse(
      /** @param {CurveSceneObject} o */ (o) => {
        // A failed refinement has no pieces to draw: the mark sits this render out.
        if (o.visible && o.curvedPaths?.error) {
          o.visible = false;
          restores.push(() => (o.visible = true));
          return;
        }
        if (o.visible && /** @type {RefinesCurveObject} */ (refinesPieces)(o))
          restores.push(
            o.curvedPaths.draw(
              slot === "main"
                ? o.curvedPaths
                : (o.curvedPaths.views.get(slot) ?? o.curvedPaths),
            ),
          );
      },
    );
    return render();
  } finally {
    restores.reverse().forEach((f) => f());
  }
}
/** @param {Object3D} scene @param {string} slot */
export function releaseCurves(scene, slot) {
  scene.traverse(
    /** @param {CurveSceneObject} o */ (o) => {
      const c = o.curvedPaths?.views.get(slot);
      if (c) {
        c.dispose();
        /** @type {CurvedPaths} */ (o.curvedPaths).views.delete(slot);
      }
    },
  );
}

/** @param {Object3D} scene */
export function curveErrors(scene) {
  /** @type {string[]} */
  const errors = [];
  scene.traverse(
    /** @param {CurveSceneObject} o */ (o) => {
      if (o.curvedPaths?.error) errors.push(o.curvedPaths.error);
    },
  );
  return errors;
}

/** @param {Object3D} scene */
export function curvePending(scene) {
  let pending = false;
  scene.traverse(
    /** @param {CurveSceneObject} o */ (o) =>
      (pending ||= !!o.curvedPaths?.pending),
  );
  return pending;
}
