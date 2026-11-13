// @ts-check
import { refinesPieces } from "./curves.js";
import { animationClock, uniformTransition } from "./animation.js";
import { markAnimation } from "./markAnimation.js";
import { spherical } from "./coordinates.js";
import { registerManager } from "../rendering/uploadSettlement.js";
import {
  ArrayInstancedBufferAttribute,
  ArrayTexture,
  normalizeTextureResolution,
} from "../../threeExtensions/array/arraytexture.js";
import { Array as JaxArray, numpy as np } from "@hmplot/jax";
import {
  bufferAttribute,
  uniform as threeUniform,
  texture,
  storage as threeStorage,
  instanceIndex,
} from "three/tsl";
import * as THREE from "three";
import { FieldType, createType } from "../objects/types.js";
import { adoptJax } from "./foreignJax.js";
import { asArray, isChannelScalar } from "./data.js";
import { reportDataError } from "./dataErrors.js";

/** Backend declaration adapters describe the pinned Three runtime; no alternate binding state. */
const uniform =
  /** @type {import("./effectiveFieldBinding.js").FieldUniformFactory} */ (
    threeUniform
  );
const storage =
  /** @type {import("./curvedPathTypes.js").FieldStorageFactory} */ (
    threeStorage
  );

/** @param {unknown} value */
export function normalizeMaxElements(value) {
  const count = Number(value);
  if (!Number.isInteger(count) || count <= 0)
    throw new Error(
      `maxElements must be a positive integer; received ${value}.`,
    );
  return count;
}

/** Allocation and filter planning share the same field widths and device ceiling (TODO 74). */
/** @param {import("./effectiveFieldBinding.js").CapacityRequest} request */
export function markCapacity({
  initial,
  allocated,
  fields = [],
  limits = {},
  rows = 0,
}) {
  const widest = Math.max(
    4,
    ...[...fields]
      .filter((field) => field.canBeBuffer)
      .map((field) => 4 * (field.channels === 3 ? 4 : (field.channels ?? 1))),
  );
  const ceiling = Math.max(
    1,
    Math.floor(
      Math.min(
        (limits.maxStorageBufferBindingSize ?? 128 * 1024 * 1024) / widest,
        (limits.maxBufferSize ?? Infinity) / 64,
      ),
    ),
  );
  const current = Math.min(allocated ?? normalizeMaxElements(initial), ceiling);
  return {
    initial,
    allocated,
    ceiling,
    current,
    next:
      rows > current
        ? Math.min(ceiling, 2 ** Math.ceil(Math.log2(rows)))
        : current,
  };
}

// Tell the buffer, in one tag per write (TODO 32.11), which mark owns its transitions and
// whether the field must snap (symbol codes and connected-path distances are not
// interpolable). From the consuming mark: the per-component spec (explicit animate()/tween
// components, and suppressed components for procedural @time channels, which write their own
// values), the scale-space kinds of the implicit transition, and the keyed staging frame this
// write belongs to. The whole tag is captured when the update is queued, so a later
// publication's policy never applies to an earlier write. `snapRows` is a
// padded mark's rows that were hidden before this write (TODO 32.12): they take the new values
// at once instead of moving from their hidden ones.
/**
 * @param {BufferedField} field
 * @param {import("./effectiveFieldBinding.js").StagingRows | null} [staging]
 * @param {JaxArray | null} [snapRows]
 * @returns {import("./effectiveFieldBinding.js").FieldAnimationTag}
 */
function captureAnimation(field, staging = null, snapRows = null) {
  const name = field._samplingName ?? field.name;
  const target = field.target,
    animation = target ? markAnimation(target) : null;
  return {
    owner: target,
    derived:
      name === "symbolCode" || (target?.isConnectedPath && name === "distance"),
    spec: animation?.specs?.[name] ?? null,
    kinds: animation?.kinds?.[name] ?? null,
    arrive: Boolean(animation?.arrive),
    schemeReset: Boolean(animation?.schemeReset),
    staging,
    snapRows,
    changed: async () => {
      field.animationVersion = (field.animationVersion ?? 0) + 1;
      requireFieldManager(field).invalidate();
    },
  };
}

/** Borrow the installed rendering owner; an unbuilt field owns no queued work.
 * @param {BufferedField} field @returns {BufferManager}
 */
function requireFieldManager(field) {
  if (!field.manager)
    throw Error(
      `Field ${field.name} is unbuilt. Register it with BufferManager.registerField() before using it.`,
    );
  return field.manager;
}
/** Check the existing build boundary instead of asserting that null bindings are initialized.
 * @param {BufferedField} field
 * @returns {asserts field is BufferedField & {manager: BufferManager, uniformNode: import("three/webgpu").Node & {value: import("./effectiveFieldBinding.js").FieldUniformValue}, highlightNode: import("three/webgpu").Node & {value: number}}}
 */
function requireFieldBinding(field) {
  requireFieldManager(field);
  if (!field.uniformNode || !field.highlightNode)
    throw Error(
      `Field ${field.name} has no shader binding. Register it with BufferManager.registerField() before using it.`,
    );
}

