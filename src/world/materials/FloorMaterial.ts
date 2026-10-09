import * as THREE from "three";

import { CONCRETE_TILE_METRES, type ConcreteTextures } from "./ConcreteTexture";
import { useWorldSpaceUv } from "./WorldSpaceUv";

/**
 * Three related looks of the same dark industrial concrete. They share the
 * textures; only the tint, roughness and the turn of the pattern differ.
 */
export type FloorVariant = "dark" | "medium" | "worn";

interface FloorLook {
  name: string;
  /** Tint over the (mid-grey) texture: charcoal, never black, no emissive. */
  color: number;
  roughness: number;
  normalScale: number;
  /** Quarter turns of the pattern, so neighbouring variants do not line up. */
  rotation: number;
}

export const FLOOR_LOOKS: Record<FloorVariant, FloorLook> = {
  dark: {
    name: "FloorConcreteDark",
    color: 0x62666b,
    roughness: 0.92,
    normalScale: 0.55,
    rotation: 0,
  },
  medium: {
    name: "FloorConcreteMedium",
    color: 0x72767b,
    roughness: 0.88,
    normalScale: 0.6,
    rotation: Math.PI / 2,
  },
  worn: {
    name: "FloorConcreteWorn",
    color: 0x696b70,
    roughness: 0.82,
    normalScale: 0.85,
    rotation: Math.PI,
  },
};

/** One floor material: concrete, high roughness, no metalness, world-scaled texture. */
export function createFloorMaterial(
  variant: FloorVariant,
  textures: ConcreteTextures,
): THREE.MeshStandardMaterial {
  const look = FLOOR_LOOKS[variant];
  const material = new THREE.MeshStandardMaterial({
    name: look.name,
    color: look.color,
    map: textures.color,
    normalMap: textures.normal,
    normalScale: new THREE.Vector2(look.normalScale, look.normalScale),
    roughness: look.roughness,
    metalness: 0,
  });

  useWorldSpaceUv(material, {
    tileMetres: CONCRETE_TILE_METRES,
    rotation: look.rotation,
  });

  return material;
}
