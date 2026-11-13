import { NormalizeGPU } from "../../plot/utils/normalizeGPU.js";
import { animationClock, animationEnabled, BufferTransition, RowTransition } from "../../plot/utils/animation.js";
import { releaseAttribute } from "./attributeRelease.js";
import { markAnimation } from "../../plot/utils/markAnimation.js";
import * as THREE from "three/webgpu";
import {
  Fn,
  instanceIndex,
  textureStore,
  uvec2,
  vec4,
  storage,
  uniform,
  float,
  uint,
  min,
  floor,
  fract,
  mix,
  clamp,
} from "three/tsl";
import { getWebGPUDevice, numpy as np, DType } from "@hmplot/jax";
import { normalizeTexture } from "./normalize.js";
import { REMAP_SIZE } from "../../plot/utils/gridMarks.js";
import { limitError } from "../../plot/utils/limits.js";

/** A per-row field's `rows` rows of `stride` floats, past the `capacity` rows its buffer holds. */
const fieldCapacityError = (rows, capacity, stride) =>
  limitError("storage", {
    what: "a per-row channel",
    count: rows * stride * 4,
    limit: capacity * stride * 4,
  });

async function arrayToStorageBufferAttribute(renderer, array, bufferAttr) {
  if (array.dtype !== DType.Float32)
    throw new Error("GPU attributes require float32 data");
  if (array.size > bufferAttr.array.length)
    throw new Error(
      "GPU upload is larger than its destination (an internal error).",
    );
  if (array.size === 0) return;
  if (array.device === "webgpu" && renderer.backend.isWebGPUBackend) {
    const device = getWebGPUDevice();
    const held = array.ref;
    try {
      const sourceBuffer = await held.ref.gpuBuffer();
      const destinationBuffer = renderer.backend.get(bufferAttr).buffer;
      const commandEncoder = device.createCommandEncoder();
      commandEncoder.copyBufferToBuffer(
        sourceBuffer,
        0,
        destinationBuffer,
        0,
        array.size * 4,
      );
      const commandBuffer = commandEncoder.finish();
      device.queue.submit([commandBuffer]);
    } finally {
      held.dispose();
    }
  } else {
    bufferAttr.copyArray(await array.ref.data());
    bufferAttr.needsUpdate = true;
  }
}

/** A texture's resolution as a positive integer, or an error naming the value. */
export function normalizeTextureResolution(value) {
  const resolution = Math.floor(Number(value));
  if (!Number.isFinite(resolution) || resolution <= 0) {
    throw new Error(`Invalid texture resolution: ${value}`);
  }
  return resolution;
}

/**
 * A texel's source coordinate along one axis (a fractional row or column): evenly spread over
 * the source (texel centres to cell centres), or, with `flag` set, read from a remap table (a
 * grid table's uneven axis, TODO 51; utils/gridMarks.js) at `offset` in `remapNode`, sampled
 * linearly. `even` is the evenly spread coordinate. Returns [coordinate, its change per texture
 * width (for the derivatives)].
 */
function sourceCoordinate(texel, texResolution, size, remapNode, offset, flag, even) {
  const t = clamp(float(texel).add(0.5).div(float(texResolution)).mul(REMAP_SIZE).sub(0.5), 0, REMAP_SIZE - 1);
  const i0 = uint(floor(t)), i1 = min(i0.add(1), uint(REMAP_SIZE - 1));
  const a = remapNode.element(i0.add(offset)), b = remapNode.element(i1.add(offset));
  const remapped = flag.greaterThan(0.5);
  const coordinate = clamp(remapped.select(mix(a, b, fract(t)), even), 0, float(size).sub(1));
  const slope = remapped.select(b.sub(a).mul(REMAP_SIZE), float(size));
  return [coordinate, slope];
}

/** The most cells along either side of a grid that a Heatmap draws sharp by default. */
export const SHARP_CELLS = 64;

/**
 * Whether a Heatmap draws its cells sharp, each a flat square of its value (TODO 134.15):
 * `pixelated` true or false says so; unset (automatic), a grid of at most SHARP_CELLS cells
 * along each side is sharp and a finer one is blended, a sampled field more than a table.
 * @param {boolean | undefined} pixelated @param {number} width @param {number} height
 */
export function sharpCells(pixelated, width, height) {
  return pixelated ?? (width <= SHARP_CELLS && height <= SHARP_CELLS);
}

