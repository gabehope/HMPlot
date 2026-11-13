<script>
  import { useReporter } from "../plot/utils/reporter.js";
  import { onDestroy } from "svelte";
  import SceneNode from "../scene/SceneNode.svelte";
  import { SceneRuntime } from "../scene/runtime.svelte.js";
  import { instantiateTemplate, templateInstanceId } from "./definition.js";
  import { loadSceneComponents } from "../scene/componentLoading.js";
  import { trackPreparation } from '../plot/rendering/viewSettlement.js';

  /**
   * @type {{ definition: any, params?: Record<string, unknown>, events?: Record<string, Record<string, Function>>,
   *   props?: Record<string, unknown>, children?: import("svelte").Snippet }}
   * `params` binds the file's parameters; `props` are props of its main part (its contract's
   * main, else its only mark), and a key naming a contract part takes an object of that part's
   * props (`{ stem: { color: "gray" } }`); `events` binds host callbacks to parts by contract name, else by
   * a node's `name`.
   */
  let { definition, params = {}, events = {}, props = {}, children = undefined } = $props();
  const prefix = templateInstanceId();
  let handlers = new Map();
  const runtime = new SceneRuntime((message) => {
    if (message.type === "event")
      handlers.get(`${message.target}:${message.event}`)?.(message.payload, message);
  });
  let slotId = $state(null), error = $state("");
  $effect.pre(() => {
    let cancelled = false;
    try {
      const instance = instantiateTemplate(definition, params, prefix, events, props);
      if (instance.slotId === null && children)
        throw Error("PortableTemplate: this template has no slot for caller children.");
      handlers = instance.handlers;
      slotId = instance.slotId;
      trackPreparation(null, loadSceneComponents(instance.root).then(components => {
        if (cancelled || runtime.disposed) return;
        runtime._components = components;
        runtime.root = instance.root;
        runtime.revision++;
        error = "";
      }).catch(reason => { if (!cancelled) { runtime.root = null; error = reason?.message ?? String(reason); } }));
    } catch (reason) {
      runtime.root = null;
      error = reason?.message ?? String(reason);
    }
    return () => { cancelled = true; };
  });
  onDestroy(() => runtime.dispose());
  // Its error is a diagnostic of its scene node too (TODO 136.6, utils/reporter.js).
  const reportError = useReporter("PortableTemplate");
  $effect(() => reportError(error));
</script>

{#if error}<p role="alert">{error}</p>{:else if runtime.root}
  <SceneNode node={runtime.root} {runtime} {slotId} slotChildren={children} />
{/if}
