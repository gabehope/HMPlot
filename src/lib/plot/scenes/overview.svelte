<script>
  import { useViewServices } from "../utils/viewServices.js";
  import { exportPixels } from "../utils/exportPixels.js";
  import { limitError } from "../utils/limits.js";
  import { holdAnimation } from "../utils/animation.js";
  import { animationVersion } from "../utils/markAnimation.js";
  import { spherical, periodicSpherical, sphericalDomain,
    inverseOrthographicAtCenter } from "../utils/coordinates.js";
  import { useThrelte } from "@threlte/core";
  import { onMount, onDestroy } from "svelte";
  import * as THREE from "three/webgpu";
  import { MinimapGPU } from "../utils/minimapGPU.js";
  import { axisLayout, readAxis } from "../utils/axes.js";
  import { groupsThousands, tickLabel } from "../utils/numberLabels.js";
  import { plotRectangle } from "../utils/viewport.js";
  import { fitOverview, cameraRestorePatch, flyoverAlignPosition } from "../utils/minimapMath.js";
  import { controlsTheme } from "../../options/controlsTheme.js";
  let { source, mode, options } = $props();
  const { renderer, scene, camera, invalidate } = useThrelte();
  const viewServices = useViewServices();
  let draws = 0, retryFrame;
  function retry() { if (!retryFrame) retryFrame = requestAnimationFrame(() => { retryFrame = 0; invalidate(); }); }
  onDestroy(() => cancelAnimationFrame(retryFrame));
  const release = (c) => {
    c.gpu?.dispose();
    c.gpu = undefined;
    c.revision = -1;
    c.lastFrame = undefined;
    c.failedRevision = undefined;
    c.error = "";
  };
  function capture() {
    const cam = camera.current,
      controls = viewServices.navigation.controls.current;
    return controls && cam
      ? {
          viewport: controls.getViewport?.(),
          camera: viewServices.navigation.camera.current?.get(),
          position: cam.position.toArray(),
          target: controls.target.toArray(),
          up: cam.up.toArray(),
          zoom: cam.zoom,
          zoomX: cam.userData.zoomX,
          zoomY: cam.userData.zoomY,
        }
      : undefined;
  }
  function restore(state) {
    if (!state) return;
    const cam = camera.current,
      controls = viewServices.navigation.controls.current;
    if (!cam || !controls) return;
    if (state.viewport && controls.setViewport) { controls.setViewport(state.viewport); return; }
    // 3D: the scene's camera API syncs the controls' world-up. Navigation comes from
    // state.position/target/up/zoom, which align() and orbit() edit; only the lens
    // (fov/near/far) comes from the captured camera state.
    if (viewServices.navigation.camera.current) {
      viewServices.navigation.camera.current.set(cameraRestorePatch(state));
      return;
    }
    cam.position.fromArray(state.position);
    cam.up.fromArray(state.up);
    cam.zoom = state.zoom;
    controls.target.fromArray(state.target);
    cam.updateProjectionMatrix();
    controls.update();
    invalidate();
  }
  function move(x,y,start) {
    if (mode !== '2d') return;
    if (spherical(options) && options.get('projection') === 'orthographic') {
      // Freeze the orientation captured at pointer-down. Re-inverting every
      // absolute drag position against a newly rotated disk would accumulate
      // the same movement on each pointer event.
      const mapping = start?.viewport?.center
        ? { get: (key) => key === 'projectionCenter'
          ? start.viewport.center : options.get(key) }
        : options;
      const source = inverseOrthographicAtCenter([x, y], mapping);
      if (source) viewServices.navigation.controls.current?.panTo?.(source[0], source[1]);
    } else viewServices.navigation.controls.current?.panTo?.(x,y);
  }
  function align(axis, sign) {
    if (mode !== "3d") return;
    const state = capture();
    if (!state) return;
    // Flyover keeps its up (its ground plane); the top-down button stops at its pitch clamp.
    if (state.camera?.mode === "flyover") {
      state.position = flyoverAlignPosition(state, axis, sign);
      restore(state);
      return;
    }
    const distance = new THREE.Vector3()
      .fromArray(state.position)
      .distanceTo(new THREE.Vector3().fromArray(state.target));
    state.position = [...state.target];
    state.position[axis] += distance * sign;
    state.up = axis === 1 ? [0, 0, -sign] : [0, 1, 0];
    restore(state);
  }
  function orbit(dx, dy, start) {
    if (mode !== "3d" || !start) return;
    const up = new THREE.Vector3().fromArray(start.up),
      q = new THREE.Quaternion().setFromUnitVectors(
        up,
        new THREE.Vector3(0, 1, 0),
      );
    const offset = new THREE.Vector3()
      .fromArray(start.position)
      .sub(new THREE.Vector3().fromArray(start.target))
      .applyQuaternion(q);
    const sphere = new THREE.Spherical().setFromVector3(offset);
    sphere.theta -= dx * 0.012;
    sphere.phi -= dy * 0.012;
    sphere.makeSafe();
    offset
      .setFromSpherical(sphere)
      .applyQuaternion(q.invert())
      .add(new THREE.Vector3().fromArray(start.target));
    restore({ ...start, position: offset.toArray() });
  }
  function frame(renderContent = true) {
    if (!source.clients.size) return;
    const cam = camera.current;
    if (!cam || !viewServices.navigation.controls.current) return;
    // Camera replacement and the mode prop can settle in different effects.
    if ((mode === "2d") !== !!cam.isOrthographicCamera) return;
    cam.updateMatrixWorld();
    const inverse = cam.quaternion.clone().invert();
    const axes = [0, 1, 2]
      .flatMap((axis) =>
        [-1, 1].map((sign) => {
          const v = new THREE.Vector3();
          v.setComponent(axis, sign);
          v.applyQuaternion(inverse);
          return {
            axis,
            sign,
            x: v.x,
            y: -v.y,
            z: v.z,
            label: `${sign > 0 ? "+" : "−"}${"XYZ"[axis]}`,
          };
        }),
      )
      .sort((a, b) => a.z - b.z);
    const rect = cam.userData.plotRect, size = renderer.getSize(new THREE.Vector2());
    const a = new THREE.Vector3(rect ? rect.left/size.x*2-1 : -1, rect ? 1-rect.bottom/size.y*2 : -1, 0).unproject(cam),
      b = new THREE.Vector3(rect ? rect.right/size.x*2-1 : 1, rect ? 1-rect.top/size.y*2 : 1, 0).unproject(cam);
    const view = {
      x: [Math.min(a.x, b.x), Math.max(a.x, b.x)],
      y: [Math.min(a.y, b.y), Math.max(a.y, b.y)],
    };
    const objects = [];
    scene.traverse((o) => {
      if (o.material && !o.userData?.omitOverview)
        objects.push([
          o.uuid,
          o.visible,
          o.count,
          o.material.version,
          o.geometry?.uuid,
          o.progress?.value,
          o.surfaceVersion,
          animationVersion(o),
          o.matrixWorld.elements,
        ]);
    });
    const revision = JSON.stringify([
      viewServices.drawing.revision,
      scene.background?.getHex?.(),
      options.get("coordinates"), options.get("projection"),
      options.get("projectionCenter"),
      options.get("_projectionCenterLongitude"), options.get("_projectionCenterLatitude"),
      options.get("baseRadius"), options.get("radialScale"),
      objects,
      options.get("xrange"),
      options.get("yrange"),
      renderer.toneMapping,
      renderer.outputColorSpace,
    ]);
    for (const client of source.clients) {
      if (!(client.width > 0 && client.height > 0)) continue;
      const showX = client.axes === true || !!client.axes?.x, showY = client.axes === true || !!client.axes?.y;
      const rect = plotRectangle(client.width,client.height,{left:showY?44:showX?24:0,right:showX?24:0,top:showY?8:0,bottom:showX?22:0});
      const fit = fitOverview(
        rect.width,
        rect.height,
        spherical(options)
          ? sphericalDomain(options).x
          : (options.get("xrange") ?? [-50, 50]),
        spherical(options)
          ? sphericalDomain(options).y
          : (options.get("yrange") ?? [-50, 50]),
        !spherical(options) && options.child("plot").get("aspect") !== "equal",
      );
      // The source camera changes its drawable rectangle when axes toggle.
      // Include that layout in the overview frame so a camera-only update
      // cannot reuse a rectangle from the previous axis margins.
      fit.x += rect.left; fit.y += rect.top; fit.width=client.width; fit.height=client.height; fit.rect=rect;
      fit.periodic = periodicSpherical(options);
      if (mode === "2d" && renderContent) {
        const key = revision + JSON.stringify([fit, window.devicePixelRatio]);
        if (client.revision !== key && client.failedRevision !== key) {
          try {
          if (!client.gpu) client.gpu = new MinimapGPU(renderer, client.canvas);
          const complete = client.gpu.render(
            scene,
            fit,
            client.displayScale ?? 0.35,
            client.maxInstances === undefined ? 1000 : client.maxInstances,
          );
          if (complete) {
            client.revision = key;
            client.error = '';
            client.generation=viewServices.lifecycle.completedFrame;
            draws++;
          } else {retry();continue;}
          } catch(error) {client.error=error.message;client.failedRevision=key;client.notify({...client.completedFrame,error:client.error});continue;}
        }
        if(client.failedRevision===key)continue;
      } else if (mode === "3d" && client.gpu) release(client);
      const tickOptions=client.axis?.getFrameOptions?.()??options;
      const tickKey=JSON.stringify([mode,showX,showY,fit, ['x','y'].map(a=>[tickOptions.get(a+'bounds'),tickOptions.get(a+'Transform'),readAxis(tickOptions,a)]), options.get('projection'),options.get('angleUnit')]);
      if (client.tickKey !== tickKey) {
        client.tickKey=tickKey;
        // The overview draws no compact labels' offset (TODO 136.10): its ticks keep whole values.
        const whole=(l)=>l?.offset?{...l,offset:null,major:l.major.map(t=>({...t,label:tickLabel(t.value,groupsThousands(l.major.map(m=>m.value)))}))}:l;
        client.ticks = mode === '2d' && (showX || showY) ? {
          x: showX ? whole(axisLayout(tickOptions,'x',[fit.left,fit.right],(fit.right-fit.left)*(fit.scaleX??fit.scale))) : null,
          y: showY ? whole(axisLayout(tickOptions,'y',[fit.bottom,fit.top],(fit.top-fit.bottom)*(fit.scaleY??fit.scale))) : null,
        } : null;
      }
      const ticks = client.ticks;
      if(mode==='2d' && !renderContent){
        if(client.completedFrame?.mode==='2d'){
          const next={...client.completedFrame,view};
          const key=JSON.stringify(next);if(client.lastFrame!==key){client.lastFrame=key;client.notify(next);}
        }
        continue;
      }
      // The plot's background and text color (TODO 61), for the minimap's own (a transparent plot's
      // minimap keeps its default colors).
      const colors = controlsTheme(options.child("plot").get("background"), options.child("plot").get("axisTextColor"));
      const theme = { background: colors["--hm-theme-background"], text: colors["--hm-theme-color"] };
      const next = { mode, view, fit, axes, ticks, theme, error:client.error??'', sourceId:source.id };
      client.completedFrame = next;
      const key = JSON.stringify(next);
      if (client.lastFrame !== key) {
        client.lastFrame = key;
        client.notify(next);
      }
    }
  }
  $effect(() => {
    mode;
    // Invalidate retired mode resources even when the main frame is held.
    for (const client of source.clients) {
      release(client);
      client.notify(null);
    }
    invalidate();
  });
  onMount(() => {
    const disconnect = source.bind({
      invalidate,
      release,
      move,
      align,
      orbit,
      capture,
      restore,
      async exportPNG(client, scale = 1) {
        if(mode !== '2d' || !client.completedFrame) throw Error('Only completed 2D minimaps can be exported.');
        if(!Number.isFinite(scale)||scale<0.1||scale>10) throw Error('Export scale must be between 0.1 and 10.');
        const fit=client.completedFrame.fit, width=Math.round(fit.width*scale),height=Math.round(fit.height*scale),limits=renderer.backend.device.limits;
        if(Math.max(width,height)>limits.maxTextureDimension2D)throw limitError('texture',{component:'Minimap',what:"a PNG export's side",count:Math.max(width,height),limit:limits.maxTextureDimension2D,hint:'Reduce the export scale.'});
        if(width*height*48>limits.maxBufferSize)throw limitError('exportPixels',{component:'Minimap',what:'a PNG export',count:width*height,limit:Math.floor(limits.maxBufferSize/48)});
        const canvas=document.createElement('canvas'),gpu=new MinimapGPU(renderer,canvas);
        const releaseAnimation=holdAnimation(viewServices);
        try {
          const deadline=performance.now()+30000;
          while(!gpu.render(scene,fit,client.displayScale??0.35,client.maxInstances,scale)){
            if(performance.now()>deadline)throw Error('Minimap export preparation timed out.');
            await new Promise(resolve=>setTimeout(resolve,16));
          }
          const pixels=await exportPixels(renderer,gpu.colorTarget.texture,width,height);
          const output=document.createElement('canvas');output.width=width;output.height=height;
          output.getContext('2d').putImageData(new ImageData(pixels,width,height),0,0);
          return await new Promise((resolve,reject)=>output.toBlob(blob=>blob?resolve(blob):reject(Error('PNG encoding failed.'))));
        } finally {releaseAnimation();await renderer.backend.device.queue.onSubmittedWorkDone();gpu.dispose();}
      },
    });
    // A theme that changes only the background or text draws nothing new: redraw for the minimap.
    const stopTheme = ["background", "axisTextColor"].map((key) => options.child("plot").on(() => invalidate(), key));
    const releaseFrame = viewServices.drawing.overviewFrame.install(frame);
    const releaseDiagnostics = viewServices.diagnostics.overview.install(() => ({
      clients: source.clients.size,
      targets: [...source.clients].filter((c) => c.gpu).length * 2,
      draws,
      sourceId:source.id,
      frames:[...source.clients].map(c=>({generation:c.generation,sourceId:c.sourceId,error:c.error??'',width:c.width,height:c.height,ready:!!c.completedFrame})),
    }));
    return () => {
      for (const stop of stopTheme) stop?.();
      disconnect();
      releaseFrame();
      releaseDiagnostics();
    };
  });
</script>