class BufferManager {
  /**
   * @param {import("three/webgpu").WebGPURenderer} renderer
   * @param {number} [maxElements]
   * @param {() => void} [invalidate]
   * @param {import("../../options/options.js").OptionsNode | null} [options]
   * @param {number} [resolution]
   * @param {import("./internalTypes.js").ViewServices} [view] The view its fields' errors and
   *   upload timings are reported to.
   */
  constructor(
    renderer,
    maxElements = 100000,
    invalidate = () => {},
    options = null,
    resolution = 512,
    view = undefined,
  ) {
    this.renderer = renderer;
    this.view = view;
    this.unregisterManager = registerManager(this);
    this.maxElements = maxElements;
    this.resolution = normalizeTextureResolution(resolution);
    /** @type {Map<string, BufferedField>} */
    this.fields = new Map();
    this.chain = Promise.resolve();
    this.pendingUpdates = 0;
    /** @type {number | undefined} */
    this.animationBatch = undefined;
    /** @type {Set<() => void> | undefined} */
    this.capacityListeners = undefined;
    this._highlight = -1;
    this.invalidate = () => {
      if (view) view.drawing.revision++;
      invalidate();
    };
    this._nextBatchId = 1;
    this.batchUpdateCounts = new Map();
    this.isDisposed = false;

    /** @type {Record<string, () => void>} */
    this.unsubscribeOptions = {};
    this.options = options;

    if (this.options?.has("maxElements")) {
      this.maxElements = normalizeMaxElements(this.options.get("maxElements"));
      this.unsubscribeOptions["maxElements"] = this.options
        .store("maxElements")
        .subscribe(
          /** @param {unknown} v */ (v) => {
            this.setMaxElements(v);
          },
        );
    }

    if (this.options?.has("resolution")) {
      this.resolution = normalizeTextureResolution(
        this.options.get("resolution"),
      );
      this.unsubscribeOptions["resolution"] = this.options
        .store("resolution")
        .subscribe(
          /** @param {unknown} v */ (v) => {
            this.setResolution(v);
          },
        );
    }
  }

  dispose() {
    this.isDisposed = true;
    for (const field of this.fields.values()) {
      field.version++;
    }
    this.chain.finally(() => {
      for (const field of this.fields.values()) field.dispose();
      this.fields.clear();
      this.unregisterManager();
      this.batchUpdateCounts.clear();
    });
    for (const unsubscribe of Object.values(this.unsubscribeOptions)) {
      unsubscribe();
    }
  }

  /** @param {BufferedField} field @param {string} [key] */
  registerField(field, key) {
    if (!key) {
      key = field.name;
    }

    field._samplingName = key;
    field.build(this);
    if (this.fields.has(key)) {
      console.warn(`Field with key ${key} already exists. Overwriting.`);
      this.fields.get(key)?.dispose();
    }
    this.fields.set(key, field);
    for (const changed of this.capacityListeners ?? []) changed();

    // If this field has a corresponding option, subscribe to it and update the field when it changes
    if (this.options?.has(key)) {
      if (this.unsubscribeOptions[key]) {
        this.unsubscribeOptions[key]();
      }

      this.unsubscribeOptions[key] = this.options.store(key).subscribe(
        /** @param {unknown} v */ (v) => {
          const field = this.getField(key);
          if (field) {
            field.update(
              /** @type {import("./effectiveFieldBinding.js").FieldValue} */ (
                v
              ),
            );
          }
        },
      );
    }

    return field;
  }

  /** @param {string} key */
  getField(key) {
    return this.fields.get(key);
  }

  /**
   * @param {() => void | Promise<unknown>} func
   * @param {((error: Error) => void) | null | undefined} err
   * @param {boolean} [invalidate] @param {number} [batchId] @param {() => void} [cleanup]
   */
  enqueue(func, err, invalidate = false, batchId = 0, cleanup = () => {}) {
    const queued = performance.now();
    if (!this.pendingUpdates)
      this.animationBatch = (this.animationBatch ?? 0) + 1;
    this.pendingUpdates++;
    if (batchId != 0) {
      if (!this.batchUpdateCounts.has(batchId)) {
        this.batchUpdateCounts.set(batchId, 0);
      }
      this.batchUpdateCounts.set(
        batchId,
        (this.batchUpdateCounts.get(batchId) ?? 0) + 1,
      );
    }

    this.chain = this.chain
      .then(async () => {
        if (this.isDisposed) return;
        await animationClock(this.renderer).busy;
        if (this.isDisposed) return;
        this.view?.diagnostics.instrumentation.current?.sample(
          "uploadQueue",
          performance.now() - queued,
        );
        const started = performance.now();
        await func();
        this.view?.diagnostics.instrumentation.current?.sample(
          "uploadPreparation",
          performance.now() - started,
        );
      })
      .catch((e) => {
        console.error("Error in BufferManager queue", e);
        if (err) err(e);
      })
      .finally(() => {
        this.pendingUpdates--;
        cleanup();
        if (this.isDisposed) return;
        if (invalidate) {
          this.invalidate();
        }

        if (batchId == 0) return;
        if (this.batchUpdateCounts.has(batchId)) {
          this.batchUpdateCounts.set(
            batchId,
            (this.batchUpdateCounts.get(batchId) ?? 0) - 1,
          );
          if ((this.batchUpdateCounts.get(batchId) ?? 0) <= 0) {
            this.batchUpdateCounts.delete(batchId);
            this.invalidate();
          }
        }
      });
    return this.chain;
  }

  /** @param {unknown} maxElements */
  setMaxElements(maxElements) {
    const capacity = normalizeMaxElements(maxElements);
    if (capacity == this.maxElements) return;
    this.maxElements = capacity;
    for (const field of this.fields.values()) {
      field.setMaxElements(capacity);
    }
    for (const changed of this.capacityListeners ?? []) changed();
  }

  /** @param {() => void} changed */
  onCapacityChange(changed) {
    (this.capacityListeners ??= new Set()).add(changed);
    return () => this.capacityListeners?.delete(changed);
  }

  /** @param {unknown} resolution */
  setResolution(resolution) {
    const size = normalizeTextureResolution(resolution);
    if (size == this.resolution) return;
    this.resolution = size;
    for (const field of this.fields.values()) {
      field.setResolution(size);
    }
  }

  /** @returns {number} */
  get highlight() {
    return this._highlight;
  }

  set highlight(value) {
    this._highlight = value;
    for (const field of this.fields.values()) {
      field.highlight = value;
    }
  }

  get nextBatchId() {
    return this._nextBatchId++;
  }
}

