// @ts-check
import {
  transformClamped,
  DEFAULT_TRANSFORM_CONSTANT,
} from "./scaleTransforms.js";
import { createFrameScale, frameDimensionStages } from "./frameMapping.js";
import { fitCanonicalPoint } from "./canonicalFit.js";
import { MAP_FLAGS } from "./operationTable.js";
import { LIMITS, limitError } from "./limits.js";
import {
  inverseLatitude,
  inverseLongitude,
  inversePolarPoint,
  orthographicAtCenter,
  inverseOrthographicAtCenter,
  polarPoint,
  projectionY,
  inverseY,
  sphericalPoint,
  wrapLongitude,
  longitudeRadians,
  latitudeRadians,
  polarDomain,
  angularPeriod,
  normalizeProjectionCenter,
  periodicSpherical,
  jointProjectionOf,
  TAU,
} from "./coordinates.js";
import {
  jointProjection,
  jointForward,
  jointInverse,
} from "./mapProjections.js";
import { aspect3dSource } from "./aspect3d.js";
import { coordinateView } from "./viewContext.js";

/**
 * Live operations borrow options: CPU mapping reads their current parameters, and rendering
 * binds the same owners. Resolved operations contain numerical values only, for one JAX/WGSL
 * pass. They are different protocols; a packed scale is not a live frame scale.
 * @typedef {import('./internalTypes.js').AxisName} AxisName
 * @typedef {Pick<import('../../options/options.js').OptionsNode, 'get'> & {
 *   defaults?: CoordinateOptions | null, frameDefinition?: CoordinateFrameDefinition,
 *   values?: ReadonlyMap<string, unknown>
 * }} CoordinateOptions
 * @typedef {{parent?: CoordinateOptions | null, placement?: unknown,
 *   ranges?: ReadonlySet<string>, matrix: import('three/webgpu').Matrix4,
 *   owns(axis: string): boolean}} CoordinateFrameDefinition
 * @typedef {{source: CoordinateOptions, rangeKey: string}} LiveScaleStage
 * @typedef {{source?: undefined, domain: number[], range: number[], transform?: string,
 *   constant?: number}} ReferenceScaleStage
 * @typedef {{kind: 'scale', axes?: Partial<Record<AxisName, LiveScaleStage | ReferenceScaleStage>>,
 *   display?: boolean}} ScaleOperation
 * @typedef {{kind: 'polar' | 'spherical-globe' | 'spherical-map2d' | 'spherical-map3d',
 *   options: CoordinateOptions, angleRange?: number[] | null, preserveRadial?: boolean}} ProjectionOperation
 * @typedef {{kind: 'fit', source: CoordinateOptions, radiusKind: 'polar' | 'spherical'}} LiveFitOperation
 * @typedef {{kind: 'fit', source?: undefined, canonicalBounds: number[][],
 *   parentRanges: number[][]}} ReferenceFitOperation
 * @typedef {{kind: 'matrix', elements: number[], inverse: number[]}} MatrixOperation
 * @typedef {Omit<ScaleOperation, 'axes'> & {axes?: Partial<Record<AxisName, LiveScaleStage>>}} LiveScaleOperation
 * @typedef {LiveScaleOperation | ProjectionOperation | LiveFitOperation | MatrixOperation} LiveCoordinateOperation
 * @typedef {ScaleOperation | ProjectionOperation | LiveFitOperation | ReferenceFitOperation |
 *   MatrixOperation} CoordinateOperation
 * @typedef {{kind: string, a: number, d: number, r0: number, span: number,
 *   constant: number}} ResolvedScaleStage
 * @typedef {{kind: 'scale', axes: Partial<Record<AxisName, ResolvedScaleStage>>} |
 *   {kind: 'fit', sx: number, sy: number, tx: number, ty: number} |
 *   {kind: 'matrix', elements: number[]} |
 *   {kind: 'polar', factor: number, origin: number, base: number, radial: number, axis: string} |
 *   {kind: 'spherical-globe', factor: number, origin: number, base: number, radial: number} |
 *   {kind: 'spherical-map2d' | 'spherical-map3d', factor: number, origin: number, base: number,
 *    radial: number, projection: string, centerLongitude: number, centerLatitude: number,
 *    conic?: number[]}} ResolvedCoordinateOperation
 * @typedef {{matrixFor?: (definition: CoordinateFrameDefinition) => import('three/webgpu').Matrix4}}
 *   BuildOptions
 */
