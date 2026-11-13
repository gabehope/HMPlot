import { visibleNeighbors, searchBrackets } from "./candidates.js";
let cached;
export function resetSearchCache() {
  cached?.neighbors.forEach((a) => a.dispose());
  cached = null;
}
export function experimentalBrackets(
  baseline,
  time,
  shown,
  position,
  start,
  end,
  at,
) {
  if (globalThis.__recordPrimitiveCalls) globalThis.__primitiveCalls.brackets++;
  const mode = globalThis.__primitiveMode ?? "sort";
  if (mode === "oracle") {
    [time, shown, position, start, end, at].forEach((a) => a.dispose());
    return globalThis.__oracleBrackets.map((a) => a.ref);
  }
  if (mode !== "search") return baseline(time, shown, position, start, end, at);
  const epoch = globalThis.__maskEpoch ?? 0;
  if (!cached || cached.time !== time || cached.epoch !== epoch) {
    resetSearchCache();
    cached = {
      time,
      epoch,
      neighbors: visibleNeighbors(time.ref, shown.ref, position.ref),
    };
  }
  shown.dispose();
  position.dispose();
  return searchBrackets(
    time,
    cached.neighbors[0].ref,
    cached.neighbors[1].ref,
    start,
    end,
    at,
    globalThis.__historySteps ?? time.shape[0],
  );
}
