import { observeShaderBuilds } from "./shaderBuilds.js";

export function diagnostic(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.diagnostic = { code, ...details };
  return error;
}

/**
 * One diagnostic (TODO 136.6): every layer reports errors and warnings in this shape, and
 * runtime.diagnostics(), hm.check, the exported page and the widget read it. A plain string or an
 * Error becomes one; a message that opens "Component.property:" or "Component:" names its source.
 * @typedef {{severity: "error" | "warning" | "lint", code: string, component?: string,
 *   node?: string, property?: string, message: string, hint?: string}} Diagnostic
 * @param {unknown} value a string, an Error (one diagnostic() made carries its details) or a Diagnostic
 * @param {Partial<Diagnostic>} [defaults] what the reporter knows: its component, node, severity
 * @returns {Diagnostic | null}
 */
export function toDiagnostic(value, defaults = {}) {
  if (value === null || value === undefined || value === "") return null;
  const error = /** @type {any} */ (value);
  if (error.severity && error.message) return { ...defaults, ...error };
  const source = error?.diagnostic ?? {};
  const message = typeof value === "string" ? value : String(error?.message ?? value);
  const named = /^([A-Z]\w*)(?:\.(\w+))?: /.exec(message);
  return {
    severity: defaults.severity ?? "error",
    code: error?.code ?? source.code ?? defaults.code ?? "error",
    component: source.component ?? defaults.component ?? named?.[1],
    node: source.node ?? defaults.node,
    property: source.property ?? defaults.property ?? named?.[2],
    message,
    hint: source.suggestion ?? defaults.hint,
  };
}

export function diagnosticPayload(error) {
  const source = error?.diagnostic ?? {};
  return {
    code: error?.code ?? source.code ?? "frontend",
    message: error?.message ?? String(error),
    diagnostic: {
      component: source.component,
      property: source.property,
      scope: source.scope,
      field: source.field,
      shape: source.shape,
      suggestion: source.suggestion,
      details: source.details,
    },
  };
}

const distance = (a, b) => {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let prior = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const saved = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        prior + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prior = saved;
    }
  }
  return row[b.length];
};

export function fieldHelp(scope, field) {
  const columns = scope?.keys?.() ?? scope?.columns?.() ?? [];
  const available = [...columns].map(String).slice(0, 12);
  const match = available
    .map((value) => [value, distance(String(field), value)])
    .sort((a, b) => a[1] - b[1])[0];
  return {
    available,
    suggestion:
      match && match[1] <= Math.max(2, String(field).length / 3)
        ? `Did you mean ${JSON.stringify(match[0])}?`
        : available.length
          ? `Available columns: ${available.join(", ")}.`
          : "Supply the field in the active Data scope or pass an array directly.",
  };
}

