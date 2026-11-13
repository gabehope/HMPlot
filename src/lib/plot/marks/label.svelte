<script lang="ts">
  import { coordinateView } from "../utils/viewContext.js";
  import { markComponent } from "../utils/markComponent.svelte.js";
  import { trackPreparation } from '../rendering/viewSettlement.js';
  import { useViewServices } from "../utils/viewServices.js";
  import { registryFor } from "../utils/guides.js";
  import { spherical, angularFactor, longitudeOrigin } from "../utils/coordinates.js";
  import { coordinatePoint } from "../utils/coordinateNodes.js";
  import { collapsed } from "../utils/mappedValidity.js";
  import {
    uniform,
    int,
    vec4,
    positionLocal,
    cameraViewMatrix,
    cameraProjectionMatrix,
    cameraWorldMatrix,
    viewportResolution,
  } from "three/tsl";
  import { T, useTask, useThrelte } from "@threlte/core";
  import { untrack } from "svelte";
  import { Mesh, MeshBasicNodeMaterial, DoubleSide, Vector3, BufferGeometry, Float32BufferAttribute } from "three/webgpu";
  import { ensureScatter2DOptions } from "../objects/defaultOptions.js";
  import {
    ScalarType,
    SelectType,
    BooleanType,
    ColorType,
  } from "../objects/types.js";
  import { fontChoices } from "../utils/fonts.js";
  import { labelGeometry } from "../utils/labels.js";
  import { framePoint } from "../utils/framePlacement.js";
  import type { MarkProps } from "../publicTypes.js";
  let {
    text = "",
    tex = false,
    position = [0, 0, 0],
    name = undefined,
    options = undefined,
    ...others
  }: MarkProps & Record<string, any> = $props();
  const { camera, invalidate } = useThrelte();
  const viewServices = useViewServices();
  let revision = $state(0),
    geometryReady = $state(false),
    version = 0,
    lease,
    unguide,
    unsubscribe = () => {};
  const component = markComponent(untrack(() => (tex ? "TeX" : "Text3D")), {
    name: () => name,
    setup: (parent) => {
      ensureScatter2DOptions(parent);
      parent.ensure(
        "fontSize",
        new ScalarType({ defaultValue: 3, min: 0.1, max: 30 }),
      );
      parent.ensure(
        "align",
        new SelectType({
          defaultValue: "center",
          options: ["left", "center", "right"],
        }),
      );
      parent.ensure(
        "font",
        new SelectType({
          defaultValue: "helvetiker",
          options: fontChoices,
        }),
      );
      parent.ensure("billboard", new BooleanType({ defaultValue: false }));
      parent.ensure("labelColor", new ColorType({ defaultValue: "#30374a" }));
    },
    // A plain mesh, placed on the CPU (framePoint); cleanup releases its parts.
    create: (local) => {
      const mesh = Object.assign(new Mesh(
        new BufferGeometry().setAttribute("position", new Float32BufferAttribute([], 3)),
        new MeshBasicNodeMaterial({ side: DoubleSide }),
      ), { options: local, longitudeShift: uniform(0) });
      mesh.visible = false;
      unguide = registryFor(local)?.register(Object.assign(mesh, { isGuideText: true }));
      unsubscribe = local.on(() => revision++);
      return mesh;
    },
    display: () =>
      options ?? [
        ...(tex ? [] : ["font"]),
        "fontSize",
        "labelColor",
        "align",
        "billboard",
        "opacity",
        "xTransform",
        "xbounds",
        "xrange",
        "yTransform",
        "ybounds",
        "yrange",
        "zTransform",
        "zbounds",
        "zrange",
        "xTransformConstant",
        "yTransformConstant",
        "zTransformConstant",
      ],
    populate: () => ({
      ...others,
      ...(others.size === undefined ? {} : { fontSize: others.size }),
      ...(others.color === undefined ? {} : { labelColor: others.color }),
    }),
    handlers: () => others,
    cleanup: () => {
      unguide?.();
      version++;
      unsubscribe();
      lease?.release();
      if (!lease) mesh.geometry.dispose();
      mesh.material.dispose();
    },
  });
  const { mark: mesh, local } = component;
  const visible = $derived.by(() => {
    revision;
    return geometryReady && !!text && local.get("visible") !== false;
  });
  export const getLegendSource = () => (mesh as any).guideHandle;
  export const getMark = () => mesh;
  // A spherical label's point and size are uniforms. Its graph depends only on the options
  // coordinatePoint reads and on billboard, so any other option change compiles nothing.
  const sphericalPoint = uniform(new Vector3()),
    sphericalSize = uniform(1);
  let sphericalGraph = null;
  $effect(() => {
    revision;
    const id = ++version;
    const size = local.get("fontSize");
    if (spherical(local)) {
      mesh.position.set(0, 0, 0);
      mesh.scale.setScalar(1);
      sphericalPoint.value.set(position[0] ?? 0, position[1] ?? 0, position[2] ?? 0);
      sphericalSize.value = size * Number(local.get("displayScale") ?? 1);
      const graph = JSON.stringify([local.get("billboard"), coordinateView(local), local.get("sphericalView"),
        local.get("projection"), angularFactor(local), longitudeOrigin(local)]);
      if (graph !== sphericalGraph) {
        sphericalGraph = graph;
        // A point the projection cannot map (behind the horizon) draws nothing (TODO 136.11).
        const { position: point, valid } = coordinatePoint(mesh, sphericalPoint),
          scale = cameraProjectionMatrix
            .mul(cameraViewMatrix.mul(vec4(point, 1)))
            .w.abs()
            .mul(2)
            .div(
              vec4(cameraProjectionMatrix.element(int(1))).y.abs().mul(viewportResolution.y),
            )
            .mul(sphericalSize);
        const offset = positionLocal.mul(scale);
        mesh.material.positionNode = collapsed(valid, point.add(
          local.get("billboard")
            ? cameraWorldMatrix.mul(vec4(offset, 0)).xyz
            : offset,
        ));
        mesh.material.needsUpdate = true;
      }
    } else {
      sphericalGraph = null;
      mesh.material.positionNode = null;
      // Compose the full frame chain (nonlinear parents included). The effect re-runs when
      // the chain's options change, so a pixel-anchored frame's text follows its camera.
      mesh.position.fromArray(framePoint(local, position));
      mesh.scale.setScalar(size * Number(local.get("displayScale") ?? 1));
    }
    mesh.userData.overviewScale = true;
    mesh.material.color.set(local.get("labelColor"));
    mesh.material.opacity = local.get("opacity");
    mesh.material.transparent = mesh.material.opacity < 1;
    trackPreparation(viewServices, labelGeometry(String(text), tex, local.get("align"), local.get("font"))
      .then((next) => {
        if (id !== version) {
          next.release();
          return;
        }
        const previous = lease;
        lease = next;
        const old = mesh.geometry;
        mesh.geometry = next.geometry;
        // Font geometry arrives after scene preparation. Rebuild a material that
        // may have been compiled against the empty initial geometry.
        if (old !== next.geometry) mesh.material.needsUpdate = true;
        if (previous) previous.release();
        else old.dispose();
        geometryReady = Boolean(next.geometry.attributes.position?.count);
        component.report();
        invalidate();
      })
      .catch((error) => {
        if (id === version) {
          geometryReady = false;
          invalidate();
          component.report(error);
        }
      }));
  });
  // The camera turns only in frames that draw anyway: following it asks for none (by default a
  // task does, and a label at rest drew 60 frames a second).
  useTask(
    () => {
      if (local.get("billboard") && !spherical(local))
        mesh.quaternion.copy(camera.current.quaternion);
      else mesh.quaternion.identity();
    },
    { autoInvalidate: false },
  );
</script>

{#if geometryReady}<T is={mesh} {visible} {...component.events} />{/if}
