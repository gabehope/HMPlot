// The reference page of an API name, as guide pages write it ([Points], [hm.visualize_tree]):
// scripts/docs-pages.mjs links them in the HTML pages, docsMarkdown.server.js in the Markdown ones.
import { apiEntries } from "./api.js";

const names = new Map();
for (const entry of apiEntries.filter(e => !e.hidden)) {
  names.set(entry.title, entry);
  names.set(`hm.${entry.pythonTitle ?? entry.title}`, entry);
}
for (const [name,id] of Object.entries({ col:"names", input:"names", tween:"animate-tween", template:"template", slot:"slot" })) {
  const entry = apiEntries.find(e => e.id === id);
  names.set(name,entry); names.set(`hm.${name}`,entry);
}
/** The reference URL of an API name (`hm.` names and Python-only entries open in Python), or undefined. */
export function referenceLink(name) {
  const entry = names.get(name);
  return entry && `/reference/${name.startsWith("hm.") || entry.languages === "python" ? "python" : "svelte"}/${entry.id}`;
}
