import { docsPage } from "./docsPages.js";
import { withThumbnails } from "./exampleData.server.js";
export const ssr = true;
export const load = () => withThumbnails(docsPage({ mode: "examples" }));
