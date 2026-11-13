/**
 * hmplot/video (R2.0c.3): a plot's animation encoded in the browser with WebCodecs' VideoEncoder,
 * as an MP4: H.264 where the browser has it (Chrome does), else VP9. It is loaded on demand, so a
 * page that never exports video does not carry it.
 *
 *   const blob = await plot.exportVideo({ duration: 2000, fps: 30 });
 *
 * Each frame is the plot's PNG export at a frozen clock time (as Python's export_mp4 steps it);
 * the clock returns to its time and frozen state afterwards.
 */

/**
 * The clock times of a video's frames, in milliseconds: start + i * 1000 / fps before
 * start + duration, at least one (the same frames as Python's export_mp4).
 */
export function frameTimes({ duration, fps = 30, start = 0 }) {
  if (!(Number.isFinite(duration) && duration > 0)) throw Error("duration must be a positive, finite number of milliseconds.");
  if (!(Number.isFinite(fps) && fps > 0)) throw Error("fps must be a positive, finite number.");
  if (!(Number.isFinite(start) && start >= 0)) throw Error("start must be a finite, nonnegative number of milliseconds.");
  // Rounding first keeps a product like 3.0000000000000004 from adding a frame.
  const frames = Math.max(1, Math.ceil(Math.round((duration * fps / 1000) * 1e9) / 1e9));
  return Array.from({ length: frames }, (_, i) => start + (i * 1000) / fps);
}

/**
 * Encode `handle`'s animation (a Plot's handle: its animation clock and exportPNG). Options:
 * duration and start in milliseconds, fps (default 30), scale (PNG pixels per CSS pixel,
 * default 1). Resolves to an MP4 Blob.
 */
export async function exportVideo(handle, { duration, fps = 30, start = 0, scale = 1 } = {}) {
  const times = frameTimes({ duration, fps, start });
  const previous = { time: handle.getAnimationTime(), frozen: !!handle.getAnimationTimeFrozen?.() };
  try {
    return await encodeFrames((async function* () {
      for (const time of times) {
        await handle.setAnimationTime(time, { freeze: true });
        yield await handle.exportPNG({ scale });
      }
    })(), { fps });
  } finally {
    await handle.setAnimationTime(previous.time, { freeze: previous.frozen });
  }
}

const CODECS = [
  // H.264 High, Main and Baseline at level 5.1 (up to 4096 x 2304), then VP9 profile 0.
  { codec: "avc1.640033", entry: "avc1" }, { codec: "avc1.4d0033", entry: "avc1" },
  { codec: "avc1.42e033", entry: "avc1" }, { codec: "vp09.00.10.08", entry: "vp09" },
];

/** Encode image frames (PNG Blobs or ImageBitmaps, all one size) at `fps` into an MP4 Blob. */
export async function encodeFrames(frames, { fps = 30 } = {}) {
  if (typeof VideoEncoder === "undefined") throw Error("This browser has no WebCodecs VideoEncoder; export MP4s from Python with its ffmpeg encoder.");
  const samples = [], step = 1e6 / fps;
  let encoder, chosen, description, width, height, canvas, context, index = 0, failure;
  for await (const frame of frames) {
    const bitmap = frame instanceof Blob ? await createImageBitmap(frame) : frame;
    if (!encoder) {
      // Even dimensions: 4:2:0 video halves them.
      width = bitmap.width + (bitmap.width % 2);
      height = bitmap.height + (bitmap.height % 2);
      const config = { width, height, framerate: fps, bitrate: Math.round(width * height * fps * 0.15), latencyMode: "quality" };
      for (const candidate of CODECS) {
        const trial = { ...config, codec: candidate.codec, ...(candidate.entry === "avc1" ? { avc: { format: "avc" } } : {}) };
        if ((await VideoEncoder.isConfigSupported(trial)).supported) { chosen = { ...candidate, config: trial }; break; }
      }
      if (!chosen) throw Error("This browser can encode neither H.264 nor VP9 video at this size.");
      encoder = new VideoEncoder({
        output(chunk, metadata) {
          const data = new Uint8Array(chunk.byteLength);
          chunk.copyTo(data);
          samples.push({ data, key: chunk.type === "key" });
          if (metadata?.decoderConfig?.description)
            description = new Uint8Array(ArrayBuffer.isView(metadata.decoderConfig.description)
              ? metadata.decoderConfig.description.buffer.slice(metadata.decoderConfig.description.byteOffset,
                metadata.decoderConfig.description.byteOffset + metadata.decoderConfig.description.byteLength)
              : metadata.decoderConfig.description);
        },
        error(error) { failure = error; },
      });
      encoder.configure(chosen.config);
      canvas = new OffscreenCanvas(width, height);
      context = canvas.getContext("2d");
    }
    // A video has no alpha: the frame goes over white.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0);
    if (frame instanceof Blob) bitmap.close();
    const videoFrame = new VideoFrame(canvas, { timestamp: Math.round(index * step), duration: Math.round(step) });
    encoder.encode(videoFrame, { keyFrame: index % Math.max(1, Math.round(fps * 2)) === 0 });
    videoFrame.close();
    index++;
    if (failure) throw failure;
  }
  if (!encoder) throw Error("A video needs at least one frame.");
  await encoder.flush();
  encoder.close();
  if (failure) throw failure;
  if (chosen.entry === "avc1" && !description) throw Error("The H.264 encoder gave no decoder configuration.");
  return new Blob([muxMp4({ samples, width, height, fps, entry: chosen.entry, codec: chosen.codec, description })], { type: "video/mp4" });
}

