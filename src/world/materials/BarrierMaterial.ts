import * as THREE from "three";

import type { PaintedConcreteTextures } from "./PaintedConcreteTexture";
import { useWorldSpaceUv } from "./WorldSpaceUv";

/**
 * The concrete of low barriers, railings and cover: a lighter, drier, more
 * chipped concrete than the painted walls, in three closely related looks that
 * differ in tint, in which texture set they use and where the pattern sits.
 * Matte, no metalness, no emissive; the texture is placed in world metres.
 */
const LOOKS: Array<{
  name: string;
  color: number;
  normalScale: number;
  offset: [number, number];
  rotation: number;
}> = [
  {
    name: "BarrierConcreteA",
    color: 0x8d939e,
    normalScale: 0.7,
    offset: [0.4, 1.9],
    rotation: 0,
  },
  {
    name: "BarrierConcreteB",
    color: 0x7f8691,
    normalScale: 0.85,
    offset: [2.6, 0.3],
    rotation: Math.PI / 2,
  },
  {
    name: "BarrierConcreteC",
    color: 0x969ba3,
    normalScale: 0.6,
    offset: [1.2, 3.4],
    rotation: Math.PI,
  },
];

export function createBarrierMaterial(
  index: number,
  textures: PaintedConcreteTextures,
): THREE.MeshStandardMaterial {
  const look = LOOKS[index % LOOKS.length];
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
    rotation: look.rotation,
    macro: { frequency: 0.24, strength: 0.18, baseDirt: 0.28 },
  });

  return material;
}
