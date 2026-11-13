import { docsPage } from "../../examples/docsPages.js";
// In the browser (test routes are client-only): the page's data as a docs route's server gives it.
export const load = ({ url }) => docsPage({ mode: "example", id: url.searchParams.get("id") ?? "timeseries" });
