// @ts-check
// Writes in flight (TODO 145.2): a click's value is read from the GPU before it commits, so a
// check that the page has settled (hmplot/check) waits for them first.
/** @type {Set<Promise<unknown>>} */
const writes = new Set();
/** Track a write until it settles; returns `work`. @template T @param {Promise<T>} work */
export function trackWrite(work) {
  writes.add(work);
  const done = () => writes.delete(work);
  work.then(done, done);
  return work;
}
/** Resolves once the input writes in flight now (and those they start) have settled. */
export async function inputWritesSettled() {
  while (writes.size) await Promise.allSettled([...writes]);
}
