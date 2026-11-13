// GPU work counters for churn measurements (TODO Stage 17.0): pipelines, shader modules, buffer
// allocations and readbacks on every GPUDevice in the page (jax-js and three share one), queue
// submits and completion waits (onSubmittedWorkDone, TODO 65.0), plus a CPU-profile classifier
// that attributes samples to packages by resolved module path.
//
//   await page.addInitScript(installGpuCounters);
//   const before = await gpuCounters(page); ...gesture...; const work = countersDelta(before, await gpuCounters(page));

/** Capture device validation failures: an invalid draw can still increment completed frames. */
export function installGpuErrors() {
  if (window.__gpuErrors) return;
  window.__gpuErrors = [];
  const request = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = async function (...args) {
    const device = await request.apply(this, args);
    device.addEventListener("uncapturederror", event => window.__gpuErrors.push(event.error.message));
    return device;
  };
}

/**
 * Runs in the page before any script (page.addInitScript). Render pipelines are recorded by
 * their FULL descriptor (both WGSL stages, layouts, vertex buffers, primitive, depth/stencil,
 * multisample incl. alphaToCoverage, and fragment targets) as well as by WGSL alone, so a
 * "distinct" count cannot merge pipelines that differ only in blend or depth state.
 */
export function installGpuCounters() {
  if (window.__gpuCounters) return;
  const state = {
    compute: 0, render: 0, shaders: 0, buffers: 0, bufferBytes: 0,
    // Bytes of buffers created and not yet destroyed (17.11 soak).
    liveBytes: 0,
    readbacks: { jax: 0, picking: 0, three: 0, app: 0, other: 0 }, readbackMs: [],
    submits: 0, fences: 0, fenceSources: {},
    renderKeys: [], renderWgsl: [], computeKeys: [],
  };
  const codes = new Map(), moduleCode = new WeakMap(), layoutKeys = new WeakMap();
  const intern = (code) => {
    let id = codes.get(code);
    if (id === undefined) codes.set(code, (id = codes.size));
    return id;
  };
  const device = GPUDevice.prototype;
  const wrap = (name, after) => {
    const original = device[name];
    if (!original) return;
    device[name] = function (...args) {
      const result = original.apply(this, args);
      after(result, ...args);
      return result;
    };
  };
  wrap("createShaderModule", (module, descriptor) => {
    state.shaders++;
    moduleCode.set(module, intern(descriptor.code));
  });
  wrap("createBindGroupLayout", (layout, descriptor) => layoutKeys.set(layout, JSON.stringify(descriptor.entries)));
  wrap("createPipelineLayout", (layout, descriptor) =>
    layoutKeys.set(layout, `[${descriptor.bindGroupLayouts.map((item) => layoutKeys.get(item) ?? "?").join(",")}]`));
  const sizes = new WeakMap();
  wrap("createBuffer", (buffer, descriptor) => {
    state.buffers++;
    state.bufferBytes += descriptor.size;
    state.liveBytes += descriptor.size;
    sizes.set(buffer, descriptor.size);
  });
  const destroy = GPUBuffer.prototype.destroy;
  GPUBuffer.prototype.destroy = function () {
    const size = sizes.get(this);
    if (size !== undefined) { state.liveBytes -= size; sizes.delete(this); }
    return destroy.call(this);
  };
  const stage = (value) => value && {
    module: moduleCode.get(value.module), entryPoint: value.entryPoint, constants: value.constants,
    buffers: value.buffers, targets: value.targets,
  };
  const renderKey = (descriptor) => JSON.stringify({
    layout: descriptor.layout === "auto" ? "auto" : layoutKeys.get(descriptor.layout),
    vertex: stage(descriptor.vertex), fragment: stage(descriptor.fragment),
    primitive: descriptor.primitive, depthStencil: descriptor.depthStencil, multisample: descriptor.multisample,
  });
  for (const name of ["createRenderPipeline", "createRenderPipelineAsync"])
    wrap(name, (_, descriptor) => {
      state.render++;
      state.renderKeys.push(renderKey(descriptor));
      state.renderWgsl.push(`${moduleCode.get(descriptor.vertex?.module)}:${moduleCode.get(descriptor.fragment?.module)}`);
    });
  for (const name of ["createComputePipeline", "createComputePipelineAsync"])
    wrap(name, (_, descriptor) => {
      state.compute++;
      state.computeKeys.push(`${moduleCode.get(descriptor.compute?.module)}:${descriptor.compute?.entryPoint}`);
    });
  const mapAsync = GPUBuffer.prototype.mapAsync;
  GPUBuffer.prototype.mapAsync = function (mode, ...rest) {
    const promise = mapAsync.call(this, mode, ...rest);
    if (mode & GPUMapMode.READ) {
      const start = performance.now(), stack = new Error().stack ?? "";
      const kind = /mapAsyncRead/.test(stack) ? "jax"
        : /\/src\/lib\/picking\//.test(stack) ? "picking"
        : /getArrayBufferAsync|copyTextureToBuffer|resolveQueriesAsync/.test(stack) ? "three"
        : /\/src\/lib\//.test(stack) ? "app" : "other";
      state.readbacks[kind]++;
      promise.then(() => state.readbackMs.push(performance.now() - start), () => {});
    }
    return promise;
  };
  const queue = GPUQueue.prototype, submit = queue.submit, done = queue.onSubmittedWorkDone;
  queue.submit = function (...args) { state.submits++; return submit.apply(this, args); };
  queue.onSubmittedWorkDone = function (...args) {
    state.fences++;
    // The first library file on the stack: who waits.
    const source = /\/src\/lib\/(?:[\w-]+\/)*([\w-]+\.(?:js|ts|svelte))/.exec(new Error().stack ?? "")?.[1] ?? "other";
    state.fenceSources[source] = (state.fenceSources[source] ?? 0) + 1;
    return done.apply(this, args);
  };
  window.__gpuCounters = {
    state,
    snapshot: () => ({
      compute: state.compute, render: state.render, shaders: state.shaders,
      buffers: state.buffers, bufferBytes: state.bufferBytes, liveBytes: state.liveBytes,
      readbacks: Object.values(state.readbacks).reduce((a, b) => a + b, 0), readbackKinds: { ...state.readbacks },
      readbackMs: state.readbackMs.length, renderKeys: state.renderKeys.length, computeKeys: state.computeKeys.length,
      submits: state.submits, fences: state.fences, fenceSources: { ...state.fenceSources },
      builds: window.__markBuilds ?? 0, time: performance.now(),
    }),
    /** Readback latencies (ms) recorded since `from` (a snapshot's readbackMs index). */
    latencies: (from = 0) => state.readbackMs.slice(from),
    /** Created vs distinct pipelines since the given snapshot indices. */
    distinct(from = { renderKeys: 0, computeKeys: 0 }) {
      const render = state.renderKeys.slice(from.renderKeys), wgsl = state.renderWgsl.slice(from.renderKeys);
      const compute = state.computeKeys.slice(from.computeKeys);
      return {
        render: render.length, renderDistinct: new Set(render).size, renderDistinctByWgsl: new Set(wgsl).size,
        compute: compute.length, computeDistinct: new Set(compute).size,
      };
    },
  };
}

