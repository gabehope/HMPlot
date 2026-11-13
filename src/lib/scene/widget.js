import registry from "./registry.json";
import { mount, unmount, tick } from "svelte";
import SceneRenderer from "./SceneRenderer.svelte";
import { SceneRuntime } from "./runtime.svelte.js";
import { initializePlot } from "../jaxExtensions/setup.js";
import { getWebGPUDevice } from "@hmplot/jax";
import { diagnosticPayload } from "../plot/utils/diagnostics.js";
import { embedDefaultFont } from "../plot/utils/defaultFont.js";
import { blobDataURL } from "../plot/utils/exportDocument.js";

// A view in a browser without WebGPU shows a static image of the scene, drawn by the kernel in
// its headless Chrome (TODO 71). A lost device is not this: a reload brings WebGPU back.
const SNAPSHOT_PENDING = "This browser has no WebGPU: the kernel is drawing a static image of the plot…";
/** How long a view waits for the kernel to send a plugin's file, in milliseconds. */
const PLUGIN_TIMEOUT = 30000;
const SNAPSHOT_NOTE = "Static image: this browser has no WebGPU. Open the notebook in a browser with WebGPU to interact with the plot.";

/**
 * The kernel's SVG of the scene as an image: a data URL with the bundled font embedded (an
 * image cannot reach the page's fonts), its size in CSS pixels, and its title and description
 * (the plots' generated descriptions) as the alt text.
 */
async function snapshotImage(bytes) {
  const svg = new DOMParser().parseFromString(new TextDecoder().decode(bytes), "image/svg+xml").documentElement;
  if (svg.localName !== "svg") throw Error("The kernel's static image is not an SVG document.");
  const text = (name) => svg.querySelector(`:scope > ${name}`)?.textContent.trim() ?? "";
  const size = (name) => (Number(svg.getAttribute(name)) > 0 ? Math.round(Number(svg.getAttribute(name))) : undefined);
  const title = text("title"), description = text("desc");
  await embedDefaultFont(svg);
  return {
    src: await blobDataURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" })),
    alt: (title && description ? `${title}${/[.!?]$/.test(title) ? "" : "."} ${description}` : title || description) || "A static image of the plot.",
    width: size("width"),
    height: size("height"),
  };
}

