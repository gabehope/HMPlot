/** One active preparation and one replaceable request. Complete useful active work while
 * input changes; discarded queued requests release their retained resources immediately.
 * The optional barrier yields between publications without delaying their settlement.
 * @param {(signal: AbortSignal) => Promise<unknown>} [between]
 */
export function latestPreparation(between = () => Promise.resolve()) {
  let active, queued, running = false, closed = false;
  const lifetime = new AbortController();
  const discard = job => { job?.cancel(false); job?.resolve(); };
  const drain = async () => {
    if (running || closed) return;
    running = true;
    try {
      while (queued && !closed) {
        active = queued; queued = undefined;
        const job = active;
        try { job.resolve(await job.work()); } catch (e) { job.reject(e); }
        finally { active = undefined; }
        await between(lifetime.signal);
      }
    } finally { running = false; }
  };
  const cancel = () => {
    active?.cancel(true);
    discard(queued); queued = undefined;
  };
  return {
    /** @param {() => unknown | Promise<unknown>} work
     * @param {(started: boolean) => void} [cancel] */
    run(work, cancel = () => {}) {
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      const job = { work, cancel, resolve, reject, promise };
      if (closed) discard(job);
      else { discard(queued); queued = job; void drain(); }
      return promise;
    },
    cancel,
    dispose() {
      const settled = active?.promise ?? Promise.resolve();
      closed = true;
      lifetime.abort();
      cancel();
      return settled;
    },
  };
}