/** @type {readonly AxisName[]} */
const AXES = ["x", "y", "z"];
/** The most stages a coordinate mapping has (the registry's coordinateStages). */
const STAGES = /** @type {number} */ (LIMITS.coordinateStages.value);

/** @param {CoordinateOptions | undefined} options @param {string} key
 * @param {unknown} fallback */
const value = (options, key, fallback) =>
  options?.get?.(key) ??
  /** @type {Record<string, unknown> | undefined} */ (options)?.[key] ??
  fallback;
// A surface child's chart texture is always equirectangular (coordinatePoint).
/** @param {CoordinateOptions} options */
const projectionOf = (options) =>
  coordinateView(options) === "chart"
    ? "equirectangular"
    : value(options, "projection", "equirectangular");
/** @template {number | undefined} T @param {ArrayLike<T>} point @returns {(T | number)[]} */
const point3 = (point) => [point[0], point[1], point[2] ?? 0];

/** Select the equivalent angular value nearest a child interval.
 * @param {number | undefined} angle @param {number[] | null | undefined} range
 * @param {number} period */
export function angleInChildRange(angle, range, period) {
  if (
    angle === undefined ||
    !Number.isFinite(angle) ||
    !Array.isArray(range) ||
    !range.every(Number.isFinite) ||
    !Number.isFinite(period) ||
    period <= 0
  )
    return angle;
  const low = Math.min(...range),
    high = Math.max(...range);
  if (angle >= low && angle <= high) return angle;
  const middle = (range[0] + range[1]) / 2;
  return angle + Math.round((middle - angle) / period) * period;
}

/** @param {CoordinateOptions} source */
const coordinateKind = (source) => {
  const kind = source.get("coordinates");
  if (kind === "polar") return "polar";
  if (kind !== "spherical") return "cartesian";
  if (
    coordinateView(source) === "3d" &&
    source.get("sphericalView") !== "projected"
  )
    return "spherical-globe";
  return coordinateView(source) === "3d"
    ? "spherical-map3d"
    : "spherical-map2d";
};

/** @param {CoordinateOptions} options @param {readonly AxisName[]} [axes]
 * @returns {LiveScaleOperation[]} */
function cartesianScales(options, axes = AXES) {
  const stages = Object.fromEntries(
    axes.map((axis) => [axis, frameDimensionStages(options, axis)]),
  );
  const count = Math.max(...axes.map((axis) => stages[axis].length));
  return Array.from({ length: count }, (_, index) => ({
    kind: "scale",
    axes: Object.fromEntries(
      axes.flatMap((axis) => {
        const stage = stages[axis][index];
        return stage ? [[axis, stage]] : [];
      }),
    ),
  }));
}

/** Build the data-to-world path from the nearest frame through its ancestors.
 * A frame that only inherits geometry is transparent. Every operation retains
 * its OptionsNode, so the CPU reads live values and the shader binds live
 * references from the very same descriptor.
 * @param {CoordinateOptions} options @param {BuildOptions} [settings]
 * @returns {LiveCoordinateOperation[]} */
