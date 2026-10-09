import * as THREE from "three";

/**
 * Reinforced industrial glass: a faint cool tint you can see through, never a
 * bright blue slab. Transparent without writing depth, so panes sort against
 * each other and the beams behind them without flicker. No emissive, no
 * reflection or refraction.
 */
export function createIndustrialGlassMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    name: "IndustrialGlass",
    color: 0x5f7886,
    roughness: 0.2,
    metalness: 0,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
}
