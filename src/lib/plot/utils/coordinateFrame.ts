import { polarAxisLayout, polarBands } from "./axes.js";
import { framePoint } from "./framePlacement.js";
import { orthographicGuides } from "./orthographicGuides.js";
import type { RoundLabel } from "./plotLayout.js";
import {
  angularFactor,
  sphericalDomain,
  polarDomain,
  jointProjectionOf,
} from "./coordinates.js";
import { fitMapViewport } from "./mapFit.js";
import { viewContextOf } from "./viewContext.js";
import type { OptionsNode } from "../../options/options.js";
import type { NavigationControls } from "./internalTypes.js";

type Axis = "x" | "y" | "z";
type Bounds = number[] | undefined;

/**
 * Coordinate-specific frame policy. Borrows the frame's options; owns the Cartesian ranges
 * saved across a switch to geographic coordinates. The frame owns subscriptions and calls
 * these operations when its configuration changes. No render work or arrays are retained.
 */
export class CoordinateFrame {
  #options: OptionsNode;
  #previous = "cartesian";
  #cartesian: Record<string, unknown> | undefined;

  constructor(options: OptionsNode) {
    this.#options = options;
  }

  padding(value: number) {
    return this.#options.get("coordinates") === "spherical" ? 0 : value;
  }

  collects(axis?: string) {
    const o = this.#options;
    return (
      o.get("coordinates") !== "spherical" ||
      (o.get("projection") === "orthographic" && (!axis || axis === "z")) ||
      (o.get("angleUnit") === "extent" && (!axis || axis === "x"))
    );
  }

