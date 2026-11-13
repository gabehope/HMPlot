/** Shared control definitions survive cell virtualization; no plot arrays are retained. */
export function createTransformRegistry(invalidate) {
  const entries = new Map();
  let alive = true;
  function entry(name) {
    if (!entries.has(name))
      entries.set(name, {
        handles: new Map(),
        patch: {},
        listeners: new Set(),
        last: null,
      });
    return entries.get(name);
  }
  function publish(e) {
    const status = [...e.handles.values()].find((s) => s)?.value ?? e.last;
    if (status) {
      e.last = { ...status, mounted: alive };
      for (const f of e.listeners) f(e.last);
    }
  }
  return {
    settings(name) {
      return name ? entry(name).patch : {};
    },
    register(name, handle) {
      if (!name) return () => {};
      const e = entry(name),
        slot = { value: null };
      e.handles.set(handle, slot);
      const off = handle.subscribe((s) => {
        if (s.mounted) slot.value = s;
        publish(e);
      });
      return () => {
        off();
        e.handles.delete(handle);
        publish(e);
      };
    },
    get(name) {
      const e = entry(name);
      return {
        subscribe(f) {
          e.listeners.add(f);
          if (e.last) f(e.last);
          return () => e.listeners.delete(f);
        },
        async update(patch) {
          const previous = e.patch;
          e.patch = { ...previous, ...patch };
          invalidate();
          try {
            await Promise.all(
              [...e.handles.keys()].map((h) => h.update(patch)),
            );
          } catch (error) {
            e.patch = previous;
            invalidate();
            throw error;
          }
        },
        async action(id) {
          await Promise.all([...e.handles.keys()].map((h) => h.action?.(id)));
        },
        async whenSettled() {
          await Promise.all([...e.handles.keys()].map((h) => h.whenSettled()));
        },
      };
    },
    dispose() {
      alive = false;
      for (const e of entries.values()) {
        publish(e);
        e.listeners.clear();
        e.handles.clear();
      }
      entries.clear();
    },
  };
}
