import { numpy as np, Array as JaxArray } from "@hmplot/jax";
import { uploadColumn } from "./deviceParams.js";

/**
 * OFFSETS (TODO 38). Per-row deltas that a drag, or code, sets on a table's numeric columns, in
 * each column's own units ("weight +3.2 on row 17"). The table's data never changes: a view
 * follows the offsets only if it reads them, through offset(column) and moved(column), which
 * read the virtual column "@offset:<column>" of any scope over the table.
 *
 * One layer per data identity (utils/interaction.js createDataIdentity), next to its selection
 * and brush, so every view of a table's rows shares it: in a scatterplot matrix the same row is
 * x = weight in one cell and x = age in the next. Rows are the table's rows (a root row index).
 *
 * Each column that has been set keeps a dense host Float32Array over the rows and its device
 * copy, uploaded on the first read after a change. A column never set reads as zeros, from one
 * shared upload, so a view compiles the same kernels before and after the first drag. Uploads
 * go through uploadColumn (utils/deviceParams.js), so a short constant column is never folded
 * into a kernel as a literal.
 *
 * The layer is a subscribable resource like a selection (status: revision, membership, active),
 * so transforms and marks that read "@offset:..." rerun through onMembershipChange.
 */
export const OFFSET_PREFIX = "@offset:";
export const isOffsetField = (key) => typeof key === "string" && key.startsWith(OFFSET_PREFIX);
export const offsetField = (column) => `${OFFSET_PREFIX}${column}`;
export const offsetColumn = (key) => key.slice(OFFSET_PREFIX.length);

// An empty table's offsets are an empty array (np.array of no values cannot tell its dtype).
const upload = (host) => host.length ? uploadColumn(host, "float32") ?? np.array(host, { dtype: np.float32 }) : np.zeros([0], { dtype: np.float32 });

