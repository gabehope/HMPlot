// @ts-check
/**
 * A spherical Frame's atmosphere (TODO 37.6), a first-party plugin (TODO 138.5): a slightly larger
 * back-facing sphere around its globe, added onto what is behind it and fading from the globe's
 * limb to the shell's edge as the view ray passes farther from the globe's center (a Fresnel-like
 * rim). An object effect: a Frame's `atmosphere` adds it to the plot's scene
 * (scenes/presentationObject.svelte), which fits it before each draw. It is not a mark: it is not
 * picked, has no data for the axes' domains and no legend, and the minimap leaves it out. Like
 * the sky, fog and glow, it makes SVG and PDF exports draw the plot as one raster.
 */

export const ATMOSPHERE_DEFAULTS = Object.freeze({ color: "#7fb2ff", thickness: 0.1 });

export default {
  name: "hmplot.atmosphere",
  apiVersion: 1,
  /** @param {any} hm */
  setup(hm) {
    const { AdditiveBlending, BackSide, Color, Mesh, MeshBasicNodeMaterial, SphereGeometry, Vector3 } = hm.three;
    const { cross, positionView, uniform, vec4 } = hm.tsl;
    const north = new Vector3(), south = new Vector3(), equator = new Vector3();
    hm.effect("atmosphere", {
      stage: "object",
      export: "raster",
      parameters: {
        color: { type: "color", default: ATMOSPHERE_DEFAULTS.color },
        // A fraction of the globe's radius, above 0.
        thickness: { type: "number", default: ATMOSPHERE_DEFAULTS.thickness },
      },
      /** @param {Record<string, unknown>} values as given @param {{ frame: { globe: boolean } }} context */
      check({ thickness }, { frame }) {
        if (thickness !== undefined && !(/** @type {number} */ (thickness) > 0))
          return `thickness is a number above 0 (a fraction of the globe's radius); got ${JSON.stringify(thickness)}.`;
        if (!frame.globe) return "needs a spherical Frame (a globe) in a 3D plot.";
        return "";
      },
      object() {
        const material = new MeshBasicNodeMaterial({ side: BackSide, transparent: true, depthWrite: false, blending: AdditiveBlending });
        const mesh = new Mesh(new SphereGeometry(1, 64, 32), material);
        const centerView = uniform(new Vector3()), inner = uniform(1), outer = uniform(1.1);
        const color = uniform(new Color(ATMOSPHERE_DEFAULTS.color));
        let thickness = /** @type {number} */ (ATMOSPHERE_DEFAULTS.thickness);
        // How far the view ray through this pixel passes from the globe's center (view space; the
        // camera at the origin): 1 at the globe's limb, 0 at the shell's edge.
        const miss = cross(positionView.normalize(), centerView).length();
        const rim = outer.sub(miss).div(outer.sub(inner)).clamp(0, 1);
        material.colorNode = vec4(color, rim.mul(rim));
        mesh.frustumCulled = false;
        mesh.matrixAutoUpdate = false;
        mesh.renderOrder = 1;
        return {
          object: mesh,
          /** @param {{ color: string, thickness: number }} values */
          set(values) {
            color.value.setStyle(values.color);
            thickness = values.thickness;
          },
          /**
           * Fit the shell to the Frame's globe as the camera sees it (a placed Frame may move or
           * follow the camera).
           * @param {{ camera: any, frame: { period: number, point(position: number[]): number[] } }} inputs
           */
          update({ camera, frame }) {
            const pole = Number.isFinite(frame.period) ? frame.period / 4 : 90;
            north.fromArray(frame.point([0, pole]));
            south.fromArray(frame.point([0, -pole]));
            equator.fromArray(frame.point([0, 0]));
            const center = north.add(south).multiplyScalar(0.5), radius = equator.distanceTo(center);
            // A globe with no size: the shell collapses (an object hidden here would not be fitted again).
            const shell = radius > 0 && Number.isFinite(radius) ? radius * (1 + thickness) : 0;
            mesh.matrix.makeScale(shell, shell, shell).setPosition(center);
            mesh.matrixWorld.copy(mesh.matrix);
            centerView.value.copy(center).applyMatrix4(camera.matrixWorldInverse);
            inner.value = shell ? radius : 1;
            outer.value = shell ? shell : 2;
          },
          dispose() {
            mesh.geometry.dispose();
            material.dispose();
          },
        };
      },
    });
  },
};
