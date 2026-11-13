import { docsPage } from "../examples/docsPages.js";
import { withExamples, withThumbnails } from "../examples/exampleData.server.js";
// The docs render on the server (prerendered), unlike the test routes (+layout.js; TODO 68.1).
export const ssr = true;
export const load = async () => withThumbnails(await withExamples(docsPage({ mode: "home" })));
