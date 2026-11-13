// @ts-check
/** Binary transport only. Callers retain their scene, tile and Provider envelopes. */

/** Borrow bytes and encode exactly this view, including its offset, without a large argument list.
 * @param {Uint8Array<ArrayBufferLike>} bytes
 */
export function bytesToBase64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

/** Return fresh owned bytes. Invalid base64 keeps the native atob error.
 * @param {string} value
 * @returns {Uint8Array<ArrayBuffer>}
 */
export function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}
