import type { TooltipEvent } from "../utils/markTooltip.js";
import { beginInteraction, endInteraction } from "../utils/interaction.js";
import { trackWrite } from "../utils/inputWrites.js";
import { RESET, writerValue } from "../utils/inputWriters.js";
import type {
  InteractionOwner,
  InteractionScope,
  SelectionState,
} from "../utils/viewControllerTypes.js";

/** A pick after namedData has mapped drawn rows back to observations. */
export interface MarkPickEvent extends TooltipEvent {
  nativeEvent?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean };
  _seriesRows?(): number[];
}

/** Borrow the accepted binding at event time: live writes may replace its scope. */
export interface MarkEventBinding {
  revisions: { selection: number; hover: number; nearest: number };
  scope?: InteractionScope | null;
}

/** An input a click or a hover writes (TODO 145.2, utils/inputWriters.js). */
interface InputWriterSetting {
  name: string;
  /** The row's column it takes; null: its constant `value`, or with `reset` the default. */
  column: string | null;
  value?: unknown;
  reset?: boolean;
}
interface InputWriters {
  select: InputWriterSetting | null;
  hover: InputWriterSetting | null;
  store: {
    commit(name: string, value: unknown): void;
    reset(name: string): void;
    preview(name: string, value: unknown, writer: object): void;
    endPreview(name: string, writer: object): void;
  } | null;
  /** The writer tokens, one per role: a preview is withdrawn by the writer that made it. */
  owners: { select: object; hover: object };
  /** The value of `column` at the row a pick names, in `scope` (undefined: none). */
  valueAt(
    event: MarkPickEvent,
    column: string,
    scope: unknown,
  ): Promise<unknown>;
}

interface EventInputs {
  owner: InteractionOwner | undefined;
  scope: InteractionScope | null | undefined;
  selection: SelectionState | null | undefined;
  hover: SelectionState | null | undefined;
  nearest: SelectionState | null | undefined;
  writers?: InputWriters;
  picksNearest: boolean;
  binding(): MarkEventBinding | null | undefined;
  /** Resolve source/series rows. The caller owns any temporary device reads. */
  rows(event: MarkPickEvent): number[] | Promise<number[]>;
  tooltip: {
    /** Own tooltip publication and any asynchronous errors inside this callback. */
    show(event: MarkPickEvent): void;
    leave(): void;
    move?(event: MarkPickEvent): void;
  };
}

/**
 * Install row-interaction handlers into the borrowed preparation draft. This owns no scopes,
 * resources or subscriptions. Selection, hover and nearest have independent revisions: a newer
 * event rejects late row readbacks for its own state without discarding a click on a hover change.
 * Existing user handlers run after an accepted selection/hover change, in the original order.
 */
