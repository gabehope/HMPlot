import base from "./playwright.config.js";
// Measurement specs under tests/perf/: run with PERF=1 against a running dev server.
export default { ...base, testDir: "tests/perf", testMatch: "*.spec.js", timeout: 600000 };