/**
 * A scalar field's texel: its value bilinearly from the source cells, and its derivatives per
 * texture width. Two channels are a value and its validity (a grid table's missing or hidden
 * cells, TODO 51): only valid cells are blended, and the alpha is the valid share, which the
 * Heatmap cuts at one half (the cells' edge). With `sharp` set, the texel takes its nearest
 * cell's value and validity, with no slope (sharpCells).
 */
const heatmapTSL = Fn(
  ({
    bufferNode,
    sourceWidth,
    sourceHeight,
    sourceChannels,
    targetTexture,
    texResolution,
    remapNode,
    remapX,
    remapY,
    sharp,
  }) => {
    const w = uint(sourceWidth), h = uint(sourceHeight), c = uint(sourceChannels), r = uint(texResolution);
    const px = instanceIndex.mod(r), py = instanceIndex.div(r);
    const evenX = float(px).add(0.5).mul(float(w)).div(float(r)).sub(0.5);
    const evenY = float(py).add(0.5).mul(float(h)).div(float(r)).sub(0.5);
    const [x, slopeX] = sourceCoordinate(px, r, w, remapNode, uint(0), remapX, evenX);
    const [y, slopeY] = sourceCoordinate(py, r, h, remapNode, uint(REMAP_SIZE), remapY, evenY);
    const x0 = uint(floor(x)), y0 = uint(floor(y)), x1 = min(x0.add(1), w.sub(1)), y1 = min(y0.add(1), h.sub(1));
    const tx = fract(x), ty = fract(y);
    const at = (i, j) => j.mul(w).add(i).mul(c);
    const value = (i, j) => float(bufferNode.element(at(i, j)));
    const valid = (i, j) => c.equal(2).select(float(bufferNode.element(at(i, j).add(1))), float(1));
    const [v00, v10, v01, v11] = [value(x0, y0), value(x1, y0), value(x0, y1), value(x1, y1)];
    const [m00, m10, m01, m11] = [valid(x0, y0), valid(x1, y0), valid(x0, y1), valid(x1, y1)];
    const w00 = float(1).sub(tx).mul(float(1).sub(ty)).mul(m00), w10 = tx.mul(float(1).sub(ty)).mul(m10);
    const w01 = float(1).sub(tx).mul(ty).mul(m01), w11 = tx.mul(ty).mul(m11);
    const cover = w00.add(w10).add(w01).add(w11);
    const blended = cover.greaterThan(1e-6).select(
      w00.mul(v00).add(w10.mul(v10)).add(w01.mul(v01)).add(w11.mul(v11)).div(cover.max(1e-6)), float(0));
    // A missing neighbour takes the blended value, so the slope stays the valid cells'.
    const fill = (v, m) => m.greaterThan(0.5).select(v, blended);
    const [f00, f10, f01, f11] = [fill(v00, m00), fill(v10, m10), fill(v01, m01), fill(v11, m11)];
    const dx = mix(f10.sub(f00), f11.sub(f01), ty).mul(slopeX);
    const dy = mix(f01.sub(f00), f11.sub(f10), tx).mul(slopeY);
    const xn = uint(floor(x.add(0.5))), yn = uint(floor(y.add(0.5))), mn = valid(xn, yn);
    const nearest = vec4(mn.greaterThan(0.5).select(value(xn, yn), float(0)), 0, 0, mn);
    textureStore(targetTexture, uvec2(px, py),
      sharp.greaterThan(0.5).select(nearest, vec4(blended, dx, dy, cover))).toWriteOnly();
  },
);

