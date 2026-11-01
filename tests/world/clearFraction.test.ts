import { describe, expect, it } from "vitest";

import { ArenaCollision } from "../../src/world/ArenaCollision";
import { ARENA_LAYOUT } from "../../src/world/UpperFloorMap";

describe("segmentClearFraction", () => {
  it("changes smoothly as a line is swung across a wall (not in tenth-of-a-metre steps)", () => {
    const world = new ArenaCollision(ARENA_LAYOUT);
    // The Armory's west wall, seen from inside: a hand reaching at it.
    const wall = ARENA_LAYOUT.walls.find(
      (w) => w.id === "room-armory-wall-w-1",
    )!;
    const x = wall.maxX + 0.5;
    const z = (wall.minZ + wall.maxZ) / 2;
    let last: number | null = null;
    let worst = 0;

    for (let a = -0.6; a <= 0.6; a += 0.005) {
      // From the eye, a reach of 0.8 m turning a little each step.
      const f = world.segmentClearFraction(
        x,
        wall.bottom + 1.5,
        z,
        x - 0.8 * Math.cos(a),
        wall.bottom + 1.5,
        z + 0.8 * Math.sin(a),
      );

      if (last !== null) {
        worst = Math.max(worst, Math.abs(f - last));
      }

      last = f;
    }

    expect(worst).toBeLessThan(0.03);
  });
});
