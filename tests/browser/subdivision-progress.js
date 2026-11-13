// Observe completed draws while input changes continuously, without settling it. Runs in
// the page; both edges of the observation window count toward the maximum draw gap.
export async function subdivisionProgress(plot, duration = 2000) {
  const start = performance.now(), frames = [], draws = [];
  let previous = plot.getDiagnostics().completedFrame;
  while (performance.now() - start < duration) {
    await new Promise(requestAnimationFrame);
    const now = performance.now(), completed = plot.getDiagnostics().completedFrame;
    frames.push(now);
    if (completed !== previous) { draws.push(now); previous = completed; }
  }
  const end = performance.now(), edges = [start, ...draws, end];
  return { animationFrames: frames.length, completedFrames: draws.length,
    maxGap: Math.max(...edges.slice(1).map((t, i) => t - edges[i])) };
}
