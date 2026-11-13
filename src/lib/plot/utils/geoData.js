/** GeoJSON structure is host metadata; numeric measurements remain ordinary columns. */
/** @param {unknown} value @returns {value is import("./dataViewTypes.js").GeometryColumn} */
export const isGeometryColumn = (value) => value?.isGeometryColumn === true;
export function geoFeatures(data) {
  if (!data || typeof data !== "object")
    throw Error("GeoJSON requires a Geometry, Feature, or FeatureCollection.");
  const features =
    data.type === "FeatureCollection"
      ? data.features
      : data.type === "Feature"
        ? [data]
        : [{ type: "Feature", properties: {}, geometry: data }];
  if (!Array.isArray(features))
    throw Error("GeoJSON FeatureCollection requires a features array.");
  for (const [i, f] of features.entries()) {
    if (
      !f ||
      f.type !== "Feature" ||
      (f.properties != null &&
        (typeof f.properties !== "object" || Array.isArray(f.properties)))
    )
      throw Error(`GeoJSON feature ${i}: invalid Feature.`);
    if (Object.hasOwn(f.properties ?? {}, "geometry"))
      throw Error(
        `GeoJSON feature ${i}: property "geometry" conflicts with the reserved geometry column.`,
      );
  }
  return features;
}
export function geoTable(data) {
  const features = geoFeatures(data),
    columns = Object.create(null);
  for (const f of features)
    for (const key of Object.keys(f.properties ?? {})) columns[key] ??= [];
  for (const key of Object.keys(columns)) {
    const values = features.map((f) => f.properties?.[key]);
    columns[key] = values.some(
      (v) => typeof v === "string" || typeof v === "boolean",
    )
      ? values
      : values.map((v) => (v == null ? NaN : v));
  }
  columns.geometry = {
    isGeometryColumn: true,
    features,
    length: features.length,
    source: data,
    indices: null,
  };
  return columns;
}
