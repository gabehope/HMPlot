import {test} from 'node:test';
import assert from 'node:assert/strict';
import {embeddedFacetLayout} from '../../src/lib/plot/utils/embeddedFacets.js';
const cells=['a','b','c'].map(column=>({column,row:null}));
test('bands partition only the requested dimension without rescaling inherited coordinates',()=>{
 const result=embeddedFacetLayout(cells,{splitColumn:true});
 assert.deepEqual(result.extent,{x:[-.5,2.5],y:null});
 assert.deepEqual(result.cells[0].x.range,[-.45,.45]);assert.deepEqual(result.cells[1].y,{});
 assert.throws(()=>embeddedFacetLayout(cells,{layout:'bands',wrap:2}),/layout="grid"/);
 assert.throws(()=>embeddedFacetLayout(cells,{bandPadding:1}),/bandPadding/);
});
test('grid uses top-to-bottom row order and converts gap from pixels',()=>{
 const result=embeddedFacetLayout(cells,{layout:'grid',wrap:2,gap:10,width:200,height:200});
 assert.deepEqual(result.cells.map(v=>[v.x.range.reduce((a,b)=>a+b)/2,v.y.range.reduce((a,b)=>a+b)/2]),[[0,1],[1,1],[0,0]]);
 assert.deepEqual(result.cells[0].x.range,[-.45,.45]);
});
test('grid places cells that carry grid positions there: a lower-triangle pairs matrix',async()=>{
 const {pairCells}=await import('../../src/lib/plot/utils/facetSpec.js');
 const list=['a','b','c'],{cells:pairs}=pairCells({x:list,y:list,triangle:'lower'});
 assert.equal(pairs.length,6);
 const result=embeddedFacetLayout(pairs.map(p=>({...p})),{splitRow:true,splitColumn:true,layout:'grid',gap:0});
 assert.deepEqual(result.extent,{x:[-.5,2.5],y:[-.5,2.5]});
 // Row a (top) holds one cell at column a; row c (bottom) holds all three.
 const centers=result.cells.map(v=>[v.cell.y+v.cell.x,v.x.range.reduce((a,b)=>a+b)/2,v.y.range.reduce((a,b)=>a+b)/2]);
 assert.deepEqual(centers,[['aa',0,2],['ba',0,1],['bb',1,1],['ca',0,0],['cb',1,0],['cc',2,0]]);
 // Cells without grid positions keep row-major filling.
 assert.deepEqual(embeddedFacetLayout(pairs.map(({gridRow,gridColumn,...p})=>p),{layout:'grid',splitRow:true,splitColumn:true,gap:0})
  .cells.map(v=>v.x.range.reduce((a,b)=>a+b)/2),[0,1,2,0,1,2]);
});

import {rootFrameDimension} from '../../src/lib/plot/utils/frameMapping.js';
import {axisCategory} from '../../src/lib/plot/utils/categorical.js';
test('local dimensions cannot inherit root categories or claim root-axis brushing',()=>{
 const scale={},root={frameDefinition:{parent:null,owns:()=>true},categoryAxes:{x:scale}};
 const child={defaults:root,frameDefinition:{parent:root,owns:a=>a==='x'}};
 assert.equal(axisCategory(child,'x'),null);assert.equal(rootFrameDimension(child,'x'),false);
 assert.equal(rootFrameDimension(child,'y'),true);assert.equal(rootFrameDimension(root,'x'),true);
 child.frameDefinition.owns=()=>false;assert.equal(axisCategory(child,'x'),scale);
 child.frameDefinition.placement={};assert.equal(rootFrameDimension(child,'y'),false);
});

test("facet configuration errors, including embedded camera links", async () => {
  const { validateFacetConfig } = await import("../../src/lib/plot/utils/embeddedFacets.js");
  const base = { embedded: false, link: "none", layout: "grid", scales: "shared", splitRow: true, splitColumn: true };
  validateFacetConfig(base);
  validateFacetConfig({ ...base, embedded: true, layout: "bands" });
  assert.throws(() => validateFacetConfig({ ...base, embedded: true, link: "x" }), /Embedded facets share their View camera; use link="none"/);
  assert.throws(() => validateFacetConfig({ ...base, layout: "bands" }), /layout=bands requires an enclosing Plot or Frame/);
  assert.throws(() => validateFacetConfig({ ...base, link: "grid", wrap: 2 }), /link="grid" requires explicit row and column/);
  // link="grid" needs two split dimensions: pairs, or fields x a category, but not fields alone.
  validateFacetConfig({ ...base, link: "grid" });
  assert.throws(() => validateFacetConfig({ ...base, splitRow: false, link: "grid" }), /link="grid" requires explicit row and column/);
  assert.throws(() => validateFacetConfig({ ...base, link: "x", scales: "free-x" }), /Linked facet dimensions require shared domains/);
  validateFacetConfig({ ...base, link: "x", scales: "free-y" });
  for (const scales of ["independent", "free-w", undefined])
    assert.throws(() => validateFacetConfig({ ...base, scales }), { message: "Invalid facet scales." });
  validateFacetConfig({ ...base, resolve: { color: "independent", size: "shared", width: "shared", shape: "independent" } });
  for (const resolve of [{ fill: "shared" }, { color: "free" }, ["color"], "independent"])
    assert.throws(() => validateFacetConfig({ ...base, resolve }),
      { message: "Facet resolve accepts color, size, width, and shape set to shared or independent." });
  for (const link of ["both", "all", undefined])
    assert.throws(() => validateFacetConfig({ ...base, link }), { message: "Invalid facet link." });
});