export function buildCoordinateOperations(options, { matrixFor } = {}) {
  /** @param {CoordinateOptions} source @param {number} depth
   * @param {number[] | null} [parentAngleRange] @returns {LiveCoordinateOperation[]} */
  const walk = (source, depth, parentAngleRange = null) => {
    if (depth > STAGES) throw limitError("coordinateStages");
    /** @type {CoordinateOptions | null | undefined} */
    let frame = source;
    while (frame && !frame.frameDefinition) frame = frame.defaults;
    if (!frame) {
      const kind = coordinateKind(source);
      return kind === "cartesian"
        ? cartesianScales(source)
        : [
            {
              kind,
              options: source,
              angleRange: parentAngleRange,
              preserveRadial: !!parentAngleRange,
            },
          ];
    }
    let definition = frame.frameDefinition;
    // An inherited frame has no new coordinate conversion. Keep the original
    // source for its local parameter overrides while looking for the boundary.
    while (
      definition?.parent &&
      !definition.placement &&
      !definition.ranges?.size &&
      frame.get("coordinates") === definition.parent.get("coordinates")
    ) {
      frame = definition.parent;
      definition = frame.frameDefinition;
    }
    const kind = coordinateKind(source),
      parent = definition?.parent;
    const ranged = definition?.ranges?.has("x") && definition.ranges.has("y");
    if (definition?.placement) {
      /** @type {LiveCoordinateOperation[]} */
      const local =
        kind === "cartesian"
          ? cartesianScales(source)
          : [{ kind, options: source }];
      const matrix = matrixFor?.(definition) ?? definition.matrix;
      return [
        ...local,
        {
          kind: "matrix",
          elements: matrix.elements,
          inverse: matrix.clone().invert().elements,
        },
      ];
    }
    if (ranged && parent && kind !== "cartesian")
      return [
        { kind, options: source },
        {
          kind: "fit",
          source: frame,
          radiusKind: kind === "polar" ? "polar" : "spherical",
        },
        ...walk(parent, depth + 2, frame.get("_frameXRange")),
      ];
    if (
      ranged &&
      parent &&
      kind === "cartesian" &&
      coordinateKind(parent) !== "cartesian"
    )
      return [
        {
          kind: "scale",
          axes: Object.fromEntries(
            /** @type {AxisName[]} */ (["x", "y"]).map((axis) => [
              axis,
              {
                source: frame,
                rangeKey: "_frame" + axis.toUpperCase() + "Range",
              },
            ]),
          ),
        },
        ...walk(parent, depth + 1, frame.get("_frameXRange")),
      ];
    return kind === "cartesian"
      ? cartesianScales(source)
      : [
          {
            kind,
            options: source,
            angleRange: parentAngleRange,
            preserveRadial: !!parentAngleRange,
          },
        ];
  };
  const operations = walk(options, 0);
  // Explicit placements have already mapped their anchor through the parent
  // metric and express their own sizes in world units. Other frames inherit
  // one root display metric after all data-coordinate mappings.
  const display =
    !operations.some((operation) => operation.kind === "matrix") &&
    aspect3dSource(options);
  if (display)
    operations.push({
      kind: "scale",
      display: true,
      axes: Object.fromEntries(
        AXES.map((axis) => [
          axis,
          { source: display, rangeKey: axis + "range" },
        ]),
      ),
    });
  if (operations.length > STAGES)
    throw limitError("coordinateStages", { count: operations.length });
  return operations;
}

/** Freeze one ordered chain's numeric parameters for a JAX or WGSL pass.
 * The operation definitions above remain the sole source of topology; these
 * records carry values in a stable layout without retaining OptionsNodes.
 * @param {CoordinateOptions} options
 * @param {BuildOptions & {includePlacement?: boolean}} [settings]
 * @returns {ResolvedCoordinateOperation[]} */