/** @typedef {import("./effectiveFieldBinding.js").EffectiveFieldBinding} EffectiveFieldBinding */
/** @implements {EffectiveFieldBinding} */
class BufferedField {
  /**
   * @param {import("./effectiveFieldBinding.js").FieldTypeInput} [type]
   * @param {import("./effectiveFieldBinding.js").FieldTarget | null} [target]
   * @param {import("./effectiveFieldBinding.js").FieldParameters} [params]
   */
  constructor(type = null, target = null, params = {}) {
    const hasType =
      typeof type === "string" ||
      typeof type === "function" ||
      type instanceof FieldType ||
      (typeof type === "object" && type?.isFieldType);

    /** @type {import("./effectiveFieldBinding.js").FieldDefinition | null} */
    this.type = hasType ? createType(type, params.typeParams ?? {}) : null;
    this.target = target ?? params.target ?? null;
    this._name = params.name;
    this._stash = params.stash ?? null;
    this.getStash = params.getStash ?? null;
    this.onDirty = params.onDirty ?? null;
    // Value-only state changes may alternate scalar and per-instance values.
    // Keep both branches bound from initialization so that toggling
    // feedback does not rebuild the material (including picking/overview).
    this.bufferMode = params.stableRepresentation ? uniform(0, "uint") : null;
    /** @type {Set<import("./effectiveFieldBinding.js").FieldStorage | null>} */
    this.retiredBuffers = new Set();
    this.onCount = params.onCount ?? null;
    // build() installs these bindings; unbuilt fields have no rendering owner or nodes.
    /** @type {BufferManager | null} */
    this.manager = null;
    /** @type {(import("three/webgpu").Node & { value: import("./effectiveFieldBinding.js").FieldUniformValue }) | null} */
    this.uniformNode = null;
    /** @type {(import("three/webgpu").Node & { value: number }) | null} */
    this.highlightNode = null;
    /** @type {import("./effectiveFieldBinding.js").FieldStorage | null} */
    this.buffer = null;
    /** @type {import("./effectiveFieldBinding.js").FieldStorage | null} */
    this.bufferNodeSource = null;
    /** @type {import("three/webgpu").Node | null} */
    this.bufferNode = null;
    /** @type {import("./effectiveFieldBinding.js").FieldValue} */
    this.data = null;
    /** @type {import("./effectiveFieldBinding.js").FieldWriteRequest | null} */
    this.lastRequest = null;
    /** @type {import("./curvedPathTypes.js").FieldStorageNode | null} */
    this.tileStorageNode = null;
    /** @type {{ rows: number; limit: number } | null} */
    this.truncated = null;
    /** @type {ArrayInstancedBufferAttribute | undefined} */
    this.scalarBuffer = undefined;
    /** @type {(import("three/webgpu").Node & {value: number}) | undefined} */
    this.channelUniform = undefined;
    /** @type {string | undefined} */
    this._samplingName = undefined;
    this._count = 0;
    this.version = 0;
    this.isBufferNode = false;
    this.animationVersion = 0;
  }

  /** @param {BufferManager} manager @param {import("./effectiveFieldBinding.js").FieldValue} [defaultValue] */
  build(manager, defaultValue) {
    this.manager = manager;
    if (this.canBeBuffer) {
      this.buffer = new ArrayInstancedBufferAttribute(
        this.renderer,
        this.maxElements,
        this.channels,
      );
      this.bufferNode = this.bufferRead(this.buffer);
    } else {
      this.bufferNode = null;
      this.buffer = null;
    }

    this.highlightNode = uniform(-1);
    this.version = 0;
    this.isBufferNode = false;
    this.data = null;
    this.isBuilt = true;
    this.count = 1;

    defaultValue = defaultValue ?? this.defaultValue;
    if (defaultValue != null) {
      this.uniformNode = uniform(this.getUniformData(defaultValue, this.stash));
      if (this.bufferMode && this.canBeBuffer) {
        this.bufferNodeSource = this.buffer;
        this.rebind();
      } else this.setNode(this.uniformNode, this.highlightNode, this.stash);
    } else {
      this.uniformNode = uniform();
    }
  }

  get canBeBuffer() {
    return this.type?.canBeBuffer ?? true;
  }

  /** @returns {number} */
  get count() {
    return this._count;
  }

  /** @param {number} value */
  set count(value) {
    this._count = value;
    this.onCount?.(value);
  }

  get renderer() {
    return requireFieldManager(this).renderer;
  }

  get view() {
    return requireFieldManager(this).view;
  }

  get maxElements() {
    return requireFieldManager(this).maxElements;
  }

  get stash() {
    if (this.getStash) return this.getStash(this);
    return this._stash;
  }

  get name() {
    return this._name ?? this.type?.name ?? this.constructor.name;
  }

  get channels() {
    return this.type?.channels ?? 1;
  }

  /** @returns {import("./effectiveFieldBinding.js").FieldUniformValue | null} */
  get defaultValue() {
    return this.type?.defaultValue ?? 0;
  }

  /** @returns {number} */
  get highlight() {
    requireFieldBinding(this);
    return this.highlightNode.value;
  }

  set highlight(value) {
    requireFieldBinding(this);
    this.highlightNode.value = value;
  }

  markDirty() {
    this.onDirty?.(this);
  }

  /** @param {unknown} data @returns {data is import("./effectiveFieldBinding.js").FieldUniformValue} */
  isUniformType(data) {
    if (this.type) return this.type.isUniformType(data);
    return (
      typeof data === "number" ||
      typeof data === "string" ||
      data instanceof THREE.Color ||
      data instanceof THREE.Vector2 ||
      data instanceof THREE.Vector3 ||
      data instanceof THREE.Vector4
    );
  }

  /** @param {unknown} data @param {unknown} stash @returns {import("./effectiveFieldBinding.js").FieldUniformValue} */
  getUniformData(data, stash) {
    if (this.type) return this.type.getUniformData(data, stash);
    return /** @type {import("./effectiveFieldBinding.js").FieldUniformValue} */ (
      data
    );
  }

  /** @param {JaxArray} data @param {unknown} stash */
  validateShape(data, stash) {
    if (this.type) return this.type.validateShape(data, stash);
    return data;
  }

