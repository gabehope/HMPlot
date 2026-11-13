import { redirect } from "@sveltejs/kit";
import { base } from "$app/paths";
export const ssr = true;
export const prerender = true;
export const load = () => redirect(307, `${base}/examples`);
