/** Preserve vertex sizing when deriving a picking material from a visible one.
 * Three's node-material copy methods omit PointsNodeMaterial.sizeNode and
 * SpriteNodeMaterial.sizeAttenuation. The latter also applies to points, which
 * inherit the sprite implementation, and only changes geometry in perspective.
 * A point pick pass can independently enable depth writes to preserve nearest-depth IDs.
 */
export function copyPickingMaterial(target, source, { depthWrite } = {}) {
  target.copy(source);
  if ('sizeAttenuation' in source)
    target.sizeAttenuation = source.sizeAttenuation;
  if (source.isPointsNodeMaterial) target.sizeNode = source.sizeNode;
  if (depthWrite !== undefined) target.depthWrite = depthWrite;
  return target;
}