// RGB/RGBA samples use the same device-local storage-copy path as scalar maps.
const imageTSL = Fn(
  ({
    bufferNode,
    sourceWidth,
    sourceHeight,
    sourceChannels,
    targetTexture,
    texResolution,
    remapNode,
    remapX,
    remapY,
  }) => {
    const w = uint(sourceWidth),
      h = uint(sourceHeight),
      c = uint(sourceChannels),
      r = uint(texResolution);
    const px = instanceIndex.mod(r),
      py = instanceIndex.div(r);
    // Row zero at the top, unless a grid table's remap places the rows (TODO 51).
    const [x] = sourceCoordinate(px, r, w, remapNode, uint(0), remapX,
      float(px).add(0.5).mul(float(w)).div(float(r)).sub(0.5));
    const [y] = sourceCoordinate(py, r, h, remapNode, uint(REMAP_SIZE), remapY,
      float(r).sub(float(py)).sub(0.5).mul(float(h)).div(float(r)).sub(0.5));
    const x0 = uint(floor(x)),
      y0 = uint(floor(y)),
      x1 = min(x0.add(1), w.sub(1)),
      y1 = min(y0.add(1), h.sub(1));
    const sample = (channel) => {
      const ch = min(uint(channel), c.sub(1));
      return mix(
        mix(
          bufferNode.element(y0.mul(w).add(x0).mul(c).add(ch)),
          bufferNode.element(y0.mul(w).add(x1).mul(c).add(ch)),
          fract(x),
        ),
        mix(
          bufferNode.element(y1.mul(w).add(x0).mul(c).add(ch)),
          bufferNode.element(y1.mul(w).add(x1).mul(c).add(ch)),
          fract(x),
        ),
        fract(y),
      );
    };
    const linear = (v) =>
      v
        .lessThanEqual(0.04045)
        .select(v.div(12.92), v.add(0.055).div(1.055).pow(2.4));
    const alpha = c.equal(4).select(sample(3), float(1));
    textureStore(
      targetTexture,
      uvec2(px, py),
      vec4(linear(sample(0)), linear(sample(1)), linear(sample(2)), alpha),
    ).toWriteOnly();
  },
);

const pixelImageTSL = Fn(
  ({
    bufferNode,
    sourceWidth,
    sourceHeight,
    sourceChannels,
    targetTexture,
    texResolution,
    remapNode,
    remapX,
    remapY,
  }) => {
    const w = uint(sourceWidth),
      h = uint(sourceHeight),
      c = uint(sourceChannels),
      r = uint(texResolution);
    const px = instanceIndex.mod(r),
      py = instanceIndex.div(r);
    // Row zero at the top, unless a grid table's remap places the rows (TODO 51).
    const [x] = sourceCoordinate(px, r, w, remapNode, uint(0), remapX,
      float(px).add(0.5).mul(float(w)).div(float(r)).sub(0.5));
    const [y] = sourceCoordinate(py, r, h, remapNode, uint(REMAP_SIZE), remapY,
      float(r).sub(float(py)).sub(0.5).mul(float(h)).div(float(r)).sub(0.5));
    const x0 = uint(floor(x)),
      y0 = uint(floor(y)),
      x1 = min(x0.add(1), w.sub(1)),
      y1 = min(y0.add(1), h.sub(1));
    const sample = (channel) => {
      const ch = min(uint(channel), c.sub(1));
      return bufferNode.element(
        uint(floor(y.add(0.5)))
          .mul(w)
          .add(uint(floor(x.add(0.5))))
          .mul(c)
          .add(ch),
      );
    };
    const linear = (v) =>
      v
        .lessThanEqual(0.04045)
        .select(v.div(12.92), v.add(0.055).div(1.055).pow(2.4));
    const alpha = c.equal(4).select(sample(3), float(1));
    textureStore(
      targetTexture,
      uvec2(px, py),
      vec4(linear(sample(0)), linear(sample(1)), linear(sample(2)), alpha),
    ).toWriteOnly();
  },
);

class ArrayTexture extends THREE.StorageTexture {
  constructor(
    renderer, // Note: This is a bit inelegant, but we need the renderer to do GPU buffer copies
    resolution = 512,
    array = undefined,
    MAX_WIDTH = Infinity,
    MAX_HEIGHT = Infinity,
    MAX_CHANNELS = 4,
    image = false,
    pixelated = false,
  ) {
    resolution = normalizeTextureResolution(resolution);
    super(resolution, resolution);

    this.MAX_WIDTH = MAX_WIDTH;
    this.MAX_HEIGHT = MAX_HEIGHT;
    this.MAX_CHANNELS = MAX_CHANNELS;
    this.maxElements = 1;
    this.imageMode = image;
    this.pixelated = image && !!pixelated;
    // A scalar grid's cells: sharp, blended or (undefined) by each write's shape (sharpCells).
    /** @type {boolean | undefined} */
    this.cellMode = image ? false : pixelated;
    this.sharp = uniform(0);
    this.renderer = renderer;
    this.bufferAttr = new THREE.StorageBufferAttribute(this.maxElements, 1);
    this.bufferNode = storage(this.bufferAttr, "float", this.maxElements);

    this.sourceWidth = uniform(0);
    this.sourceHeight = uniform(0);
    this.sourceChannels = uniform(0);
    this.texResolution = uniform(resolution);
    // A grid table's remap tables (TODO 51): x then y, REMAP_SIZE entries each, used where set.
    this.remapAttr = new THREE.StorageBufferAttribute(2 * REMAP_SIZE, 1);
    this.remapNode = storage(this.remapAttr, "float", 2 * REMAP_SIZE);
    this.remapX = uniform(0);
    this.remapY = uniform(0);
    this.array = undefined;
    this.computeNode = this.createComputeNode(resolution);
    this.generateMipmaps = false;
    this.magFilter = this.pixelated ? THREE.NearestFilter : THREE.LinearFilter;
    this.minFilter = this.pixelated ? THREE.NearestFilter : THREE.LinearFilter;
    this.colorSpace = THREE.NoColorSpace;
    this.wrapS = THREE.ClampToEdgeWrapping;
    this.wrapT = THREE.ClampToEdgeWrapping;
    this.type = THREE.HalfFloatType;
    this.needsUpdate = true;

    if (array) {
      void this.write(array);
    }
  }