export async function render({ model, el }) {
  const view = crypto.randomUUID();
  let closed = false,
    chain = Promise.resolve(),
    pending = null,
    draining = false,
    canceled = new Set(),
    // Without WebGPU: the error it reported, and the newest static image asked for (TODO 71).
    unavailable = null,
    snapshots = 0;
  // An HTML export embeds the standalone runtime (TODO 54), which this bundle does not contain:
  // the kernel sends its copy (python/hmplot/static/standalone.js) when the view first needs it.
  let standaloneSource = null;
  const standaloneRequests = new Map();
  const send = (message, buffers = []) =>
    model.send(
      { protocol: 1, scene: model.get("state")?.scene, view, ...message },
      {},
      buffers,
    );
  const runtime = new SceneRuntime(send);
  const standalone = () => (standaloneSource ??= new Promise((resolve, reject) => {
    const request = crypto.randomUUID();
    standaloneRequests.set(request, { resolve, reject });
    send({ type: "standalone_request", request });
  }).catch((e) => {
    standaloneSource = null;
    throw e;
  }));
  // The plugin files the scene names (TODO 138.4): the kernel reads them from their installed
  // packages; the runtime checks each against the hash the state names.
  const pluginRequests = new Map();
  // A kernel that does not answer (restarted, or gone with a saved notebook) fails the plugin
  // after a while (plugin.failed), and the scene draws without it.
  runtime.pluginSource = ({ name, version, hash }) => {
    const request = crypto.randomUUID();
    const answer = new Promise((resolve, reject) => {
      pluginRequests.set(request, { resolve, reject });
      send({ type: "plugin_request", request, name, version, hash });
    });
    return bounded(answer, PLUGIN_TIMEOUT, "plugin loading").finally(() => pluginRequests.delete(request));
  };
  const component = mount(SceneRenderer, {
    target: el,
    props: { runtime, notebook: true },
  });
  // An update's error is shown (`rejected`) until one applies; a command's goes to its caller.
  const error = (e, request, revision = model.get("state")?.revision, shown = !request) => {
    const message = e.message ?? String(e);
    if (shown) runtime.rejected = message;
    const diagnostic = diagnosticPayload(e);
    send({
      type: "error",
      message,
      code: diagnostic.code,
      diagnostic: diagnostic.diagnostic,
      request,
      revision,
    });
  };
  const columns = async (resources, id) => {
    const entry = resources[id];
    const column =
      typeof entry === "string"
        ? await model.widget_manager.get_model(entry.replace(/^IPY_MODEL_/, ""))
        : entry;
    if (!column) throw Error(`Missing binary column ${id}`);
    return {
      payload: column.get("payload"),
      descriptor: column.get("descriptor"),
    };
  };
  const bounded = (promise, milliseconds, phase) => {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Object.assign(Error(`Notebook command timed out during ${phase}.`), {
            code: "bridge.timeout",
            diagnostic: { code: "bridge.timeout", scope: "notebook frontend", details: { phase } },
          })),
          Math.max(1, milliseconds ?? 30000),
        );
      }),
    ]).finally(() => clearTimeout(timer));
  };
  const drain = () => {
    if (draining || closed || !pending) return;
    draining = true;
    chain = chain.then(async () => {
      while (!closed && pending) {
        const job = pending;
        pending = null;
        try {
          await runtime.apply(job.state, (id) => columns(job.resources, id));
          runtime.setSerializable(job.state, (id) => columns(job.resources, id), standalone);
          send({ type: "ack", revision: job.state.revision });
        } catch (e) {
          error(e, undefined, job.state.revision);
        }
      }
    }).finally(() => {
      draining = false;
      if (pending) drain();
    });
  };
  const update = () => {
    // A view without WebGPU draws nothing itself: the kernel sends it images (TODO 71).
    if (unavailable) return;
    const state = model.get("state");
    if (!state?.root) return;
    if (Object.keys(state.columns).some((id) => !model.get("columns")?.[id]))
      return;
    const resources = { ...model.get("columns") };
    pending = { state, resources };
    drain();
  };
  // The kernel's static image of the scene, or why it has none: then today's error, with what
  // to do (TODO 71). A newer one replaces it after each update.
  const snapshot = async (m, buffers) => {
    const ticket = ++snapshots;
    let image = null, reason = m.error;
    if (!reason)
      try { image = await snapshotImage(buffers[0]); }
      catch (e) { reason = e.message ?? String(e); }
    if (closed || ticket !== snapshots) return;
    if (image) {
      runtime.error = "";
      runtime.snapshot = { ...image, note: SNAPSHOT_NOTE };
    } else {
      runtime.snapshot = null;
      runtime.error = `${unavailable} Open the notebook in a browser with WebGPU (Chrome or Edge 113 or later) to see the plot. The kernel could not draw a static image of it instead: ${reason}`;
    }
  };
  const message = (m, buffers = []) => {
    if (m.view && m.view !== view) return;
    if (m.type === "snapshot") {
      if (unavailable) void snapshot(m, buffers);
      return;
    }
    if (m.type === "standalone") {
      const waiting = standaloneRequests.get(m.request);
      standaloneRequests.delete(m.request);
      if (m.error || !buffers[0]) waiting?.reject(Error(`The kernel could not send the standalone runtime for HTML export: ${m.error ?? "it sent nothing"}`));
      else waiting?.resolve(new TextDecoder().decode(buffers[0]));
      return;
    }
    if (m.type === "plugin") {
      const waiting = pluginRequests.get(m.request);
      pluginRequests.delete(m.request);
      if (m.error) waiting?.reject(Error(m.error));
      else waiting?.resolve(buffers[0] ? new TextDecoder().decode(buffers[0]) : null);
      return;
    }
    if (m.type === "error") {
      runtime.error = m.message;
      return;
    }
    if (m.type === "dispose") {
      cleanup();
      return;
    }
    if (m.type === "resync") {
      update();
      return;
    }
    if (m.type === "interaction") {
      runtime.syncInteraction(m);
      return;
    }
    if (m.type === "input") {
      runtime.syncInput(m);
      return;
    }
    if (m.type === "offsets" || m.type === "offsets_ack") {
      runtime.syncOffsets(m);
      return;
    }
    if (m.type === "cancel") {
      canceled.add(m.request);
      return;
    }
    if (m.type === "command") {
      chain = chain.then(async () => {
        try {
          if (canceled.delete(m.request)) return;
          send({ type: "status", request: m.request, phase: "preparation", revision: m.revision });
          const value = await bounded(runtime.command(m), m.args?.timeoutMs, "rendering/export");
          if (canceled.delete(m.request)) return;
          // Jupyter's server closes the connection on a message over 10 MiB: a result over the
          // command's maxBytes is not sent, and Python exports it another way (python/PROTOCOL.md).
          const blob = value?.blob instanceof Blob ? value.blob : value instanceof Blob ? value : null;
          const maxBytes = m.args?.maxBytes;
          if (blob && maxBytes && blob.size > maxBytes)
            throw Object.assign(Error(`The ${m.command} result is ${blob.size} bytes, more than the ${maxBytes} this view may send to the kernel.`), {
              code: "bridge.message_too_large",
              diagnostic: { code: "bridge.message_too_large", scope: "notebook frontend", details: { bytes: blob.size, maxBytes } },
            });
          send({ type: "status", request: m.request, phase: "result delivery", revision: m.revision });
          if (value?.blob instanceof Blob)
            send({ type: "result", request: m.request, value: { report: value.report ?? (value.warnings?.length ? { omitted_callbacks: value.warnings } : undefined) } }, [
              new DataView(await value.blob.arrayBuffer()),
            ]);
          else if (value instanceof Blob)
            send({ type: "result", request: m.request }, [
              new DataView(await value.arrayBuffer()),
            ]);
          else send({ type: "result", request: m.request, value });
        } catch (e) {
          if (!canceled.delete(m.request)) error(e, m.request, m.revision);
        }
      });
    }
  };
  async function cleanup() {
    if (closed) return;
    closed = true;
    model.off("change:state", update);
    model.off("change:columns", update);
    model.off("msg:custom", message);
    for (const waiting of standaloneRequests.values()) waiting.reject(Error("The view closed before the kernel sent the standalone runtime."));
    standaloneRequests.clear();
    for (const waiting of pluginRequests.values()) waiting.reject(Error("The view closed before the kernel sent the plugin."));
    pluginRequests.clear();
    runtime.dispose();
    await unmount(component);
    await chain;
    runtime.resources.dispose();
    send({ type: "dispose" });
  }
  try {
    // A fast frontend can reply as soon as capabilities are announced. Install
    // listeners first so readiness and the first transaction cannot race.
    model.on("change:state", update);
    model.on("change:columns", update);
    model.on("msg:custom", message);
    await initializePlot();
    send({
      type: "capabilities",
      ready: true,
      features: ["binary-columns", "scene-v1"],
      library: registry.library,
      // Python checks a grid table's variables against it before sending them (TODO 48.6).
      limits: { maxStorageBufferBindingSize: getWebGPUDevice()?.limits?.maxStorageBufferBindingSize },
    });
    update();
  } catch (e) {
    // No WebGPU (not a lost device: a reload brings that one back): the view asks the kernel for
    // a static image at its width and shows that, read-only, in the plot's place (TODO 71).
    if (e?.code === "webgpu.unavailable") unavailable = e.message;
    if (!unavailable) runtime.error = e.message ?? String(e);
    error(e, undefined, undefined, false);
    send({ type: "capabilities", ready: false, message: e.message });
    if (unavailable && !closed) {
      runtime.snapshot = { note: SNAPSHOT_PENDING };
      await tick();
      const width = el.querySelector(".hmplot-snapshot")?.clientWidth;
      send({ type: "snapshot_request", width: width > 0 ? width : null });
    }
  }
  return cleanup;
}
export default { render };