/**
 * Count mark build() calls from now on (window.__markBuilds, reported as `builds`; per class in
 * window.__markBuildsByClass). Mark classes override build() without calling the base, so
 * every class that defines its own build() is wrapped.
 *
 * It wraps the classes of /src/lib/plot/objects/*.js as imported by URL. A dev server that has
 * seen edits serves the edited modules to the app with a `?t=` timestamp, which is another
 * module instance: the app's classes are then not wrapped and every count reads 0. Run against
 * a fresh dev server (Playwright starts one when none is running). On such a server this throws
 * instead of letting a "no builds" assertion pass on a count that never moves (TODO 32.13): it
 * reads the mark components' import specifiers, where a hot-reloaded object module has `?t=`.
 */
export async function countMarkBuilds(page) {
  await page.evaluate(async () => {
    if (window.__markBuildsHooked) return;
    // The components that import the object modules name a hot-reloaded one with `?t=`.
    const importers = ["anchor", "arrows", "heatmap", "label", "labels", "line", "polarRect", "prism",
      "scatter3d", "scatterPoints", "segments", "surface", "uncertainty"]
      .map((name) => `/src/lib/plot/marks/${name}.svelte`).concat("/src/lib/plot/geojson.svelte");
    const reloaded = new Set();
    for (const url of importers)
      for (const [, file] of (await (await fetch(url)).text()).matchAll(/objects\/(\w+)\.js\?t=/g)) reloaded.add(file);
    if (reloaded.size)
      throw Error(`countMarkBuilds: the page runs hot-reloaded object modules (${[...reloaded].join(", ")}), which it cannot count; restart the dev server.`);
    window.__markBuildsHooked = true;
    window.__markBuilds = 0;
    window.__markBuildsByClass = {};
    const files = ["base", "scatter", "scatter3d", "segments", "labels", "heatmap", "arrows", "uncertainty", "prism",
      "polarRect", "geoFaces", "geoSegments", "surface"];
    for (const file of files) {
      const module = await import(`/src/lib/plot/objects/${file}.js`);
      for (const [name, value] of Object.entries(module)) {
        if (typeof value !== "function" || !value.prototype || !Object.hasOwn(value.prototype, "build")) continue;
        const build = value.prototype.build;
        value.prototype.build = function (...args) {
          // An override that calls super.build() counts once.
          if (!this.__countingBuild) {
            window.__markBuilds++;
            window.__markBuildsByClass[name] = (window.__markBuildsByClass[name] ?? 0) + 1;
          }
          const outer = !this.__countingBuild;
          this.__countingBuild = true;
          try { return build.apply(this, args); } finally { if (outer) this.__countingBuild = false; }
        };
      }
    }
  });
}

