import { examples } from "../catalog.js";
import { docsPage } from "../docsPages.js";
import { withExamples } from "../exampleData.server.js";
export const ssr = true;
export const load = ({ params }) => withExamples(docsPage({ mode: "example", id: params.example }));
export const entries = () => examples.map((e) => ({ example: e.id }));
