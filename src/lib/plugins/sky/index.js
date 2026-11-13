// @ts-check
/**
 * The sky (TODO 37.2), a first-party plugin (TODO 138.5): a 3D plot's sky beneath its scene, an
 * equirectangular image or a gradient from the horizon to the zenith and the ground, drawn in
 * display space after tone mapping (so an image shows its file's colors and a gradient its CSS
 * colors), seen through the camera: its up is the camera's up, turned by `rotation`. It uses
 * only what a plugin is given (hm, the effect's inputs); reference.js holds its math on the CPU.
 */

/** A gradient sky's colors where it sets none (the ground's default is its horizon). */
export const SKY_DEFAULTS = Object.freeze({ zenith: "#4a7cc4", horizon: "#d6e4f2" });

export default {
  name: "hmplot.sky",
  apiVersion: 1,
  /** @param {any} hm */
  setup(hm) {
    const { float, mix, select, cross, dot, vec2, vec3, vec4, equirectUV } = hm.tsl;
    hm.effect("sky", {
      stage: "display",
      // Beneath every other display effect.
      order: -1,
      cameras: "perspective",
      export: "raster",
      parameters: {
        image: { type: "image", wrap: "repeat" },
        zenith: { type: "color", default: SKY_DEFAULTS.zenith },
        horizon: { type: "color", default: SKY_DEFAULTS.horizon },
        ground: { type: "color" },
        // [x, y, z] degrees, about the sky's own axes in that order.
        rotation: { type: "vector", length: 3, default: [0, 0, 0] },
        visible: { type: "boolean", default: true },
      },
      /**
       * @param {Record<string, unknown>} values as given
       * @param {{ threeD?: boolean, plot?: string }} context the Plot's
       */
      check(values, { threeD = true, plot = "the Plot" } = {}) {
        if (!threeD) return `needs a 3D view, and ${plot} is 2D. Set type="3d" on it, or remove sky.`;
        const given = ["zenith", "horizon", "ground"].filter((key) => values[key] != null);
        if (values.image != null && given.length)
          return `takes image or the gradient's colors (${given.join(", ")}), not both.`;
        return "";
      },
      /** @param {Record<string, unknown>} values with their defaults */
      shown: (values) => values.visible !== false,
      /** @param {any} inputs */
      display({ rgb, alpha, uv, params, camera }) {
        // The view direction through this pixel: screen uv runs down the image, NDC's y up.
        const ndc = vec2(uv.x.mul(2).sub(1), uv.y.mul(-2).add(1));
        const view = camera.projectionInverse.mul(vec4(ndc, 0.5, 1));
        let d = camera.world.mul(vec4(view.xyz.div(view.w).normalize(), 0)).xyz.normalize();
        // In the sky's frame (reference.js's skyLocalSteps): undo the turn of +y to the camera's
        // up, then the rotation's turns.
        const up = camera.up.normalize();
        const k = vec3(up.z, 0, up.x.negate()), s2 = dot(k, k), c = up.y;
        const turned = d.mul(c).sub(cross(k, d)).add(k.mul(dot(k, d).mul(float(1).sub(c)).div(s2.max(1e-12))));
        d = select(s2.greaterThan(1e-12), turned, select(c.lessThan(0), d.mul(vec3(1, -1, -1)), d));
        const radians = params.rotation.mul(Math.PI / 180), cosine = radians.cos(), sine = radians.sin();
        d = vec3(d.x, cosine.x.mul(d.y).add(sine.x.mul(d.z)), sine.x.negate().mul(d.y).add(cosine.x.mul(d.z)));
        d = vec3(cosine.y.mul(d.x).sub(sine.y.mul(d.z)), d.y, sine.y.mul(d.x).add(cosine.y.mul(d.z)));
        d = vec3(cosine.z.mul(d.x).add(sine.z.mul(d.y)), sine.z.negate().mul(d.x).add(cosine.z.mul(d.y)), d.z);
        let color;
        if (params.image) color = params.image.sample(equirectUV(d)).level(0).rgb;
        else {
          // The horizon's color at the horizon, blending linearly in the elevation angle.
          const elevation = d.y.clamp(-1, 1).asin().div(Math.PI / 2);
          color = elevation.greaterThanEqual(0).select(
            mix(params.horizon, params.zenith, elevation),
            mix(params.horizon, params.ground ?? params.horizon, elevation.negate()),
          );
        }
        // Opaque: beneath the scene, every pixel is covered.
        return { rgb: rgb.mul(alpha).add(color.mul(float(1).sub(alpha))), alpha, opaque: true };
      },
    });
  },
};
