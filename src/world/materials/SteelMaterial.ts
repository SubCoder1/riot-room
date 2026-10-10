import * as THREE from "three";

import { METAL_TILE_METRES } from "./MetalTexture";
import { useWorldSpaceUv } from "./WorldSpaceUv";

/**
 * Exposed structural steel: dark blue-grey, mostly matte with a subtle metallic
 * response. No texture, no emissive. One material shared by every beam, column,
 * brace and truss.
 */
export function createIndustrialSteelMaterial(
  wear?: THREE.Texture,
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    name: "IndustrialSteel",
    color: 0x8793a8,
    map: wear ?? null,
    roughness: 0.74,
    metalness: 0.4,
  });

  if (wear) {
    useWorldSpaceUv(material, {
      tileMetres: METAL_TILE_METRES,
      macro: { frequency: 0.2, strength: 0.1 },
    });
  }

  return material;
}