  /** @param {import("three/webgpu").Node} node @param {import("three/webgpu").Node} highlightNode @param {unknown} stash */
  setNode(node, highlightNode, stash) {
    requireFieldBinding(this);
    if (this.type && this.target) {
      this.type.setNode(
        this.target,
        this.bufferMode && node !== this.uniformNode
          ? this.bufferMode.greaterThan(0).select(node, this.uniformNode)
          : node,
        highlightNode,
        stash,
        this.isBufferNode,
      );
    }
  }

  /** @param {import("./effectiveFieldBinding.js").FieldValue} data @returns {Promise<import('./internalTypes.js').FieldWriteResult>} */
  update(data, batchId = 0) {
    requireFieldBinding(this);
    if (this.manager.isDisposed) return Promise.resolve({ status: "disposed" });
    data = adoptJax(data); // An array from another jax-js copy (TODO 23.0b).
    const animation = this.target ? markAnimation(this.target) : null;
    const staging = animation?.schemeReset
        ? null
        : (animation?.staging ?? null),
      snapRows = animation?.snapRows ?? null;
    const scalar = data instanceof JaxArray && data.shape.length === 0;
    const myBuffer = scalar
      ? (this.scalarBuffer ??= new ArrayInstancedBufferAttribute(
          this.renderer,
          1,
          this.channels,
        ))
      : this.buffer;
    // The same input as the last request, into the same buffer with the same settings, writes
    // nothing (TODO 30.4): a mark re-prepared for one channel (a Force tick moves positions)
    // passes its other channels' unchanged columns and constants again. Arrays are immutable,
    // and a host array is the same values while it is the same object (TODO 26.6).
    const settings = [
      JSON.stringify(this.stash ?? null),
      this.target?.options?.get("normalization") ?? "auto",
    ].join("|");
    const last = this.lastRequest;
    if (
      !staging &&
      !(this.target && markAnimation(this.target).schemeReset) &&
      !this.retiredBuffers.size &&
      last &&
      last.data === data &&
      last.buffer === myBuffer &&
      last.settings === settings &&
      last.version === this.version
    )
      return /** @type {Promise<import("./internalTypes.js").FieldWriteResult>} */ (
        last.done
      );
    const animationTag = captureAnimation(this, staging, snapRows);
    const retained = data instanceof JaxArray ? data.ref : data;
    const myVersion = ++this.version;
    const myStash = this.stash;
    /** @type {import("./effectiveFieldBinding.js").FieldWriteRequest | null} */
    const request = (this.lastRequest = staging
      ? null
      : { data, buffer: myBuffer, settings, version: myVersion, done: null });
    return request
      ? (request.done = this.enqueueWrite(
          retained,
          batchId,
          myVersion,
          myBuffer,
          myStash,
          staging,
          snapRows,
          animationTag,
        ))
      : this.enqueueWrite(
          retained,
          batchId,
          myVersion,
          myBuffer,
          myStash,
          staging,
          snapRows,
          animationTag,
        );
  }

  /**
   * @param {import("./effectiveFieldBinding.js").FieldValue} retained
   * @param {number} batchId @param {number} myVersion
   * @param {import("./effectiveFieldBinding.js").FieldStorage | null} myBuffer
   * @param {unknown} myStash
   * @param {import("./effectiveFieldBinding.js").StagingRows | null} staging
   * @param {JaxArray | null} [snapRows]
   * @param {import("./effectiveFieldBinding.js").FieldAnimationTag | null} [animationTag]
   */
  enqueueWrite(
    retained,
    batchId,
    myVersion,
    myBuffer,
    myStash,
    staging,
    snapRows = null,
    animationTag = null,
  ) {
    /** @type {import('./internalTypes.js').FieldWriteResult} */
    let outcome = { status: "disposed" };
    requireFieldBinding(this);
    return this.manager
      .enqueue(
        async () => {
          // A superseded write is skipped, except a keyed staging write: the next staging
          // frame re-orders the rows this one laid out. A correspondence reset must also land
          // before subsequent unchanged targets can retain their previous motion.
          if (
            myVersion !== this.version &&
            !staging &&
            !animationTag?.schemeReset
          ) {
            outcome = { status: "superseded" };
            return;
          }
          if (
            retained == null ||
            /** @type {{shape?: number[]} | null | undefined} */ (retained)
              ?.shape?.[0] === 0 ||
            (Array.isArray(retained) && retained.length === 0)
          ) {
            /** @type {{dispose?(): void} | null | undefined} */ (
              this.data
            )?.dispose?.();
            this.data = null;
            this.count = 0;
            outcome = { status: "applied" };
            return;
          }
          const newdata = await this.write(
            retained,
            myBuffer,
            myStash,
            () => myVersion === this.version && !this.manager.isDisposed,
            staging,
            snapRows,
            animationTag,
          );
          if (newdata === undefined) {
            outcome = {
              status: this.manager.isDisposed ? "disposed" : "superseded",
            };
            return;
          }
          /** @type {{dispose?(): void} | null | undefined} */ (
            this.data
          )?.dispose?.();
          this.data = newdata;
          // A write that succeeds clears this field's error (TODO 32.5), unless it was cut.
          const cut = this.truncated;
          reportDataError(
            this.view,
            this,
            cut
              ? `${this.target?.componentName ?? this.target?.constructor?.componentName ?? "This mark"} has ${cut.rows} rows; it can hold ${cut.limit} (the device's buffer limit), and the rest are not drawn.`
              : "",
          );
          outcome = { status: "applied" };
          this.failed = false;
        },
        (error) => {
          outcome = { status: "failed", error };
          // Read by consumers that wait for this field's data (curvedPaths.js prepare).
          this.failed = true;
          // A failed write is tried again by the next request, even of the same input.
          if (this.lastRequest?.version === myVersion) this.lastRequest = null;
          if (!this.data) {
            this.count = 0;
            this.target && (this.target.count = 0);
          }
          reportDataError(this.view, this, error.message);
          console.error(`Error updating ${this.name}`, error);
        },
        !batchId,
        batchId,
        () => {
          if (retained instanceof JaxArray) retained.dispose();
        },
      )
      .then(() => outcome);
  }

