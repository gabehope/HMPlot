<script lang="ts">
  import { useViewServices } from "../utils/viewServices.js";
  import { onDestroy, tick, untrack } from "svelte";
  import { useThrelte } from "@threlte/core";
  import { numpy as np } from "@hmplot/jax";
  import Raw from "../marks/image.svelte";
  import Named from "./namedMark.svelte";
  import { initializePlot } from "../../jaxExtensions/setup.js";
  import { imageFilePixels, isImageFile } from "../utils/imageFiles.js";
  import { settlePreparations, trackPreparation } from '../rendering/viewSettlement.js';
import { settleUploads } from '../rendering/uploadSettlement.js';
  import { reportDataError } from "../utils/dataErrors.js";
  import type { ImageProps } from "../publicTypes.js";
  let props: ImageProps = $props();
  let mark = $state<any>();
  export const getLegendSource = () => mark?.getLegendSource();
  export const getSurface = () => mark?.getSurface();
  export const subscribeSettings = (listener) => mark?.subscribeSettings(listener);
  export const getMark = () => mark?.getMark();

  // An image file as `data` (TODO 69.10): a URL, a Blob (a Python scene's encoded file), an
  // ImageBitmap or an image or canvas element, decoded once by the browser into its pixels. The
  // plot waits for it (aria-busy, whenSettled); until it decodes the Image draws nothing, and a
  // failure is the plot's error. The pixels are released once the plot no longer draws them.
  const { renderer } = useThrelte();
  const viewServices = useViewServices();
  const owner = {};
  let decoded = $state.raw<{ source: any; array: any } | null>(null);
  // Once the mark has prepared what replaced it (or been removed) and the GPU is done with it.
  const release = (entry) => {
    if (!entry) return;
    (async () => { await tick(); await settlePreparations(viewServices); await settleUploads(viewServices); })()
      .catch(() => {}).finally(() => entry.array.dispose());
  };
  $effect(() => {
    const source = props.data;
    if (!isImageFile(source)) {
      reportDataError(viewServices, owner, "");
      untrack(() => { release(decoded); decoded = null; });
      return;
    }
    if (untrack(() => decoded?.source === source)) return;
    const abort = new AbortController();
    const work = (async () => {
      const [{ values, shape }] = await Promise.all([imageFilePixels(source, abort.signal), initializePlot()]);
      abort.signal.throwIfAborted();
      const array = np.array(values).reshape(shape);
      const previous = untrack(() => decoded);
      decoded = { source, array };
      reportDataError(viewServices, owner, "");
      release(previous);
    })().catch((error) => {
      if (!abort.signal.aborted) reportDataError(viewServices, owner, error.message);
    });
    trackPreparation(viewServices, work, undefined, { load: true });
    return () => abort.abort();
  });
  onDestroy(() => {
    reportDataError(viewServices, owner, "");
    release(decoded);
  });
  const values = $derived(isImageFile(props.data)
    ? { ...props, data: decoded?.source === props.data ? decoded.array : undefined } : props);
</script>

<Named bind:this={mark} component={Raw} kind="Image" {values} />
