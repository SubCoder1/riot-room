/**
 * Which wall pieces are old brick. Brick is an accent: the main arena shell,
 * the modern rooms (control, server, switch, cargo, break, archive, hall,
 * armory) and most walls stay as they are. Matched by the start of a wall's id.
 */
const BRICK_WALL_PREFIXES: readonly string[] = [
  // Old industrial rooms.
  "room-warehouse-",
  "room-workshop-",
  "room-yard-",
  "room-barracks-",
  // Their rooftop walls and parapets, and the back-of-building nook.
  "roofwall-workshop",
  "roofwall-store", // (the yard's roof edge)
  "roofwall-barracks",
  "parapet-warehouse",
  "nook-west",
];

/** Outer walls of the building that are old brick (the west back wall). */
const BRICK_OUTER_WALLS: readonly string[] = ["west"];

export function isBrickWall(id: string): boolean {
  return BRICK_WALL_PREFIXES.some((prefix) => id.startsWith(prefix));
}

/**
 * The brick finish a wall shares with the rest of its room: every wall piece
 * of one room (its pieces on either side of a door, its sides, the slices of
 * a broken one) is the same brick, so a corner never changes look. Anything
 * that is not a room's wall stands alone.
 */
export function brickGroup(id: string): string {
  const room = /^(room-[a-z0-9]+)-wall-/.exec(id);

  if (!room) {
    return id.split("~")[0];
  }

  return SHARED_BRICK[room[1]] ?? room[1];
}

/**
 * Brick rooms that stand side by side, share a wall and run on into each
 * other (the Workshop's east wall and south line are the Warehouse's): they
 * are one block of building, so they share one brick finish.
 */
const SHARED_BRICK: Readonly<Record<string, string>> = {
  "room-warehouse": "room-workshop",
};

export function isBrickOuterWall(side: string): boolean {
  return BRICK_OUTER_WALLS.includes(side);
}
