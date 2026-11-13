import type { ComponentProps } from 'svelte';
import { Points, Plot, Frame, Html } from 'hmplot';
const supported: ComponentProps<typeof Points> = {x:'x',onclick(event) {
  const index: number | undefined = event.sourceRow;
  // @ts-expect-error a source row is an index, not the original record
  event.sourceRow.name;
}};
// @ts-expect-error closed Svelte component API rejects misspellings
const misspelled: ComponentProps<typeof Points> = { opactiy:0.5 };
// @ts-expect-error attachments take scalar numeric coordinates
const columnAnchor: ComponentProps<typeof Html> = {x:'x',y:1};
declare const frame: ReturnType<typeof Frame>;
declare const plot: ReturnType<typeof Plot>;
frame.subscribeScreenMapping(mapping=>mapping?.project({x:1,y:2}));
plot.setViewport({x:0,y:0,zoom:2});
// @ts-expect-error viewport center is numeric, not a domain interval
plot.setViewport({x:[0,1]});
// @ts-expect-error no invented convenience method
frame.projectRows([]);
// @ts-expect-error settings subscription requires a callback
frame.subscribeSettings('changed');
