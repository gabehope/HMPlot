/**
 * Make three's OrbitControls honor a changed `camera.up`. OrbitControls computes its
 * y-up rotation (`_quat` / `_quatInverse`) from `object.up` once, in its constructor; these
 * private fields have been stable since r160, and tests/unit/orbit-up.test.js fails loudly
 * if a three upgrade renames them.
 */
export function syncOrbitUp(controls) {
  const { _quat: quat, _quatInverse: inverse, object } = controls ?? {};
  if (!quat?.setFromUnitVectors || !inverse?.copy || !object?.up)
    throw Error("OrbitControls no longer exposes _quat/_quatInverse: update syncOrbitUp for this three version.");
  const up = object.up.clone().normalize();
  quat.setFromUnitVectors(up, up.constructor ? new up.constructor(0, 1, 0) : { x: 0, y: 1, z: 0 });
  inverse.copy(quat).invert();
  return controls;
}
