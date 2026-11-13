import { loadFont } from "./fonts.js";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { ShapeGeometry, BufferGeometry } from "three/webgpu";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
const cache = new Map();
export async function labelGeometry(
  content,
  tex = false,
  align = "center",
  fontName = "helvetiker",
) {
  const key = JSON.stringify([content, tex, align, tex ? null : fontName]);
  let entry = cache.get(key);
  if (!entry) {
    entry = {
      users: 0,
      promise: (async () => {
        let geometry;
        if (tex) {
          const { texSVG } = await import("./tex.js");
          // MathJax inherits its SVG color from CSS. SVGLoader has no CSS context, and
          // only the outlines are used here: the label material supplies their color.
          const parsed = new SVGLoader().parse((await texSVG(content)).replaceAll("currentColor", "#000000"));
          const parts = parsed.paths.flatMap((path) =>
            SVGLoader.createShapes(path).map(
              (shape) => new ShapeGeometry(shape),
            ),
          );
          geometry = parts.length
            ? mergeGeometries(parts)
            : new BufferGeometry();
          parts.forEach((part) => part.dispose());
          geometry.scale(0.001, -0.001, 0.001);
        } else {
          const font = await loadFont(fontName);
          geometry = new ShapeGeometry(font.generateShapes(content, 1));
        }
        if (geometry.attributes.position?.count) {
          geometry.computeBoundingBox();
          const box = geometry.boundingBox;
          geometry.translate(
            align === "left"
              ? -box.min.x
              : align === "right"
                ? -box.max.x
                : -(box.min.x + box.max.x) / 2,
            -(box.min.y + box.max.y) / 2,
            0,
          );
        }
        return geometry;
      })(),
    };
    cache.set(key, entry);
    entry.promise.catch(() => cache.delete(key));
  }
  entry.users++;
  let released = false;
  function release() {
    if (released) return;
    released = true;
    entry.users--;
    if (entry.users === 0 && cache.get(key) === entry) {
      cache.delete(key);
      entry.promise.then(
        (g) => g.dispose(),
        () => {},
      );
    }
  }
  try {
    return { geometry: await entry.promise, release };
  } catch (error) {
    release();
    throw error;
  }
}
