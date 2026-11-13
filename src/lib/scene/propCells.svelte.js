// @ts-check
// Each of a scene node's props as a reactive cell of its own (TODO 69.10; Stage 115.2).

class PropValue {
  /** @type {unknown} */
  value = $state.raw();
  /** @param {unknown} value */
  constructor(value) {
    this.value = value;
  }
}

/**
 * Props as a value of their own each: a change of one prop re-runs only what reads it. Spread
 * from one object, every prop read depends on the whole object, so a Run checkbox restarted the
 * Force it plays, and a Playback re-configured each Frame it moves, on every frame. The set of
 * names is tracked apart from the values (a missing prop's read depends on the names). sync()
 * takes each new props object; `props` is what the component is spread from.
 */
export function propCells() {
  /** @type {Map<string | symbol, PropValue>} */
  const cells = new Map();
  let names = $state(0);
  /** @param {Record<string, unknown>} next */
  const sync = (next) => {
    let changed = false;
    for (const name of [...cells.keys()])
      if (!Object.hasOwn(next, name)) changed = cells.delete(name);
    for (const [name, value] of Object.entries(next)) {
      const cell = cells.get(name);
      if (!cell) {
        cells.set(name, new PropValue(value));
        changed = true;
      } else if (!Object.is(cell.value, value)) cell.value = value;
    }
    if (changed) names++;
  };
  const props = new Proxy(/** @type {Record<string, unknown>} */ ({}), {
    get: (_, name) => {
      const cell = cells.get(name);
      if (cell) return cell.value;
      names;
      return undefined;
    },
    has: (_, name) => {
      names;
      return cells.has(name);
    },
    ownKeys: () => {
      names;
      return [...cells.keys()];
    },
    getOwnPropertyDescriptor: (_, name) => {
      const cell = cells.get(name);
      return cell
        ? { enumerable: true, configurable: true, value: cell.value }
        : undefined;
    },
  });
  return { sync, props };
}