// -- A minimal MP4 muxer: ftyp, mdat with every sample in order, then moov with one video track.

const text = (value) => new TextEncoder().encode(value);
const u8 = (...values) => Uint8Array.from(values);
function u16(value) { return u8(value >>> 8 & 255, value & 255); }
function u32(value) { return u8(value >>> 24 & 255, value >>> 16 & 255, value >>> 8 & 255, value & 255); }
function concat(parts) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}
const box = (type, ...parts) => { const body = concat(parts); return concat([u32(body.length + 8), text(type), body]); };
const fullBox = (type, version, flags, ...parts) => box(type, u8(version, flags >>> 16 & 255, flags >>> 8 & 255, flags & 255), ...parts);
const MATRIX = concat([u32(0x10000), u32(0), u32(0), u32(0), u32(0x10000), u32(0), u32(0), u32(0), u32(0x40000000)]);

/** The MP4 bytes of encoded video samples ({data, key}) at a constant frame rate. */
export function muxMp4({ samples, width, height, fps, entry, codec, description }) {
  const timescale = Math.round(fps * 1000), delta = 1000, duration = samples.length * delta;
  const movieDuration = Math.round((samples.length * 1000) / fps);
  const ftyp = box("ftyp", text("isom"), u32(0x200), text("isom"), text("iso2"), text(entry), text("mp41"));
  const mdatSize = samples.reduce((sum, sample) => sum + sample.data.length, 0);
  const mdat = concat([u32(mdatSize + 8), text("mdat"), ...samples.map((sample) => sample.data)]);
  const config = entry === "avc1" ? box("avcC", description) : vpcC(codec);
  const sampleEntry = box(entry,
    new Uint8Array(6), u16(1),                     // reserved, data reference index
    new Uint8Array(16), u16(width), u16(height),   // pre-defined and reserved, size
    u32(0x480000), u32(0x480000), u32(0), u16(1),  // 72 dpi, reserved, one frame per sample
    new Uint8Array(32), u16(0x18), u16(0xffff),    // compressor name, depth, pre-defined
    config);
  const syncs = samples.flatMap((sample, i) => (sample.key ? [i + 1] : []));
  const stbl = box("stbl",
    fullBox("stsd", 0, 0, u32(1), sampleEntry),
    fullBox("stts", 0, 0, u32(1), u32(samples.length), u32(delta)),
    fullBox("stss", 0, 0, u32(syncs.length), ...syncs.map(u32)),
    fullBox("stsc", 0, 0, u32(1), u32(1), u32(samples.length), u32(1)),
    fullBox("stsz", 0, 0, u32(0), u32(samples.length), ...samples.map((sample) => u32(sample.data.length))),
    fullBox("stco", 0, 0, u32(1), u32(ftyp.length + 8)));
  const minf = box("minf",
    fullBox("vmhd", 0, 1, new Uint8Array(8)),
    box("dinf", fullBox("dref", 0, 0, u32(1), fullBox("url ", 0, 1))),
    stbl);
  const mdia = box("mdia",
    fullBox("mdhd", 0, 0, u32(0), u32(0), u32(timescale), u32(duration), u16(0x55c4), u16(0)),
    fullBox("hdlr", 0, 0, u32(0), text("vide"), new Uint8Array(12), text("VideoHandler\0")),
    minf);
  const trak = box("trak",
    fullBox("tkhd", 0, 3, u32(0), u32(0), u32(1), u32(0), u32(movieDuration), new Uint8Array(8),
      u16(0), u16(0), u16(0), u16(0), MATRIX, u32(width * 0x10000), u32(height * 0x10000)),
    mdia);
  const moov = box("moov",
    fullBox("mvhd", 0, 0, u32(0), u32(0), u32(1000), u32(movieDuration), u32(0x10000), u16(0x100),
      new Uint8Array(10), MATRIX, new Uint8Array(24), u32(2)),
    trak);
  return concat([ftyp, mdat, moov]);
}

/** A VP9 codec configuration box from a codec string such as vp09.00.10.08 (4:2:0, BT.709). */
function vpcC(codec) {
  const [, profile, level, depth] = codec.split(".").map(Number);
  return fullBox("vpcC", 1, 0, u8(profile, level, (depth << 4) | (1 << 1)), u8(1, 1, 1), u16(0));
}