  /** @param {import("./effectiveFieldBinding.js").FieldStorage | null} [active] */
  releaseRetiredBuffers(active) {
    for (const buffer of this.retiredBuffers) {
      if (buffer === active) continue;
      buffer?.dispose?.();
      this.retiredBuffers.delete(buffer);
    }
  }

  /**
   * @returns {Promise<import("./effectiveFieldBinding.js").FieldValue>}
   * @param {import("./effectiveFieldBinding.js").FieldValue} data
   * @param {import("./effectiveFieldBinding.js").FieldStorage | null} buffer
   * @param {unknown} stash @param {() => boolean} [isCurrent]
   * @param {import("./effectiveFieldBinding.js").StagingRows | null} [staging]
   * @param {JaxArray | null} [snapRows]
   * @param {import("./effectiveFieldBinding.js").FieldAnimationTag | null} [animationTag]
   */
  async write(
    data,
    buffer,
    stash,
    isCurrent = () => true,
    staging = null,
    snapRows = null,
    animationTag = null,
  ) {
    if (data == null) return data;
    requireFieldBinding(this);
    const input = data;

    if (isChannelScalar(data)) {
      // Same numeric node as a row buffer, backed by one host uniform. This preserves color
      // mapping instead of interpreting a numeric expression as a literal CSS color.
      const changed = !this.isChannelScalar;
      this.channelUniform ??= uniform(data.value, "float");
      if (this.data != null && this.target)
        uniformTransition(
          this.target,
          `field:${this._samplingName ?? this.name}`,
          this.channelUniform,
          data.value,
          animationTag,
        );
      else this.channelUniform.value = data.value;
      this.count = 1;
      this.isChannelScalar = true;
      /** @type {boolean} */
      this.deviceScalar = false;
      this.isBufferNode = true;
      if (changed) {
        this.setNode(
          /** @type {NonNullable<BufferedField["channelUniform"]>} */ (
            this.channelUniform
          ),
          this.highlightNode,
          stash,
        );
        this.markDirty();
      }
      this.bufferNodeSource = null;
      this.releaseRetiredBuffers();
      return data;
    }
    const wasChannelScalar = this.isChannelScalar;
    this.isChannelScalar = false;

    if (this.isUniformType(data)) {
      /** @type {boolean} */
      this.deviceScalar = false;
      // A hollow point's "transparent" (TODO 64) is no color for the settings pane.
      if (
        this.type?.name === "fill" &&
        data !== this.data &&
        data !== "transparent" &&
        this.target?.options?.has("fillColor")
      ) {
        const color = `#${new THREE.Color(/** @type {import("three").ColorRepresentation} */ (data)).getHexString()}`;
        this.target.options.set("fillColor", color);
      }
      this.count = 1;
      if (this.data != null && this.target)
        uniformTransition(
          this.target,
          `field:${this._samplingName ?? this.name}`,
          this.uniformNode,
          this.getUniformData(data, stash),
          animationTag,
        );
      else this.uniformNode.value = this.getUniformData(data, stash);
      if (this.isBufferNode || wasChannelScalar) {
        this.isBufferNode = false;
        if (this.bufferMode) this.bufferMode.value = 0;
        else {
          this.setNode(this.uniformNode, this.highlightNode, stash);
          this.markDirty();
        }
      }

      if (
        this.bufferMode &&
        this.bufferNodeSource &&
        this.bufferNodeSource !== buffer
      ) {
        // Capacity changes may retire the buffer while feedback is inactive.
        // Rebind the retained array branch before releasing its old storage.
        /** @type {NonNullable<typeof buffer>} */ (
          buffer
        ).ensureStorageAttribute();
        this.bufferNodeSource = buffer;
        this.rebind();
        this.markDirty();
      }
      this.releaseRetiredBuffers(buffer);
      return data;
    }

    if (!this.canBeBuffer || !buffer) {
      throw new Error(`Field ${this.name} cannot be updated with buffer data`);
    }
    // Host data uploads as columns do (data.js asArray: a missing number is NaN, 64-bit arrays
    // become float32; TODO 48.1).
    data = data instanceof JaxArray ? data.ref : asArray(data);
    const scalar = data.shape.length === 0;

    // Past the mark's capacity (it grows to fit, up to the device's limit: base.ensureCapacity):
    // the rest is cut, and the update says so on the plot (TODO 29.2).
    this.truncated =
      data.shape[0] > this.maxElements
        ? { rows: data.shape[0], limit: this.maxElements }
        : null;
    if (this.truncated) data = data.slice([0, this.maxElements]);
    try {
      data = this.validateShape(/** @type {JaxArray} */ (data), stash);
      buffer.animationTag =
        animationTag ?? captureAnimation(this, staging, snapRows);
      await buffer.write(
        data,
        this.target?.options?.get("normalization") ?? "auto",
      );
    } catch (error) {
      if (data.refCount > 0) data.dispose();
      throw error;
    }
    if (!isCurrent()) {
      data.dispose();
      return;
    }
    this.count = scalar ? 1 : data.shape[0];
    // Rank zero carries cardinality through exports and future resizes too.
    this.deviceScalar = scalar;
    if (wasChannelScalar) this.bufferNodeSource = null;
    this.bindBuffer(buffer, stash);
    if (scalar) {
      data.dispose();
      return /** @type {JaxArray} */ (input).ref;
    }
    return data;
  }

