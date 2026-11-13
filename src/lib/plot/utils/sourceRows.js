// A source-index array is immutable. Share its numeric download between consumers and
// preparations, but map it to the current owning table's tokens outside this cache.
const decoded = new WeakMap();

/** Borrow an immutable source-index array; retain it only until its download settles. */
export function decodedSourceRows(array) {
  let ready = decoded.get(array);
  if (ready) return ready;
  const held = array.ref;
  // data() consumes its read reference on success; a failed backend read does not.
  ready = Promise.resolve().then(async () => {
    try { return await held.data(); }
    catch (error) { held.dispose(); throw error; }
  }).then((rows) => Array.from(rows, Number))
    .catch((error) => {
      if (decoded.get(array) === ready) decoded.delete(array);
      throw error;
    });
  decoded.set(array, ready);
  return ready;
}
