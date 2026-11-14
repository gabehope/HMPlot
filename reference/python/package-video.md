# hmplot/video

A plot's animation encoded as MP4 in the browser with WebCodecs, loaded on first use.

JavaScript only.

## Example

```svelte
// A Plot handle loads this module itself: plot.exportVideo({ duration: 3000, fps: 30 }).
import { exportVideo } from "hmplot/video";

const blob = await exportVideo(plot, { duration: 3000, fps: 30, scale: 2 });
```

## Exports

- `exportVideo(handle, {duration, fps, start, scale})` (`Promise<Blob>`): An MP4 (H.264 where the browser has it, else VP9) of a Plot handle's animation: one PNG export per frame at a frozen clock time, from start (ms, default 0) for duration ms at fps (default 30) and scale (PNG pixels per CSS pixel, default 1); the clock returns to its time and frozen state afterwards. A browser without VideoEncoder is an error.
- `frameTimes({duration, fps, start})` (`number[]`): The frames' clock times in milliseconds: start + i × 1000 / fps before start + duration, at least one (the frames Python's export_mp4 steps through).
- `encodeFrames(frames, {fps})` (`Promise<Blob>`): Encodes image frames (PNG Blobs or ImageBitmaps, all one size, from an iterable or async iterable) at fps into an MP4. A frame has no alpha: it goes over white.
- `muxMp4({samples, width, height, fps, entry, codec, description})` (`Uint8Array`): The MP4 bytes of already encoded samples ({ data, key }) at a constant frame rate; encodeFrames uses it.

## Usage

A [Plot handle](plot-handle)'s `exportVideo({ duration, fps, start, scale })` imports this module the first time it runs, so a page that never exports video does not carry the encoder; import it yourself to encode frames of your own, or to know the frames' times. The video has the plot's animation clock frozen at each frame's time, so `@time` channels, transitions, playing Playbacks and running Simulates all advance by exactly one frame per frame, however long the export takes.

Encoding uses the browser's WebCodecs `VideoEncoder`: Chrome and Edge have it, and other browsers may not, in which case the export is an error. Odd frame sizes are padded to even ones, and frames are drawn over white, since MP4 video has no alpha. Python's `export_mp4(..., encoder="browser")` uses this encoder in the notebook view or the export browser; its default encoder is ffmpeg, which needs no WebCodecs. See docs/DOCUMENT-EXPORT.md, "Video in the browser".

## Related examples

- [animate, enter/exit, and @time](/HMPlot/examples/animation-engine.md)
