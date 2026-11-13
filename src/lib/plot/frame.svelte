<script lang="ts">
  import { createScreenMappingRelay } from "./utils/screenMapping.js";
  import { provideAnimationGroup } from "./utils/animationGroupContext.js";
  import Axis from "./axis.svelte";
  import PresentationObject from "./scenes/presentationObject.svelte";
  import { getContext, setContext, onDestroy, untrack } from "svelte";
  import { ROOT_CONTENT_CONTEXT } from "./utils/rootFrameSelection.js";
  import { registerFrameContent } from "./utils/frameModel.js";
  import type { RootContentContext } from "./utils/internalTypes.js";
  import type { FrameProps, FrameHandle, ScreenMapping } from "./publicTypes.js";
  let { children, atmosphere = undefined, animationGroup = undefined, ...props }: FrameProps = $props();
  provideAnimationGroup(() => animationGroup);
  let handle = $state<any>();
  // This Frame in the Plot's logical content (utils/frameModel.ts): a root candidate, and the
  // owner its children register under.
  const content = registerFrameContent(getContext<RootContentContext | undefined>(ROOT_CONTENT_CONTEXT), () => props as any);
  if (content.context) setContext(ROOT_CONTENT_CONTEXT, content.context);
  $effect(() => {
    // Read the reactive props before notifying the selector of a changed
    // candidate; it never depends on the currently selected root.
    void props.x?.range; void props.y?.range; void props.z?.range;
    void props.placement; void (props as any)._facetCell;
    untrack(() => content.changed());
  });
  onDestroy(() => content.release());
  export const getAxisLayout: FrameHandle["getAxisLayout"] = () => handle?.getAxisLayout();
  const mapping = createScreenMappingRelay();
  export const getScreenMapping = (): ScreenMapping | null => mapping.getScreenMapping();
  export const subscribeScreenMapping = (listener: (mapping: ScreenMapping | null) => void): (() => void) => mapping.subscribeScreenMapping(listener);
  $effect(() => {
    mapping.connect(handle);
    return () => mapping.connect(null);
  });
  onDestroy(() => mapping.dispose());
  export const getFrameOptions: FrameHandle["getFrameOptions"] = () => handle?.getFrameOptions();
  export const getLegendSource = () => handle?.getLegendSource();
  export const getMinimapSource: FrameHandle["getMinimapSource"] = () => handle?.getMinimapSource();
  export const subscribeSettings: FrameHandle["subscribeSettings"] = (listener) => handle?.subscribeSettings(listener);
</script>

<Axis {...props} frameMode={true} rootLogicalKey={content.key} bind:this={handle}>{#if atmosphere}<PresentationObject kind="atmosphere" owner="Frame: atmosphere" settings={atmosphere} />{/if}{@render children?.()}</Axis>