  publishDomain(axis: string, bounds: number[], viewOptions: OptionsNode) {
    if (axis === "z" && this.#options.get("projection") === "orthographic")
      viewContextOf(viewOptions)?.update({
        radialExtent: [bounds[0], bounds[1]],
      });
  }

  /** A root's authored angular domain can frame a separable flat map. */
  domainBox(mode: string, viewport: unknown, x: Bounds, y: Bounds) {
    const o = this.#options;
    if (
      viewport !== undefined ||
      o.get("coordinates") !== "spherical" ||
      mode === "3d" ||
      o.get("projection") === "orthographic" ||
      jointProjectionOf(o)
    )
      return null;
    const unit = o.get("angleUnit");
    if (unit === "extent" || (!x && !y)) return null;
    const degrees = (v: number) =>
      unit === "radians" ? (v * 180) / Math.PI : v;
    const [west, east] = x
      ? [degrees(Math.min(...x)), degrees(Math.max(...x))]
      : [-180, 180];
    const [south, north] = y
      ? [degrees(Math.min(...y)), degrees(Math.max(...y))]
      : [-80, 80];
    return [west, south, east, north].every(Number.isFinite) &&
      east > west &&
      north > south
      ? [west, south, east, north]
      : null;
  }

  fit(
    controls: NavigationControls | undefined,
    rect: { width: number; height: number },
    box: number[],
  ) {
    return fitMapViewport(this.#options, controls, rect, box);
  }

  /** Install geographic ranges, or restore authored/saved ranges when returning to Cartesian. */
  syncRanges(domain: (axis: Axis) => Bounds, range: (axis: Axis) => Bounds) {
    const o = this.#options,
      kind = o.get("coordinates");
    if (kind === "spherical") {
      if (this.#previous !== "spherical")
        this.#cartesian = Object.fromEntries(
          ["xbounds", "ybounds", "xrange", "yrange"].map((k) => [k, o.get(k)]),
        );
      const bounds = sphericalDomain(o),
        unit = o.get("angleUnit");
      const period =
        unit === "extent"
          ? Math.abs(o.get("xbounds")[1] - o.get("xbounds")[0])
          : (2 * Math.PI) / angularFactor(o);
      o.set("xrange", bounds.x);
      o.set("yrange", bounds.y);
      if (domain("x") === undefined && unit !== "extent")
        o.set("xbounds", [-period / 2, period / 2]);
      if (domain("y") === undefined)
        o.set("ybounds", [-period / 4, period / 4]);
    } else if (this.#previous === "spherical" && this.#cartesian) {
      for (const [key, value] of Object.entries(this.#cartesian))
        o.set(
          key,
          (key.endsWith("bounds")
            ? domain(key[0] as Axis)
            : range(key[0] as Axis)) ?? value,
        );
    }
    this.#previous = kind;
  }
}

/** Guide labels in disk-relative coordinates, shared with the root's layout measurement.
 * Reads coordinate options and text metrics; returns descriptors and retains no layout state. */
export function roundFrameLabels(
  axisOptions: OptionsNode,
  {
    width,
    height,
    fontSize,
    font,
    tickLabelsEnabled,
    shown,
    visible,
    measure,
  }: {
    width: number;
    height: number;
    fontSize: number;
    font: string;
    tickLabelsEnabled: boolean;
    shown: { x: boolean; y: boolean };
    visible: boolean;
    measure: (label: string, font: string) => number;
  },
): RoundLabel[] {
  const labels: RoundLabel[] = [];
  const text = { fontSize, font },
    tickLabels = tickLabelsEnabled,
    showX = shown.x,
    showY = shown.y,
    // A rule's or band's label: 4 px right of and above its point.
    note = (label: unknown, angle: number, radius: number) =>
      label
        ? labels.push({
            text: String(label),
            angle,
            radius,
            dx: 4,
            dy: -4,
            anchor: "start",
            ...text,
          })
        : 0,
    // A point in disk radii (x right, y up) as an angle and a radius.
    polarPoint = (u: number, v: number) => ({
      angle: Math.atan2(v, u),
      radius: Math.hypot(u, v),
    });
  const coordinates = axisOptions.get("coordinates");
  if (visible && coordinates === "polar") {
    const ticks = polarAxisLayout(axisOptions, Math.min(width, height)),
      r = Math.max(...polarDomain(axisOptions).x),
      x = ticks.angular.config,
      y = ticks.radial.config;
    if (showX) {
      if (tickLabels && x.major)
        for (const t of ticks.angular.major)
          if (t.showLabel)
            labels.push({
              text: String(t.label),
              angle: t.angle,
              dy: -(x.tickLabelOffset ?? 3) - 2,
              anchor:
                (x.tickLabelAlign ?? "auto") === "auto"
                  ? "middle"
                  : x.tickLabelAlign,
              rotate: x.tickLabelAngle ?? 0,
              ...text,
            });
      for (const t of ticks.angular.reference) note(t.label, t.angle, 1);
    }
    if (showY) {
      if (tickLabels && y.major)
        for (const t of ticks.radial.major)
          if (t.showLabel)
            labels.push({
              text: String(t.label),
              angle: 0,
              radius: t.radius / r,
              dx: y.tickLabelOffset ?? 3,
              dy: -4,
              anchor:
                (y.tickLabelAlign ?? "auto") === "auto"
                  ? "start"
                  : y.tickLabelAlign,
              rotate: y.tickLabelAngle ?? 0,
              ...text,
            });
      for (const t of ticks.radial.reference) note(t.label, 0, t.radius / r);
    }
    // Band labels: at the middle of an angular band's outer arc, the start of a radial band's.
    for (const band of polarBands(axisOptions)) {
      if (!band.label) continue;
      const world = framePoint(axisOptions, [
        ...(band.axis === "x"
          ? band.outer[Math.floor(band.outer.length / 2)]
          : band.outer[0]),
        0,
      ]);
      if (world?.every?.(Number.isFinite)) {
        const { angle, radius } = polarPoint(world[0] / r, world[1] / r);
        note(band.label, angle, radius);
      }
    }
  } else if (
    visible &&
    coordinates === "spherical" &&
    axisOptions.get("projection") === "orthographic" &&
    width >= 120 &&
    height >= 80
  ) {
    // A globe's labels, where the overlay anchors them for a disk this size: a meridian's on its
    // face, a parallel's left of its leftmost point, outside the limb (TODO 135.5).
    // Laid out at twice the area's size, with labels scaled alike, so the labels the overlay
    // keeps apart on the drawn disk (about the area's size) are the ones given room.
    const r = Math.max(...sphericalDomain(axisOptions).x),
      size = 2 * Math.min(width, height),
      scale = size / Math.min(width, height),
      // orthographicGuides is untyped JavaScript: its guides by axis.
      guides = orthographicGuides(
        axisOptions,
        { x: [-r, r], y: [-r, r] },
        size,
        size,
        {
          shown: { x: showX, y: showY },
          fontSize: fontSize * scale,
          measure: (label: string) => measure(label, font) * scale,
        },
      ) as Record<"x" | "y", { major: any[]; reference: any[] }>;
    for (const a of ["x", "y"] as const) {
      if (!(a === "x" ? showX : showY)) continue;
      const at = (anchor: { x: number; y: number }) =>
        polarPoint((anchor.x / size) * 2 - 1, 1 - (anchor.y / size) * 2);
      for (const guide of guides[a].major)
        if (tickLabels && guide.showLabel && guide.anchor)
          labels.push({
            text: String(guide.label),
            ...at(guide.anchor),
            dx: a === "y" ? -5 : 0,
            dy: a === "x" ? -4 : 0,
            anchor: a === "y" ? "end" : "middle",
            ...text,
          });
      for (const rule of guides[a].reference)
        if (rule.anchor) {
          const { angle, radius } = at(rule.anchor);
          note(rule.label, angle, radius);
        }
    }
  }
  return labels;
}

/** Validate a coordinate system's angular dimensions before publishing frame options. */
export function validateAngularAxis(
  system: unknown,
  axis: string,
  type: unknown,
  transform: unknown,
) {
  if (
    system === "spherical" &&
    (axis === "x" || axis === "y") &&
    (type === "datetime" || transform !== "linear")
  )
    throw Error("Spherical angular axes require linear numeric coordinates.");
  if (
    system === "polar" &&
    axis === "x" &&
    (type === "datetime" || transform !== "linear")
  )
    throw Error("Polar angular axes require linear numeric coordinates.");
}

/** A child changing coordinate systems starts from these, rather than its parent's settings. */
export function boundaryCoordinateDefaults(system: string) {
  return {
    angleUnit: "degrees",
    anglePeriod: 360,
    baseRadius: system === "polar" ? 0 : 1,
    radialScale: 1,
    polarAxis: "Z",
    projection: "equirectangular",
    sphericalView: "globe",
  };
}
