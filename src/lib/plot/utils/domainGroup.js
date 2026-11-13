// @ts-check
import { unionDomains } from "./markDomains.js";

/**
 * A domain group (TODO 136.14): plots that show one union domain on the axes they share, as
 * LinkViews' plots do by default. Each member reports the domain its own marks span on an axis
 * (or its explicit domain), and every member is given the union of the reports, which its frame
 * unions with its own marks' domain; an explicit domain still wins in its own plot. A report
 * never includes what the group gave, so the union can shrink again when data does.
 *
 * Datetime axes count from their own time origin (the first column a plot binds), so a report
 * carries its origin and the union is taken in absolute units.
 *
 * @typedef {number[] & { anchored?: boolean[], exact?: boolean[], screen?: number[], crossScreen?: number[] }} Bounds
 * @typedef {{ apply(axis: string, bounds: Bounds | null): void }} Member
 * @typedef {ReturnType<typeof createDomainGroup>} DomainGroup
 */

/** @param {Bounds} bounds @param {number} by */
const shift = (bounds, by) =>
  by
    ? Object.assign([bounds[0] + by, bounds[1] + by], {
        ...(bounds.anchored ? { anchored: bounds.anchored } : {}),
        ...(bounds.exact ? { exact: bounds.exact } : {}),
        ...(bounds.screen ? { screen: bounds.screen } : {}),
        ...(bounds.crossScreen ? { crossScreen: bounds.crossScreen } : {}),
      })
    : bounds;

/** @param {Bounds | null | undefined} bounds */
const signature = (bounds) =>
  bounds
    ? JSON.stringify([bounds[0], bounds[1], bounds.anchored, bounds.exact, bounds.screen, bounds.crossScreen])
    : "";

/** @param {readonly string[]} axes the axes the group shares ("x", "y") */
export function createDomainGroup(axes) {
  /** @type {Map<Member, { reports: Record<string, { bounds: Bounds, origin: number } | undefined>, given: Record<string, string> }>} */
  const members = new Map();
  /** @param {string} axis */
  function publish(axis) {
    const union = unionDomains(
      [...members.values()]
        .map((m) => m.reports[axis])
        .filter((r) => r !== undefined)
        .map((r) => shift(r.bounds, r.origin)),
    );
    for (const [member, state] of members) {
      const local = union && shift(union, -(state.reports[axis]?.origin ?? 0)),
        key = signature(local);
      if (state.given[axis] === key) continue;
      state.given[axis] = key;
      member.apply(axis, local);
    }
  }
  return {
    axes,
    /** @param {Member} member */
    join(member) {
      /** @type {{ reports: Record<string, { bounds: Bounds, origin: number } | undefined>, given: Record<string, any> }} */
      const state = { reports: {}, given: {} };
      members.set(member, state);
      return {
        /**
         * @param {string} axis
         * @param {Bounds | null} bounds
         * @param {number} [origin] the axis's time origin (0 for a number axis)
         */
        report(axis, bounds, origin = 0) {
          if (!axes.includes(axis) || !members.has(member)) return;
          const before = state.reports[axis];
          if (
            signature(before?.bounds) === signature(bounds) &&
            (before?.origin ?? 0) === origin
          )
            return;
          state.reports[axis] = bounds
            ? { bounds, origin }
            : undefined;
          publish(axis);
        },
        leave() {
          if (!members.delete(member)) return;
          for (const axis of axes) {
            member.apply(axis, null);
            publish(axis);
          }
        },
      };
    },
  };
}
