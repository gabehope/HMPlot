// The same illustrative population as ten-million-stars.py. These are ordinary HMPlot
// expressions; Data(rows=N) supplies the row count and Calculate owns seeded random expressions on the GPU.
export function galaxyColumns({ random, multiply: mul, add, subtract: sub, divide: div,
  where, less, greater, greater_equal: ge, power: pow, square, sqrt, minimum: min,
  maximum: max, clip, floor, exp, log, sin, cos }) {
  const draw = (seed, distribution = "uniform") => random({ seed, distribution });
  const born = mul(draw(7), 10), bulge = less(draw(8), 0.14);
  const age = where(bulge, add(mul(born, 0.3), 7), born);
  const arm = mul(floor(mul(draw(9), 2)), Math.PI);
  const radius = mul(add(draw(10, "exponential"), draw(11, "exponential")), 1.8);
  const spread = add(add(mul(square(mul(age, 0.1)), 1.2), 0.15), mul(exp(mul(square(radius), -0.5)), 1.5));
  const angle = add(add(mul(log(add(radius, 0.5)), 2.6), arm), mul(draw(12, "normal"), spread));
  const r = mul(radius, add(mul(draw(13, "normal"), 0.07), 1));
  const x = where(bulge, sub(mul(draw(12, "normal"), 0.65), mul(draw(13, "normal"), 0.2)), mul(r, cos(angle)));
  const z = where(bulge, add(mul(draw(13, "normal"), 0.6), mul(draw(12, "normal"), 0.2)), mul(r, sin(angle)));
  const y = mul(draw(14, "normal"), where(bulge, 0.4, add(mul(age, 0.025), 0.055)));

  // Kroupa birth masses: dN/dM ~ M^-1.3 / M^-2.3, continuous at 0.5 solar masses.
  // Lifetimes, giants and white-dwarf cooling are deliberately approximate, not observations.
  const low = (0.5 ** -0.3 - 0.08 ** -0.3) / -0.3;
  const high = 0.5 * (30 ** -1.3 - 0.5 ** -1.3) / -1.3, p = low / (low + high);
  const u = draw(15);
  const small = pow(add(mul(clip(div(u, p), 0, 1), 0.5 ** -0.3 - 0.08 ** -0.3), 0.08 ** -0.3), -1 / 0.3);
  const large = pow(add(mul(clip(div(sub(u, p), 1 - p), 0, 1), 30 ** -1.3 - 0.5 ** -1.3), 0.5 ** -1.3), -1 / 1.3);
  const mass = where(less(u, p), small, large), lifetime = mul(pow(mass, -2.5), 10);
  const phase = div(age, lifetime), giant = clip(div(sub(phase, 1), 0.12), 0, 1);
  const mainT = min(mul(where(less(mass, 1), pow(mass, 0.35), pow(mass, 0.55)), 5772), 40000);
  const mainL = where(less(mass, 0.43), mul(pow(mass, 2.3), 0.23), pow(mass, 3.5));
  const giantT = add(mul(sqrt(giant), -1800), 4900), giantL = pow(10, add(mul(giant, 2.4), 1.2));
  const cooling = max(sub(age, mul(lifetime, 1.12)), 0);
  const dwarfT = mul(pow(add(mul(cooling, 6), 1), -0.35), 26000);
  const dwarfL = mul(pow(div(dwarfT, 5772), 4), 0.012 ** 2);
  const remnantL = where(ge(mass, 8), 0, dwarfL);
  const temperature = where(less(phase, 1), mainT, where(less(phase, 1.12), giantT, dwarfT));
  const luminosity = mul(where(less(phase, 1), mainL, where(less(phase, 1.12), giantL, remnantL)), pow(10, mul(draw(16, "normal"), 0.08)));
  return { x, y, z, age, temperature, luminosity };
}

// Read luminosity in a second ordinary Calculate rather than duplicate its full expression.
export function galaxyIntensity({ where, greater, clip, multiply, power }) {
  return where(greater("luminosity", 0), clip(multiply(power("luminosity", 0.3), 0.012), 0.001, 0.25), 0);
}
