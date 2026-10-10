import * as THREE from "three";

import { type PaintedConcreteTextures } from "./PaintedConcreteTexture";
import { useWorldSpaceUv } from "./WorldSpaceUv";

/** Three closely related looks of the same dark painted concrete. */
export type PaintedVariant = "dark" | "standard" | "worn";

interface PaintedLook {
  name: string;
  /** Tint over the (light grey) texture: dark charcoal with a cool blue-grey cast. */
  color: number;
  normalScale: number;
  /** Shifts the pattern so neighbours of different looks do not line up (metres). */
  offset: [number, number];
}

export const PAINTED_LOOKS: Record<PaintedVariant, PaintedLook> = {
  dark: {
    name: "PaintedConcreteDark",
    color: 0x535b6b,
    normalScale: 0.5,
    offset: [0, 0],
  },
  standard: {
    name: "PaintedConcrete",
    color: 0x636c7c,
    normalScale: 0.55,
    offset: [1.7, 2.3],
  },
  worn: {
    name: "PaintedConcreteWorn",
    color: 0x5c6474,
    normalScale: 0.75,
    offset: [3.1, 0.9],
  },
};

/**
 * One painted-concrete material: matte (roughness from the map, 0.82 to 0.93),
 * no metalness, no emissive, texture scaled in world metres.
 */
export function createPaintedConcreteMaterial(
  variant: PaintedVariant,
  textures: PaintedConcreteTextures,
): THREE.MeshStandardMaterial {
  const look = PAINTED_LOOKS[variant];
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
    tileMetres: textures.tileMetres,
    offset: look.offset,
    // Patchy fading, and grime gathered low on every wall.
    macro: { frequency: 0.17, strength: 0.17, baseDirt: 0.24 },
  });

  return material;
}
