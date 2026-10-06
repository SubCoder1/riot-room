import { describe, expect, it } from "vitest";

import {
  PLAYER_RADIUS,
  STEP_UP,
  ArenaCollision,
} from "../../src/world/ArenaCollision";
import {
  ARENA_HALF,
  ARENA_LAYOUT,
  allSolids,
  stairsToSteps,
} from "../../src/world/ArenaLayout";

const world = new ArenaCollision();

/** Walks a character along a straight line in small steps, like the game loop. */
function walk(
  from: { x: number; z: number },
  to: { x: number; z: number },
  feetStart = 0,
  speed = 8.5,
): { x: number; z: number; feet: number } {
  let { x, z } = from;
  let feet = feetStart;
  const dt = 1 / 60;
  const total = Math.hypot(to.x - from.x, to.z - from.z);
  const ux = (to.x - from.x) / total;
  const uz = (to.z - from.z) / total;

  for (let travelled = 0; travelled < total; travelled += speed * dt) {
    const move = world.moveHorizontal(
      x,
      z,
      ux * speed * dt,
      uz * speed * dt,
      feet,
    );

    x = move.x;
    z = move.z;
    feet = world.groundHeight(x, z, feet);
  }

  return { x, z, feet };
}

describe("Arena layout", () => {
  it("is about 40 m x 40 m", () => {
    expect(ARENA_LAYOUT.size).toBe(40);
    expect(ARENA_HALF).toBe(20);
  });

  it("has one 10x10 central platform at 1.5-2 m", () => {
    const centre = ARENA_LAYOUT.platforms.find(
      (p) => p.id === "center-platform",
    );

    expect(centre).toBeDefined();
    expect(centre!.maxX - centre!.minX).toBe(10);
    expect(centre!.maxZ - centre!.minZ).toBe(10);
    expect(centre!.height).toBeGreaterThanOrEqual(1.5);
    expect(centre!.height).toBeLessThanOrEqual(2);
  });

  it("has two ~8x8 side platforms on different sides", () => {
    const sides = ARENA_LAYOUT.platforms.filter(
      (p) => p.id !== "center-platform",
    );

    expect(sides).toHaveLength(2);

    for (const side of sides) {
      expect(side.maxX - side.minX).toBe(8);
      expect(side.maxZ - side.minZ).toBe(8);
    }

    expect(Math.sign(sides[0].minX)).not.toBe(Math.sign(sides[1].minX));
  });

  it("every solid stays inside the arena", () => {
    for (const solid of allSolids()) {
      if (solid.kind === "cylinder") {
        expect(Math.abs(solid.x) + solid.radius).toBeLessThan(ARENA_HALF);
        expect(Math.abs(solid.z) + solid.radius).toBeLessThan(ARENA_HALF);
      } else {
        for (const edge of [solid.minX, solid.maxX, solid.minZ, solid.maxZ]) {
          expect(Math.abs(edge)).toBeLessThan(ARENA_HALF);
        }
      }
    }
  });

  it("stairs rise in steps a character can walk up", () => {
    for (const stairs of ARENA_LAYOUT.stairs) {
      expect(stairs.rise).toBeLessThanOrEqual(STEP_UP);
      expect(stairsToSteps(stairs)).toHaveLength(stairs.steps);
    }
  });

  it("the centre of the arena floor is open", () => {
    // Between the platforms and cover: lots of free floor for melee.
    expect(world.clearanceAt(-9, 9)).toBeGreaterThan(2);
    expect(world.clearanceAt(9, 9)).toBeGreaterThan(1.5);
  });
});

