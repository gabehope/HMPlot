// A plugin package for the tests (TODO 138.4): the docs' hatch, as an installed package ships it.
export default {
  name: "test-hatch",
  version: "0.1.0",
  apiVersion: 1,
  setup(hm) {
    const { fract, mix, step, vec4 } = hm.tsl;
    hm.shade("hatch", {
      parameters: {
        spacing: { type: "number", default: 8, min: 2 },
        width: { type: "number", default: 0.5, min: 0, max: 1 },
        ink: { type: "color", default: "#000000" },
      },
      shade({ color, screenCoordinate, params }) {
        const along = fract(screenCoordinate.x.add(screenCoordinate.y).div(params.spacing));
        return vec4(mix(color.rgb, params.ink, step(along, params.width)), color.a);
      },
    });
  },
};
