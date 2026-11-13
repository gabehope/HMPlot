import { Color } from "three/webgpu";

/** The shader blends a filled border in linear RGB. SVG/PDF stroke alpha blends in
 * sRGB, so resolve its color first; retain real alpha for hollow symbols. */
export function filledOutlineColor(fill, style) {
  return style.opacity >= 1 ? style.color
    : `#${new Color(fill).lerp(new Color(style.color), style.opacity).getHexString()}`;
}

/** A filled boundary with an inside stroke. Group opacity matches the shader's single pass:
 * the border fades over the fill before global/interaction opacity applies. */
export function outlinedPath(d, fill, opacity, style, boundary = d, extra = {}) {
  const path = { type: "path", attrs: { d, fill, ...extra } };
  if (!(style.width > 0 && style.opacity > 0 && style.color)) {
    path.attrs.opacity = opacity;
    return path;
  }
  // Deterministic IDs keep Python/Svelte exports identical. Equal paths can share the same clip.
  let hash = 2166136261;
  for (let k = 0; k < d.length; k++) hash = Math.imul(hash ^ d.charCodeAt(k), 16777619);
  const id = `hmplot-outline-${(hash >>> 0).toString(16)}`;
  return { type: "g", attrs: { opacity }, children: [
    { type: "clipPath", attrs: { id }, children: [{ type: "path", attrs: { d } }] }, path,
    { type: "path", attrs: { d: boundary, fill: "none", stroke: filledOutlineColor(fill, style),
      "stroke-width": 2 * style.width, "stroke-opacity": 1,
      "stroke-linejoin": "round", "stroke-linecap": "round", "clip-path": `url(#${id})` } },
  ] };
}
