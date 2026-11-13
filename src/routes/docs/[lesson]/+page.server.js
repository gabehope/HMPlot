import { guideSections } from "../../examples/guide.js";
import { docsPage } from "../../examples/docsPages.js";
import { withExamples } from "../../examples/exampleData.server.js";
export const ssr = true;
export const load = ({ params }) => withExamples(docsPage({ mode: "guide", id: params.lesson }));
export const entries = () => guideSections.map(({ id }) => ({ lesson: id }));
