/**
 * Image files (TODO 37.5, 69.10): the sky effect's image, and an Image's `data` given as a file instead of
 * pixel values. A file is a URL, a Blob (what a Python scene's encoded file arrives as,
 * scene/resources.js), an ImageBitmap, an HTMLImageElement, an HTMLCanvasElement or an
 * OffscreenCanvas, decoded by the browser, so a JPEG travels as the JPEG it is.
 */

/** Whether `value` is an image file rather than pixel values (an array, nested lists). */
export function isImageFile(value) {
  if (typeof value === "string") return value.length > 0;
  const is = (type) => typeof globalThis[type] !== "undefined" && value instanceof globalThis[type];
  return ["Blob", "ImageBitmap", "HTMLImageElement", "HTMLCanvasElement", "OffscreenCanvas"].some(is);
}

/** `source` decoded into a new ImageBitmap (the caller closes it). `what` names it in messages
 * ("Plot.effects: sky image", "Image: data"). */
export async function loadImageFile(source, signal, what = "Plot.effects: sky image") {
  const [component] = what.split(":");
  if (typeof source === "string") {
    let response;
    try { response = await fetch(source, { signal }); }
    catch (error) { if (error.name === "AbortError") throw error; throw Error(`${component}: could not load the image ${JSON.stringify(source)} (${error.message}).`); }
    if (!response.ok) throw Error(`${component}: could not load the image ${JSON.stringify(source)} (HTTP ${response.status}).`);
    try { return await createImageBitmap(await response.blob()); }
    catch (error) { throw Error(`${component}: could not decode the image ${JSON.stringify(source)} (${error.message}).`); }
  }
  if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) await source.decode();
  try { return await createImageBitmap(source); }
  catch (error) { throw Error(`${component}: could not decode its image (${error.message}).`); }
}

/**
 * An image file's pixels as an Image takes them: { values, shape }, a Float32Array of
 * [height, width, 3] values from 0 to 1, top row first, or [height, width, 4] when some pixel is
 * not opaque (its alpha kept).
 */
export async function imageFilePixels(source, signal) {
  const bitmap = await loadImageFile(source, signal, "Image: data");
  try {
    signal?.throwIfAborted();
    const { width, height } = bitmap;
    const canvas = new OffscreenCanvas(width, height), context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, width, height).data, count = width * height;
    let channels = 3;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] !== 255) { channels = 4; break; }
    const values = new Float32Array(count * channels);
    for (let i = 0, j = 0; i < count; i++) for (let c = 0; c < channels; c++) values[j++] = pixels[i * 4 + c] / 255;
    return { values, shape: [height, width, channels] };
  } finally { bitmap.close(); }
}
