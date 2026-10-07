import { describe, expect, it } from "vitest";

import {
  ArenaCollision,
  PLAYER_RADIUS,
  STEP_UP,
} from "../../src/world/ArenaCollision";
import {
  ARENA_HALF,
  ARENA_LAYOUT,
  allSolids,
  stairsToSteps,
  type RampSolid,
  type StairsDefinition,
} from "../../src/world/ArenaLayout";

const world = new ArenaCollision();
const layout = ARENA_LAYOUT;

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

/** Unit vector of the direction a ramp or stairs climbs. */
function riseVector(direction: string): { x: number; z: number } {
  const sign = direction.startsWith("+") ? 1 : -1;

  return direction.endsWith("x") ? { x: sign, z: 0 } : { x: 0, z: sign };
}

/** Where a ramp's low edge is, and the line it climbs along. */
function rampClimb(r: RampSolid): {
  foot: { x: number; z: number };
  top: { x: number; z: number };
  up: { x: number; z: number };
} {
  const up = riseVector(r.direction);
  const cx = (r.minX + r.maxX) / 2;
  const cz = (r.minZ + r.maxZ) / 2;
  const halfLength = up.x ? (r.maxX - r.minX) / 2 : (r.maxZ - r.minZ) / 2;

  return {
    up,
    foot: { x: cx - up.x * halfLength, z: cz - up.z * halfLength },
    top: { x: cx + up.x * halfLength, z: cz + up.z * halfLength },
  };
}

function stairsClimb(s: StairsDefinition): {
  foot: { x: number; z: number };
  top: { x: number; z: number };
} {
  const up = riseVector(s.direction);
  const cross = (s.crossMin + s.crossMax) / 2;
  const along = (distance: number): { x: number; z: number } =>
    up.x ? { x: distance, z: cross } : { x: cross, z: distance };
  const sign = up.x || up.z;

  return {
    foot: along(s.start),
    top: along(s.start + sign * s.tread * s.steps),
  };
}

