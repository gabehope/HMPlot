// Only this page's Markdown loads (TODO 68.1): one chunk per guide page.
const pages = import.meta.glob(["../../content/guide/*.svx", "../../content/guide/*.md"]);
export async function load({ data }) {
  if (data.unpublished) return data;
  const page = pages[`../../content/guide/${data.id}.svx`] ?? pages[`../../content/guide/${data.id}.md`];
  return { ...data, Content: (await page?.())?.default };
}