  // The shader reads `buffer` (written): bound once, or again after a capacity change.
  /** @param {import("./effectiveFieldBinding.js").FieldStorage} buffer @param {unknown} stash */
  bindBuffer(buffer, stash) {
    requireFieldBinding(this);
    const needsBinding =
      this.bufferNodeSource !== buffer ||
      (!this.isBufferNode && !this.bufferMode);
    const storageRebind =
      needsBinding &&
      this.isBufferNode &&
      this.tileStorageNode &&
      this.target?.plotTileStorage;
    this.isBufferNode = true;
    if (this.bufferMode) this.bufferMode.value = 1;
    if (needsBinding) {
      this.bufferNodeSource = buffer;
      this.bufferNode = this.bufferRead(buffer);
      /** @type {boolean} */
      this.curvedBinding = refinesPieces(this.target);
      if (this.curvedBinding && !this.deviceScalar)
        this.bufferNode =
          /** @type {NonNullable<import("./effectiveFieldBinding.js").FieldTarget["curvedPaths"]>} */ (
            this.target?.curvedPaths
          ).field(
            /** @type {import("./curvedPathTypes.js").CurveBufferField} */ (
              this
            ),
          );
      else if (this.target?.sampling && !this.deviceScalar)
        this.bufferNode = this.target.sampling.field(
          this._samplingName ?? this.name,
          this.channels,
          /** @type {import("three/webgpu").Node} */ (this.bufferNode),
        );
      this.setNode(
        /** @type {import("three/webgpu").Node} */ (this.bufferNode),
        this.highlightNode,
        stash,
      );
      if (!storageRebind) this.markDirty();
    }
    this.releaseRetiredBuffers(buffer);
  }

  /**
   * Write `rows` rows of host data (a Float32Array of `channels` numbers a row) straight into the
   * field's buffer (TODO 63.6): one writeBuffer, no jax array, kernel or retained GPU copy; the
   * field keeps the host array (with its `shape`) for exports. For marks given arrays prepared off
   * the main thread (a live VectorTile's slots), which grow first (ensureCapacity). No
   * animation: a mark that animates its fields writes through update().
   */
  /** @param {Float32Array} array @param {number} rows */
  updateHost(array, rows) {
    requireFieldBinding(this);
    if (this.manager.isDisposed) return Promise.resolve();
    const myVersion = ++this.version,
      myBuffer = /** @type {ArrayInstancedBufferAttribute} */ (this.buffer),
      stash = this.stash;
    this.lastRequest = null;
    return this.manager.enqueue(
      async () => {
        if (myVersion !== this.version) return;
        myBuffer.writeHost(array, rows);
        this.count = rows;
        if (rows) this.bindBuffer(myBuffer, stash);
        /** @type {{dispose?(): void} | null | undefined} */ (
          this.data
        )?.dispose?.();
        this.data = rows
          ? Object.assign(array.subarray(0, rows * this.channels), {
              shape: this.channels > 1 ? [rows, this.channels] : [rows],
            })
          : null;
        this.truncated = null;
        reportDataError(this.view, this, "");
      },
      (error) => {
        reportDataError(this.view, this, error.message);
        console.error(`Error updating ${this.name}`, error);
      },
      true,
    );
  }

  /**
   * How the mark's shader reads this field's buffer: a per-instance vertex attribute, or, when
   * the mark's per-row fields are over the vertex-buffer budget (BasePlotObject
   * vertexBuffersExceeded names them in `storageFields`), the same buffer as a storage buffer
   * indexed by instance (TODO 17.10). Named: an unnamed storage buffer would give every mark its
   * own shader (17.6).
   */
  /** @param {import("./effectiveFieldBinding.js").FieldStorage} sourceBuffer */
  bufferRead(sourceBuffer) {
    const buffer = /** @type {ArrayInstancedBufferAttribute} */ (sourceBuffer);
    const name = this._samplingName ?? this.name;
    const tileStorage =
      this.target?.plotTileStorage && this.target?.tileStorageFields?.has(name);
    if (
      buffer === this.scalarBuffer ||
      tileStorage ||
      this.target?.storageFields?.has(name)
    ) {
      const type =
        buffer.itemSize === 4
          ? "vec4"
          : buffer.itemSize === 2
            ? "vec2"
            : "float";
      // Live tiles keep the same field representation. Runtime-sized storage declarations and
      // a stable node let Three rebind a grown attribute without rebuilding its node graph.
      const stable = tileStorage && buffer !== this.scalarBuffer;
      const held = stable ? this.tileStorageNode : null;
      const source =
        held ??
        storage(buffer, type, stable ? 0 : buffer.count).setName(
          `hmField_${String(name).replace(/\W/g, "_")}`,
        );
      source.value = buffer;
      if (stable) this.tileStorageNode = source;
      const node = source.element(
        buffer === this.scalarBuffer ? 0 : instanceIndex,
      );
      return this.channels === 3
        ? /** @type {import("./curvedPathTypes.js").FieldComponents} */ (node)
            .xyz
        : node;
    }
    return this.channels === 3
      ? /** @type {import("./curvedPathTypes.js").FieldComponents} */ (
          bufferAttribute(buffer)
        ).xyz
      : bufferAttribute(buffer);
  }

