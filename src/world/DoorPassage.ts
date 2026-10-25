import type { ArenaCollision } from "./ArenaCollision";
import {
  WALL_THICKNESS,
  type DoorDefinition,
  type RoomDefinition,
} from "./ArenaLayout";

/**
 * Whether a body can go through a room's doorway: straight through ("open"), only
 * crouched ("crouch": the Archive's low hole in its west wall), or not at all
 * ("sealed": a closed shutter, or stock stacked across the opening). Worked out
 * from the real collision at the opening, so the tactical map and the tests
 * both say what the level actually does.
 */
export type DoorPassage = "open" | "crouch" | "sealed";

const RADIUS = 0.35;
/** A standing body's headroom, and a crouching one's (see the Archive's lintel). */
const STANDING = 1.8;
const CROUCHING = 1.0;

/** The middle of a doorway's opening in its wall. */
export function doorOpening(
  room: RoomDefinition,
  door: DoorDefinition,
): { x: number; z: number; outX: number; outZ: number } {
  const mid = WALL_THICKNESS / 2;

  switch (door.side) {
    case "n":
      return { x: door.at, z: room.minZ + mid, outX: 0, outZ: -1 };
    case "s":
      return { x: door.at, z: room.maxZ - mid, outX: 0, outZ: 1 };
    case "w":
      return { x: room.minX + mid, z: door.at, outX: -1, outZ: 0 };
    default:
      return { x: room.maxX - mid, z: door.at, outX: 1, outZ: 0 };
  }
}

export function doorPassage(
  world: ArenaCollision,
  room: RoomDefinition,
  door: DoorDefinition,
): DoorPassage {
  const { x, z } = doorOpening(room, door);

  if (!world.isBlocked(x, z, room.floorY, RADIUS, STANDING)) {
    return "open";
  }

  return world.isBlocked(x, z, room.floorY, RADIUS, CROUCHING)
    ? "sealed"
    : "crouch";
}
