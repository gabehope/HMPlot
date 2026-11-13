export function attachSurface(mark, surface) {
  mark.surface = surface;
  mark.build();
  mark.invalidate();
  if (!surface) return () => {};
  const rebuild = () => {
    if (!mark.isDisposed) {
      mark.build();
      mark.invalidate();
    }
  };
  (surface.surfaceListeners ??= new Set()).add(rebuild);
  return () => {
    surface.surfaceListeners.delete(rebuild);
    mark.surface = undefined;
  };
}
