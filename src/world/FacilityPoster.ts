import * as THREE from "three";

import { drawTacticalSheet } from "../ui/TacticalMap";
import type {
  ArenaLayout,
  DoorDefinition,
  PosterDefinition,
  RoomDefinition,
} from "./ArenaLayout";
import type { DoorPassage } from "./DoorPassage";

/**
 * The site plan on the spawn-area wall: the very map the M key opens, drawn by
 * the same code from the same layout (so the two can never disagree), printed
 * on a dark board. It is a physical poster on a wall, not a map UI.
 */

/** The sheet is drawn at this size (the M-key map's) and fits the 4:3 poster. */
const SHEET_W = 1200;
const SHEET_H = 900;

/** Draws the plan; null if there is no canvas to draw on (tests, no DOM). */
export function createFacilityPosterTexture(
  layout: ArenaLayout,
  _poster: PosterDefinition,
  passage?: (room: RoomDefinition, door: DoorDefinition) => DoorPassage,
): THREE.CanvasTexture | null {
  if (typeof document === "undefined") {
    return null;
  }

  const canvas = document.createElement("canvas");

  canvas.width = SHEET_W;
  canvas.height = SHEET_H;

  let ctx: CanvasRenderingContext2D | null;

  try {
    ctx = canvas.getContext("2d");
  } catch {
    return null;
  }

  if (!ctx) {
    return null;
  }

  // The board behind the plan (the map itself is drawn see-through).
  ctx.fillStyle = "#0a0c0f";
  ctx.fillRect(0, 0, SHEET_W, SHEET_H);
  // "You are here": the middle of the room's spawn points (the plan hangs
  // in the spawn room, its stairs beside it).
  const points = layout.spawnPoints;
  const here =
    points.length > 0
      ? {
          x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
          z: points.reduce((sum, p) => sum + p.z, 0) / points.length,
        }
      : undefined;

  drawTacticalSheet(ctx, layout, passage, here);

  const texture = new THREE.CanvasTexture(canvas);

  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;

  return texture;
}

/** The poster as a plane on its wall, or null without a canvas. */
export function createFacilityPoster(
  layout: ArenaLayout,
  poster: PosterDefinition,
  passage?: (room: RoomDefinition, door: DoorDefinition) => DoorPassage,
): THREE.Mesh | null {
  const texture = createFacilityPosterTexture(layout, poster, passage);

  if (!texture) {
    return null;
  }

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(poster.width, poster.height),
    new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.92,
      metalness: 0,
      // A little brightness of its own so it still reads in the dark.
      emissive: new THREE.Color(0xffffff),
      emissiveMap: texture,
      emissiveIntensity: 0.22,
    }),
  );

  mesh.name = poster.id;
  mesh.position.set(poster.x, poster.y, poster.z);
  mesh.rotation.y = Math.atan2(poster.nx, poster.nz);
  mesh.receiveShadow = true;

  return mesh;
}