export function createOffsetLayer() {
  // `waiting`: offsets from Python for rows this layer does not have yet (hydrate()).
  // `dragVersion`: the version of the last change a live drag made (decision 7).
  let length = 0, version = 0, disposed = false, zeros = null, waiting = null, dragging = false, dragVersion = -1;
  /** column -> { host: Float32Array (length rows), device: JaxArray | null } */
  const columns = new Map();
  // The columns a view has read (the drag's note when nothing reads what it writes).
  const read = new Set();
  const listeners = new Set();
  // `hydrated`: the change came from Python (hydrate), so a scene does not send it back.
  let hydrated = false;
  const status = () => ({ revision: version, membership: version, active: columns.size > 0, hydrated });
  const notify = (fromPython = false) => {
    version++;
    hydrated = fromPython;
    if (dragging) dragVersion = version;
    const current = status();
    for (const listener of [...listeners]) listener(current);
  };
  const dropDevice = (entry) => { entry.device?.dispose(); entry.device = null; };
  const checkRows = (rows) => {
    for (const row of rows)
      if (!Number.isInteger(row) || row < 0 || row >= length)
        throw RangeError(`Offset rows must be integers from 0 to ${length - 1}; received ${row}.`);
  };
  const layer = {
    isOffsets: true,
    get version() { return version; },
    /** interactionVersion() reads revision (+ previewRevision, which offsets do not have). */
    get revision() { return version; },
    get length() { return length; },
    /** Whether any column has offsets. */
    get active() { return columns.size > 0; },
    status,
    /** Whether a drag is writing the offsets (decision 7: its changed rows arrive at once). */
    get dragging() { return dragging; },
    beginDrag() { dragging = true; },
    endDrag() { dragging = false; },
    /**
     * Whether the offsets changed since version `seen` and the latest change was a drag's. A
     * view that draws them then skips the transitions of the rows that changed (decision 7);
     * a change from Escape, resetOffsets() or code animates as usual.
     */
    draggedSince(seen) { return version !== seen && version === dragVersion; },
    subscribe(listener) { listeners.add(listener); listener(status()); return () => listeners.delete(listener); },
    /** The columns that have offsets, in the order they were first set. */
    columns: () => [...columns.keys()],
    has: (column) => columns.has(column),
    /** One row's offset in `column` (0 when never set). */
    value(column, row) { return columns.get(column)?.host[row] ?? 0; },
    /** A copy of `column`'s offsets over every row, or undefined when it has none. */
    host(column) {
      const entry = columns.get(column);
      return entry ? entry.host.slice() : undefined;
    },
    /** Whether a view has read `column`'s offsets (through offset() or moved()). */
    wasRead: (column) => read.has(column),
    /**
     * `column`'s offsets on the device, one per row, lent: valid until its offsets or the row
     * count change (a table scope lends it as "@offset:<column>").
     */
    device(column) {
      if (disposed) throw Error("Offsets have been disposed.");
      read.add(column);
      const entry = columns.get(column);
      if (!entry) return (zeros ??= upload(new Float32Array(length)));
      return (entry.device ??= upload(entry.host));
    },
    /**
     * Set `column`'s offset of each row in `rows` to the matching `deltas` value (a number
     * sets them all). Offsets replace, they do not add: a drag writes target − original.
     */
    set(column, rows, deltas) {
      if (typeof column !== "string" || !column || column.startsWith("@"))
        throw TypeError(`Offsets need a column name; received ${JSON.stringify(column)}.`);
      rows = Array.from(rows ?? [], Number);
      checkRows(rows);
      const values = typeof deltas === "number" ? rows.map(() => deltas) : Array.from(deltas ?? [], Number);
      if (values.length !== rows.length)
        throw RangeError(`Offsets for ${column}: ${rows.length} rows and ${values.length} deltas.`);
      if (values.some((value) => !Number.isFinite(value)))
        throw RangeError(`Offsets for ${column} must be finite numbers.`);
      let entry = columns.get(column);
      if (!entry) {
        if (values.every((value) => value === 0)) return this;
        columns.set(column, (entry = { host: new Float32Array(length), device: null }));
      }
      rows.forEach((row, index) => { entry.host[row] = values[index]; });
      dropDevice(entry);
      notify();
      return this;
    },
    /** Replace every offset of `column` with one value per row (a Float32Array or array). */
    setColumn(column, deltas) {
      if (deltas?.length !== length)
        throw RangeError(`Offsets for ${column} need ${length} values; received ${deltas?.length}.`);
      return this.set(column, Array.from({ length }, (_, row) => row), deltas);
    },
    /** Remove the offsets of `names` (every column when omitted). */
    clear(names = undefined) {
      const targets = names === undefined ? [...columns.keys()] : [names].flat().filter((name) => columns.has(name));
      if (!targets.length) return this;
      for (const name of targets) { dropDevice(columns.get(name)); columns.delete(name); }
      notify();
      return this;
    },
    /** Every nonzero offset: { row, column, delta }, by column, then row. */
    entries() {
      const output = [];
      for (const [column, { host }] of columns)
        host.forEach((delta, row) => { if (delta !== 0) output.push({ row, column, delta }); });
      return output;
    },
    /**
     * The table's rows changed (createDataIdentity.update). Keyed rows keep the offsets of the
     * keys that survive; unkeyed rows keep theirs by position while the row count stays the
     * same, as selections do, and lose them when it changes.
     */
    /** @param {number} nextLength @param {readonly string[] | null | undefined} [previousTokens] @param {readonly string[] | null | undefined} [nextTokens] */
    rows(nextLength, previousTokens = null, nextTokens = null) {
      const previousLength = length;
      length = nextLength;
      if (previousLength !== length) { zeros?.dispose(); zeros = null; }
      if (waiting?.length === length) {
        // Python's offsets are for these rows: they replace any remapped ones.
        const descriptor = waiting;
        waiting = null;
        this.hydrate(descriptor);
        return;
      }
      if (!columns.size) return;
      if (previousTokens && nextTokens) {
        const lookup = new Map(nextTokens.map((token, row) => [token, row]));
        for (const [column, entry] of [...columns]) {
          const host = new Float32Array(length);
          entry.host.forEach((delta, row) => {
            const next = delta === 0 ? undefined : lookup.get(previousTokens[row]);
            if (next !== undefined) host[next] = delta;
          });
          dropDevice(entry);
          if (host.some((delta) => delta !== 0)) entry.host = host;
          else columns.delete(column);
        }
        notify();
      } else if (previousLength !== length) this.clear();
    },
    /**
     * Take the offsets of a Python table snapshot, { length, columns: { name: { rows, deltas } } },
     * in place of the current ones. They index the rows Python sent: when the table's data
     * changed with them (`pending`), or the layer has other rows, they wait for the next rows()
     * so a keyed remap does not move them.
     */
    hydrate(descriptor, { pending = false } = {}) {
      if (pending || descriptor.length !== length) { waiting = descriptor; return this; }
      for (const entry of columns.values()) dropDevice(entry);
      columns.clear();
      for (const [column, { rows, deltas }] of Object.entries(descriptor.columns ?? {})) {
        checkRows(rows);
        const host = new Float32Array(length);
        rows.forEach((row, index) => { host[row] = deltas[index]; });
        columns.set(column, { host, device: null });
      }
      notify(true);
      return this;
    },
    /** The offsets as they are, including any waiting for rows, for restore(). */
    snapshot() {
      return { length, waiting, columns: [...columns].map(([column, { host }]) => [column, host.slice()]) };
    },
    /** Put back a snapshot(): a scene update that failed after hydrating its offsets. */
    restore(saved) {
      for (const entry of columns.values()) dropDevice(entry);
      columns.clear();
      if (saved.length !== length) { zeros?.dispose(); zeros = null; }
      length = saved.length;
      waiting = saved.waiting;
      for (const [column, host] of saved.columns) columns.set(column, { host: host.slice(), device: null });
      notify(true);
    },
    /** The offsets as a scene sends them: { name: { rows, deltas } }, nonzero rows only. */
    columnsDescriptor() {
      const output = {};
      for (const { row, column, delta } of this.entries()) {
        const entry = (output[column] ??= { rows: [], deltas: [] });
        entry.rows.push(row);
        entry.deltas.push(delta);
      }
      return output;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of columns.values()) dropDevice(entry);
      columns.clear();
      zeros?.dispose();
      zeros = null;
      listeners.clear();
    },
  };
  return layer;
}

