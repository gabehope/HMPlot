const hosts = new WeakMap();

/** Portal only the positioning wrapper. A stable source node keeps Svelte's keyed
 * ranges intact; its document order determines the overlay's keyboard order. */
export function attachHtml(host, source, wrapper) {
  let group = hosts.get(host);
  if (!group) {
    const entries = new Map();
    const order = () => {
      const ordered = [...entries]
        .sort(([, a], [, b]) =>
          a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
            ? -1
            : 1,
        )
        .map(([node]) => node);
      for (let i = 0; i < ordered.length; i++) {
        if (host.children[i] === ordered[i]) continue;
        const before = host.children[i] ?? null;
        if (host.moveBefore) host.moveBefore(ordered[i], before);
        else {
          const focused = ordered[i].contains(document.activeElement)
            ? document.activeElement
            : null;
          host.insertBefore(ordered[i], before);
          focused?.focus({ preventScroll: true });
        }
      }
    };
    const observer = new MutationObserver(order);
    observer.observe(host.parentElement, { childList: true, subtree: true });
    group = { entries, observer, order };
    hosts.set(host, group);
  }
  group.entries.set(wrapper, source);
  host.appendChild(wrapper);
  group.order();
  return () => {
    group.entries.delete(wrapper);
    wrapper.remove();
    if (!group.entries.size) {
      group.observer.disconnect();
      hosts.delete(host);
    }
  };
}