export function resolveCoordinateOperations(
  options,
  { matrixFor, includePlacement = true } = {},
) {
  const operations = buildCoordinateOperations(options, { matrixFor });
  return operations.flatMap(
    /** @returns {ResolvedCoordinateOperation[]} */ (operation) => {
      if (operation.kind === "matrix" && !includePlacement) return [];
      if (operation.kind === "scale") {
        const axes = Object.fromEntries(
          AXES.flatMap((axis) => {
            const stage = operation.axes?.[axis];
            if (!stage) return [];
            const source = stage.source ?? options,
              bounds = value(source, axis + "bounds", null),
              range = value(source, stage.rangeKey, null),
              kind = value(source, axis + "Transform", "linear"),
              constant = value(
                source,
                axis + "TransformConstant",
                DEFAULT_TRANSFORM_CONSTANT,
              );
            if (
              !Array.isArray(bounds) ||
              !Array.isArray(range) ||
              ![...bounds, ...range].every(Number.isFinite)
            )
              throw Error(
                `Coordinate ${axis} scale requires finite bounds and range.`,
              );
            // Bounds map as the shaders map them (clamped into the transform's domain).
            const a = transformClamped(kind, bounds[0], constant),
              denominator = transformClamped(kind, bounds[1], constant) - a;
            return [
              [
                axis,
                {
                  kind,
                  a,
                  d: Math.abs(denominator) < 1e-8 ? 1e-8 : denominator,
                  r0: range[0],
                  span: range[1] - range[0],
                  constant,
                },
              ],
            ];
          }),
        );
        return [{ kind: "scale", axes }];
      }
      if (operation.kind === "fit") {
        const source = operation.source,
          radius =
            operation.radiusKind === "polar"
              ? polarDomain(source).x[1]
              : value(source, "baseRadius", 1),
          xRange = value(source, "_frameXRange", null),
          yRange = value(source, "_frameYRange", null);
        fitCanonicalPoint(
          [0, 0],
          [
            [-radius, radius],
            [-radius, radius],
          ],
          [xRange, yRange],
        );
        const scale =
          Math.min(
            Math.abs(xRange[1] - xRange[0]),
            Math.abs(yRange[1] - yRange[0]),
          ) /
          (2 * radius);
        return [
          {
            kind: "fit",
            sx: scale * Math.sign(xRange[1] - xRange[0]),
            sy: scale * Math.sign(yRange[1] - yRange[0]),
            tx: (xRange[0] + xRange[1]) / 2,
            ty: (yRange[0] + yRange[1]) / 2,
          },
        ];
      }
      if (operation.kind === "matrix")
        return [{ kind: "matrix", elements: Array.from(operation.elements) }];
      const source = operation.options,
        period = angularPeriod(source);
      if (!Number.isFinite(period) || period <= 0)
        throw Error("Coordinate angle period must be finite and positive.");
      const factor = TAU / period,
        base = value(source, "baseRadius", operation.kind === "polar" ? 0 : 1),
        radial = value(source, "radialScale", 1),
        angularBounds = value(source, "xbounds", null);
      if (![base, radial].every(Number.isFinite))
        throw Error("Coordinate radius parameters must be finite.");
      if (operation.kind === "polar")
        return [
          {
            kind: "polar",
            factor,
            origin:
              value(source, "angleUnit", "degrees") === "extent"
                ? angularBounds[0]
                : 0,
            base,
            radial,
            axis: value(source, "polarAxis", "Z"),
          },
        ];
      const origin =
        value(source, "angleUnit", "degrees") === "extent"
          ? (angularBounds[0] + angularBounds[1]) / 2
          : 0;
      if (operation.kind === "spherical-globe")
        return [{ kind: operation.kind, factor, origin, base, radial }];
      const center = normalizeProjectionCenter(
        value(source, "projectionCenter", [0, 0]),
        source,
      );
      // A joint projection's parameters (albers' conic constants) ride with the record.
      const joint = jointProjection(projectionOf(source))
        ? jointProjectionOf(source)
        : null;
      return [
        {
          kind: operation.kind,
          factor,
          origin,
          base,
          radial,
          projection: projectionOf(source),
          centerLongitude: (center[0] - origin) * factor,
          centerLatitude: center[1] * factor,
          ...(joint?.params
            ? { conic: [joint.params.n, joint.params.c, joint.params.rho0] }
            : {}),
        },
      ];
    },
  );
}

