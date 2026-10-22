import { describe, expect, it } from "vitest";

import { ArenaCollision } from "../../src/world/ArenaCollision";
import { ARENA_LAYOUT } from "../../src/world/UpperFloorMap";

const world = new ArenaCollision();
const F = 4;

describe("Shot blocks for drawn-only props", () => {
  it("a line through a barracks seat is stopped, a line over it is not", () => {
    // Along x through seat 1 (x -25.5, z -10.3).
    expect(
      world.segmentBlocked(-26.2, F + 0.3, -11.1, -24.8, F + 0.3, -11.1),
    ).toBe(true);
    expect(
      world.segmentBlocked(-26.2, F + 1.4, -11.1, -24.8, F + 1.4, -11.1),
    ).toBe(false);
  });

  it("they never stop a body: the same seat can be walked through", () => {
    expect(world.isBlocked(-25.5, -11.1, F, 0.3)).toBe(false);
  });

  it("every block stands on the first floor and is inside the map", () => {
    for (const b of ARENA_LAYOUT.shotSolids ?? []) {
      expect(b.bottom, b.id).toBe(F);
      expect(b.height, b.id).toBeGreaterThan(F);
      expect(Math.abs(b.minX), b.id).toBeLessThan(32);
      expect(Math.abs(b.minZ), b.id).toBeLessThan(24);
    }
  });
});

describe("Archive shelves you can stand on", () => {
  it("none is tall enough to put a standing player's head into the 3.8 m ceiling", () => {
    for (const w of ARENA_LAYOUT.walls.filter((s) =>
      s.id.startsWith("shelf-archive"),
    )) {
      // Feet on the top, 1.8 m of body, the ceiling 3.8 m over the floor.
      expect(w.height + 1.8, w.id).toBeLessThanOrEqual(F + 3.8 + 1e-6);
    }
  });
});

describe("Stair handrails", () => {
  it("are solid on the open edge: walking off the side of a flight is stopped", () => {
    for (const id of ["stairs-spawn-nw", "stairs-spawn-ne"]) {
      const stairs = ARENA_LAYOUT.stairs.find((s) => s.id === id)!;
      const step = 6;
      const sign = stairs.direction.startsWith("+") ? 1 : -1;
      const x = stairs.start + sign * (stairs.tread * (step + 0.5));
      const feet = stairs.rise * (step + 1);
      let at = { x, z: stairs.crossMin + 0.6 };

      // Walk off the open side in frame-sized steps.
      for (let k = 0; k < 14; k++) {
        at = world.moveHorizontal(at.x, at.z, 0, -0.1, feet);
      }

      const moved = at;

      expect(moved.z, id).toBeGreaterThan(stairs.crossMin);
    }
  });
});

describe("Archive shelves can be vaulted", () => {
  it("each is low enough to vault (1.45 m at most) from the aisle in front of it", () => {
    for (const id of [
      "shelf-archive-1",
      "shelf-archive-2",
      "shelf-archive-3",
      "shelf-archive-4",
    ]) {
      const s = ARENA_LAYOUT.walls.find((w) => w.id === id)!;

      expect(s.height - F, id).toBeLessThanOrEqual(1.45);
    }
  });
});

describe("Archive: nobody is thrown out through its walls", () => {
  it("random walking and jumping never leaves the room except by a door", async () => {
    const { spawnPlayer, rng } = await import("./playerHarness");
    const room = ARENA_LAYOUT.rooms.find((r) => r.id === "room-archive")!;
    const throughDoor = (x: number, z: number): boolean =>
      room.doors.some((d) => {
        const along = d.side === "n" || d.side === "s" ? x : z;

        return Math.abs(along - d.at) < d.width / 2 + 0.5;
      });
    const random = rng(23);
    const bad: string[] = [];

    for (let i = 0; i < 350; i++) {
      const x = room.minX + 0.6 + random() * (room.maxX - room.minX - 1.2);
      const z = room.minZ + 0.6 + random() * (room.maxZ - room.minZ - 1.2);

      if (world.isBlocked(x, z, F, 0.5)) continue;

      const p = spawnPlayer(x, F, z, random() * Math.PI * 2);
      let last = [x, z];

      for (let k = 0; k < 24 && bad.length < 5; k++) {
        p.input.yaw = random() * 6.28;
        p.input.keys.clear();
        p.input.keys.add("KeyW");
        p.input.jumpQueued = random() < 0.8;
        p.step(0.25, () => {
          const px = p.player.position.x;
          const pz = p.player.position.z;
          const outside =
            px < room.minX ||
            px > room.maxX ||
            pz < room.minZ ||
            pz > room.maxZ;

          if (outside && !throughDoor(last[0], last[1])) {
            bad.push(
              `${x.toFixed(1)},${z.toFixed(1)} last ${last.map((v) => v.toFixed(2))} now ${px.toFixed(2)},${pz.toFixed(2)}`,
            );
          }

          if (!outside) last = [px, pz];
        });
      }
    }

    expect(bad).toEqual([]);
  }, 60000);
});
