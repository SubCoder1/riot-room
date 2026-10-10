import * as THREE from "three";

import { BRICK_TILE_METRES, type BrickTextures } from "./BrickTexture";
import { useWorldSpaceUv } from "./WorldSpaceUv";

/** Two related looks of the same old brick; they share the textures. */
export type BrickVariant = "dark" | "worn";

interface BrickLook {
  name: string;
  /** Tint over the brick texture (the lighting does the rest; no emissive). */
  color: number;
  normalScale: number;
  /** Shifts the pattern so two walls of different looks do not line up (metres). */
  offset: [number, number];
}

export const BRICK_LOOKS: Record<BrickVariant, BrickLook> = {
  dark: {
    name: "BrickDark",
    color: 0xffffff,
    normalScale: 0.8,
    offset: [0, 0],
  },
  worn: {
    name: "BrickWorn",
    color: 0xcfc4c0,
    normalScale: 1,
    offset: [0.75, 0.5],
  },
};

/**
 * One brick material: dark desaturated brick, high roughness (from the map,
 * 0.80 to 0.95), no metalness, texture scaled in world metres.
 */
export function createBrickMaterial(
  variant: BrickVariant,
  textures: BrickTextures,
): THREE.MeshStandardMaterial {
  const look = BRICK_LOOKS[variant];
  const material = new THREE.MeshStandardMaterial({
    name: look.name,
    color: look.color,
    map: textures.color,
    normalMap: textures.normal,
    normalScale: new THREE.Vector2(look.normalScale, look.normalScale),
    roughnessMap: textures.roughness,
    roughness: 1,
    metalness: 0,
  });

  useWorldSpaceUv(material, {
    tileMetres: BRICK_TILE_METRES,
    offset: look.offset,
    macro: { frequency: 0.21, strength: 0.2, baseDirt: 0.3 },
  });

  return material;
}