  rebind() {
    requireFieldBinding(this);
    if (this.isChannelScalar) {
      this.setNode(
        /** @type {NonNullable<BufferedField["channelUniform"]>} */ (
          this.channelUniform
        ),
        this.highlightNode,
        this.stash,
      );
      return;
    }
    if ((!this.isBufferNode && !this.bufferMode) || !this.bufferNodeSource)
      return;
    const buffer = this.bufferNodeSource;
    this.bufferNode = this.bufferRead(buffer);
    /** @type {boolean} */
    this.curvedBinding = refinesPieces(this.target);
    if (this.curvedBinding && !this.deviceScalar)
      this.bufferNode =
        /** @type {NonNullable<import("./effectiveFieldBinding.js").FieldTarget["curvedPaths"]>} */ (
          this.target?.curvedPaths
        ).field(
          /** @type {import("./curvedPathTypes.js").CurveBufferField} */ (this),
        );
    else if (this.target?.sampling && !this.deviceScalar)
      this.bufferNode = this.target.sampling.field(
        this._samplingName ?? this.name,
        this.channels,
        /** @type {import("three/webgpu").Node} */ (this.bufferNode),
      );
    this.setNode(
      /** @type {import("three/webgpu").Node} */ (this.bufferNode),
      this.highlightNode,
      this.stash,
    );
  }
  /** @param {number} maxElements */
  setMaxElements(maxElements) {
    if (!this.canBeBuffer) return;
    const oldBuffer = this.buffer;
    this.buffer = new ArrayInstancedBufferAttribute(
      this.renderer,
      maxElements,
      this.channels,
    );
    this.retiredBuffers.add(oldBuffer);
    // Refill the resized buffer in the background; surface failures instead of
    // leaving an unhandled rejection. Host rows (updateHost: a typed array tagged with its shape)
    // refill as they came, by rows: through update() they became one flat column (TODO 136.1:
    // a tile slot shrunk to 2,048 rows reported "position data must have 2 or 3 channels").
    const host =
      this.data instanceof Float32Array &&
      Array.isArray(/** @type {{shape?: unknown}} */ (this.data).shape)
        ? /** @type {Float32Array & {shape: number[]}} */ (this.data)
        : null;
    Promise.resolve(
      host
        ? this.updateHost(host, Math.min(host.shape[0], maxElements))
        : this.update(this.data),
    ).catch((error) =>
      console.error(
        `Could not refill ${this.name} after resizing to ${maxElements} elements.`,
        error,
      ),
    );
  }

  /** @param {number[]} _resolution */
  setResolution(..._resolution) {}

  dispose() {
    reportDataError(this.view, this, "");
    const buffer = this.buffer;
    const data = this.data;
    this.buffer = null;
    this.data = null;
    this.bufferNode = null;
    this.tileStorageNode = null;
    this.isBuilt = false;
    buffer?.dispose?.();
    this.scalarBuffer?.dispose?.();
    this.releaseRetiredBuffers(undefined);
    /** @type {{dispose?(): void} | null | undefined} */ (data)?.dispose?.();
  }
}

class TextureField extends BufferedField {
  rebind() {
    requireFieldBinding(this);
  }
  /**
   * @param {import("./effectiveFieldBinding.js").FieldTypeInput} [type]
   * @param {import("./effectiveFieldBinding.js").FieldTarget | null} [target]
   * @param {import("./effectiveFieldBinding.js").FieldParameters} [params]
   */
  constructor(type = null, target = null, params = {}) {
    super(type, target, params);
    /** @type {{x: ArrayLike<number> | null; y: ArrayLike<number> | null} | null} */
    this.remap = null;
    this._resolution =
      params.resolution == null
        ? null
        : normalizeTextureResolution(params.resolution);
    this.image = params.image ?? false;
    // An image's nearest sampling; a scalar grid's sharp cells (unset: automatic, sharpCells).
    this.pixelated = params.pixelated;
    this.maxTextureWidth =
      params.maxWidth ?? params.maxTextureWidth ?? Infinity;
    this.maxTextureHeight =
      params.maxHeight ?? params.maxTextureHeight ?? Infinity;
    this.maxTextureChannels =
      params.maxChannels ?? params.maxTextureChannels ?? 4;

    /** @type {number | null} The newest write's version while it is queued (enqueueWrite). */
    this.queuedVersion = null;
  }

  /** @param {unknown} value */
  normalizeResolution(value) {
    return normalizeTextureResolution(value);
  }

  createBuffer(resolution = this.resolution) {
    const texture = new ArrayTexture(
      this.renderer,
      resolution,
      undefined,
      this.maxTextureWidth,
      this.maxTextureHeight,
      this.maxTextureChannels,
      this.image,
      this.pixelated,
    );
    // An unset mode is automatic (the constructor's default blends).
    if (!this.image) texture.cellMode = this.pixelated;
    if (this.remap) void texture.setRemap(this.remap);
    return texture;
  }

  /**
   * A scalar grid's sharp or blended cells (TODO 134.15; sharpCells in arraytexture.js): true,
   * false or undefined (automatic). A change resamples the texture.
   * @param {boolean | undefined} value
   */
  setPixelated(value) {
    if (this.image || value === this.pixelated) return;
    this.pixelated = value;
    const texture = /** @type {ArrayTexture | null} */ (this.buffer);
    if (texture) texture.cellMode = value;
    if (!this.isBufferNode) return;
    // The newest data, resampled: a queued write's (still held by it), not the shown data it
    // replaces.
    const last = this.lastRequest;
    const data =
      last &&
      last.version === this.version &&
      this.queuedVersion === last.version
        ? last.data
        : this.data;
    if (data == null) return;
    this.lastRequest = null;
    this.update(data);
  }

  /** Track the newest queued write until it settles (setPixelated resamples its data). */
  /** @type {BufferedField["enqueueWrite"]} */
  enqueueWrite(retained, batchId, myVersion, ...rest) {
    this.queuedVersion = myVersion;
    return super
      .enqueueWrite(retained, batchId, myVersion, ...rest)
      .finally(() => {
        if (this.queuedVersion === myVersion) this.queuedVersion = null;
      });
  }

  /** A grid table's remap tables (TODO 51), for this texture and any it is replaced by. */
  /** @param {TextureField["remap"]} remap */
  setRemap(remap) {
    this.remap = remap;
    return /** @type {ArrayTexture | null} */ (this.buffer)?.setRemap?.(remap);
  }

  /** @param {BufferManager} manager @param {import("./effectiveFieldBinding.js").FieldValue} [defaultValue] */
  build(manager, defaultValue) {
    this.manager = manager;
    if (this.canBeBuffer) {
      this.buffer = this.createBuffer();
      this.bufferNode = texture(/** @type {ArrayTexture} */ (this.buffer));
      this.bufferNodeSource = this.buffer;
    } else {
      this.bufferNode = null;
      this.bufferNodeSource = null;
      this.buffer = null;
    }

    this.highlightNode = uniform(-1);
    this.version = 0;
    this.isBufferNode = false;
    this.data = null;
    this.isBuilt = true;
    this.count = 1;

    defaultValue = defaultValue ?? this.defaultValue;
    if (defaultValue != null) {
      this.uniformNode = uniform(this.getUniformData(defaultValue, this.stash));
      this.setNode(this.uniformNode, this.highlightNode, this.stash);
    } else {
      this.uniformNode = uniform();
    }
  }