/** Whether an operation bends straight source lines: polar, spherical, or a
 * scale with a log or sqrt transform. Fits, placements and linear scales are
 * affine and keep straight lines straight.
 * @param {CoordinateOperation} operation @param {CoordinateOptions} options */
export function bendingOperation(operation, options) {
  return (
    operation.kind === "polar" ||
    operation.kind.startsWith("spherical") ||
    (operation.kind === "scale" &&
      Object.entries(operation.axes ?? {}).some(
        ([axis, stage]) =>
          ((stage.source ?? options).get(axis + "Transform") ?? "linear") !==
          "linear",
      ))
  );
}

/** Whether every operation after the mark's own is affine (a fit, a
 * placement or a linear scale): mixing mapped points then commutes with the
 * rest of the chain, so a cut found in the mark's own space stays exact.
 * @param {CoordinateOptions} options */
export function affineAncestors(options) {
  try {
    return buildCoordinateOperations(options)
      .slice(1)
      .every(
        (operation) =>
          operation.kind === "fit" ||
          operation.kind === "matrix" ||
          (operation.kind === "scale" && !bendingOperation(operation, options)),
      );
  } catch {
    return false;
  }
}

/** A lone flat-map operation is a repeating root: its marks draw once per
 * visible longitude tile, so paths keep unwrapped longitude. Any other chain
 * (a ranged, placed or ancestor-mapped map) shows one canonical extent.
 * @param {readonly (CoordinateOperation | ResolvedCoordinateOperation)[]} operations */
export function repeatingRootMap(operations) {
  const [operation] = operations,
    options =
      operation && "options" in operation ? operation.options : undefined;
  // A resolved record carries its projection; a built one reads its options.
  const projection =
    (operation && "projection" in operation
      ? operation.projection
      : undefined) ??
    (coordinateView(options) === "chart"
      ? "equirectangular"
      : options?.get("projection"));
  // Joint projections (equal-earth, albers, ...) have one curved outline: never repeating.
  return (
    operations.length === 1 &&
    (operation.kind === "spherical-map2d" ||
      operation.kind === "spherical-map3d") &&
    projection !== "orthographic" &&
    !jointProjection(projection)
  );
}

/**
 * Whether a mark's chain ends in a repeating root flat map, which the
 * renderer repeats across the antimeridian (wrappedRender.js): marks in the
 * map itself and in any frame on it, such as a chart. Cached per frame
 * topology, since the render loop asks for every mark each frame.
 */
/** @type {WeakMap<CoordinateOptions, {key: string, value: boolean}>} */
const wrapCache = new WeakMap();
/** @param {CoordinateOptions | undefined} options */
export function wrapsWithRoot(options) {
  if (!options?.get) return false;
  const key = `${options.get("_frameTopology") ?? ""}|${options.get("coordinates")}|${options.get("projection")}|${coordinateView(options)}`;
  const cached = wrapCache.get(options);
  if (cached?.key === key) return cached.value;
  let value = false;
  try {
    const last = buildCoordinateOperations(options).at(-1);
    value =
      last?.kind === "spherical-map2d" &&
      periodicSpherical(last.options ?? options);
  } catch {
    value = false;
  }
  wrapCache.set(options, { key, value });
  return value;
}

/** Flat-map flags for path refinement: a repeating root keeps unwrapped
 * longitude and clamps Mercator, as its vertices do; any other map is one
 * extent, cut at its seam and Mercator limit.
 * @param {readonly (CoordinateOperation | ResolvedCoordinateOperation)[]} operations
 * @returns {(operation: ResolvedCoordinateOperation, index: number) => number} */
