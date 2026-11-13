// Tile geometry supplies complete positions and normals through its nodes. Three's stock
// mesh/point materials also bind an identity instance matrix; unlike our line material, they
// do not read `instanceTransform`. Omit that unused binding explicitly, including in clones
// used for picking. The renderer still draws object.count instances.
import { MeshStandardNodeMaterial, PointsNodeMaterial } from "three/webgpu";
import { positionLocal, subBuild } from "three/tsl";

function tilePosition(material) {
  if (material.positionNode !== null)
    positionLocal.assign(subBuild(material.positionNode, "POSITION", "vec3"));
  return positionLocal;
}

export class TileMeshNodeMaterial extends MeshStandardNodeMaterial {
  constructor(parameters) {
    super(parameters);
    this.instanceTransform = false;
  }
  setupPosition() { return tilePosition(this); }
}

export class TilePointsNodeMaterial extends PointsNodeMaterial {
  constructor(parameters) {
    super(parameters);
    this.instanceTransform = false;
  }
  setupPosition() { return tilePosition(this); }
}