describe("Arena collision", () => {
  it("the floor is solid", () => {
    expect(world.groundHeight(-17, -16, 0)).toBe(0);
    expect(world.groundHeight(3, 17, 0)).toBe(0);
  });

  it("the outer walls keep players inside", () => {
    for (const [dx, dz] of [
      [50, 0],
      [-50, 0],
      [0, 50],
      [0, -50],
    ]) {
      const end = walk({ x: -9, z: 8 }, { x: -9 + dx * 0.9, z: 8 + dz * 0.4 });

      expect(Math.abs(end.x)).toBeLessThanOrEqual(
        ARENA_HALF - PLAYER_RADIUS + 1e-9,
      );
      expect(Math.abs(end.z)).toBeLessThanOrEqual(
        ARENA_HALF - PLAYER_RADIUS + 1e-9,
      );
    }
  });

  it("a solid platform cannot be walked into from the floor", () => {
    // East platform (1.5 m) from the open floor to its north.
    const end = walk({ x: 14, z: -16 }, { x: 14, z: -4 });

    expect(end.feet).toBe(0);
    expect(end.z).toBeLessThan(-9);
  });

  it("walking into a wall slides along it instead of sticking", () => {
    const move = world.moveHorizontal(19.6, 0, 0.1, 0.1, 0);

    expect(move.z).toBeCloseTo(0.1);
    expect(move.x).toBeCloseTo(19.6);
  });

  it.each([
    ["centre ramp", { x: 0, z: 12 }, { x: 0, z: 0 }, 1.8],
    ["centre stairs", { x: 0, z: -10 }, { x: 0, z: 0 }, 1.8],
    ["west ramp", { x: -14, z: -6.5 }, { x: -14, z: 3 }, 1.2],
    ["west stairs", { x: -14, z: 10.5 }, { x: -14, z: 3 }, 1.2],
    ["east ramp", { x: 14, z: 5.5 }, { x: 14, z: -5 }, 1.5],
    ["east stairs", { x: 5.8, z: -4.5 }, { x: 14, z: -5 }, 1.5],
  ])("%s leads up onto its platform", (_name, from, to, top) => {
    const end = walk(from, to);

    expect(end.feet).toBeCloseTo(top);
    expect(Math.hypot(end.x - to.x, end.z - to.z)).toBeLessThan(0.3);
  });

  it("ramps and stairs can be walked down again", () => {
    const down = walk({ x: 0, z: 0 }, { x: 0, z: 12 }, 1.8);

    expect(down.feet).toBe(0);
    expect(down.z).toBeGreaterThan(11);

    const stairsDown = walk({ x: 0, z: 0 }, { x: 0, z: -10 }, 1.8);

    expect(stairsDown.feet).toBe(0);
  });

  it("walking off a platform edge leaves nothing underfoot (the player falls)", () => {
    expect(world.groundHeight(-5.5, 0, 1.8)).toBe(0);
    expect(world.groundHeight(-4.9, 0, 1.8)).toBe(1.8);
  });

  it("tall cover and pillars block; low cover can be hopped once airborne", () => {
    const block = ARENA_LAYOUT.covers.find((c) => c.id === "cover-block-3")!;
    const low = ARENA_LAYOUT.covers.find((c) => c.id === "cover-low-1")!;
    const cx = (block.minX + block.maxX) / 2;
    const lx = (low.minX + low.maxX) / 2;

    // On foot, 1.4 m and 0.8 m both stop you.
    expect(world.isBlocked(cx, block.minZ - 0.2, 0, PLAYER_RADIUS)).toBe(true);
    expect(world.isBlocked(lx, low.minZ - 0.2, 0, PLAYER_RADIUS)).toBe(true);

    // At the top of a jump (about 0.93 m) the 0.8 m wall can be crossed...
    expect(world.isBlocked(lx, low.minZ - 0.2, 0.5, PLAYER_RADIUS)).toBe(false);
    // ...but the 1.4 m block cannot.
    expect(world.isBlocked(cx, block.minZ - 0.2, 0.93, PLAYER_RADIUS)).toBe(
      true,
    );
  });

  it("pushOut frees a character shoved into scenery", () => {
    const stuck: Array<[string, number, number]> = [
      ...ARENA_LAYOUT.covers.map((c): [string, number, number] => [
        c.id,
        (c.minX + c.maxX) / 2,
        (c.minZ + c.maxZ) / 2,
      ]),
      ...ARENA_LAYOUT.pillars.map((p): [string, number, number] => [
        p.id,
        p.x,
        p.z,
      ]),
      // Just inside the east edge of the central platform.
      ["center-platform edge", 4.9, 3.5],
    ];

    for (const [id, x, z] of stuck) {
      const out = world.pushOut(x, z, 0);

      expect(world.isBlocked(out.x, out.z, 0, PLAYER_RADIUS - 0.02), id).toBe(
        false,
      );
    }
  });

  it("no wall pocket can trap a character: a path exists from every spawn to every other", () => {
    // Coarse flood fill on foot over the whole arena.
    const cell = 0.5;
    const n = Math.round((ARENA_HALF * 2) / cell);
    const index = (x: number, z: number): number =>
      Math.round((z + ARENA_HALF) / cell) * n +
      Math.round((x + ARENA_HALF) / cell);
    const seen = new Set<number>();
    const first = ARENA_LAYOUT.spawnPoints[0];
    const queue: Array<[number, number, number]> = [[first.x, first.z, 0]];

    seen.add(index(first.x, first.z));

    while (queue.length) {
      const [x, z, feet] = queue.pop()!;

      for (const [dx, dz] of [
        [cell, 0],
        [-cell, 0],
        [0, cell],
        [0, -cell],
      ]) {
        const nx = x + dx;
        const nz = z + dz;

        if (
          Math.abs(nx) > ARENA_HALF ||
          Math.abs(nz) > ARENA_HALF ||
          seen.has(index(nx, nz)) ||
          world.isBlocked(nx, nz, feet, PLAYER_RADIUS)
        ) {
          continue;
        }

        seen.add(index(nx, nz));
        queue.push([nx, nz, world.groundHeight(nx, nz, feet)]);
      }
    }

    for (const point of ARENA_LAYOUT.spawnPoints) {
      expect(seen.has(index(point.x, point.z))).toBe(true);
    }

    // Each platform top is reachable on foot too.
    for (const platform of ARENA_LAYOUT.platforms) {
      const x = (platform.minX + platform.maxX) / 2;
      const z = (platform.minZ + platform.maxZ) / 2;

      expect(seen.has(index(x, z))).toBe(true);
    }
  });
});