export function pathOperationFlags(operations) {
  const root = repeatingRootMap(operations);
  return () =>
    root ? MAP_FLAGS.unwrap | MAP_FLAGS.clampMercator : MAP_FLAGS.cutMercator;
}

/** An ordered numerical coordinate path. Each operation consumes the previous
 * operation's output; a coordinate embedding can never be applied twice by a
 * per-axis scale stage. Source identity remains outside this numerical path.
 * @param {ArrayLike<number>} point @param {readonly CoordinateOperation[]} operations
 * @returns {number[] | null} */
export function applyCoordinateOperations(point, operations) {
  if (!Array.isArray(operations))
    throw Error("Coordinate operations must be an array.");
  if (operations.length > STAGES)
    throw limitError("coordinateStages", { count: operations.length });
  /** @type {number[] | null} */
  let current = point3(point);
  for (const operation of operations) {
    if (current === null) return null;
    current = forwardOperation(current, operation);
  }
  return current;
}

/** Reverse only nonsingular operations. Projection inverses return undefined
 * for a coordinate that the projection discarded.
 * @param {ArrayLike<number>} point @param {readonly CoordinateOperation[]} operations
 * @returns {(number | undefined)[] | null} */
export function inverseCoordinateOperations(point, operations) {
  if (!Array.isArray(operations))
    throw Error("Coordinate operations must be an array.");
  if (operations.length > STAGES)
    throw limitError("coordinateStages", { count: operations.length });
  /** @type {(number | undefined)[] | null} */
  let current = point3(point);
  for (let index = operations.length - 1; index >= 0; index--) {
    if (current === null) return null;
    current = inverseOperation(current, operations[index]);
  }
  return current;
}

/** @param {ScaleOperation} operation */
function scales(operation) {
  return AXES.map((axis) => {
    const stage = operation.axes?.[axis];
    if (!stage) return null;
    if (!("rangeKey" in stage)) return createFrameScale(stage);
    const source = stage.source;
    return createFrameScale({
      domain: source.get(axis + "bounds"),
      range: source.get(stage.rangeKey),
      transform: source.get(axis + "Transform") ?? "linear",
      constant:
        source.get(axis + "TransformConstant") ?? DEFAULT_TRANSFORM_CONSTANT,
    });
  });
}

/** @param {LiveFitOperation | ReferenceFitOperation} operation
 * @returns {{canonicalBounds: number[][], parentRanges: number[][]}} */
function fitIntervals(operation) {
  if ("canonicalBounds" in operation) return operation;
  const radius =
    operation.radiusKind === "polar"
      ? polarDomain(operation.source).x[1]
      : operation.source.get("baseRadius");
  return {
    canonicalBounds: [
      [-radius, radius],
      [-radius, radius],
    ],
    parentRanges: /** @type {AxisName[]} */ (["x", "y"]).map((axis) =>
      operation.source.get("_frame" + axis.toUpperCase() + "Range"),
    ),
  };
}

/** @template {number | undefined} T @param {T[]} point
 * @param {LiveFitOperation | ReferenceFitOperation} operation @param {boolean} [inverse]
 * @returns {(T | number)[]} */
function fitted(point, operation, inverse = false) {
  const { canonicalBounds, parentRanges } = fitIntervals(operation);
  if (!inverse)
    return [
      ...fitCanonicalPoint(point, canonicalBounds, parentRanges),
      ...point.slice(parentRanges.length),
    ];
  const count = parentRanges.length;
  const ratios = parentRanges.map((target, axis) =>
    Math.abs(
      (target[1] - target[0]) /
        (canonicalBounds[axis][1] - canonicalBounds[axis][0]),
    ),
  );
  const scale = Math.min(...ratios);
  // The forward validator rejects missing, constant and nonfinite intervals.
  fitCanonicalPoint(
    canonicalBounds.map((interval) => (interval[0] + interval[1]) / 2),
    canonicalBounds,
    parentRanges,
  );
  const mapped = Array.from({ length: count }, (_, axis) => {
    const source = canonicalBounds[axis],
      target = parentRanges[axis];
    const orientation = Math.sign(
      (target[1] - target[0]) / (source[1] - source[0]),
    );
    return (
      (source[0] + source[1]) / 2 +
      ((point[axis] ?? NaN) - (target[0] + target[1]) / 2) /
        (scale * orientation)
    );
  });
  return [...mapped, ...point.slice(count)];
}

