import { docsPage } from "../examples/docsPages.js";
import { withExamples } from "../examples/exampleData.server.js";
export const ssr = true;
export const load = () => withExamples(docsPage({ mode: "api", id: "plot", language: "svelte" }));
