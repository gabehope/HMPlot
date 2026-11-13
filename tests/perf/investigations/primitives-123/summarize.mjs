import { readFile, writeFile } from "node:fs/promises";
const inputs = process.argv.slice(2);
if (!inputs.length) throw Error("Pass retained plain/counters/gpu JSON files.");
const median = (xs) => {
  const a = [...xs].sort((a, b) => a - b),
    m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const stats = (xs) => ({
  n: xs.length,
  median: median(xs),
  min: Math.min(...xs),
  max: Math.max(...xs),
});
const summaries = [];
for (const input of inputs) {
  const data = JSON.parse(await readFile(input, "utf8"));
  if (!data.complete || data.failure)
    throw Error(`Incomplete capture: ${input}`);
  const groups = new Map();
  for (const sample of data.samples) {
    const condition = Object.fromEntries(
      [
        "workload",
        "n",
        "bucket",
        "visibility",
        "entities",
        "steps",
        "changing",
        "minimum",
        "time",
      ]
        .filter((k) => sample[k] !== undefined)
        .map((k) => [k, sample[k]]),
    );
    const key = JSON.stringify(condition);
    if (!groups.has(key)) groups.set(key, { condition, samples: [] });
    groups.get(key).samples.push(sample);
  }
  summaries.push({
    input,
    kind: data.kind,
    manifestSha256: data.manifestSha256,
    browser: data.browser,
    adapter: data.adapter,
    groups: [...groups.values()].map(({ condition, samples }) => ({
      condition,
      arms: [...new Set(samples.map((s) => s.method))].map((method) => {
        const arm = samples.filter((s) => s.method === method),
          field =
            condition.workload === "compact"
              ? "totalMs"
              : condition.workload === "moving-live"
                ? "fps"
                : "ms";
        return {
          method,
          field,
          ...stats(arm.map((s) => s[field])),
          ...(condition.workload === "compact"
            ? {
                operationMs: stats(arm.map((s) => s.operationMs)),
                countMs: stats(arm.map((s) => s.countMs)),
              }
            : {}),
          completedFrames: arm.map((s) => s.completedFrames ?? null),
          counters: arm.map((s) => s.counters),
          primitiveCalls: arm.map((s) => s.primitiveCalls ?? null),
          gpu: arm.map((s) => s.gpu ?? null),
        };
      }),
      paired: [...new Set(samples.map((s) => s.method))]
        .filter(
          (m) =>
            m !==
            (condition.workload === "compact" ||
            condition.workload.startsWith("moving")
              ? "sort"
              : "scan"),
        )
        .map((method) => {
          const baseline =
            condition.workload === "compact" ||
            condition.workload.startsWith("moving")
              ? "sort"
              : "scan";
          const field =
            condition.workload === "compact"
              ? "totalMs"
              : condition.workload === "moving-live"
                ? "fps"
                : "ms";
          const ratios = samples
            .filter((s) => s.method === method)
            .map(
              (s) =>
                s[field] /
                samples.find((b) => b.method === baseline && b.rep === s.rep)[
                  field
                ],
            );
          return {
            method,
            baseline,
            ratioField: field,
            candidateOverBaseline: stats(ratios),
            ratios,
          };
        }),
    })),
    correctness: data.correctness,
  });
}
const output =
  process.env.PRIMITIVE_SUMMARY ?? "/tmp/hmplot-123-summary.json";
await writeFile(output, JSON.stringify(summaries, null, 2));
console.log(output);