  createComputeNode(resolution = this.resolution) {
    return (
      this.imageMode ? (this.pixelated ? pixelImageTSL : imageTSL) : heatmapTSL
    )({
      bufferNode: this.bufferNode,
      sourceWidth: this.sourceWidth,
      sourceHeight: this.sourceHeight,
      sourceChannels: this.sourceChannels,
      targetTexture: this,
      texResolution: this.texResolution,
      remapNode: this.remapNode,
      remapX: this.remapX,
      remapY: this.remapY,
      sharp: this.sharp,
    }).compute(resolution * resolution);
  }

  /**
   * Place the source rows and columns by remap tables ({ x, y }: Float32Arrays of REMAP_SIZE
   * fractional indices, or null for an evenly spread axis; TODO 51). Resampled at once when
   * the texture holds data.
   */
  async setRemap(remap) {
    const x = remap?.x ?? null, y = remap?.y ?? null;
    if (x === this.remap?.x && y === this.remap?.y) return;
    this.remap = { x, y };
    if (x) this.remapAttr.array.set(x, 0);
    if (y) this.remapAttr.array.set(y, REMAP_SIZE);
    this.remapAttr.needsUpdate = true;
    this.remapX.value = x ? 1 : 0;
    this.remapY.value = y ? 1 : 0;
    if (this.array) await this.renderAnimatedTexture();
  }

  ensureStorageAttribute() {
    if (
      this.renderer.backend?.isWebGPUBackend &&
      !this.renderer.backend.has(this.bufferAttr)
    ) {
      this.renderer.backend.createStorageAttribute(this.bufferAttr);
    }
  }

  getDimensions(array = this.array) {
    const [height, width, channels = 1] = array.shape;

    if (
      !height ||
      !width ||
      channels > this.MAX_CHANNELS ||
      width > this.MAX_WIDTH ||
      height > this.MAX_HEIGHT
    ) {
      throw new Error(`Unsupported array shape: ${array.shape}`);
    }

    return { height, width, channels };
  }

  get resolution() {
    return this.texResolution.value;
  }

  set resolution(value) {
    throw new Error(
      "ArrayTexture resolution is immutable; create a new ArrayTexture instead.",
    );
  }

  async renderAnimatedTexture() {
    if (this.normalizedAttr) {
      const d = this.renderer.backend.device;
      this.normalizer ??= new NormalizeGPU(d);
      this.normalizer.run(this.renderer.backend.get(this.bufferAttr).buffer,
        this.renderer.backend.get(this.normalizedAttr).buffer, this.array.size, this.animationNormalization);
    }
    await this.renderer.computeAsync(this.computeNode);
  }