  get texture() {
    return this.buffer;
  }

  /** @returns {import("./effectiveFieldBinding.js").FieldUniformValue | null} */
  get defaultValue() {
    return this.type?.defaultValue ?? null;
  }

  get resolution() {
    return this.manager?.resolution ?? this._resolution ?? 512;
  }

  /** @param {number} value */
  set resolution(value) {
    if (this.manager) {
      this.manager.setResolution(value);
    } else {
      this._resolution = this.normalizeResolution(value);
    }
  }

  /** @param {number} value */
  setResolution(value) {
    value = this.normalizeResolution(value);
    if (/** @type {ArrayTexture | null} */ (this.buffer)?.resolution === value)
      return;

    this._resolution = value;
    if (!this.isBuilt || !this.canBeBuffer) return;
    requireFieldBinding(this);

    const oldBuffer = this.buffer;
    this.buffer = this.createBuffer(value);

    if (this.isBufferNode && this.data != null) {
      this.update(this.data);
    } else {
      this.bufferNode = texture(/** @type {ArrayTexture} */ (this.buffer));
      this.bufferNodeSource = this.buffer;

      if (this.isBufferNode) {
        this.setNode(
          /** @type {import("three/webgpu").Node} */ (this.bufferNode),
          this.highlightNode,
          this.stash,
        );
        this.markDirty();
      }
    }

    this.retiredBuffers.add(oldBuffer);
    if (!this.isBufferNode) this.releaseRetiredBuffers(this.buffer);
  }

  /** @param {JaxArray} data */
  getTextureElementCount(data) {
    if (!data?.shape?.length) return 1;
    const [height = 1, width = 1] = data.shape;
    return height * width;
  }

  /** @param {JaxArray} data @param {unknown} stash */
  validateTextureShape(data, stash) {
    if (this.type?.validateTextureShape) {
      return this.type.validateTextureShape(data, stash);
    }

    if (data.shape.length < 2 || data.shape.length > 3) {
      throw new Error(
        `${this.name} texture data must have shape [height, width] or [height, width, channels], but got ${data.shape}`,
      );
    }

    const [height, width, channels = 1] = data.shape;
    if (!height || !width || !channels || channels > this.maxTextureChannels) {
      throw new Error(
        `${this.name} texture data has unsupported shape ${data.shape}`,
      );
    }

    return data;
  }

  /**
   * @returns {Promise<import("./effectiveFieldBinding.js").FieldValue>}
   * @param {import("./effectiveFieldBinding.js").FieldValue} data
   * @param {import("./effectiveFieldBinding.js").FieldStorage | null} buffer
   * @param {unknown} stash @param {() => boolean} [isCurrent]
   * @param {import("./effectiveFieldBinding.js").StagingRows | null} [staging]
   * @param {JaxArray | null} [snapRows]
   * @param {import("./effectiveFieldBinding.js").FieldAnimationTag | null} [animationTag]
   */
  async write(
    data,
    buffer,
    stash,
    isCurrent = () => true,
    staging = null,
    snapRows = null,
    animationTag = null,
  ) {
    if (data == null) return data;
    requireFieldBinding(this);

    if (this.isUniformType(data)) {
      // A hollow point's "transparent" (TODO 64) is no color for the settings pane.
      if (
        this.type?.name === "fill" &&
        data !== this.data &&
        data !== "transparent" &&
        this.target?.options?.has("fillColor")
      ) {
        const color = `#${new THREE.Color(/** @type {import("three").ColorRepresentation} */ (data)).getHexString()}`;
        this.target.options.set("fillColor", color);
      }
      this.count = 1;
      if (this.data != null && this.target)
        uniformTransition(
          this.target,
          `field:${this._samplingName ?? this.name}`,
          this.uniformNode,
          this.getUniformData(data, stash),
          animationTag,
        );
      else this.uniformNode.value = this.getUniformData(data, stash);
      if (this.isBufferNode) {
        this.isBufferNode = false;
        this.setNode(this.uniformNode, this.highlightNode, stash);
        this.markDirty();
      }

      this.releaseRetiredBuffers(undefined);
      return data;
    }

    if (!this.canBeBuffer || !buffer) {
      throw new Error(`Field ${this.name} cannot be updated with texture data`);
    }

    data = data instanceof JaxArray ? data.ref : asArray(data);

    try {
      data = this.validateTextureShape(/** @type {JaxArray} */ (data), stash);
      buffer.animationTag =
        animationTag ?? captureAnimation(this, staging, snapRows);
      await buffer.write(
        data,
        this.target?.options?.get("normalization") ?? "auto",
      );
    } catch (error) {
      if (data.refCount > 0) data.dispose();
      throw error;
    }
    if (!isCurrent()) {
      data.dispose();
      return;
    }
    this.count = this.getTextureElementCount(data);

    if (this.bufferNodeSource !== buffer || !this.isBufferNode) {
      this.isBufferNode = true;
      this.bufferNode = texture(/** @type {ArrayTexture} */ (buffer));
      this.bufferNodeSource = buffer;
      this.setNode(
        /** @type {import("three/webgpu").Node} */ (this.bufferNode),
        this.highlightNode,
        stash,
      );
      this.markDirty();
    }
    this.releaseRetiredBuffers(buffer);

    return data;
  }

  /** @param {number[]} _maxElements */
  setMaxElements(..._maxElements) {
    // ArrayTexture capacity is controlled by maxTextureWidth/maxTextureHeight,
    // not BufferManager.maxElements.
  }
}

export { BufferManager, BufferedField, TextureField };
