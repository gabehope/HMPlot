import {Scatter} from './scatter.js';
import {MeshBasicNodeMaterial,PlaneGeometry,Vector4,Color} from 'three/webgpu';
import {vec2,vec3,vec4,float,uv,texture,uniform,min,max,abs,clamp,length,cameraProjectionMatrix,cameraViewMatrix,cameraWorldMatrix,screenSize,screenDPR} from 'three/tsl';
import {BufferedField} from '../utils/proputils.js';
import {ScalarType} from './types.js';
import {collapsed} from '../utils/mappedValidity.js';
import {LEADER_WIDTH,LEADER_GAP,HALO_WIDTH} from '../utils/labelAtlas.js';
export class Labels extends Scatter {
  // Builds at the end of its constructor, after its fields and atlas nodes (Scatter.setup skips its build).
  static buildsItself = true;
  static componentName="Text";
  constructor(options,view,invalidate){
    super(options,view,invalidate,new MeshBasicNodeMaterial({transparent:true,depthWrite:false}));
    this.exportKind="labels";
    // Text stays out of the minimap (TODO 61): at its scale names are clutter, and a map's place
    // names stack on one another.
    this.userData.omitOverview=true;
    for(const key of ['textCode','textWidth'])this.manager.registerField(new BufferedField(new ScalarType({targetNodes:[key+'Node']}),this,{onDirty:()=>this.build()}),key);
    // The atlas reaches the shader through a uniform (columns, rows, cell width and height in
    // 64px units) and one texture node whose value is swapped, so a new atlas never changes
    // the shader and never recompiles the pipeline.
    this.atlasShape=uniform(new Vector4(1,1,1,1));this.atlasNode=null;
    // The cells' padding in font sizes (labelAtlas.js: wider in an atlas a halo draws from).
    this.atlasPad=uniform(4/64);
    // Alignment shifts a label by a fraction of its width: a uniform, so a new align moves the
    // text without a rebuild (the options store does not rebuild Labels on align).
    // align "auto" picks each row's side from its dx (utils/labelSide.js), in the shader; only
    // switching to or from it rebuilds.
    this.alignShift=uniform(-0.5);this.alignAuto=false;
    const align=()=>{const value=this.options?.get('align')??'center';this.alignShift.value=value==='left'?0:value==='right'?-1:-0.5;
      const auto=value==='auto';if(auto!==this.alignAuto){this.alignAuto=auto;this.build();}};
    // A box behind each label (TODO 46: callouts, crosshair readouts): its colors and sizes are
    // uniforms, so only turning it on or off rebuilds the material.
    this.boxActive=false;
    this.boxFill=uniform(new Color('#ffffff'));this.boxStroke=uniform(new Color('#8a94a6'));
    this.boxShape=uniform(new Vector4(4,3,1,1));// padding, radius, stroke width (CSS px), opacity
    // The leader: width (CSS px), whether it has a color of its own (else the text's), and the gap
    // it leaves at the point (CSS px).
    this.leaderActive=false;this.leaderColor=uniform(new Color('#8a94a6'));this.leaderShape=uniform(new Vector4(LEADER_WIDTH,0,LEADER_GAP,0));
    // A halo (TODO 134.29): the text drawn over its own outline, HALO_WIDTH CSS px wide, in the
    // plot's background, where a label has no box.
    this.haloActive=false;this.haloColor=uniform(new Color('#ffffff'));
    align();
    if(this.options?.has('align'))this.unregister.push(this.options.on(()=>{align();this.invalidate();},'align'));
    this.build();
  }
  // Glyph coverage always blends: the material is transparent from the start, so a new opacity
  // (or a dimmed row) never changes the blend decision and never rebuilds a Text mark.
  blended(){return true;}
  // Glyph quads are unlit: without a normal attribute the instance node skips the normal
  // transform, which frees a vertex buffer for per-row color and opacity (WebGPU allows 8).
  updateGeometry(){const quad=new PlaneGeometry(1,1);quad.deleteAttribute('normal');this.replaceGeometry(quad);}
  vertexBufferFields(){return [...super.vertexBufferFields().filter((name)=>name!=='symbolCode'&&name!=='categoryOutline'),'textCode','textWidth'];}
  /** A box behind each label: false, or { fill, outlineColor, outlineWidth, padding, radius, opacity }. Returns true when the material must be rebuilt. */
  setBox(box){
    const active=!!box;
    if(active){
      this.boxFill.value.set(box.fill??'#ffffff');this.boxStroke.value.set(box.outlineColor??'#8a94a6');
      this.boxShape.value.set(Math.max(0,box.padding??4),Math.max(0,box.radius??3),Math.max(0,box.outlineWidth??1),Math.min(1,Math.max(0,box.opacity??1)));
    }
    this.exportBox=active?{fill:box.fill??'#ffffff',stroke:box.outlineColor??'#8a94a6',strokeWidth:Math.max(0,box.outlineWidth??1),padding:Math.max(0,box.padding??4),radius:Math.max(0,box.radius??3),opacity:Math.min(1,Math.max(0,box.opacity??1))}:null;
    if(active===this.boxActive)return false;
    this.boxActive=active;return true;
  }
  /** A leader line from each label's point (less a gap) to its box's nearest edge: false, or { color, width }; the text's color unless it sets one. Returns true when the material must be rebuilt. */
  setLeader(leader){
    const active=!!leader;
    if(active){if(leader.color!=null)this.leaderColor.value.set(leader.color);this.leaderShape.value.set(Math.max(0,leader.width??LEADER_WIDTH),leader.color!=null?1:0,LEADER_GAP,0);}
    this.exportLeader=active?{color:leader.color??null,width:Math.max(0,leader.width??LEADER_WIDTH),gap:LEADER_GAP}:null;
    if(active===this.leaderActive)return false;
    this.leaderActive=active;return true;
  }
  /** A halo behind each label without a box: a CSS color, or null for none. Returns true when the material must be rebuilt. */
  setHalo(color){
    const active=!!color;
    if(active)this.haloColor.value.set(color);
    this.exportHalo=active?{color,width:HALO_WIDTH}:null;
    if(active===this.haloActive)return false;
    this.haloActive=active;return true;
  }
  build(){
    if(!this.atlas||!this.coordinatesNode||!this.textCodeNode)return;
    if(this.vertexBuffersExceeded(this.vertexBufferFields()))return;
    // A label whose point the chain cannot map collapses (TODO 136.11).
    const shape=this.atlasShape,code=this.textCodeNode,{position:point,valid}=this.mapPosition(vec3(0)),
      clip=cameraProjectionMatrix.mul(cameraViewMatrix.mul(vec4(point,1))),
      unit=vec3(clip.w.abs().mul(2).div(cameraProjectionMatrix.element(0).x.abs().mul(screenSize.x)),clip.w.abs().mul(2).div(cameraProjectionMatrix.element(1).y.abs().mul(screenSize.y)),0),
      // The pixel ratio is a uniform (screenDPR): another ratio compiles nothing.
      pixel=this.displayScaleNode.mul(screenDPR),size=(this.scaleNode?.x??float(12)).mul(pixel),
      dx=(this.dxNode??float(0)).mul(pixel),dy=(this.dyNode??float(0)).mul(pixel),
      // Codes are whole numbers; the half-cell offset keeps the row exact under a uniform divisor.
      row=code.add(0.5).div(shape.x).floor(),column=code.sub(row.mul(shape.x)),fill=this.getColorNode(this.getValueNode()),
      present=code.greaterThanEqual(0).select(float(1),float(0));
    // Label-local coordinates in units of the font size, y up: the atlas cell spans x from
    // A - pad (A: the text's left edge, from its width and align) over shape.z, y over
    // ±shape.w/2. The label's point is at -offset (offsets are screen pixels, y down).
    const rowOffset=this.dxNode??float(0),
      shift=this.alignAuto?rowOffset.greaterThan(4).select(float(0),rowOffset.lessThan(-4).select(float(-1),float(-0.5))):this.alignShift,
      width=this.textWidthNode??float(0),A=width.mul(shift),cellLeft=A.sub(this.atlasPad),
      halo=this.haloActive&&!this.boxActive,extended=this.boxActive||this.leaderActive||halo;
    let lx,ly,u,v,inside=float(1),pad,hx,hy,cx,origin,near;
    if(!extended){lx=uv().x.mul(shape.z).add(cellLeft);ly=uv().y.sub(0.5).mul(shape.w);u=uv().x;v=uv().y;}
    else{
      // The quad also covers the box (the text's width and a line, 1.2, tall, padded) and the
      // leader from the label's point to the box's nearest point.
      pad=this.boxShape.x.mul(pixel).div(size);hx=width.mul(0.5).add(pad);hy=float(0.6).add(pad);cx=A.add(width.mul(0.5));
      origin=vec2(dx.negate().div(size),dy.div(size));
      near=vec2(clamp(origin.x,cx.sub(hx),cx.add(hx)),clamp(origin.y,hy.negate(),hy));
      const reach=this.leaderActive?this.leaderShape.x.mul(pixel).div(size).add(2/64):float(0),
        x0=min(min(cellLeft,cx.sub(hx)),this.leaderActive?origin.x.sub(reach):cellLeft),
        x1=max(max(cellLeft.add(shape.z),cx.add(hx)),this.leaderActive?origin.x.add(reach):cellLeft),
        y0=min(min(shape.w.mul(-0.5),hy.negate()),this.leaderActive?origin.y.sub(reach):hy.negate()),
        y1=max(max(shape.w.mul(0.5),hy),this.leaderActive?origin.y.add(reach):hy);
      lx=x0.add(uv().x.mul(x1.sub(x0)));ly=y0.add(uv().y.mul(y1.sub(y0)));
      u=lx.sub(cellLeft).div(shape.z);v=ly.div(shape.w).add(0.5);
      inside=u.greaterThanEqual(0).and(u.lessThanEqual(1)).and(v.greaterThanEqual(0)).and(v.lessThanEqual(1)).select(float(1),float(0));
    }
    const px=lx.mul(size).add(dx),py=ly.mul(size).sub(dy),
      coord=vec2(column.add(u).div(shape.x),shape.y.sub(1).sub(row).add(v).div(shape.y)),
      coverage=texture(this.atlasNode,coord).a.mul(present).mul(inside);
    this.material.positionNode=collapsed(valid,point.add(cameraWorldMatrix.mul(vec4(vec3(px,py,0).mul(unit),0)).xyz));
    if(!extended){this.material.colorNode=fill.rgb;this.material.opacityNode=fill.a.mul(coverage);}
    else{
      // Composited back to front (premultiplied): the leader, the box's fill, its stroke inside
      // the edge, the text. Distances are in device pixels.
      const here=vec2(lx,ly),textA=fill.a.mul(coverage);
      let color=vec3(0),alpha=float(0);
      const over=(rgb,a)=>{color=rgb.mul(a).add(color.mul(float(1).sub(a)));alpha=a.add(alpha.mul(float(1).sub(a)));};
      if(this.leaderActive){
        // From the gap's end at the point to the box: a leader shorter than the gap is not drawn.
        const along=near.sub(origin),span=length(along),gap=this.leaderShape.z.mul(pixel).div(size),
          t=clamp(here.sub(origin).dot(along).div(max(along.dot(along),1e-8)),min(gap.div(max(span,1e-8)),1),1),
          distance=length(here.sub(origin.add(along.mul(t)))).mul(size),
          outside=span.sub(gap).mul(size).greaterThan(0.5).select(float(1),float(0)),
          rgb=this.leaderShape.y.greaterThan(0.5).select(this.leaderColor,fill.rgb);
        over(rgb,clamp(this.leaderShape.x.mul(pixel).mul(0.5).add(0.5).sub(distance),0,1).mul(outside).mul(fill.a).mul(present));
      }
      if(this.boxActive){
        const radius=min(this.boxShape.y.mul(pixel).div(size),min(hx,hy)),
          q=vec2(abs(lx.sub(cx)).sub(hx).add(radius),abs(ly).sub(hy).add(radius)),
          d=length(max(q,vec2(0))).add(min(max(q.x,q.y),0)).sub(radius).mul(size),
          stroke=this.boxShape.z.mul(pixel),opacity=this.boxShape.w.mul(fill.a).mul(present),edge=clamp(float(0.5).sub(d),0,1);
        over(this.boxFill,edge.mul(opacity));
        over(this.boxStroke,edge.mul(clamp(d.add(stroke).add(0.5),0,1)).mul(stroke.greaterThan(0).select(float(1),float(0))).mul(opacity));
      }
      if(halo){
        // The text's coverage dilated by the halo's width (at most the cell's padding): the
        // largest of samples on two rings around this point, each kept within this label's cell.
        const r=min(float(HALO_WIDTH).mul(pixel).div(size),this.atlasPad.sub(2/64)),
          at=(dx,dy)=>texture(this.atlasNode,vec2(column.add(clamp(u.add(r.mul(dx).div(shape.z)),0,1)).div(shape.x),shape.y.sub(1).sub(row).add(clamp(v.add(r.mul(dy).div(shape.w)),0,1)).div(shape.y))).a;
        let spread=coverage;
        for(const [ring,count] of [[1,16],[0.5,8]])
          for(let k=0;k<count;k++){const angle=2*Math.PI*(k+0.5*(ring<1))/count;spread=max(spread,at(ring*Math.cos(angle),ring*Math.sin(angle)).mul(present).mul(inside));}
        over(this.haloColor,spread.mul(fill.a));
      }
      over(fill.rgb,textA);
      this.material.colorNode=color.div(max(alpha,1e-4));this.material.opacityNode=alpha;
    }
    this.material.alphaTest=0.05;
    // The `blend` option composites labels like every other mark.
    this.applyBlend(true);
    this.material.needsUpdate=true;
  }
  /** Points the material at `atlas`. Returns true when the node graph must be built (the first atlas). */
  setAtlas(atlas){
    this.atlas=atlas;this.atlasShape.value.set(atlas.columns,atlas.rows,atlas.cellWidth/64,atlas.cellHeight/64);this.atlasPad.value=(atlas.pad??4)/64;
    if(this.atlasNode){this.atlasNode.value=atlas.texture;return false;}
    this.atlasNode=texture(atlas.texture);return true;
  }
}
