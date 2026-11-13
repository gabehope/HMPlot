import { getContext, setContext } from "svelte";
import { ANIMATION_GROUP_CONTEXT } from "./animationGroup.js";

/** Undefined inherits; explicit null restores the ordinary Data.key/position fallback. */
export function provideAnimationGroup(read) {
  const parent = getContext(ANIMATION_GROUP_CONTEXT);
  const current = () => (read() === undefined ? parent?.() : read());
  setContext(ANIMATION_GROUP_CONTEXT, current);
  return current;
}
