// Experiment-only safeguards: a stalled or unpatched arm cannot produce timing evidence.
export function replaceOnce(code, needle, replacement, file) {
  const count = code.split(needle).length - 1;
  if (count !== 1)
    throw Error(
      `Primitive experiment patch in ${file}: expected one ${JSON.stringify(needle)} match, found ${count}.`,
    );
  return code.replace(needle, replacement);
}

export function requireFrames(completedFrames) {
  if (!Number.isInteger(completedFrames) || completedFrames <= 0)
    throw Error(
      "Primitive experiment: no completed plot frames; discard this capture.",
    );
}

export async function waitForFrame(plot, before, timeoutMs = 30000) {
  let frame,
    timer,
    stopped = false;
  try {
    await Promise.race([
      (async () => {
        await plot.whenSettled();
        while (!stopped && plot.getDiagnostics().completedFrame <= before)
          await new Promise((resolve) => {
            frame = requestAnimationFrame(resolve);
          });
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              Error(
                `Primitive experiment: plot did not settle and complete a frame within ${timeoutMs} ms.`,
              ),
            ),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    stopped = true;
    clearTimeout(timer);
    if (frame !== undefined) cancelAnimationFrame(frame);
  }
}