  async writeHeatmapTexture() {
    if (!this.array) return;

    const { height, width, channels } = this.getDimensions();

    this.ensureStorageAttribute();
    const shape = JSON.stringify(this.array.shape), clock = animationClock(this.renderer);
    const upload = async target => {
      const source = await this.array.ref.gpuBuffer();
      const device = this.renderer.backend.device, encoder = device.createCommandEncoder();
      encoder.copyBufferToBuffer(source, 0, target, 0, this.array.size * 4);
      device.queue.submit([encoder.finish()]);
    };
    // A procedural (@time) texture snaps, as animationPlan's suppressed components do.
    const suppressed = this.animationTag?.schemeReset || this.animationTag?.spec?.components?.some((component) => component?.suppressed);
    if (this.animationRaw && !suppressed && clock.active(this.animationTag?.owner) && this.animationShape === shape) {
      const output = this.renderer.backend.get(this.bufferAttr).buffer;
      if (!this.transition || this.transition.output !== output || this.transition.count !== this.array.size) {
        this.transition?.dispose();
        this.transition = new BufferTransition(this.renderer, this.animationTag?.owner, output, this.array.size, async () => {
          await this.renderAnimatedTexture(); await this.animationTag?.changed?.();
        }, this.imageMode && this.array.shape.at(-1) === 4);
      }
      await this.transition.prepare(upload);
    } else {
      this.transition?.dispose(); this.transition = undefined;
      await arrayToStorageBufferAttribute(this.renderer, this.array, this.bufferAttr);
    }
    this.animationShape = shape;
    this.sourceHeight.value = height;
    this.sourceWidth.value = width;
    this.sourceChannels.value = channels;
    this.sharp.value = !this.imageMode && sharpCells(this.cellMode, width, height) ? 1 : 0;
    await this.renderAnimatedTexture();
  }

  async write(array, normalization = "auto") {
    if (array.refCount <= 0) {
      console.warn(
        "Attempting to write from an array that has been disposed. Ignoring.",
      );
      return; // Array has been disposed, do nothing
    }
    this.getDimensions(array);
    if (array.size > this.maxElements) {
      const limit = getWebGPUDevice().limits.maxStorageBufferBindingSize / 4;
      if (array.size > limit)
        throw limitError("storage", {
          component: this.imageMode ? "Image" : "Heatmap",
          what: this.imageMode ? "its image" : "its grid",
          count: array.size * 4,
          limit: limit * 4,
          hint: "Use smaller tiles.",
        });
      const oldBuffer = this.bufferAttr,
        oldCompute = this.computeNode;
      this.maxElements = Math.min(limit, 2 ** Math.ceil(Math.log2(array.size)));
      this.bufferAttr = new THREE.StorageBufferAttribute(this.maxElements, 1);
      this.bufferNode = storage(this.bufferAttr, "float", this.maxElements);
      this.computeNode = this.createComputeNode();
      await getWebGPUDevice().queue.onSubmittedWorkDone();
      releaseAttribute(this.renderer, oldBuffer);
      oldCompute?.dispose?.();
    }

    this.array?.dispose();
    this.array = undefined;
    const raw = this.animationRaw || animationEnabled(this.animationTag?.owner);
    if (raw && !this.animationRaw && this.rawArray && JSON.stringify(this.rawArray.shape) === JSON.stringify(array.shape)) {
      this.ensureStorageAttribute();
      await arrayToStorageBufferAttribute(this.renderer, this.rawArray, this.bufferAttr);
      this.animationShape = JSON.stringify(array.shape);
    } else if (raw !== this.animationRaw) this.animationShape = null;
    this.rawArray?.dispose(); this.rawArray = array.ref;
    if ((this.imageMode ? "none" : normalization) !== this.animationNormalization) this.animationShape = null;
    this.animationRaw = !!raw;
    this.animationNormalization = this.imageMode ? "none" : normalization;
    if (raw && this.animationNormalization !== "none") {
      if (!this.normalizedAttr || this.normalizedAttr.array.length < this.maxElements) {
        if (this.normalizedAttr) releaseAttribute(this.renderer, this.normalizedAttr);
        this.normalizedAttr = new THREE.StorageBufferAttribute(this.maxElements, 1);
        this.renderer.backend.createStorageAttribute(this.normalizedAttr);
      }
      if (this.normalizedNodeSource !== this.normalizedAttr) {
        this.normalizedNodeSource = this.normalizedAttr;
        this.bufferNode = storage(this.normalizedAttr, "float", this.maxElements);
        this.computeNode?.dispose?.(); this.computeNode = this.createComputeNode();
      }
    } else if (this.normalizedAttr) {
      releaseAttribute(this.renderer, this.normalizedAttr); this.normalizedAttr = undefined;
      this.bufferNode = storage(this.bufferAttr, "float", this.maxElements);
      this.computeNode?.dispose?.(); this.computeNode = this.createComputeNode();
    }
    this.array = normalizeTexture(array, raw ? "none" : this.animationNormalization);
    await this.writeHeatmapTexture();
  }

