import { prepareNamed } from "./namedData.js";
import { scaleProps } from "./scaleProps.js";
import { numericExtent, scaleOptions } from "./scaleBindings.js";
import { shapeOf } from "./data.js";
/** A composite geographic mark has independent area and line color channels. */
export function prepareGeoStyles(args, scope, options, state) {
  const { color, colorScale, ...fillArgs } = args;
  const fill = prepareNamed(fillArgs, scope, options, "GeoJSON", state);
  let stroke;
  try {
    if (color !== undefined || colorScale !== undefined)
      stroke = prepareNamed(
        {
          ...args,
          fill: undefined,
          fillScale: undefined,
          color: color ?? args.fill,
          colorScale,
          position: args.position,
        },
        scope,
        options,
        "GeoJSON",
        state,
      );
    return {
      props: fill.props,
      stroke: stroke?.props ?? { ...fill.props, color: fill.props.fill },
      metadata: { ...fill.metadata, ...stroke?.metadata },
      scales: new Set([...fill.scales, ...(stroke?.scales ?? [])]),
      // GPU-array RGB rows are range-checked asynchronously by the mark, like other marks.
      rgbChecks: [...fill.rgbChecks, ...(stroke?.rgbChecks ?? [])],
      rgb: { ...fill.rgb, ...stroke?.rgb },
      dispose() {
        fill.dispose();
        stroke?.dispose();
      },
    };
  } catch (e) {
    fill.dispose();
    stroke?.dispose();
    throw e;
  }
}

/**
 * A GeoJSON's continuous colors (TODO 64.9): GeoJSON bypasses namedMark, whose scale bindings
 * give other marks theirs, so its numeric fill (faces and points) and line color mapped through
 * the default [0, 1] and ignored colormap and a continuous fillScale or colorScale. This returns
 * each channel's mark options as namedMark's would set them: the scale's domain, else the values'
 * finite extent in the scale's transform's domain. { fill, color }, each null when the channel
 * is not numbers; a line color left unset follows the fill.
 */
export async function geoColorOptions(args, prepared, signal) {
  const result = { fill: null, color: null };
  for (const channel of ["fill", "color"]) {
    if (channel === "color" && args.color === undefined && args.colorScale === undefined) {
      result.color = result.fill;
      continue;
    }
    const values = channel === "fill" ? prepared.props.fill : prepared.stroke.color;
    if (prepared.metadata?.[channel] || prepared.rgb?.[channel] || typeof values === "string" ||
        typeof values === "number" || shapeOf(values).length !== 1) continue;
    const own = Object.fromEntries([channel, `${channel}Scale`, "colormap"]
      .filter((key) => args[key] !== undefined).map((key) => [key, args[key]]));
    const flat = scaleProps(own, "GeoJSON"), scale = flat[`${channel}Scale`];
    if (scale?.isCategorical) continue;
    if (scale?.isContinuous) {
      const extent = scale.normalization.explicit ? null : await numericExtent(values, scale.normalization.transform, signal);
      result[channel] = scaleOptions(scale, "color", scale.normalization.preview({}, extent), {});
      continue;
    }
    const domain = await numericExtent(values, "linear", signal) ?? [0, 1];
    result[channel] = { valueBounds: domain, valueTransform: "linear", ...(flat.cmapIndex !== undefined ? { cmapIndex: flat.cmapIndex } : {}) };
  }
  return result;
}
