import{c as Tt,a as $,f as z}from"./CBBAqgJ0.js";import{o as jt}from"./N83JKgEV.js";import{p as qt,b as P,i as dt,g as t,f as B,c as S,s as r,r as D,d,u as k,a as Jt,t as Kt}from"./B9wkoLL1.js";import{s as Ot}from"./DERYp8jH.js";import{i as F,c as A}from"./DhO4MQLI.js";import{r as mt}from"./BYlnjHhB.js";import{b as xt}from"./DXSzS3sl.js";import{b as ft}from"./DkNc9VSg.js";import{p as ct,b as h}from"./CIo0f6os.js";import{T as N}from"./Bb8oyIJ3.js";import"./B-ja0Cv4.js";import ot from"./D8i4euQZ.js";import vt from"./SdsZJORj.js";import Qt from"./VRVU6AK2.js";import Ut from"./5ZDE-OOv.js";import{c as rt,bR as Xt}from"./tOd4CyYd.js";import"./CUvJkHif.js";/* empty css        */import Yt from"./D8E7zIKX.js";import{D as Zt}from"./DK5ZAW9T.js";import M from"./ixmKINV6.js";import _ from"./CL6cdHyS.js";import W from"./B3lrqsIQ.js";import E from"./Y6whoCvK.js";import te from"./D0EK5LRb.js";import ee from"./wTcQ2cFY.js";import oe from"./C3RWRl_C.js";import re from"./DQKIo8Xp.js";import ae from"./BD7yvJaW.js";import le from"./B_6VjdSC.js";var ie=z('<label class="svelte-wymhby">View <select aria-label="View"><option>2d</option><option>3d</option></select></label>'),se=z('<label class="svelte-wymhby">Bins <input type="number" min="1" max="20" class="svelte-wymhby"/></label>'),ne=z('<label class="svelte-wymhby">Point size <input aria-label="Point size" type="range" min="3" max="14" class="svelte-wymhby"/></label>'),ue=z("<!><!><!>",1),pe=z("<!><!><!>",1),de=z("<!><!><!>",1),me=z('<div class="controls svelte-wymhby"><label class="svelte-wymhby">Example <select aria-label="Example"><option>Wrapped facets</option><option>Matrix facets</option><option>Global normalization before faceting</option><option>Faceted histograms</option><option>Hexagonal columns</option><option>Rectangular columns</option><option>Voxel bins</option><option>Stacked intervals</option><option>Swarm</option><option>Normalized rolling signal</option></select></label><!><!><!><!></div> <!>',1),xe=z('<output aria-label="Selected bin"> </output>'),fe=z("<!> <!>",1);function qe(ht,G){qt(G,!0);let yt=ct(G,"onready",3,void 0),gt=ct(G,"oncode",3,void 0),v=P(void 0),at=P(void 0),I=P(""),V=P(7);const $t=new Set(["facets","matrix","histogram","global","stack"]);let n=P("facets"),L=P("3d"),R=P(8),f=P(void 0),_t=P({x:Array.from({length:120},(m,u)=>Math.sin(u*1.71)*2+u%3),y:Array.from({length:120},(m,u)=>Math.cos(u*.71)*2),group:Array.from({length:120},(m,u)=>["A","B","C"][u%3]),time:Array.from({length:120},(m,u)=>u),z:Array.from({length:120},(m,u)=>Math.sin(u*.31)*2),site:Array.from({length:120},(m,u)=>u%2?"North":"South")});dt(()=>{yt()?.($t.has(t(n))?t(f)?{exportPNG:m=>t(f).exportPNG({scale:m}),whenSettled:()=>t(f).whenSettled(),openSettings:m=>t(f).getPlots()[0]?.plot.openSettings(m)}:void 0:t(v))});const bt={matrix:`<Data value={observations}>
  <Facet row="site" column="group" link="x">
    <Plot height={240} axes2d><Points x="x" y="y" fill="group" /></Plot>
  </Facet>
</Data>`,global:`<Data value={observations}>
  <Normalize field="x" as="x">
    <Facet column="group" wrap={3}>
      <Plot height={260} axes2d><Points x="x" y="y" fill="group" /></Plot>
    </Facet>
  </Normalize>
</Data>`,voxel:`<Plot type="3d">
  <Bin x="x" y="y" z="z" bins={4} empty={false}>
    <Rect x0="x0" x1="x1" y0="y0" y1="y1" z0="z0" z1="z1" fill="count" />
  </Bin>
</Plot>`,stack:`<Plot axes2d>
  <Stack y="x" series="group">
    <Rect x0={0} x1={1} y0="y0" y1="y1" fill="group" />
  </Stack>
</Plot>`,facets:`<Data value={observations}>
  <Facet column="group" wrap={3}>
    <Plot height={260} axes2d>
      <Points x="x" y="y" fill="group" />
    </Plot>
  </Facet>
</Data>`,histogram:`<InputContext>
  <Slider name="bins" min={1} max={64} step={1} value={8} label="Bins" />
  <Facet column="group" wrap={3}>
    <Plot height={260} axes2d>
      <Bin x="x" bins={input("bins")}>
        <Rect x0="x0" x1="x1" y0={0} y1="count" />
      </Bin>
    </Plot>
  </Facet>
</InputContext>`,hex:`<Plot type="3d">
  <Hexbin x="x" y="y" bins={8}>
    <Prism x="x" y="y" width="width" depth="depth"
      z0={0} z1="count" rotation="rotation" shape="hexagon" fill="count" />
  </Hexbin>
</Plot>`,bins:`<Plot type="3d">
  <Bin x="x" y="y" bins={8}>
    <Rect x0="x0" x1="x1" y0="y0" y1="y1" z0={0} z1="count" fill="count" />
  </Bin>
</Plot>`,swarm:`<Plot axes2d>
  <Dodge x="x" axis="y" as="offset" padding={1} seed={42}>
    <Points x="x" y={0} dy="offset" size={7} />
  </Dodge>
</Plot>`,signal:`<Normalize field="x" as="normalized">
  <Sort by="time">
    <Window field="normalized" size={7} as="smooth">
      <Plot axes2d><Line x="time" y="smooth" /></Plot>
    </Window>
  </Sort>
</Normalize>`};dt(()=>gt()?.(bt[t(n)])),jt(()=>()=>delete window.__facetExample);var lt=fe(),it=B(lt);Yt(it,{children:(m,u)=>{var C=me(),T=B(C),j=S(T),q=r(S(j)),J=S(q);J.value=J.__value="facets";var K=r(J);K.value=K.__value="matrix";var O=r(K);O.value=O.__value="global";var Q=r(O);Q.value=Q.__value="histogram";var U=r(Q);U.value=U.__value="hex";var X=r(U);X.value=X.__value="bins";var Y=r(X);Y.value=Y.__value="voxel";var Z=r(Y);Z.value=Z.__value="stack";var tt=r(Z);tt.value=tt.__value="swarm";var st=r(tt);st.value=st.__value="signal",D(q),D(j);var nt=r(j);{var wt=i=>{var c=ie(),y=r(S(c));D(c),ft(y,()=>t(L),w=>d(L,w)),$(i,c)},St=k(()=>["bins","hex","voxel"].includes(t(n)));F(nt,i=>{t(St)&&i(wt)})}var ut=r(nt);{var Dt=i=>{var c=se(),y=r(S(c));mt(y),D(c),xt(y,()=>t(R),w=>d(R,w)),$(i,c)},kt=k(()=>["bins","hex","voxel"].includes(t(n)));F(ut,i=>{t(kt)&&i(Dt)})}var pt=r(ut);{var Bt=i=>{var c=ne(),y=r(S(c));mt(y),D(c),xt(y,()=>t(V),w=>d(V,w)),$(i,c)};F(pt,i=>{t(n)==="swarm"&&i(Bt)})}var Ft=r(pt);{var At=i=>{le(i,{name:"bins",min:1,max:64,step:1,value:8,label:"Bins"})};F(Ft,i=>{t(n)==="histogram"&&i(At)})}D(T);var Nt=r(T,2);Zt(Nt,{get value(){return t(_t)},children:(i,c)=>{var y=Tt(),w=B(y);{var Lt=o=>{h(M(o,{row:"site",column:"group",link:"x",children:(e,b)=>{_(e,{height:240,axes2d:!0,children:(a,x)=>{W(a,{x:"x",y:"y",fill:"group",size:7})},$$slots:{default:!0}})},$$slots:{default:!0}}),e=>d(f,e,!0),()=>t(f))},Rt=o=>{vt(o,{field:"x",as:"x",children:(e,b)=>{h(M(e,{column:"group",wrap:3,children:(a,x)=>{_(a,{height:260,axes2d:!0,children:(s,g)=>{W(s,{x:"x",y:"y",fill:"group",size:7})},$$slots:{default:!0}})},$$slots:{default:!0}}),a=>d(f,a,!0),()=>t(f))},$$slots:{default:!0}})},Mt=o=>{h(_(o,{x:{domain:[-3,5]},y:{domain:[-3,3]},z:{domain:[-3,3]},responsive:!0,height:440,get type(){return t(L)},axes3d:!0,children:(e,b)=>{var a=ue(),x=B(a);A(x,()=>N.AmbientLight,(l,p)=>{p(l,{intensity:1.5})});var s=r(x);A(s,()=>N.DirectionalLight,(l,p)=>{p(l,{position:[40,80,100],intensity:3})});var g=r(s);{let l=k(()=>Math.min(t(R),8));ot(g,{x:"x",y:"y",z:"z",get bins(){return t(l)},empty:!1,children:(p,H)=>{{let et=k(()=>rt({domain:[0,8]}));E(p,{x0:"x0",x1:"x1",y0:"y0",y1:"y1",z0:"z0",z1:"z1",fill:"count",get fillScale(){return t(et)},lit:!0})}},$$slots:{default:!0}})}$(e,a)},$$slots:{default:!0}}),e=>d(v,e,!0),()=>t(v))},Ct=o=>{h(M(o,{column:"site",children:(e,b)=>{_(e,{x:{domain:[0,1]},height:320,axes2d:!0,children:(a,x)=>{te(a,{y:"x",series:"group",children:(s,g)=>{E(s,{x0:.1,x1:.9,y0:"y0",y1:"y1",fill:"group"})},$$slots:{default:!0}})},$$slots:{default:!0}})},$$slots:{default:!0}}),e=>d(f,e,!0),()=>t(f))},Ht=o=>{h(M(o,{column:"group",wrap:3,children:(e,b)=>{_(e,{height:260,axes2d:!0,children:(a,x)=>{W(a,{x:"x",y:"y",fill:"group",size:7})},$$slots:{default:!0}})},$$slots:{default:!0}}),e=>d(f,e,!0),()=>t(f))},Wt=o=>{h(M(o,{column:"group",wrap:3,children:(e,b)=>{_(e,{height:260,axes2d:!0,children:(a,x)=>{{let s=k(()=>Xt("bins"));ot(a,{name:"histogram",x:"x",get bins(){return t(s)},children:(g,l)=>{E(g,{x0:"x0",x1:"x1",y0:0,y1:"count",fill:"#547ba2"})},$$slots:{default:!0}})}},$$slots:{default:!0}})},$$slots:{default:!0}}),e=>d(f,e,!0),()=>t(f))},Et=o=>{h(_(o,{x:{domain:[-3,5]},y:{domain:[-3,3]},z:{domain:[0,15]},responsive:!0,height:440,get type(){return t(L)},axes3d:!0,children:(e,b)=>{var a=pe(),x=B(a);A(x,()=>N.AmbientLight,(l,p)=>{p(l,{intensity:1.5})});var s=r(x);A(s,()=>N.DirectionalLight,(l,p)=>{p(l,{position:[40,80,100],intensity:3})});var g=r(s);Ut(g,{x:"x",y:"y",get bins(){return t(R)},children:(l,p)=>{{let H=k(()=>rt({domain:[0,8]}));ee(l,{x:"x",y:"y",width:"width",depth:"depth",z0:0,z1:"count",shape:"hexagon",rotation:"rotation",fill:"count",get fillScale(){return t(H)},lit:!0,onclick:et=>d(I,`${et.aggregate?.count??0} observations`)})}},$$slots:{default:!0}}),$(e,a)},$$slots:{default:!0}}),e=>d(v,e,!0),()=>t(v))},Gt=o=>{h(_(o,{x:{domain:[-3,5]},y:{domain:[-3,3]},z:{domain:[0,15]},responsive:!0,height:440,get type(){return t(L)},axes3d:!0,children:(e,b)=>{var a=de(),x=B(a);A(x,()=>N.AmbientLight,(l,p)=>{p(l,{intensity:1.5})});var s=r(x);A(s,()=>N.DirectionalLight,(l,p)=>{p(l,{position:[40,80,100],intensity:3})});var g=r(s);ot(g,{x:"x",y:"y",get bins(){return t(R)},children:(l,p)=>{{let H=k(()=>rt({domain:[0,8]}));E(l,{x0:"x0",x1:"x1",y0:"y0",y1:"y1",z0:0,z1:"count",fill:"count",get fillScale(){return t(H)},lit:!0})}},$$slots:{default:!0}}),$(e,a)},$$slots:{default:!0}}),e=>d(v,e,!0),()=>t(v))},It=o=>{h(_(o,{x:{domain:[-3,5]},y:{domain:[-1,1]},responsive:!0,height:300,axes2d:!0,children:(e,b)=>{oe(e,{x:"x",axis:"y",as:"offset",children:(a,x)=>{h(W(a,{x:"x",y:0,dy:"offset",get size(){return t(V)},fill:"group"}),s=>d(at,s,!0),()=>t(at))},$$slots:{default:!0}})},$$slots:{default:!0}}),e=>d(v,e,!0),()=>t(v))},Vt=o=>{vt(o,{field:"x",as:"normalized",children:(e,b)=>{re(e,{by:"time",children:(a,x)=>{Qt(a,{field:"normalized",size:7,as:"smooth",children:(s,g)=>{h(_(s,{x:{domain:[0,120]},y:{domain:[-2,2]},responsive:!0,height:360,axes2d:!0,children:(l,p)=>{ae(l,{x:"time",y:"smooth",color:"#547ba2",width:2})},$$slots:{default:!0}}),l=>d(v,l,!0),()=>t(v))},$$slots:{default:!0}})},$$slots:{default:!0}})},$$slots:{default:!0}})};F(w,o=>{t(n)==="matrix"?o(Lt):t(n)==="global"?o(Rt,1):t(n)==="voxel"?o(Mt,2):t(n)==="stack"?o(Ct,3):t(n)==="facets"?o(Ht,4):t(n)==="histogram"?o(Wt,5):t(n)==="hex"?o(Et,6):t(n)==="bins"?o(Gt,7):t(n)==="swarm"?o(It,8):o(Vt,-1)})}$(i,y)},$$slots:{default:!0}}),ft(q,()=>t(n),i=>d(n,i)),$(m,C)},$$slots:{default:!0}});var Pt=r(it,2);{var zt=m=>{var u=xe(),C=S(u,!0);D(u),Kt(()=>Ot(C,t(I))),$(m,u)};F(Pt,m=>{t(I)&&m(zt)})}$(ht,lt),Jt()}export{qe as default};
