import { describe, expect, it } from "vitest";

import {
  ArenaCollision,
  PLAYER_RADIUS,
  STEP_UP,
} from "../../src/world/ArenaCollision";
import {
  ARENA_HALF_X,
  ARENA_HALF_Z,
  UPPER_FLOOR_Y,
  allSolids,
  stairsToSteps,
} from "../../src/world/ArenaLayout";
import { ARENA_LAYOUT } from "../../src/world/UpperFloorMap";

const world = new ArenaCollision();
const layout = ARENA_LAYOUT;
const F = UPPER_FLOOR_Y;

describe("Layout data", () => {
  it("is a 64 x 48 m rectangle centred on the origin", () => {
    expect(layout.width).toBe(64);
    expect(layout.depth).toBe(48);
    expect(ARENA_HALF_X).toBe(32);
    expect(ARENA_HALF_Z).toBe(24);
  });

  it("every solid sits inside the walls", () => {
    for (const solid of allSolids(layout)) {
      if (solid.kind === "cylinder") {
        expect(Math.abs(solid.x) + solid.radius, solid.id).toBeLessThanOrEqual(
          ARENA_HALF_X + 1e-9,
        );

        continue;
      }

      expect(solid.minX, solid.id).toBeGreaterThanOrEqual(-ARENA_HALF_X - 1e-9);
      expect(solid.maxX, solid.id).toBeLessThanOrEqual(ARENA_HALF_X + 1e-9);
      expect(solid.minZ, solid.id).toBeGreaterThanOrEqual(-ARENA_HALF_Z - 1e-9);
      expect(solid.maxZ, solid.id).toBeLessThanOrEqual(ARENA_HALF_Z + 1e-9);
    }
  });

  it("ids are unique", () => {
    for (const list of [
      layout.rooms,
      layout.ladders,
      layout.platforms,
      layout.walls,
      layout.overheads,
      layout.stairs,
    ]) {
      expect(new Set(list.map((item) => item.id)).size).toBe(list.length);
    }
  });

  it("nothing is left of the old free-for-all layout", () => {
    const ids = allSolids(layout).map((s) => s.id);

    for (const old of [
      "monolith",
      "north-walkway",
      "east-tower",
      "west-terrace",
      "column-nw",
    ]) {
      expect(ids).not.toContain(old);
    }

    expect(layout.ramps).toHaveLength(0);
    // The only cylinders are the tanks on the roofs.
    for (const pillar of layout.pillars) {
      expect(pillar.bottom ?? 0, pillar.id).toBeGreaterThanOrEqual(7);
    }
  });
});

describe("Ground and walls", () => {
  it("the central arena floor is at ground level", () => {
    expect(world.groundHeight(0, 0, 0)).toBe(0);
    expect(world.groundHeight(-10, 6, 0)).toBe(0);
  });

  it("the upper floor is 4 m up, the lower balcony 2.8 m", () => {
    expect(world.groundHeight(-27, -13.5, F)).toBe(F);
    expect(world.groundHeight(26, 0, F)).toBe(F);
    expect(world.groundHeight(0, 10.5, 2.8)).toBe(2.8);
  });

  it("the outer walls stop the player from leaving the map", () => {
    expect(world.isBlocked(ARENA_HALF_X - 0.2, 0, F, PLAYER_RADIUS)).toBe(true);
    expect(world.isBlocked(0, -ARENA_HALF_Z + 0.2, F, PLAYER_RADIUS)).toBe(
      true,
    );
    expect(world.isBlocked(ARENA_HALF_X - 0.6, -3.75, F, PLAYER_RADIUS)).toBe(
      false,
    );
  });

  it("moving into the outer wall at an angle slides along it", () => {
    const move = world.moveHorizontal(
      ARENA_HALF_X - PLAYER_RADIUS - 0.05,
      -3.5,
      0.2,
      -0.2,
      F,
    );

    expect(move.z).toBeLessThan(-3.6);
    expect(move.x).toBeLessThanOrEqual(ARENA_HALF_X - PLAYER_RADIUS + 1e-9);
  });

  it("a room wall blocks, and its doorway lets the player through", () => {
    // The archive's south wall (z = -16.3..-16) with its doorway at x = -8.
    expect(world.isBlocked(-4, -16.15, F, 0.1)).toBe(true);
    expect(world.isBlocked(-8, -16.15, F, PLAYER_RADIUS)).toBe(false);
    expect(world.isBlocked(-8, -15, F, PLAYER_RADIUS)).toBe(false);
    expect(world.isBlocked(-8, -19, F, PLAYER_RADIUS)).toBe(false);
  });

  it("every doorway is wide enough for the player on both sides", () => {
    for (const room of layout.rooms) {
      for (const door of room.doors) {
        expect(door.width, room.id).toBeGreaterThanOrEqual(
          PLAYER_RADIUS * 2 + 0.6,
        );

        const horizontal = door.side === "n" || door.side === "s";
        const edge =
          door.side === "n"
            ? room.minZ
            : door.side === "s"
              ? room.maxZ
              : door.side === "w"
                ? room.minX
                : room.maxX;
        const inward = door.side === "n" || door.side === "w" ? 1 : -1;

        const free = (offset: number): boolean => {
          const at = edge + inward * offset;
          const x = horizontal ? door.at : at;
          const z = horizontal ? at : door.at;

          return !world.isBlocked(x, z, room.floorY, PLAYER_RADIUS);
        };

        // In the doorway itself and a metre inside.
        expect(free(0), `${room.id} ${door.side} door`).toBe(true);
        expect(free(1), `${room.id} ${door.side} inside`).toBe(true);

        // Outside, somewhere in the first metre (a 1.5 m corridor is tighter than a yard).
        expect(
          [-1, -0.85, -0.75, -0.6].some(free),
          `${room.id} ${door.side} outside`,
        ).toBe(true);
      }
    }
  });

  it("railings are too tall to hop but low enough to see over", () => {
    const rail = layout.walls.find((w) => w.role === "railing")!;

    expect(rail.height - (rail.base ?? 0)).toBeGreaterThan(0.95);
    expect(rail.height - (rail.base ?? 0)).toBeLessThan(1.3);
  });
});

describe("Staircases", () => {
  it.each(layout.stairs.map((s) => [s.id, s] as const))(
    "%s: comfortable steps that reach the upper floor",
    (_id, stairs) => {
      expect(stairs.rise).toBeLessThanOrEqual(STEP_UP);
      expect(stairs.rise).toBeLessThanOrEqual(0.3);
      expect(stairs.tread).toBeGreaterThanOrEqual(0.55);
      expect(stairs.crossMax - stairs.crossMin).toBeGreaterThanOrEqual(4);

      const steps = stairsToSteps(stairs);

      expect(steps[steps.length - 1].height).toBeCloseTo(F, 9);
    },
  );

  it.each(layout.stairs.map((s) => [s.id, s] as const))(
    "%s: the top step meets a landing of the same height",
    (_id, stairs) => {
      const steps = stairsToSteps(stairs);
      const top = steps[steps.length - 1];
      const sign = stairs.direction.startsWith("+") ? 1 : -1;
      const x = (top.minX + top.maxX) / 2;
      const z = (top.minZ + top.maxZ) / 2;
      const beyondX = stairs.direction.endsWith("x") ? sign * 1.5 : 0;
      const beyondZ = stairs.direction.endsWith("z") ? sign * 1.5 : 0;

      expect(world.groundHeight(x + beyondX, z + beyondZ, F)).toBe(F);
    },
  );
});
