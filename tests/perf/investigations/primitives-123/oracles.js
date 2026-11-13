export function selected(mask) {
  return Array.from(mask, (v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
}

export function bracketOracle(times, mask, starts, ends, at) {
  return Array.from(starts, (start, entity) => {
    let lo = -Infinity,
      hi = Infinity;
    for (let i = start; i <= ends[entity]; i++)
      if (mask[i] > 0) {
        if (times[i] <= at) lo = i;
        if (times[i] >= at && hi === Infinity) hi = i;
      }
    return { lo, hi, valid: lo >= start && hi <= ends[entity] };
  });
}

export function history(entities, steps, visibility = "all", phase = 0) {
  const n = entities * steps;
  return {
    times: Float32Array.from({ length: n }, (_, i) => i % steps),
    mask: Int32Array.from({ length: n }, (_, i) => {
      if (visibility === "none") return 0;
      if (visibility === "entities")
        return (Math.floor(i / steps) * 17 + phase) % 11 < 5 ? 1 : 0;
      if (visibility === "holes") return (i * 17 + phase) % 23 < 4 ? 1 : 0;
      return 1;
    }),
    starts: Int32Array.from({ length: entities }, (_, i) => i * steps),
    ends: Int32Array.from({ length: entities }, (_, i) => (i + 1) * steps - 1),
  };
}

export function assertBrackets(actual, expected, starts, ends) {
  for (let e = 0; e < expected.length; e++) {
    const valid = actual[0][e] >= starts[e] && actual[1][e] <= ends[e];
    if (
      valid !== expected[e].valid ||
      (valid &&
        (actual[0][e] !== expected[e].lo || actual[1][e] !== expected[e].hi))
    )
      throw Error(
        `Bracket mismatch for entity ${e}: ${actual.map((a) => a[e])}, expected ${JSON.stringify(expected[e])}`,
      );
  }
}
