import * as THREE from "three";

import { CEILING_TILE_METRES, type CeilingTextures } from "./CeilingTexture";
import { useWorldSpaceUv } from "./WorldSpaceUv";

/**
 * Dark engraved concrete for ceilings and roofs. Matte, no metalness. A ceiling
 * is lit only by the dim ground bounce, so on its own it would read black: a
 * very faint self-lit term (the texture itself, at a fraction) keeps the
 * engraved stripes readable in the dark without making it glow.
 */
export function createCeilingMaterial(
  textures: CeilingTextures,
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    name: "CeilingConcrete",
    color: 0xffffff,
    map: textures.color,
    normalMap: textures.normal,
    normalScale: new THREE.Vector2(1, 1),
    roughnessMap: textures.roughness,
    roughness: 1,
    metalness: 0,
    emissive: new THREE.Color(0x6d737d),
    emissiveMap: textures.color,
  });

  useWorldSpaceUv(material, {
    tileMetres: CEILING_TILE_METRES,
    macro: { frequency: 0.16, strength: 0.12 },
  });

  return material;
}