// Opt-in measurements. No synchronization or array reads are introduced.
/** @type {WeakMap<GPUDevice, import("./diagnosticsTypes.js").DeviceObservation>} */
const devices = new WeakMap();
/** @param {GPUDevice} device @returns {import("./diagnosticsTypes.js").DeviceObservation} */
export function observeDevice(device) {
  let state = devices.get(device);
  if (state) {
    state.refs++;
    return state;
  }
  const counters = {
    buffers: 0,
    bufferBytes: 0,
    peakBufferBytes: 0,
    textures: 0,
    shaderModules: 0,
    shaderBytes: 0,
    maxShaderBytes: 0,
    pipelines: 0,
    writeBytes: 0,
    submissions: 0,
  };
  const errors = [],
    restore = [];
  const patch = (object, key, wrap) => {
    const previous = object[key];
    object[key] = wrap(previous.bind(object));
    restore.push(() => (object[key] = previous));
  };
  const error = (kind, message) => {
    errors.push({ kind, message, time: performance.now() });
    if (errors.length > 64) errors.shift();
  };
  patch(device, "createBuffer", (original) => (descriptor) => {
    const b = original(descriptor);
    counters.buffers++;
    counters.bufferBytes += descriptor.size;
    counters.peakBufferBytes = Math.max(
      counters.peakBufferBytes,
      counters.bufferBytes,
    );
    const destroy = b.destroy.bind(b);
    let alive = true;
    b.destroy = () => {
      if (alive) {
        alive = false;
        counters.buffers--;
        counters.bufferBytes -= descriptor.size;
      }
      return destroy();
    };
    return b;
  });
  patch(device, "createTexture", (original) => (descriptor) => {
    const t = original(descriptor);
    counters.textures++;
    const destroy = t.destroy.bind(t);
    let alive = true;
    t.destroy = () => {
      if (alive) {
        alive = false;
        counters.textures--;
      }
      return destroy();
    };
    return t;
  });
  patch(device, "createShaderModule", (original) => (descriptor) => {
    counters.shaderModules++;
    counters.shaderBytes += descriptor.code.length;
    counters.maxShaderBytes = Math.max(
      counters.maxShaderBytes,
      descriptor.code.length,
    );
    return original(descriptor);
  });
  for (const key of [
    "createRenderPipeline",
    "createRenderPipelineAsync",
    "createComputePipeline",
    "createComputePipelineAsync",
  ])
    patch(device, key, (original) => (descriptor) => {
      counters.pipelines++;
      return original(descriptor);
    });
  patch(
    device.queue,
    "writeBuffer",
    (original) => (buffer, offset, data, dataOffset, size) => {
      counters.writeBytes +=
        (size ??
          data.byteLength / (data.BYTES_PER_ELEMENT ?? 1) - (dataOffset ?? 0)) *
        (data.BYTES_PER_ELEMENT ?? 1);
      return original(buffer, offset, data, dataOffset, size);
    },
  );
  patch(device.queue, "submit", (original) => (commands) => {
    counters.submissions++;
    return original(commands);
  });
  const onerror = (e) => error("gpu", e.error?.message ?? String(e));
  device.addEventListener("uncapturederror", onerror);
  state = {
    refs: 1,
    counters,
    errors,
    lost: false,
    release() {
      if (--state.refs) return;
      restore.reverse().forEach((f) => f());
      device.removeEventListener("uncapturederror", onerror);
      devices.delete(device);
    },
  };
  device.lost.then((info) => {
    state.lost = true;
    error("device-lost", info.message || info.reason);
  });
  devices.set(device, state);
  return state;
}
/**
 * Instrument `renderer` for its view (view.diagnostics.instrumentation); a second call for the
 * same renderer returns the same instrumentation. Disposing it releases the view's capability
 * only while it is still the view's.
 * @param {import("./internalTypes.js").PlotRenderer} renderer
 * @param {import("./internalTypes.js").ViewDiagnostics} owner
 * @returns {import("./diagnosticsTypes.js").RendererDiagnostics}
 */
export function enableDiagnostics(renderer, owner) {
  const current = owner.instrumentation.current;
  if (current?.renderer === renderer) return current;
  const state = observeDevice(renderer.backend.device);
  const shaders = observeShaderBuilds(renderer);
  /** @type {Record<string, number[]>} */
  const samples = {};
  /** @type {Record<string, number>} */
  const last = {};
  /** @type {import("./diagnosticsTypes.js").RendererDiagnostics["sample"]} */
  const sample = (kind, ms) => {
    const now = performance.now();
    if (ms === undefined) {
      if (last[kind] !== undefined) ms = now - last[kind];
      last[kind] = now;
    }
    if (ms !== undefined) {
      const values = (samples[kind] ??= []);
      values.push(ms);
      if (values.length > 512) values.shift();
    }
  };
  /** @returns {Record<string, import("./diagnosticsTypes.js").TimingSummary>} */
  const summary = () =>
    Object.fromEntries(
      Object.entries(samples).map(([key, values]) => {
        const sorted = [...values].sort((a, b) => a - b);
        return [
          key,
          {
            count: sorted.length,
            p50: sorted[Math.floor(sorted.length * 0.5)],
            p95: sorted[Math.floor(sorted.length * 0.95)],
            max: sorted.at(-1),
          },
        ];
      }),
    );
  let disposed = false,
    release = () => {};
  /** @type {import("./diagnosticsTypes.js").RendererDiagnostics} */
  const diagnostics = {
    renderer,
    sample,
    pickingMaterial: shaders.picking,
    snapshot: () => ({
      gpu: { ...state.counters },
      shaders: shaders.snapshot(),
      errors: [...state.errors],
      lost: state.lost,
      timing: summary(),
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      shaders.dispose();
      state.release();
      release();
    },
  };
  release = owner.instrumentation.install(diagnostics);
  return diagnostics;
}
