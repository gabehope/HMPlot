import { wrapTiles } from "./sphericalBudget.js";
import { TAU } from "./coordinates.js";
import { wrapsWithRoot } from "./coordinateOperations.js";
import { coordinateView } from "./viewContext.js";
/** Repeat chart geometry through render-local offsets; every copy retains IDs
 * and shares all source buffers. This also covers offscreen surface charts. */
export function installWrappedRender(renderer) {
  const render = renderer.render;
  renderer.render = function (scene, camera) {
    if (!camera.isOrthographicCamera) return render.call(this, scene, camera);
    const marks = [];
    scene.traverse((o) => {
      if (
        o.visible &&
        o.options &&
        wrapsWithRoot(o.options) &&
        coordinateView(o.options) !== "3d" &&
        o.longitudeShift
      )
        marks.push(o);
    });
    if (!marks.length) return render.call(this, scene, camera);
    const left = camera.position.x + camera.left / camera.zoom,
      right = camera.position.x + camera.right / camera.zoom,
      [first, last] = wrapTiles(left, right),
      oldClear = this.autoClear,
      hidden = [];
    try {
      for (let tile = first; tile <= last; tile++) {
        if (tile > first && tile === first + 1)
          scene.traverse((o) => {
            if (o.material && o.visible && !marks.includes(o)) {
              hidden.push(o);
              o.visible = false;
            }
          });
        for (const m of marks) m.longitudeShift.value = tile * TAU;
        this.autoClear = tile === first ? oldClear : false;
        render.call(this, scene, camera);
      }
    } finally {
      this.autoClear = oldClear;
      for (const m of marks) m.longitudeShift.value = 0;
      for (const o of hidden) o.visible = true;
    }
  };
  return () => (renderer.render = render);
}
