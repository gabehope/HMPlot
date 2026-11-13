// @ts-check
import { untrack } from "svelte";
import { markCapacity } from "./proputils.js";

/**
 * A mark's element limit: its maxElements (else the plot's, else 250,000), up to what its manager
 * has allocated and the device can bind. The limit is reactive: reading it in an effect reruns
 * the effect when the manager's capacity changes. A new manager changes it only when its
 * allocation does; an unchanged one would prepare every mark twice on mount (TODO 136.1).
 * @param {() => any} currentMark the mark's raw mark (its manager allocates the rows)
 * @param {{ get: (key: string) => any }} options the mark's options
 * @param {{ backend?: any }} renderer
 * @returns {(props: Record<string, any>) => number}
 */
export function markElementLimit(currentMark, options, renderer) {
  let revision = $state(0);
  /** @type {{ props: Record<string, any>, limit: number } | undefined} */
  let last;
  /** @param {Record<string, any>} props */
  const limitOf = (props) => {
    const manager = untrack(() => currentMark()?.manager);
    return markCapacity({
      initial: Number(props.maxElements ?? options.get("maxElements") ?? 250000),
      allocated: manager?.maxElements,
      fields: manager?.fields.values(),
      limits: /** @type {{device?: GPUDevice}} */ (renderer?.backend)?.device?.limits,
    }).current;
  };
  $effect(() => {
    const manager = currentMark()?.manager;
    if (!manager) return;
    untrack(() => {
      if (last && limitOf(last.props) !== last.limit) revision++;
    });
    return manager.onCapacityChange(() => untrack(() => revision++));
  });
  return (props) => {
    void revision;
    last = { props, limit: limitOf(props) };
    return last.limit;
  };
}
