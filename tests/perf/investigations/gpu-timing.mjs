// GPU pass timing with WebGPU timestamp queries, for lorenz-profile.mjs and sunburst-profile.mjs
// (SUNBURST_GPU_TIMING=1). While recording, every compute and render pass that does not write its
// own timestamps gets a begin/end pair in its encoder's query set; finish() resolves the pairs and
// submit() reads them back. Launch Chrome with gpuTimingArgs, or timestamps are quantized. The
// queries, buffers and readbacks are extra work: time GPU passes as a condition of their own, not
// together with CPU profiles or GPU counters (which would count the query readbacks).
//
//   await page.addInitScript(installGpuTiming);   // before the page requests its device
//   await startGpuTiming(page); ...frames...; const gpu = await stopGpuTiming(page, frames);

export const gpuTimingArgs = ["--enable-webgpu-developer-features"];

/** Runs in the page before any script: asks for timestamp-query and wraps pass encoding. */
export function installGpuTiming() {
  if (window.__gpuTiming) return;
  // Passes timed per command encoder; later passes in a larger encoder count as untimed.
  const capacity = 128;
  const state = (window.__gpuTiming = {
    enabled: false,
    record: false,
    passes: [],
    untimed: 0,
    pending: 0,
    errors: 0,
  });
  const requestDevice = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = function (descriptor = {}) {
    if (this.features.has("timestamp-query")) {
      descriptor = {
        ...descriptor,
        requiredFeatures: [
          ...(descriptor.requiredFeatures ?? []),
          "timestamp-query",
        ],
      };
      state.enabled = true;
    }
    return requestDevice.call(this, descriptor);
  };
  const devices = new WeakMap(),
    encoders = new WeakMap(),
    buffers = new WeakMap();
  const createCommandEncoder = GPUDevice.prototype.createCommandEncoder;
  GPUDevice.prototype.createCommandEncoder = function (descriptor) {
    const encoder = createCommandEncoder.call(this, descriptor);
    if (this.features.has("timestamp-query")) devices.set(encoder, this);
    return encoder;
  };
  for (const [name, kind] of [
    ["beginComputePass", "compute"],
    ["beginRenderPass", "render"],
  ]) {
    const begin = GPUCommandEncoder.prototype[name];
    GPUCommandEncoder.prototype[name] = function (descriptor = {}) {
      const device = devices.get(this);
      if (state.record && device && !descriptor.timestampWrites) {
        let timed = encoders.get(this);
        if (!timed)
          encoders.set(
            this,
            (timed = {
              querySet: device.createQuerySet({
                type: "timestamp",
                count: 2 * capacity,
              }),
              kinds: [],
            }),
          );
        if (timed.kinds.length < capacity) {
          const index = 2 * timed.kinds.length;
          timed.kinds.push(kind);
          descriptor = {
            ...descriptor,
            timestampWrites: {
              querySet: timed.querySet,
              beginningOfPassWriteIndex: index,
              endOfPassWriteIndex: index + 1,
            },
          };
        } else state.untimed++;
      }
      return begin.call(this, descriptor);
    };
  }
  const finish = GPUCommandEncoder.prototype.finish;
  GPUCommandEncoder.prototype.finish = function (descriptor) {
    const timed = encoders.get(this);
    if (!timed) return finish.call(this, descriptor);
    const device = devices.get(this),
      size = 16 * timed.kinds.length;
    const resolve = device.createBuffer({
      size,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });
    const read = device.createBuffer({
      size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    this.resolveQuerySet(timed.querySet, 0, 2 * timed.kinds.length, resolve, 0);
    this.copyBufferToBuffer(resolve, 0, read, 0, size);
    const commands = finish.call(this, descriptor);
    buffers.set(commands, { ...timed, resolve, read });
    return commands;
  };
  const submit = GPUQueue.prototype.submit;
  GPUQueue.prototype.submit = function (commandBuffers) {
    const result = submit.call(this, commandBuffers);
    for (const commands of commandBuffers) {
      const entry = buffers.get(commands);
      if (!entry) continue;
      state.pending++;
      entry.read
        .mapAsync(GPUMapMode.READ)
        .then(() => {
          const times = new BigUint64Array(entry.read.getMappedRange());
          entry.kinds.forEach((kind, i) =>
            state.passes.push([
              kind,
              Number(times[2 * i]),
              Number(times[2 * i + 1]),
            ]),
          );
          entry.read.unmap();
        })
        .catch(() => state.errors++)
        .finally(() => {
          state.pending--;
          entry.read.destroy();
          entry.resolve.destroy();
          entry.querySet.destroy();
        });
    }
    return result;
  };
}

/** Starts timing the passes encoded from now on. */
export const startGpuTiming = (page) =>
  page.evaluate(() => {
    const state = window.__gpuTiming;
    Object.assign(state, { passes: [], untimed: 0, errors: 0, record: true });
  });

/**
 * Stops timing, waits for the outstanding readbacks and summarizes the passes: GPU busy time (the
 * union of the pass intervals, so overlapping passes count once) in total and per frame, the
 * longest pass and the time by pass kind. Null when the device has no timestamp-query.
 */
export async function stopGpuTiming(page, frames) {
  await page.evaluate(() => {
    window.__gpuTiming.record = false;
  });
  await page.waitForFunction(() => window.__gpuTiming.pending === 0, null, {
    timeout: 10000,
  });
  const state = await page.evaluate(() => {
    const { enabled, passes, untimed, errors } = window.__gpuTiming;
    return { enabled, passes, untimed, errors };
  });
  if (!state.enabled) return null;
  // A pass whose timestamps did not advance (an empty pass, or a write the GPU skipped) is dropped.
  const passes = state.passes
    .filter(([, begin, end]) => end > begin)
    .sort((a, b) => a[1] - b[1]);
  let busy = 0,
    reached = -Infinity,
    longest = 0;
  const kinds = {};
  for (const [kind, begin, end] of passes) {
    if (end > reached) {
      busy += end - Math.max(begin, reached);
      reached = end;
    }
    longest = Math.max(longest, end - begin);
    kinds[kind] ??= { passes: 0, ms: 0 };
    kinds[kind].passes++;
    kinds[kind].ms += (end - begin) / 1e6;
  }
  const round = (value, digits = 3) => Number(value.toFixed(digits));
  return {
    frames,
    passes: passes.length,
    dropped: state.passes.length - passes.length,
    untimed: state.untimed,
    readbackErrors: state.errors,
    busyMs: round(busy / 1e6),
    msPerFrame: frames ? round(busy / 1e6 / frames) : null,
    longestPassMs: round(longest / 1e6),
    byKind: Object.fromEntries(
      Object.entries(kinds).map(([kind, { passes, ms }]) => [
        kind,
        { passes, ms: round(ms) },
      ]),
    ),
  };
}