describe("Arena layout", () => {
  it("is 40 m x 40 m", () => {
    expect(layout.size).toBe(40);
    expect(ARENA_HALF).toBe(20);
  });

  it("every solid stays inside the arena", () => {
    for (const solid of allSolids()) {
      if (solid.kind === "cylinder") {
        expect(Math.abs(solid.x) + solid.radius).toBeLessThanOrEqual(
          ARENA_HALF + 1e-9,
        );
        expect(Math.abs(solid.z) + solid.radius).toBeLessThanOrEqual(
          ARENA_HALF + 1e-9,
        );
      } else {
        for (const edge of [solid.minX, solid.maxX, solid.minZ, solid.maxZ]) {
          expect(Math.abs(edge), solid.id).toBeLessThan(ARENA_HALF);
        }
      }
    }
  });

  it("every stair step is one a character can walk up", () => {
    for (const stairs of layout.stairs) {
      expect(stairs.rise, stairs.id).toBeLessThanOrEqual(STEP_UP);
      expect(stairsToSteps(stairs), stairs.id).toHaveLength(stairs.steps);
    }
  });

  it("each ramp and flight of stairs meets a platform at exactly its height", () => {
    for (const ramp of layout.ramps) {
      expect(
        layout.platforms.some((p) => Math.abs(p.height - ramp.height) < 1e-9),
        ramp.id,
      ).toBe(true);
    }

    for (const stairs of layout.stairs) {
      const top = stairs.rise * stairs.steps;

      expect(
        layout.platforms.some((p) => Math.abs(p.height - top) < 1e-9),
        stairs.id,
      ).toBe(true);
    }
  });

  it("cover heights fit the jump: 0.8 m can be hopped, 2 m cannot be climbed", () => {
    const heights = new Set(layout.covers.map((c) => c.height));

    expect(heights.has(0.8)).toBe(true);
    expect(heights.has(2)).toBe(true);
    // Nothing that is almost climbable but not quite.
    for (const c of layout.covers) {
      expect(c.height === 0.8 || c.height >= 1.5, c.id).toBe(true);
    }
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
      const end = walk({ x: 1, z: 1 }, { x: 1 + dx, z: 1 + dz });

      expect(Math.abs(end.x)).toBeLessThanOrEqual(
        ARENA_HALF - PLAYER_RADIUS + 1e-9,
      );
      expect(Math.abs(end.z)).toBeLessThanOrEqual(
        ARENA_HALF - PLAYER_RADIUS + 1e-9,
      );
    }
  });

  it("walking into a wall slides along it instead of sticking", () => {
    const move = world.moveHorizontal(
      ARENA_HALF - PLAYER_RADIUS,
      0,
      0.1,
      0.1,
      0,
    );

    expect(move.z).toBeCloseTo(0.1);
    expect(move.x).toBeCloseTo(ARENA_HALF - PLAYER_RADIUS);
  });

  it("running at the edge of a pillar or the corner of a block slides round it instead of stopping", () => {
    const pillar = layout.pillars.find((p) => p.id === "pillar-3")!;
    const round = walk(
      { x: pillar.x + 0.3, z: pillar.z - 3.5 },
      { x: pillar.x + 0.3, z: pillar.z + 2 },
    );

    expect(round.z).toBeGreaterThan(pillar.z + 0.6);

    const monolith = layout.covers.find((c) => c.id === "monolith")!;
    const corner = walk(
      { x: monolith.minX - 0.3, z: monolith.minZ - 4 },
      { x: monolith.minX + 0.3, z: monolith.maxZ + 6 },
    );

    expect(corner.z).toBeGreaterThan(monolith.maxZ + 0.5);
  });

  it("standing on a corner column, you can walk right into the corner without falling", () => {
    for (const column of layout.pillars.filter((p) =>
      p.id.startsWith("column"),
    )) {
      const sx = Math.sign(column.x);
      const sz = Math.sign(column.z);
      const edge = ARENA_HALF - PLAYER_RADIUS;

      expect(world.groundHeight(sx * edge, sz * edge, column.height)).toBe(
        column.height,
      );
      expect(
        world.isBlocked(sx * edge, sz * edge, column.height, PLAYER_RADIUS),
      ).toBe(false);
    }
  });

  it("a tall platform cannot be walked into from the floor", () => {
    const tower = layout.platforms.find((p) => p.id === "east-tower")!;
    const x = (tower.minX + tower.maxX) / 2;
    // From the open ground north of the tower, straight at its north face.
    const end = walk({ x, z: tower.minZ - 5 }, { x, z: tower.minZ + 2 });

    expect(end.feet).toBe(0);
    expect(end.z).toBeLessThan(tower.minZ - PLAYER_RADIUS + 1e-6);
  });

  it.each(layout.ramps.map((r) => [r.id, r] as const))(
    "%s leads up onto its platform, and back down",
    (_id, ramp) => {
      const { foot, top, up } = rampClimb(ramp);
      const start = { x: foot.x - up.x * 1.5, z: foot.z - up.z * 1.5 };
      const end = { x: top.x + up.x * 1.2, z: top.z + up.z * 1.2 };
      const climbed = walk(start, end);

      expect(climbed.feet).toBeCloseTo(ramp.height);

      const down = walk(end, start, ramp.height);

      expect(down.feet).toBeCloseTo(0);
    },
  );

  it.each(layout.stairs.map((s) => [s.id, s] as const))(
    "%s leads up onto its platform, and back down",
    (_id, stairs) => {
      const { foot, top } = stairsClimb(stairs);
      const up = riseVector(stairs.direction);
      const start = { x: foot.x - up.x * 1.5, z: foot.z - up.z * 1.5 };
      const end = { x: top.x + up.x * 1.2, z: top.z + up.z * 1.2 };
      const climbed = walk(start, end);

      expect(climbed.feet).toBeCloseTo(stairs.rise * stairs.steps);

      const down = walk(end, start, stairs.rise * stairs.steps);

      expect(down.feet).toBeCloseTo(0);
    },
  );

  it("walking off a platform edge leaves nothing underfoot (the player falls)", () => {
    const walkway = layout.platforms.find((p) => p.id === "north-walkway")!;
    const x = (walkway.minX + walkway.maxX) / 2;

    expect(world.groundHeight(x, walkway.maxZ - 0.1, walkway.height)).toBe(
      walkway.height,
    );
    expect(world.groundHeight(x, walkway.maxZ + 0.5, walkway.height)).toBe(0);
  });

  it("2 m blocks and pillars block; low walls can be hopped once airborne", () => {
    const block = layout.covers.find((c) => c.height === 2)!;
    const low = layout.covers.find((c) => c.height === 0.8)!;
    const bx = (block.minX + block.maxX) / 2;
    const lx = (low.minX + low.maxX) / 2;

    // On foot, both stop you.
    expect(world.isBlocked(bx, block.minZ - 0.2, 0, PLAYER_RADIUS)).toBe(true);
    expect(world.isBlocked(lx, low.minZ - 0.2, 0, PLAYER_RADIUS)).toBe(true);

    // At the top of a jump (about 0.93 m) the low wall can be crossed...
    expect(world.isBlocked(lx, low.minZ - 0.2, 0.5, PLAYER_RADIUS)).toBe(false);
    // ...but the 2 m block cannot.
    expect(world.isBlocked(bx, block.minZ - 0.2, 0.93, PLAYER_RADIUS)).toBe(
      true,
    );
  });

  it("pushOut frees a character shoved into scenery", () => {
    const stuck: Array<[string, number, number]> = [
      ...layout.covers.map((c): [string, number, number] => [
        c.id,
        (c.minX + c.maxX) / 2,
        (c.minZ + c.maxZ) / 2,
      ]),
      ...layout.pillars.map((p): [string, number, number] => [p.id, p.x, p.z]),
    ];

    for (const [id, x, z] of stuck) {
      const out = world.pushOut(x, z, 0);

      expect(world.isBlocked(out.x, out.z, 0, PLAYER_RADIUS - 0.02), id).toBe(
        false,
      );
    }
  });
});
