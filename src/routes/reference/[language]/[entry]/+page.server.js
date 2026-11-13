import { apiDocs } from "../../../examples/docsManifest.js";
import { docsPage } from "../../../examples/docsPages.js";
import { withExamples } from "../../../examples/exampleData.server.js";
export const ssr = true;
export const load = ({ params }) => withExamples(docsPage({ mode: "api", id: params.entry, language: params.language }));
export const entries = () => ["svelte", "python"].flatMap((language) => apiDocs.map(({ id: entry }) => ({ language, entry })));
