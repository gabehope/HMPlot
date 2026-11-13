import test from 'node:test';
import assert from 'node:assert/strict';
import {sphericalPoint,inverseSpherical,greatCircle,projectionY,inverseY,wrapLongitude,longitudeRadians,inverseLongitude,angularPeriod,periodicSpherical,MERCATOR_LIMIT} from '../../src/lib/plot/utils/coordinates.js';
import {fitOverview,viewportRectangles,clampOverviewCenter} from '../../src/lib/plot/utils/minimapMath.js';
const close=(a,b)=>{assert.equal(a.length,b.length);a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-7,`${a} != ${b}`));};
const options={get:k=>({angleUnit:'degrees',baseRadius:1,radialScale:2})[k]};
test('Y-up longitude, latitude and radial conventions',()=>{
 close(sphericalPoint([0,0]),[0,0,1]);close(sphericalPoint([90,0]),[1,0,0]);close(sphericalPoint([0,90]),[0,1,0]);close(sphericalPoint([450,0]),[1,0,0]);
 close(sphericalPoint([Math.PI/2,0,1],{angleUnit:'radians',baseRadius:2,radialScale:3}),[5,0,0]);
 close(inverseSpherical(sphericalPoint([31,-24,.7],{radialScale:2}),options),[31,-24,.7]);
});
test('invalid latitudes, nonfinite values and nonpositive radii are excluded',()=>{
 for(const p of [[0,91],[Infinity,0],[0,NaN],[0,0,-1]])assert.equal(sphericalPoint(p),null);
});
test('extent and custom angle units map source values to complete turns',()=>{
 const extent={angleUnit:'extent',xbounds:[0,24],baseRadius:1,radialScale:1};
 assert.ok(Math.abs(longitudeRadians(12,extent))<1e-12);
 assert.ok(Math.abs(Math.abs(longitudeRadians(0,extent))-Math.PI)<1e-12);
 assert.ok(Math.abs(Math.abs(longitudeRadians(24,extent))-Math.PI)<1e-12);
 assert.equal(inverseLongitude(Math.PI/2,extent),18);
 const custom={angleUnit:'custom',anglePeriod:24,baseRadius:1,radialScale:1};
 assert.ok(Math.abs(longitudeRadians(6,custom)-Math.PI/2)<1e-12);
 assert.equal(angularPeriod(custom),24);
 close(sphericalPoint([6,0],custom),[1,0,0]);
});
test('shortest arc crosses the meridian without going through longitude zero',()=>{
 const a=sphericalPoint([170,0]),b=sphericalPoint([-170,0]);close(greatCircle(a,b,.5),[0,0,-1]);
 for(let t=0;t<=1;t+=.1)assert.ok(Math.abs(Math.hypot(...greatCircle(a,b,t))-1)<1e-7);
});
test('antipodal plane is deterministic and finite',()=>{
 const a=[0,0,1],b=[0,0,-1];close(greatCircle(a,b,.5),[0,1,0]);close(greatCircle(a,b,0),a);close(greatCircle(a,b,1),b);
});
test('all cylindrical projections round trip and Mercator has finite limits',()=>{
 for(const kind of ['equirectangular','mercator','equal-area'])for(const y of [-1.2,-.2,0,.8,1.2])assert.ok(Math.abs(inverseY(projectionY(y,kind),kind)-y)<1e-10);
 assert.ok(Math.abs(projectionY(MERCATOR_LIMIT,'mercator')-Math.PI)<1e-8);assert.ok(Math.abs(wrapLongitude(5*Math.PI)+Math.PI)<1e-10);
});
test('overview splits seam rectangles and preserves periodic horizontal navigation',()=>{
 const f={...fitOverview(180,90,[-Math.PI,Math.PI],[-Math.PI/2,Math.PI/2]),periodic:true},v={x:[Math.PI-.5,Math.PI+.5],y:[-.5,.5]},rects=viewportRectangles(v,f,true);
 assert.equal(rects.length,2);assert.ok(Math.abs(rects.reduce((n,r)=>n+r.width,0)-f.scale)<1e-7);
 assert.equal(clampOverviewCenter(10,0,v,f).x,10);
 const full=viewportRectangles({x:[-10,10],y:[-2,2]},f,true);assert.equal(full.length,1);assert.equal(full[0].width,180);
});
test('only root-owned projected spherical maps repeat across the seam',()=>{
 const root={frameDefinition:{parent:null}},parent={frameDefinition:{parent:root}},
   option=(owner,projection='mercator')=>({get:key=>({coordinates:'spherical',projection})[key],owner:key=>key==='coordinates'?root:owner});
 assert.equal(periodicSpherical(option(root)),true);
 assert.equal(periodicSpherical(option(parent)),false);
 assert.equal(periodicSpherical(option(root,'orthographic')),false);
});
