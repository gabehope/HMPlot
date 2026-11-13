<script>
  import { onMount, tick } from "svelte";
  import SceneRenderer from "$lib/scene/SceneRenderer.svelte";
  import { SceneRuntime } from "$lib/scene/runtime.svelte.js";
  import { initializePlot } from "$lib/jaxExtensions/setup.js";
  import { page } from "$app/state";
  const runtime = new SceneRuntime((message) => {
    window.notebookMessages ??= [];
    window.notebookMessages.push(message);
  });
  let widgetHost = $state();
  const decode = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  const load = async (fixture) =>
    (await fetch("/test/notebook" + (fixture ? "-" + fixture : "") + ".json")).json();
  // ?widget mounts the notebook widget itself (scene/widget.js, TODO 71) on a stand-in anywidget
  // model holding the fixture: what it sends collects in window.widgetMessages (its buffers in
  // window.widgetBuffers), window.widgetReceive(message, buffers) delivers a kernel message and
  // window.widgetPublish(state) a new scene state, as the kernel's change:state does.
  async function mountWidget(fixture) {
    let { state, buffers, metadata } = await load(fixture);
    const handlers = new Map();
    const columns = Object.fromEntries(Object.keys(buffers).map((id) => [id, {
      get: (name) => (name === "payload" ? decode(buffers[id]) : metadata?.[id]),
    }]));
    window.widgetMessages = [];
    window.widgetBuffers = [];
    window.widgetReceive = (message, sent = []) =>
      (handlers.get("msg:custom") ?? []).forEach((handler) => handler(message, sent));
    window.widgetState = state;
    window.widgetPublish = (next) => {
      state = window.widgetState = next;
      (handlers.get("change:state") ?? []).forEach((handler) => handler());
    };
    const model = {
      get: (name) => ({ state, columns })[name],
      send: (content, callbacks, sent = []) => {
        window.widgetMessages.push({ ...content, buffers: sent.length });
        window.widgetBuffers.push(sent);
      },
      on: (event, handler) => handlers.set(event, [...(handlers.get(event) ?? []), handler]),
      off: (event, handler) => handlers.set(event, (handlers.get(event) ?? []).filter((item) => item !== handler)),
    };
    const { render } = await import("$lib/scene/widget.js");
    window.widgetCleanup = await render({ model, el: widgetHost });
    window.widgetReady = true;
  }
  onMount(() => {
    window.notebookRuntime = runtime;
    const params = new URLSearchParams(location.search);
    if (params.has("widget")) {
      mountWidget(params.get("fixture")).catch((e) => console.error(e));
      return () => window.widgetCleanup?.();
    }
    (async () => {
      await initializePlot();
      const { state, buffers, metadata } = await load(params.get("fixture"));
      window.notebookState = state;
      window.notebookBuffers = buffers;
      await runtime.apply(state, (id) => ({
        payload: decode(buffers[id]),
        descriptor: metadata?.[id],
      }));
      window.notebookReady = true;
    })().catch((e) => console.error(e));
    return () => {
      runtime.dispose();
      void tick().then(() => runtime.resources.dispose());
    };
  });
</script>

<!-- ?fill=false: plots without a width stop at 800px, as image exports draw them (TODO 132.5). -->
<SceneRenderer {runtime} fill={page.url.searchParams.get("fill") !== "false"} />
<div bind:this={widgetHost}></div>
