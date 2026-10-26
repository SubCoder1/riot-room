import { describe, expect, it } from "vitest";

import { ArenaCollision } from "../../src/world/ArenaCollision";
import { WALL_THICKNESS } from "../../src/world/ArenaLayout";
import { doorOpening, doorPassage } from "../../src/world/DoorPassage";
import { ARENA_LAYOUT as layout } from "../../src/world/UpperFloorMap";

const world = new ArenaCollision();

/**
 * The doorways that are not plain open passages, on purpose: a low crawl hole
 * in the Archive's west wall, a closed roll-up shutter in the Storage room's
 * north wall, and stock stacked across the Hall's wide east opening.
 */
const NOT_OPEN: Record<string, "crouch" | "sealed"> = {
  "room-archive:w:-17.1": "crouch",
  "room-workshop:n:1": "sealed",
  "room-hall:e:19.5": "sealed",
  // The vault entrance, collapsed.
  "room-server:w:-14.3": "sealed",
};

const doors = layout.rooms.flatMap((room) =>
  room.doors.map((door, index) => ({ room, door, index })),
);

describe("Every doorway is fitted properly into its wall", () => {
  it("has doors", () => {
    expect(doors.length).toBeGreaterThan(10);
  });

  it.each(
    doors.map((d) => [`${d.room.id} #${d.index + 1} (${d.door.side})`, d]),
  )(
    "%s: fits within its wall, clear of any other door and the corners",
    (_name, { room, door }) => {
      const alongX = door.side === "n" || door.side === "s";
      const from = alongX ? room.minX : room.minZ;
      const to = alongX ? room.maxX : room.maxZ;
      const half = door.width / 2;

      // Room for a jamb at each end: not in a corner of the room.
      expect(door.at - half).toBeGreaterThanOrEqual(from + WALL_THICKNESS);
      expect(door.at + half).toBeLessThanOrEqual(to - WALL_THICKNESS);
      // Wide enough for a body, not wider than a double door.
      expect(door.width).toBeGreaterThanOrEqual(1.2);
      expect(door.width).toBeLessThanOrEqual(5);

      for (const other of room.doors) {
        if (other !== door && other.side === door.side) {
          expect(Math.abs(other.at - door.at)).toBeGreaterThanOrEqual(
            (other.width + door.width) / 2 + 0.4,
          );
        }
      }
    },
  );

  it.each(
    doors.map((d) => [`${d.room.id} #${d.index + 1} (${d.door.side})`, d]),
  )(
    "%s: is open, or is one of the few deliberate exceptions",
    (_name, { room, door }) => {
      const key = `${room.id}:${door.side}:${door.at}`;

      expect(doorPassage(world, room, door)).toBe(NOT_OPEN[key] ?? "open");
    },
  );

  it("is walkable on both sides of every doorway that can be passed", () => {
    for (const { room, door } of doors) {
      if (doorPassage(world, room, door) === "sealed") {
        continue;
      }

      const o = doorOpening(room, door);

      for (const reach of [0.8, -0.8]) {
        const x = o.x + o.outX * reach;
        const z = o.z + o.outZ * reach;

        expect(
          world.isBlocked(x, z, room.floorY, 0.35, 1.0),
          `${room.id} ${door.side}: blocked ${reach} m from the opening at ${x.toFixed(2)}, ${z.toFixed(2)}`,
        ).toBe(false);
      }
    }
  });
});
