/** Opt-in CPU graph-build attribution; this does not measure GPU execution. */
export function observeShaderBuilds(renderer) {
  const events = [], materials = new WeakMap(), builds = new WeakMap();
  const counts = { builds: 0, firstBuilds: 0, rebuilds: 0, milliseconds: 0 };
  let disposed = false;
  const add = event => {
    events.push({ frame: renderer.info?.frame ?? 0, time: performance.now(), ...event });
    if (events.length > 256) events.shift();
  };
  const identity = (object, source, picking, objectId) => ({
    mark: object.componentName ?? object.constructor?.componentName ?? object.type ?? "Object",
    label: object.options?.get?.("label") ?? object.name ?? "",
    objectId, objectUuid: object.uuid,
    beautyMaterialId: source.id, pickingMaterialId: picking.id, sourceVersion: source.version,
  });
  const picking = (object, source, material, objectId, reason) => {
    if (disposed) return;
    if (reason === "observed existing material" && materials.has(material)) return;
    const data = identity(object, source, material, objectId);
    materials.set(source, { ...data, pass: "beauty" });
    materials.set(material, { ...data, pass: "picking", reason });
    add({ kind: "picking-material", ...data, reason });
  };
  const backend = renderer.backend, original = backend.createNodeBuilder;
  let wrapped;
  if (original) {
    wrapped = function (...args) {
      const builder = original.apply(this, args), build = builder.build;
      builder.build = function (...buildArgs) {
        if (disposed) return build.apply(this, buildArgs);
        const material = this.material, object = this.object ?? args[0];
        const identity = material ?? object;
        const previous = builds.get(identity) ?? 0, start = performance.now();
        let failed = false;
        try { return build.apply(this, buildArgs); }
        catch (error) { failed = true; throw error; }
        finally {
          const milliseconds = performance.now() - start;
          if (identity && (typeof identity === "object" || typeof identity === "function"))
            builds.set(identity, previous + 1);
          counts.builds++; counts[previous ? "rebuilds" : "firstBuilds"]++;
          counts.milliseconds += milliseconds;
          const attributed = materials.get(material);
          const mark = object?.componentName ?? object?.constructor?.componentName;
          add({ kind: "shader-build", ...(attributed ?? (mark ? {
              pass: "beauty", beautyMaterialId: material?.id, sourceVersion: material?.version,
              objectUuid: object.uuid, label: object.options?.get?.("label") ?? object.name ?? "",
            } : {})),
            mark: object?.componentName ?? object?.constructor?.componentName ?? object?.type ?? "Object",
            materialId: material?.id, materialVersion: material?.version,
            pass: attributed?.pass ?? (mark ? "beauty" : "unattributed"),
            build: previous + 1, milliseconds, failed });
        }
      };
      return builder;
    };
    backend.createNodeBuilder = wrapped;
  }
  return { picking, snapshot: () => ({ ...counts, events: events.map(event => ({ ...event })) }),
    dispose() { disposed = true; if (backend.createNodeBuilder === wrapped) backend.createNodeBuilder = original; } };
}