/** @param {(number | undefined)[]} point @param {number[]} elements */
function matrixPoint(point, elements) {
  if (
    !Array.isArray(elements) ||
    elements.length !== 16 ||
    !elements.every(Number.isFinite)
  )
    throw Error("Coordinate placement requires a finite 4×4 matrix.");
  const p = point3(point),
    x = p[0] ?? NaN,
    y = p[1] ?? NaN,
    z = p[2] ?? NaN;
  const w = elements[3] * x + elements[7] * y + elements[11] * z + elements[15];
  if (!Number.isFinite(w) || Math.abs(w) < 1e-12) return null;
  return [0, 1, 2].map(
    (axis) =>
      (elements[axis] * x +
        elements[axis + 4] * y +
        elements[axis + 8] * z +
        elements[axis + 12]) /
      w,
  );
}

/** @param {number[]} point @param {CoordinateOptions} options @param {'map2d' | 'map3d'} view */
function sphericalProjected(point, options, view) {
  const longitude = longitudeRadians(point[0], options),
    latitude = latitudeRadians(point[1], options);
  const radius =
    value(options, "baseRadius", 1) +
    value(options, "radialScale", 1) * point[2];
  if (
    ![longitude, latitude, radius].every(Number.isFinite) ||
    Math.abs(latitude) > Math.PI / 2 + 1e-9 ||
    radius <= 0
  )
    return null;
  const projection = projectionOf(options);
  if (projection === "orthographic") {
    const disk = orthographicAtCenter(point, options);
    return disk
      ? view === "map3d"
        ? [disk[0], point[2] * value(options, "radialScale", 1), -disk[1]]
        : [disk[0], disk[1], 0]
      : null;
  }
  if (jointProjection(projection)) {
    const joint = jointProjectionOf(options);
    if (!joint) throw Error(`Not a joint projection: ${projection}.`);
    const xy = jointForward(
      projection,
      longitude - joint.center,
      latitude,
      joint.params,
      { center: joint.center },
    );
    if (!xy) return null;
    const base = value(options, "baseRadius", 1);
    return view === "map3d"
      ? [
          xy[0] * base,
          point[2] * value(options, "radialScale", 1),
          -xy[1] * base,
        ]
      : [xy[0], xy[1], 0];
  }
  const x = wrapLongitude(longitude),
    y = projectionY(latitude, projection);
  return view === "map3d"
    ? [
        x * value(options, "baseRadius", 1),
        point[2] * value(options, "radialScale", 1),
        -y * value(options, "baseRadius", 1),
      ]
    : [x, y, 0];
}

/** @param {(number | undefined)[]} input @param {CoordinateOptions} options
 * @param {'map2d' | 'map3d'} view */
