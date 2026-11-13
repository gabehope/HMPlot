/**
 * Layouts publish ordinary current-value columns. Upstream producers schedule themselves;
 * their generic liveness belongs to output views, not another layout clock subscription.
 */
export function layoutLive(nodes, edges, {
  sources = [], time = 0, deadline = -Infinity, controlled = false,
  nodeFields = [], edgeFields = [],
} = {}) {
  const present = sources.filter(Boolean);
  const live = deadline > time || present.some((scope) => scope.live);
  const inheritedDeadline = Math.max(deadline, ...present.map((scope) => scope.liveUntil ?? -Infinity));
  const generatedLive = controlled || deadline > -Infinity ||
    present.some((scope) => scope.live || scope.liveColumns?.size);
  for (const [view, fields] of [[nodes, nodeFields], [edges, edgeFields]]) {
    view.live = live || Boolean(view.live);
    view.liveColumns = new Set(view.liveColumns ?? []);
    for (const field of fields) {
      if (generatedLive) view.liveColumns.add(field);
      else view.liveColumns.delete(field);
    }
    if (inheritedDeadline > time) view.liveUntil = inheritedDeadline;
    else delete view.liveUntil;
  }
}