  dispose() {
    releaseAttribute(this.renderer, this.remapAttr);
    this.transition?.dispose(); this.normalizer?.dispose();
    if (this.normalizedAttr) releaseAttribute(this.renderer, this.normalizedAttr);
    super.dispose();
    releaseAttribute(this.renderer, this.bufferAttr);
    this.computeNode?.dispose?.();
    this.computeNode = null;
    this.array?.dispose?.(); this.rawArray?.dispose();
    this.array = undefined; this.rawArray = undefined;
  }
}

class ArrayInstancedBufferAttribute
  extends THREE.StorageInstancedBufferAttribute
{
  constructor(renderer, maxElements, channels = 1, array) {
    super(maxElements, channels === 3 ? 4 : channels);
    this.renderer = renderer;
    this.maxElements = maxElements;
    this.channels = channels;
    this.length = uniform(0);

    if (array) {
      this.write(array);
    }
  }

  ensureStorageAttribute() {
    if (
      this.renderer.backend?.isWebGPUBackend &&
      !this.renderer.backend.get(this).buffer
    ) {
      this.renderer.backend.createStorageAttribute(this);
    }
  }

  getDimensions(array = this.sourceArray) {
    const dims = [...array.shape];
    if (dims[0] === 0) return { length: 0, channels: this.channels };
    let channels = 1;
    if (this.channels > 1) {
      channels = dims.pop() || 1;
    }

    let length = dims.shift() || 1;
    for (const dim of dims) {
      length *= dim;
    }

    if (length > this.maxElements)
      throw fieldCapacityError(
        length,
        this.maxElements,
        this.channels === 3 ? 4 : this.channels,
      );
    if (channels != this.channels) {
      throw new Error(
        `Array has unsupported channels (${channels}), expected (${this.channels})`,
      );
    }

    return { length, channels };
  }

  /**
   * How each component of this field moves on a data write, or null to snap. The consuming
   * mark's spec (`animationTag.spec`, per component so x, y and z are independent) gives explicit
   * animate()/tween components, which run regardless of the mark's animation switch, and
   * suppressed (procedural @time) components, which snap; every other component follows the
   * mark's implicit transition. Derived channels (categorical codes) only move when a spec
   * asks for it.
   */
  animationPlan(owner, stride) {
    if (this.animationTag?.schemeReset) return null;
    const clock = animationClock(this.renderer), spec = this.animationTag?.spec;
    const explicitRuns = clock.running({ explicit: true, owner });
    const implicitRuns = !this.animationTag?.derived && clock.active(owner);
    const components = [0, 1, 2, 3].map((c) => {
      const entry = spec?.components?.[c];
      if (entry?.suppressed) return { mode: 0 };
      if (entry?.explicit)
        return explicitRuns && entry.duration > 0 ? { mode: 1, duration: entry.duration, easing: entry.easing, explicit: true } : { mode: 0 };
      return implicitRuns
        ? { mode: 1, duration: owner.options.get("animationDuration"), easing: owner.options.get("animationEasing") }
        : { mode: 0 };
    });
    if (!components.slice(0, stride).some((component) => component.mode)) return null;
    // A live drag's write (TODO 38 decision 7): rows whose value changed arrive at once
    // (mode 2); the others keep their motion.
    if (this.animationTag?.arrive) for (const component of components) if (component.mode) component.mode = 2;
    const kinds = [0, 1, 2, 3].map((c) => spec?.kinds?.[c] ?? this.animationTag?.kinds?.[c] ?? 0);
    return { stride, kinds, components, explicit: components.some((component) => component.mode && component.explicit) };
  }

  async write(array) {
    const { length, channels } = this.getDimensions(array);
    let uploadArray = array;
    if (channels == 3) {
      uploadArray = np.pad(array.ref, { "-1": [0, 1] }); // THREE StorageBufferAttributes must have a channel count of 1, 2, or 4. Pad vec3 data to a four-float stride; the unused fourth component is zero.
    }
    this.sourceArray = array;

    this.ensureStorageAttribute();
    this.length.value = length;
    try {
      const floatArray = uploadArray.ref.astype(DType.Float32);
      try {
        const shape = JSON.stringify(array.shape), stride = channels === 3 ? 4 : channels;
        const owner = this.animationTag?.owner, staging = this.animationTag?.staging;
        const output = this.renderer.backend.get(this).buffer;
        if (this.transition && this.transition.output !== output) { this.transition.dispose(); this.transition = undefined; }
        const plan = owner ? this.animationPlan(owner, stride) : null;
        const upload = async target => {
          if (!floatArray.size) return;
          const source = await floatArray.ref.gpuBuffer();
          const device = this.renderer.backend.device, encoder = device.createCommandEncoder();
          encoder.copyBufferToBuffer(source, 0, target, 0, floatArray.size * 4);
          device.queue.submit([encoder.finish()]);
        };
        try {
          if (staging && this.transition) {
            // A keyed update's staging frame: rows keep their on-screen state under their
            // new index (reindex) and never animate here; rows that do not line up snap.
            // Each staging frame re-orders a field once, however many writes it sees.
            if (this.transition.staged !== staging) {
              const aligned = staging.rows === length &&
                this.transition.count === staging.oldRows * stride;
              if (aligned) await this.transition.reindex(staging.index, upload, floatArray.size);
              else await this.transition.prepare(upload, { snap: true, count: floatArray.size });
              this.transition.staged = staging;
            }
          } else if (plan && !staging && this.animationShape === shape) {
            this.transition ??= new RowTransition(this.renderer, owner, output, floatArray.size, () => this.animationTag?.changed?.(), plan);
            // A padded mark's rows that were hidden (-1 in snapRows) take their new values at
            // once; the others keep their state and retarget below (TODO 32.12).
            const snapRows = this.animationTag?.snapRows;
            if (snapRows && snapRows.shape[0] === length && this.transition.count === floatArray.size)
              await this.transition.reindex(snapRows, upload, floatArray.size);
            await this.transition.prepare(upload, { spec: plan, count: floatArray.size });
          } else if (this.transition) {
            // Keep the transition across snaps and row-count changes; its buffers only grow.
            await this.transition.prepare(upload, { snap: true, count: floatArray.size });
          } else await arrayToStorageBufferAttribute(this.renderer, floatArray, this);
        } catch (error) {
          if (error.code !== "limit.animation") throw error;
          // Too large to animate on this device: draw the new values directly.
          const animation = owner ? markAnimation(owner) : null;
          if (!animation?.limitWarned) {
            if (animation) animation.limitWarned = true;
            console.warn(`limit.animation: ${error.message} The mark updates without animation.`);
          }
          this.transition?.dispose(); this.transition = undefined;
          await arrayToStorageBufferAttribute(this.renderer, floatArray, this);
        }
        this.animationShape = shape;
      } finally {
        floatArray.dispose();
      }
    } finally {
      if (uploadArray !== array) {
        uploadArray.dispose();
      }
    }
  }

  /**
   * Write `rows` rows of host data (a Float32Array, `channels` numbers a row) straight into the
   * GPU buffer (TODO 63.6): one queue.writeBuffer, no jax array or kernel. Three numbers a row are
   * spread to the buffer's four. No transition: a field that animates writes through write().
   */
  writeHost(array, rows) {
    if (rows > this.maxElements) throw fieldCapacityError(rows, this.maxElements, this.channels === 3 ? 4 : this.channels);
    if (this.transition) throw new Error("A field with a transition takes write(), not writeHost().");
    this.ensureStorageAttribute();
    this.length.value = rows;
    if (!rows) return;
    const stride = this.channels === 3 ? 4 : this.channels;
    let data = array.subarray(0, rows * this.channels);
    if (this.channels === 3) {
      if (padding.length < rows * 4) padding = new Float32Array(2 ** Math.ceil(Math.log2(rows * 4)));
      for (let i = 0; i < rows; i++) {
        padding[4 * i] = array[3 * i];
        padding[4 * i + 1] = array[3 * i + 1];
        padding[4 * i + 2] = array[3 * i + 2];
        padding[4 * i + 3] = 0;
      }
      data = padding.subarray(0, rows * 4);
    }
    this.renderer.backend.device.queue.writeBuffer(this.renderer.backend.get(this).buffer, 0, data.buffer, data.byteOffset, rows * stride * 4);
  }

  dispose() {
    this.transition?.dispose();
    releaseAttribute(this.renderer, this);

    this.sourceArray = null;
  }
}
// writeHost's rows spread to four numbers, reused (writeBuffer copies at once).
let padding = new Float32Array(0);

export { ArrayInstancedBufferAttribute, ArrayTexture, arrayToStorageBufferAttribute };