function inverseSphericalProjected(input, options, view) {
  // A preceding inverse may discard a component; arithmetic on it remains NaN.
  const px = input[0] ?? NaN,
    py = input[1] ?? NaN,
    pz = input[2] ?? NaN;
  const projection = projectionOf(options);
  const base = value(options, "baseRadius", 1),
    radial = value(options, "radialScale", 1);
  if (projection === "orthographic") {
    const disk = view === "map3d" ? [px, -pz] : input;
    const offset = view === "map3d" && radial !== 0 ? py / radial : 0;
    const result = inverseOrthographicAtCenter(
      disk,
      options,
      base + radial * offset,
    );
    return result
      ? [result[0], result[1], view === "map3d" ? offset : undefined]
      : null;
  }
  if (view === "map3d" && (!Number.isFinite(base) || base <= 0)) return null;
  const x = view === "map3d" ? px / base : px,
    y = view === "map3d" ? -pz / base : py;
  if (jointProjection(projection)) {
    const joint = jointProjectionOf(options);
    if (!joint) throw Error(`Not a joint projection: ${projection}.`);
    const result = jointInverse(projection, x, y, joint.params, {
      center: joint.center,
    });
    return result
      ? [
          inverseLongitude(wrapLongitude(result[0] + joint.center), options),
          inverseLatitude(result[1], options),
          view === "map3d" && radial !== 0 ? py / radial : undefined,
        ]
      : null;
  }
  return [
    inverseLongitude(wrapLongitude(x), options),
    inverseLatitude(inverseY(y, projection), options),
    view === "map3d" && radial !== 0 ? py / radial : undefined,
  ];
}

/** @param {number[]} point @param {CoordinateOperation} operation @returns {number[] | null} */
function forwardOperation(point, operation) {
  switch (operation.kind) {
    case "scale": {
      const mapping = scales(operation);
      return point.map((v, index) => mapping[index]?.forward(v) ?? v);
    }
    case "polar":
      return polarPoint(point, operation.options);
    case "spherical-globe":
      return sphericalPoint(point, operation.options);
    case "spherical-map2d":
      return sphericalProjected(point, operation.options, "map2d");
    case "spherical-map3d":
      return sphericalProjected(point, operation.options, "map3d");
    case "fit":
      return fitted(point, operation);
    case "matrix":
      return matrixPoint(point, operation.elements);
    default:
      throw Error(
        `Unknown coordinate operation: ${/** @type {{kind: string}} */ (operation).kind}.`,
      );
  }
}

/** @param {(number | undefined)[]} point @param {CoordinateOperation} operation
 * @returns {(number | undefined)[] | null} */
function inverseOperation(point, operation) {
  /** @param {(number | undefined)[] | null} result */
  const adjustAngle = (result) => {
    if (!("options" in operation)) return result;
    if (result?.[0] !== undefined)
      result[0] = angleInChildRange(
        result[0],
        operation.angleRange ?? value(operation.options, "xbounds", null),
        angularPeriod(operation.options),
      );
    if (result && operation.preserveRadial && result[2] === undefined)
      result[2] = 0;
    return result;
  };
  switch (operation.kind) {
    case "scale": {
      const mapping = scales(operation);
      return point.map((v, index) =>
        v === undefined ? undefined : (mapping[index]?.inverse(v) ?? v),
      );
    }
    case "polar":
      return adjustAngle(inversePolarPoint(point, operation.options));
    case "spherical-globe": {
      const x = point[0] ?? NaN,
        y = point[1] ?? NaN,
        z = point[2] ?? NaN;
      const radius = Math.hypot(x, y, z);
      if (!Number.isFinite(radius) || radius === 0) return null;
      const radial = value(operation.options, "radialScale", 1);
      return [
        inverseLongitude(Math.atan2(x, z), operation.options),
        inverseLatitude(
          Math.asin(Math.max(-1, Math.min(1, y / radius))),
          operation.options,
        ),
        radial === 0
          ? undefined
          : (radius - value(operation.options, "baseRadius", 1)) / radial,
      ];
    }
    case "spherical-map2d":
      return adjustAngle(
        inverseSphericalProjected(point, operation.options, "map2d"),
      );
    case "spherical-map3d":
      return adjustAngle(
        inverseSphericalProjected(point, operation.options, "map3d"),
      );
    case "fit":
      return fitted(point, operation, true);
    case "matrix":
      return matrixPoint(point, operation.inverse);
    default:
      throw Error(
        `Unknown coordinate operation: ${/** @type {{kind: string}} */ (operation).kind}.`,
      );
  }
}
