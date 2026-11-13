import { readAxis } from "./axes.js";
import { tooltipMode, axisValueText } from "./tooltip.js";
import { themeNumberFormat } from "./numberLabels.js";
import { stripHits } from "../../picking/tolerantPick.js";
import { readPixels } from "../../picking/readPixel.js";
import { trackPreparation } from '../rendering/viewSettlement.js';
import type { PlotPickObject, TooltipSeriesEntry } from "./internalTypes.js";
import type { TooltipHost, TooltipEntry, TooltipBox } from "./viewControllerTypes.js";

/** The view owns this box; marks borrow it and keep ownership of their row metadata. */
export function createTooltipController(host: TooltipHost) {
  let disposed = false;
  let tooltipEntry = $state.raw<TooltipEntry | null>(null), tooltipHold = $state<string | null>(null);
  let tooltipPointer = $state.raw<number[]>([0, 0]), tooltipWidth = $state(0), tooltipHeight = $state(0);
  const tooltipBox: TooltipBox = {
    get current() { return tooltipHold ? null : tooltipEntry; },
    show(owner: object, entry: TooltipEntry) {
      if (disposed) return;
      if (tooltipHold === "escape" && (tooltipEntry?.owner !== owner || tooltipEntry?.row !== entry.row)) tooltipHold = null;
      tooltipEntry = { ...entry, owner };
    },
    hide(owner: object | undefined = undefined) { if (tooltipEntry && (owner === undefined || tooltipEntry.owner === owner)) tooltipEntry = null; },
    hold(reason: string | null) { tooltipHold = reason; },
  };
  function tooltipMove(event: PointerEvent) {
    tooltipPointer = host.localPointer(event);
    if (event.buttons) tooltipHold = "gesture";
    else if (tooltipHold && tooltipHold !== "escape") tooltipHold = null;
  }
  // Unified x (TODO 44.4): with tooltip={{ mode: "x" }}, once per frame while the pointer moves,
  // a strip of the pick buffer a few pixels wide at its x, the frame's height, lists each series'
  // row nearest the pointer's x (marks with a tooltip take part), with a marker on each.
  const unifiedOwner = {};
  // The marks whose rows the unified box lists (their @tooltip rows are cleared with it).
  let unifiedMarks = new Set<PlotPickObject>();
  function clearUnifiedMarks(keep: Set<PlotPickObject> = new Set()) {
    for (const mark of unifiedMarks) if (!keep.has(mark)) host.view.marks.of(mark)?.tooltip?.clear();
    unifiedMarks = keep;
  }
  let unifiedPoint: number[] | null = null, unifiedFrame = 0, unifiedGeneration = 0;
  function unifiedMove(event: PointerEvent) {
    if (disposed || tooltipMode(host.tooltip) !== "x" || host.mode !== "2d" || event.buttons) return;
    unifiedPoint = host.localPointer(event);
    if (unifiedFrame) return;
    unifiedFrame = requestAnimationFrame(() => {
      unifiedFrame = 0;
      const point = unifiedPoint;
      if (point) trackPreparation(host.renderer ? host.view : undefined, unifiedRead(point).catch(() => {}));
    });
  }
  function unifiedLeave() {
    unifiedGeneration++;
    unifiedPoint = null;
    tooltipBox.hide(unifiedOwner);
    clearUnifiedMarks();
  }
  async function unifiedRead(point: number[]) {
    const generation = ++unifiedGeneration, picking = host.view.picking.context.current;
    const pass = picking?.scenePass, root = host.activeRootFrame();
    const box = root?.layout && !root.layout.polar ? root.layout : null;
    if (!pass || !root || !box || !host.canvasHost) return;
    if (point[0] < box.left || point[0] > box.right || point[1] < box.top || point[1] > box.bottom) return unifiedLeave();
    if (picking.isPickCurrent && !picking.isPickCurrent()) return;
    const target = pass.renderTarget, scale = target.width / Math.max(1, host.canvasHost.clientWidth);
    const center = Math.floor(point[0] * scale), half = Math.ceil(3 * scale);
    const left = Math.max(0, center - half), width = Math.min(target.width, center + half + 1) - left;
    const top = Math.max(0, Math.floor(box.top * scale)), height = Math.min(target.height, Math.ceil(box.bottom * scale)) - top;
    if (width <= 0 || height <= 0) return;
    const pixels = await readPixels(host.renderer, pass.getTexture("output"), left, top, width, height);
    if (disposed || generation !== unifiedGeneration) return;
    // A mark takes part through its accepted binding (Stage 117.2).
    const hits = stripHits(pixels, width, height, center - left, (id: number) => Boolean(host.view.marks.of(picking.objectIdMap.get(id))?.tooltip));
    const x = host.pointerIn(point, root.options)?.x;
    if (typeof x !== "number" || !Number.isFinite(x)) return unifiedLeave();
    const found: TooltipSeriesEntry[] = [], marks = new Set<PlotPickObject>();
    for (const [id, instances] of hits) {
      if (disposed || generation !== unifiedGeneration) return;
      const nearest = [...instances.entries()].sort((a, b) => a[1].dx - b[1].dx).slice(0, 8)
        .map(([instanceId, hit]) => ({ instanceId, pixel: [(left + hit.x + 0.5) / scale, (top + hit.y + 0.5) / scale] }));
      const mark = picking.objectIdMap.get(id);
      // The series reads the binding's rows across awaits: it holds them until it lists.
      if (!mark) continue;
      const held = host.view.marks.acquire(mark), tooltip = held.value?.tooltip;
      if (!tooltip) { held.release(); continue; }
      // Leaving must clear pending rows too, before the first series has finished reading.
      unifiedMarks.add(mark);
      let listed: TooltipSeriesEntry[];
      try { listed = await tooltip.series(nearest, x); }
      finally { held.release(); }
      if (listed.length) marks.add(mark);
      found.push(...listed);
    }
    if (disposed || generation !== unifiedGeneration) return;
    clearUnifiedMarks(marks);
    if (!found.length) return tooltipBox.hide(unifiedOwner);
    // The title: the x of the listed row nearest the pointer, as a tooltip writes it.
    const nearest = found.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a));
    const title = axisValueText(nearest.x, readAxis(root.options, "x"), themeNumberFormat(root.options));
    // Top to bottom, as the series are drawn at the pointer's x.
    found.sort((a, b) => a.pixel[1] - b.pixel[1]);
    tooltipBox.show(unifiedOwner, { row: title, title, lines: found.map((item) => ({ label: item.name, text: item.text, swatch: item.swatch })),
      markers: found.map((item) => ({ at: item.pixel, color: item.swatch })) });
  }
  // The box beside the pointer (canvas pixels), flipped to stay inside the plot.
  const tooltipPlace = $derived.by(() => {
    if (!tooltipEntry || tooltipHold || !host.canvasHost || !host.plotHost) return null;
    const gap = 14, [x, y] = tooltipPointer;
    const left = host.canvasHost.offsetLeft + x, top = host.canvasHost.offsetTop + y;
    const width = host.plotHost.clientWidth, height = host.plotHost.clientHeight;
    const across = left + gap + tooltipWidth <= width || left - gap - tooltipWidth < 0 ? left + gap : left - gap - tooltipWidth;
    const down = top + gap + tooltipHeight <= height || top - gap - tooltipHeight < 0 ? top + gap : top - gap - tooltipHeight;
    // Where neither side fits (a narrow facet cell), it stays inside the plot rather than clipped.
    return { left: Math.max(0, Math.min(across, width - tooltipWidth)), top: Math.max(0, Math.min(down, height - tooltipHeight)) };
  });
  $effect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && tooltipEntry) tooltipHold = "escape"; };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  });
  return {
    box: tooltipBox,
    get entry() { return tooltipEntry; },
    get place() { return tooltipPlace; },
    get width() { return tooltipWidth; }, set width(value: number) { tooltipWidth = value; },
    get height() { return tooltipHeight; }, set height(value: number) { tooltipHeight = value; },
    move: tooltipMove, unifiedMove, leave: unifiedLeave,
    releaseTouch(event: PointerEvent) { tooltipPointer = host.localPointer(event); tooltipHold = null; },
    dispose() {
      disposed = true;
      if (unifiedFrame) cancelAnimationFrame(unifiedFrame);
      unifiedFrame = 0;
      unifiedLeave();
      tooltipBox.hide();
    },
  };
}
