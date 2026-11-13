// The plot's description (TODO 49; out of viewCore.svelte, Stage 118.5): the marks register what
// they draw (namedMark, through DESCRIPTION_CONTEXT); the text is written when the plot settles
// after a change, never per frame.
import { setContext, onDestroy, untrack } from "svelte";
import {
  DESCRIPTION_CONTEXT,
  describeAxis,
  describePlot,
  plotDescription,
} from "./describe.js";
import { markBinding } from "./markBinding.js";
import { readAxis } from "./axes.js";
import { axisCategory, topDown } from "./categorical.js";
import type { FrameEntry, FrameOptions } from "./internalTypes.js";

/** The ticks a 2D layout (viewCore's, or a root frame's) gives each axis. */
export type DescribedLayout = {
  readonly [axis in "x" | "y" | "z"]?: {
    readonly major?: readonly { value: number }[];
  } | null;
};

/** What a mark tells its Plot it draws (namedMark's describer.set). */
export interface DescribedMark {
  kind: string;
  /** The mark, or the compound it is part of: one entry per owner. */
  owner: object;
  axes?: Record<string, unknown>;
  rows?: number;
  channels?: Record<string, string>;
  /** Whether a channel reads @time. */
  time?: boolean;
  /** The mark object, whose accepted binding holds its legend categories. */
  mark?: () => unknown;
}
/** What the description reads from its view, current at each read. */
export interface PlotDescriptionHost {
  /** The frame acting as the root (FrameModel.rootFrame). */
  activeRootFrame(): FrameEntry | undefined;
  readonly plotOptions: FrameOptions;
  /** The root's 2D axis layout, when the root frame has none of its own. */
  readonly layout: DescribedLayout | null;
  readonly activeRootKey: unknown;
  readonly mode: string;
  /** The clock scope's host: a Simulate's makes the plot "simulated". */
  readonly clockHost: { simulation?: unknown } | undefined;
  /** Legend changes: categories arrive with the marks' scales. */
  readonly guides: { subscribe(listener: () => void): () => void };
  whenSettled(options: { loads: boolean }): Promise<void>;
  /** The Plot's description prop and its describe switch. */
  readonly description: string | undefined;
  readonly describe: boolean | undefined;
}

export function createPlotDescription(host: PlotDescriptionHost) {
  const described = new Map<object, DescribedMark & { key: string }>();
  let describedRevision = $state(0);
  setContext(DESCRIPTION_CONTEXT, {
    set(owner: object, entry: DescribedMark) {
      const { mark, ...content } = entry,
        key = JSON.stringify(content),
        old = described.get(owner);
      described.set(owner, { ...entry, key });
      if (old?.key !== key) describedRevision++;
    },
    remove(owner: object) {
      if (described.delete(owner)) describedRevision++;
    },
  });
  function descriptionModel() {
    const root = host.activeRootFrame(),
      options = root?.options ?? host.plotOptions,
      frameLayout =
        (root?.layout as DescribedLayout | null | undefined) ?? host.layout;
    const parts = new Map<object, DescribedMark>();
    for (const entry of described.values())
      if (!parts.has(entry.owner)) parts.set(entry.owner, entry);
    const marks = [...parts.values()].map((entry) => {
      const mark = entry.mark?.(),
        categories: Record<string, string[]> = {};
      for (const channel of ["fill", "color"]) {
        const domain =
          markBinding(mark)?.legend?.categories?.[channel]?.scale?.domain;
        if (Array.isArray(domain) && domain.length)
          categories[channel] = domain.map((value) =>
            value == null ? "missing" : String(value),
          );
      }
      // A mark's axis columns by the titles the axes show (an explicit label names its column).
      const shown: Record<string, string> = root?.titles ?? {},
        titles = Object.fromEntries(
          Object.entries(entry.axes ?? {})
            .filter(([, title]) => typeof title === "string")
            .map(([axis, title]) => [axis, shown[axis] || title]),
        );
      return {
        kind: entry.kind,
        ...titles,
        ...entry.channels,
        categories,
        rows: entry.rows,
      };
    });
    const axes: Record<string, unknown> = {};
    for (const axis of ["x", "y", "z"] as const) {
      const config = readAxis(options, axis),
        ticks = frameLayout?.[axis]?.major ?? [],
        bounds = options.get(axis + "bounds");
      axes[axis] = describeAxis({
        bounds: bounds?.toArray?.() ?? bounds,
        step:
          ticks.length > 1
            ? Math.abs(ticks[1].value - ticks[0].value)
            : undefined,
        type: config.type,
        transform: options.get(axis + "Transform"),
        timeOrigin: config.timeOrigin,
        pattern: config.format,
        timezone: config.timezone,
        categories: axisCategory(options, axis)?.domain,
        // A band y axis lists its first category at the top unless inverted (TODO 136.15).
        first:
          axis === "y" && topDown(options)
            ? options.has("yInvert") && options.get("yInvert")
              ? "bottom"
              : "top"
            : undefined,
      });
    }
    return {
      marks,
      axes,
      coordinates: options.get("coordinates"),
      projection: options.get("projection"),
      mode: host.mode,
      moving: host.clockHost?.simulation
        ? "simulated"
        : [...described.values()].some((entry) => entry.time)
          ? "animated"
          : null,
    };
  }
  let generatedDescription = $state("");
  const descriptionText = $derived(
    plotDescription(
      host.description,
      generatedDescription,
      host.describe !== false,
    ),
  );
  const descriptionListeners = new Set<(text: string) => void>();
  // Legend categories arrive with the marks' scales: a guide change re-describes.
  const stopGuideDescription = host.guides.subscribe(() => describedRevision++);
  onDestroy(stopGuideDescription);
  $effect(() => {
    describedRevision;
    host.layout;
    host.activeRootKey;
    host.mode;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        await host.whenSettled({ loads: false });
      } catch {
        return;
      }
      if (!cancelled)
        generatedDescription = describePlot(untrack(descriptionModel));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });
  $effect(() => {
    const text = descriptionText;
    untrack(() => descriptionListeners.forEach((listener) => listener(text)));
  });
  return {
    /** The description as screen readers get it: description=, then the generated summary. */
    get text() {
      return descriptionText;
    },
    /**
     * The description now. The generated summary follows the settled plot after a pause, so an
     * export right after the first frame (Python's headless exports, a notebook's static image,
     * TODO 71) generates it itself.
     */
    current: () =>
      host.describe === false || generatedDescription
        ? descriptionText
        : plotDescription(
            host.description,
            describePlot(untrack(descriptionModel)),
          ),
    /** What the plot draws, as its description is written from it (describe.js describePlot). */
    model: () => untrack(descriptionModel),
    /** Each described mark with its scene node (plotLints.js reads them). */
    marks: () =>
      [...described].map(([key, entry]) => ({
        ...entry,
        node: (key as { sceneNode?: string }).sceneNode,
      })),
    /** Called with the description whenever it changes (and once now). */
    subscribe(listener: (text: string) => void) {
      descriptionListeners.add(listener);
      listener(descriptionText);
      return () => descriptionListeners.delete(listener);
    },
  };
}
