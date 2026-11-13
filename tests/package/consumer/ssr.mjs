import assert from "node:assert/strict";
import { createServer } from "vite";
const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const { default: App } = await server.ssrLoadModule("/src/App.svelte");
  const { render } = await server.ssrLoadModule("svelte/server");
  const result = render(App);
  assert.match(result.body, /Installed package/);
  assert.match(result.body, /Loading/);
  assert.doesNotMatch(result.body, /<canvas/);
  console.log("SSR renders safely without initializing WebGPU.");
} finally {
  await server.close();
}