/** A column's values plus its offsets, keeping the column's kind of storage. */
function movedValues(values, deltas) {
  if (values instanceof JaxArray) {
    const added = np.array(deltas, { dtype: np.float32 });
    return values.ref.astype(np.float32).add(added);
  }
  if (values?.__hmplotColumn) return { ...values, values: movedValues(values.values, deltas) };
  if (values?.codes !== undefined) throw TypeError("Offsets apply to numeric columns only.");
  const moved = Array.from(values, (value, row) => (value == null ? value : Number(value) + deltas[row]));
  return values instanceof Float32Array ? Float32Array.from(moved)
    : ArrayBuffer.isView(values) ? Float64Array.from(moved) : moved;
}

/**
 * The table `value` (a column object or an array of row objects, as Data takes) with each
 * column that has offsets replaced by its moved values, under the same names; the other
 * columns are the same arrays. `value` is not changed. Device (jax) columns give new arrays
 * the caller owns.
 */
export function applyOffsets(value, layer) {
  const names = layer.columns();
  if (Array.isArray(value)) {
    if (value.length !== layer.length)
      throw RangeError(`The table has ${value.length} rows and its offsets ${layer.length}.`);
    const deltas = new Map(names.map((name) => [name, layer.host(name)]));
    return value.map((row, index) => {
      const next = { ...row };
      for (const [name, host] of deltas)
        if (Object.hasOwn(row, name) && row[name] != null) next[name] = Number(row[name]) + host[index];
      return next;
    });
  }
  if (!value || typeof value !== "object") throw TypeError("applyOffsets needs the table's columns or rows.");
  const next = { ...value };
  for (const name of names)
    if (Object.hasOwn(value, name)) next[name] = movedValues(value[name], layer.host(name));
  return next;
}