export const gpuCounters = (page) => page.evaluate(() => window.__gpuCounters.snapshot());

/** The work done between two snapshots, with readback latency percentiles. */
export async function countersDelta(page, before, after) {
  const latencies = await page.evaluate((from) => window.__gpuCounters.latencies(from), before.readbackMs);
  const sorted = [...latencies].sort((a, b) => a - b), at = (p) => sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] * 10) / 10 : null;
  const kinds = Object.fromEntries(Object.keys(after.readbackKinds).map((key) => [key, after.readbackKinds[key] - before.readbackKinds[key]]));
  return {
    compute: after.compute - before.compute, render: after.render - before.render, shaders: after.shaders - before.shaders,
    buffers: after.buffers - before.buffers, bufferKB: Math.round((after.bufferBytes - before.bufferBytes) / 1024),
    readbacks: after.readbacks - before.readbacks, readbackKinds: kinds,
    submits: after.submits - before.submits, fences: after.fences - before.fences,
    readbackP50: at(0.5), readbackP95: at(0.95), readbackMax: sorted.length ? Math.round(sorted.at(-1) * 10) / 10 : null,
    builds: after.builds - before.builds, ms: Math.round(after.time - before.time),
  };
}

/**
 * Sample the main thread while `run()` executes and attribute self time by package. Vite's
 * pre-bundled dependency chunks mark each module with a "// <...>node_modules/<path>" comment,
 * so a sample's package is the last marker above its line (chunk names change on every
 * re-optimize, and the cache directory can live anywhere).
 * jax-js hashing (FpHash, AluExp.getHash, Kernel simplify) is reported on its own.
 */
export async function profileCpu(page, cdp, run) {
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 250 });
  await cdp.send("Profiler.start");
  await run();
  const { profile } = await cdp.send("Profiler.stop");
  const self = new Map();
  profile.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0)));
  const markers = new Map();
  const packageAt = async (url, line) => {
    if (!/\/node_modules\/|\/deps\//.test(url)) return null;
    if (!markers.has(url)) {
      const text = await page.evaluate(async (u) => { try { return await (await fetch(u)).text(); } catch { return ""; } }, url);
      const found = [];
      text.split("\n").forEach((source, index) => {
        // The bundled jax-js fork is a linked package: its marker is its vendor/ path.
        const match = /^\/\/ .*?node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(source) ??
          (/^\/\/ .*?vendor\/jax-js\//.test(source) ? [null, "@hmplot/jax"] : null);
        if (match) found.push([index, match[1]]);
      });
      markers.set(url, found);
    }
    let name = /(?:node_modules\/(?:\.vite\/deps\/)?|\/deps\/)((?:@[^/_]+[/_])?[^/_.?]+)/.exec(url)?.[1] ?? "unknown";
    for (const [at, pkg] of markers.get(url)) if (at <= line) name = pkg; else break;
    return name;
  };
  const buckets = { jaxHash: 0, jaxOther: 0, three: 0, svelte: 0, app: 0, otherLibs: 0, gpuApi: 0, gc: 0, idle: 0, program: 0, other: 0 };
  for (const node of profile.nodes) {
    const ms = (self.get(node.id) ?? 0) / 1000;
    if (!ms) continue;
    const { url, functionName: name, lineNumber } = node.callFrame;
    if (name === "(idle)") buckets.idle += ms;
    else if (name === "(garbage collector)") buckets.gc += ms;
    else if (name === "(program)") buckets.program += ms;
    else if (!url) buckets[/submit|writeBuffer|createBindGroup|createBuffer|mapAsync|Encoder|Pass|Pipeline|ShaderModule/.test(name) ? "gpuApi" : "other"] += ms;
    else if (url.includes("/src/")) buckets.app += ms;
    else {
      const pkg = (await packageAt(url, lineNumber)) ?? "";
      if (pkg.startsWith("@jax-js") || pkg.startsWith("@hmplot/jax")) buckets[/^#?(hash|update|getHash|simplify|word|hashArg|fmix32)$|^get value$|FpHash/.test(name) ? "jaxHash" : "jaxOther"] += ms;
      else if (pkg === "three") buckets.three += ms;
      else if (/svelte|threlte/.test(pkg)) buckets.svelte += ms;
      else buckets.otherLibs += ms;
    }
  }
  return Object.fromEntries(Object.entries(buckets).map(([key, value]) => [key, Math.round(value)]));
}
