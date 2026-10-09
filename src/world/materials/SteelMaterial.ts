import * as THREE from "three";

/**
 * Exposed structural steel: dark blue-grey, mostly matte with a subtle metallic
 * response. No texture, no emissive. One material shared by every beam, column,
 * brace and truss.
 */
export function createIndustrialSteelMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    name: "IndustrialSteel",
    color: 0x8793a8,
    roughness: 0.74,
    metalness: 0.4,
  });
}
