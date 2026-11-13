// Only this page's Markdown loads (TODO 68.1). Registry-alias ids render their component's page.
const pages = import.meta.glob("../../../content/reference/*.svx");
export async function load({ data }) {
  return { ...data, Content: (await pages[`../../../content/reference/${data.item.aliasOf ?? data.id}.svx`]?.())?.default };
}
