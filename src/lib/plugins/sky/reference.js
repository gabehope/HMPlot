/**
 * The sky's math (TODO 37.2), on the CPU: the view direction through a pixel, the sky's frame
 * (its up is the camera's up, turned by its rotation), and the gradient's blend. The sky plugin's
 * shader (index.js, TODO 138.5) computes the same per pixel; these are its reference, and what
 * the unit tests check. skyLocalSteps is the shader's own sequence of steps, checked against
 * skyBasis.
 */

/** A 4x4 column-major matrix (three's `elements`) times [x, y, z, w]. */
function transform(m, x, y, z, w) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12] * w,
    m[1] * x + m[5] * y + m[9] * z + m[13] * w,
    m[2] * x + m[6] * y + m[10] * z + m[14] * w,
    m[3] * x + m[7] * y + m[11] * z + m[15] * w,
  ];
}
const normalize = ([x, y, z]) => {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
};

/**
 * The world direction the camera looks along through a pixel: `ndcX`, `ndcY` in [-1, 1] (y up),
 * unprojected by the camera's inverse projection, then turned by its world matrix (a direction:
 * the camera's position does not move the sky).
 */
export function skyDirection(ndcX, ndcY, projectionInverse, cameraWorld) {
  const [x, y, z, w] = transform(projectionInverse, ndcX, ndcY, 0.5, 1);
  const view = normalize([x / w, y / w, z / w]);
  return normalize(transform(cameraWorld, view[0], view[1], view[2], 0));
}

/**
 * The sky's frame as a 3x3 row-major matrix taking a world direction to the sky's own, whose +y
 * is the sky's up: the camera's `up`, then turned by `rotation` ([x, y, z] degrees, applied in
 * that order about the sky's own axes).
 */
export function skyBasis(up = [0, 1, 0], rotation = [0, 0, 0]) {
  // The rotation taking +y to `up` (Rodrigues), so a Z-up camera sees the sky upright.
  const u = normalize(up), axis = [u[2], 0, -u[0]], s = Math.hypot(axis[0], axis[2]), c = u[1];
  let align = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  if (s > 1e-9) {
    const k = [axis[0] / s, 0, axis[2] / s], t = 1 - c;
    align = [
      t * k[0] * k[0] + c, -s * k[2], t * k[0] * k[2],
      s * k[2], c, -s * k[0],
      t * k[0] * k[2], s * k[0], t * k[2] * k[2] + c,
    ];
  } else if (c < 0) align = [1, 0, 0, 0, -1, 0, 0, 0, -1];
  const [rx, ry, rz] = rotation.map((degrees) => (degrees * Math.PI) / 180);
  const X = [1, 0, 0, 0, Math.cos(rx), -Math.sin(rx), 0, Math.sin(rx), Math.cos(rx)];
  const Y = [Math.cos(ry), 0, Math.sin(ry), 0, 1, 0, -Math.sin(ry), 0, Math.cos(ry)];
  const Z = [Math.cos(rz), -Math.sin(rz), 0, Math.sin(rz), Math.cos(rz), 0, 0, 0, 1];
  // The sky's orientation in the world: aligned to up, then turned (X, then Y, then Z, about
  // its own axes). World to sky is its inverse, the transpose.
  const orientation = [X, Y, Z].reduce(multiply, align);
  return [0, 1, 2].flatMap((row) => [0, 1, 2].map((column) => orientation[column * 3 + row]));
}
function multiply(a, b) {
  return [0, 1, 2].flatMap((row) => [0, 1, 2].map((column) =>
    a[row * 3] * b[column] + a[row * 3 + 1] * b[3 + column] + a[row * 3 + 2] * b[6 + column]));
}
/** A world direction in the sky's frame (`basis` from skyBasis). */
export const skyLocal = (basis, [x, y, z]) => [
  basis[0] * x + basis[1] * y + basis[2] * z,
  basis[3] * x + basis[4] * y + basis[5] * z,
  basis[6] * x + basis[7] * y + basis[8] * z,
];

/**
 * A world direction in the sky's frame, in the steps the shader takes (index.js): undo the turn
 * of +y to `up` (Rodrigues, with the axis left unnormalized), then the rotation's X, Y and Z
 * turns, transposed. Equal to skyLocal(skyBasis(up, rotation), direction).
 */
export function skyLocalSteps([x, y, z], up = [0, 1, 0], rotation = [0, 0, 0]) {
  const [ux, uy, uz] = normalize(up);
  // k = (uz, 0, -ux), |k| = sin of the turn, uy its cosine.
  const kx = uz, kz = -ux, s2 = kx * kx + kz * kz, c = uy;
  if (s2 > 1e-12) {
    const along = (kx * x + kz * z) * (1 - c) / s2;
    // c d - k x d + k (k . d) (1 - c) / |k|^2
    [x, y, z] = [c * x - (-kz * y) + kx * along, c * y - (kz * x - kx * z), c * z - (kx * y) + kz * along];
  } else if (c < 0) [y, z] = [-y, -z];
  const [cx, cy, cz] = rotation.map((degrees) => Math.cos((degrees * Math.PI) / 180));
  const [sx, sy, sz] = rotation.map((degrees) => Math.sin((degrees * Math.PI) / 180));
  [y, z] = [cx * y + sx * z, -sx * y + cx * z];
  [x, z] = [cy * x - sy * z, sy * x + cy * z];
  [x, y] = [cz * x + sz * y, -sz * x + cz * y];
  return [x, y, z];
}

/**
 * Where a sky direction falls on an equirectangular image, as three's equirectUV: u is the
 * longitude across (0 to 1), v the latitude from the bottom (0) to the top (1).
 */
export function skyUV([x, y, z]) {
  return [Math.atan2(z, x) / (2 * Math.PI) + 0.5, Math.asin(Math.max(-1, Math.min(1, y))) / Math.PI + 0.5];
}

/**
 * A gradient sky's color in a direction of the sky's frame: the horizon color at the horizon,
 * blending to the zenith color straight up and to the ground color straight down, linearly in
 * the elevation angle. Colors are [r, g, b] in display space (as CSS gives them).
 */
export function skyGradient([, y], zenith, horizon, ground) {
  const elevation = Math.asin(Math.max(-1, Math.min(1, y))) / (Math.PI / 2);
  const [to, t] = elevation >= 0 ? [zenith, elevation] : [ground, -elevation];
  return horizon.map((value, i) => value + (to[i] - value) * t);
}
