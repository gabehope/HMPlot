<script>
  import { useTask, useThrelte } from "@threlte/core";
  import { cameraMatrixKey } from "../utils/camera.js";
  import { Quaternion, Vector3 } from "three/webgpu";
  let { active = false, onframe } = $props();
  const { camera } = useThrelte();
  const inverse = new Quaternion(),
    a = new Vector3(),
    b = new Vector3();
  let previous = "";
  useTask(
    () => {
      if (!active || !camera.current) {
        previous = "";
        return;
      }
      const view = camera.current;
      view.updateMatrixWorld();
      const rect = view.userData?.plotRect;
      // The area is in the key too: an equal-aspect fit can keep both matrices as it moves.
      const key = [
        cameraMatrixKey(view),
        rect?.left,
        rect?.right,
        rect?.top,
        rect?.bottom,
      ].join(",");
      if (key === previous) return;
      previous = key;
      inverse.copy(view.quaternion).invert();
      const axes = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ]
        .map((values, index) => {
          a.fromArray(values).applyQuaternion(inverse);
          return {
            label: ["X", "Y", "Z"][index],
            color: ["#db4b58", "#24865e", "#4a73d8"][index],
            x: a.x,
            y: -a.y,
            z: a.z,
          };
        })
        .sort((a, b) => a.z - b.z);
      a.set(-1, -1, 0).unproject(view);
      b.set(1, 1, 0).unproject(view);
      onframe({
        axes,
        x: [a.x, b.x],
        y: [a.y, b.y],
        ...(rect ? { rect: { ...rect } } : {}),
      });
    },
    { autoInvalidate: false },
  );
</script>
