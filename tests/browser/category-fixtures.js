import { numpy as np } from "@hmplot/jax";
import {
  categorical,
  createDataScope,
} from "../../src/lib/plot/utils/categorical.js";
import { prepareNamed } from "../../src/lib/plot/utils/namedData.js";
export async function fixtures() {
  const colors = categorical({
      domain: ["A", "B"],
      range: ["#ff0000", "#0000ff"],
    }),
    axis = categorical({ domain: ["A", "B"] });
  const options = { categoryAxes: { x: axis }, get: () => undefined },
    scope = createDataScope(),
    selection = { auto: {}, hidden: { fill: new Set(["B"]) } };
  const code = np.array([0, 1, 2, -1], { dtype: np.int32 }),
    y = np.array([1, 2, 3, 4], { dtype: np.float32 });
  scope.update({
    x: ["A", "B", "C", "A"],
    y,
    group: { codes: code, categories: ["A", "B"] },
  });
  const p = prepareNamed(
    { x: "x", y: "y", fill: "group", fillScale: colors },
    scope,
    options,
    "Points",
    selection,
  );
  const pos = Array.from(await p.props.position.ref.data()),
    col = Array.from(await p.props.categoryColor.ref.data());
  const positions = Array.from({ length: 4 }, (_, i) =>
      pos.slice(i * 2, i * 2 + 2),
    ),
    rgb = Array.from({ length: 4 }, (_, i) => col.slice(i * 3, i * 3 + 3));
  p.dispose();
  scope.dispose();
  code.dispose();
  y.dispose();
  return {
    positions: positions.map((row) =>
      row.map((v) => (Number.isNaN(v) ? null : v)),
    ),
    rgb,
  };
}