export function installMarkInteractionEvents(
  props: Record<string, unknown>,
  {
    owner,
    scope,
    selection,
    hover,
    nearest,
    writers,
    picksNearest,
    binding,
    rows,
    tooltip,
  }: EventInputs,
): void {
  const original = Object.fromEntries(
    Object.entries(props).filter(([key]) =>
      /^on(pointer|click|dblclick|contextmenu)/.test(key),
    ),
  );
  // What a pick's rows are read against (TODO 139.7): the table's rows as they were (its
  // generation and key tokens). A pick's rows are the table's rows (an aggregate's
  // contributors included), so a new view over the same rows leaves them valid. When the table
  // updated during the read (live data does every frame), they move to the new rows as the
  // table's own selection does: by key, else by position within the new row count. Each kind's
  // revision still lets the latest event win.
  const basis = () => ({
    generation: owner?.generation,
    tokens: (owner as any)?.tokens as string[] | null | undefined,
  });
  const current = (read: ReturnType<typeof basis>, rows: number[]) => {
    if (!owner || owner.generation === read.generation) return rows;
    const tokens = (owner as any).tokens as string[] | null | undefined;
    if (read.tokens && tokens) {
      const at = new Map(tokens.map((token, row) => [token, row]));
      return rows
        .map((row) => at.get(read.tokens![row]))
        .filter((row): row is number => row !== undefined);
    }
    return rows.filter((row) => row < owner.length);
  };
  const notify = (key: string, event: MarkPickEvent) => {
    const handler = original[key];
    if (typeof handler === "function") handler(event);
  };

  if (selection && scope) {
    props.onclick = async (event: MarkPickEvent) => {
      const target = binding();
      if (!target) return;
      const revision = ++target.revisions.selection,
        read = basis();
      const picked = current(read, await rows(event));
      if (revision !== target.revisions.selection) return;
      const modified =
        event.nativeEvent?.shiftKey ||
        event.nativeEvent?.metaKey ||
        event.nativeEvent?.ctrlKey;
      if (modified) selection.toggle(owner, picked);
      else {
        // An aggregate pick contains every source row. Clear only an exact repeat;
        // a subset of a multi-selection still replaces it, as a different pick does.
        const current = selection.rows(owner),
          next = new Set(picked);
        if (
          next.size &&
          current.size === next.size &&
          [...next].every((row) => current.has(row))
        )
          selection.clear(owner);
        else selection.replace(owner, picked);
      }
      notify("onclick", event);
    };
    props.onpointermissed = (event: MarkPickEvent) => {
      const target = binding();
      if (!target) return;
      target.revisions.selection++;
      selection.clear(owner);
      notify("onpointermissed", event);
    };
  }

  if (hover && scope) {
    props.onpointerenter = async (event: MarkPickEvent) => {
      const target = binding();
      if (!target) return;
      const revision = ++target.revisions.hover,
        read = basis();
      // Hold the pointer event's transaction until the rows are read, so the leave it follows
      // and this enter publish together (TODO 136.8: a frame between them drew nothing hovered).
      const release = holdInteraction();
      try {
        const picked = current(read, await rows(event));
        if (revision !== target.revisions.hover) return;
        hover.replace(owner, picked, { phase: "preview" });
      } finally {
        release();
      }
      notify("onpointerenter", event);
    };
    props.onpointerleave = (event: MarkPickEvent) => {
      const target = binding();
      if (!target) return;
      target.revisions.hover++;
      hover.cancelPreview(owner);
      notify("onpointerleave", event);
    };
  }

  // An input a click writes (TODO 145.2): the clicked row's value, committed; a click on
  // nothing restores the input's default. The latest click wins over a slower read.
  const store = writers?.store;
  if (writers?.select && store) {
    const writer = writers.select,
      { name } = writer;
    let clicks = 0;
    // The read is tracked, so hmplot/check waits for the write it makes.
    props.onclick = (event: MarkPickEvent) =>
      trackWrite(
        (async () => {
          const click = ++clicks;
          const value = await writerValue(writer, (column) =>
            writers.valueAt(event, column, binding()?.scope ?? scope),
          );
          if (click !== clicks || value === undefined) return;
          if (value === RESET) store.reset(name);
          else store.commit(name, value);
          notify("onclick", event);
        })(),
      );
    props.onpointermissed = (event: MarkPickEvent) => {
      clicks++;
      store.reset(name);
      notify("onpointermissed", event);
    };
  }
  // An input a hover writes: the hovered row's value while the pointer is on it, previewed (not
  // committed), then the committed value again. A newer enter or a leave supersedes a slow read.
  if (writers?.hover && store) {
    const setting = writers.hover,
      { name } = setting,
      writer = writers.owners.hover;
    let enters = 0;
    props.onpointerenter = async (event: MarkPickEvent) => {
      const enter = ++enters;
      const release = holdInteraction();
      try {
        const value = await writerValue(setting, (column) =>
          writers.valueAt(event, column, binding()?.scope ?? scope),
        );
        if (enter !== enters || value === undefined) return;
        store.preview(name, value, writer);
      } finally {
        release();
      }
      notify("onpointerenter", event);
    };
    props.onpointerleave = (event: MarkPickEvent) => {
      enters++;
      store.endPreview(name, writer);
      notify("onpointerleave", event);
    };
  }

  if (picksNearest) {
    props.onnearestenter = async (event: MarkPickEvent) => {
      tooltip.show(event);
      const target = binding();
      if (!nearest || !scope || !target) return;
      const revision = ++target.revisions.nearest,
        read = basis();
      const release = holdInteraction();
      try {
        const picked = current(read, await rows(event));
        if (revision !== target.revisions.nearest) return;
        nearest.replace(owner, picked, { phase: "preview" });
      } finally {
        release();
      }
    };
    props.onnearestleave = () => {
      const target = binding();
      if (target) target.revisions.nearest++;
      if (nearest && owner) nearest.cancelPreview(owner);
      tooltip.leave();
    };
    // A grid is one mesh: its value changes under a moving pointer without another enter.
    if (tooltip.move) props.onnearestmove = tooltip.move;
  }
}

/**
 * Keep the open interaction transaction (TODO 136.8) until the returned release, or 100 ms: a
 * slow readback must not hold the hover. Releasing twice does nothing.
 */
function holdInteraction(): () => void {
  beginInteraction();
  let held = true;
  const release = () => {
    if (!held) return;
    held = false;
    clearTimeout(timer);
    endInteraction();
  };
  const timer = setTimeout(release, 100);
  return release;
}
