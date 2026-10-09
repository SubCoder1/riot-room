/**
 * Which wall pieces are old brick. Brick is an accent: the main arena shell,
 * the modern rooms (control, server, switch, cargo, break, archive, hall,
 * armory) and most walls stay as they are. Matched by the start of a wall's id.
 */
const BRICK_WALL_PREFIXES: readonly string[] = [
  // Old industrial rooms.
  "room-warehouse-",
  "room-workshop-",
  "room-store-",
  "room-barracks-",
  // Their rooftop walls and parapets, and the back-of-building nook.
  "roofwall-workshop",
  "roofwall-store",
  "roofwall-barracks",
  "parapet-warehouse",
  "nook-west",
];

/** Outer walls of the building that are old brick (the west back wall). */
const BRICK_OUTER_WALLS: readonly string[] = ["west"];

export function isBrickWall(id: string): boolean {
  return BRICK_WALL_PREFIXES.some((prefix) => id.startsWith(prefix));
}

export function isBrickOuterWall(side: string): boolean {
  return BRICK_OUTER_WALLS.includes(side);
}
