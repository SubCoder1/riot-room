import { describe, expect, it } from "vitest";

import { ArenaCollision } from "../../src/world/ArenaCollision";
import { ARENA_LAYOUT } from "../../src/world/ArenaLayout";
import {
  MIN_SPAWN_DISTANCE,
  SPAWN_OCCUPIED_RADIUS,
  assignSpawns,
  shuffle,
  validateSpawnPoint,
} from "../../src/world/SpawnSystem";

const world = new ArenaCollision();
const points = ARENA_LAYOUT.spawnPoints;

/** Small seeded generator so the randomness is repeatable in tests. */
function seeded(seed: number): () => number {
  let a = seed;

  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);

    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ids = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => `p${i + 1}`);

describe("Spawn points", () => {
  it("there are 8-12 individual points with unique ids", () => {
    expect(points.length).toBeGreaterThanOrEqual(8);
    expect(points.length).toBeLessThanOrEqual(12);
    expect(new Set(points.map((p) => p.id)).size).toBe(points.length);
  });

  it("has no team spawns", () => {
    for (const point of points) {
      expect(point.id).not.toMatch(/team|red|blue/i);
      expect(point.label).not.toMatch(/team|^[AB]$/i);
    }
  });

  it.each(points.map((p) => [p.label, p] as const))(
    "%s is safe: in the arena, clear of obstacles, walls and edges",
    (_label, point) => {
      expect(validateSpawnPoint(point, world)).toEqual([]);
    },
  );

  it("no two spawn points are close together", () => {
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        expect(
          Math.hypot(points[i].x - points[j].x, points[i].z - points[j].z),
        ).toBeGreaterThanOrEqual(7);
      }
    }
  });

  it("are spread around the arena (every quadrant has some)", () => {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        expect(
          points.some((p) => Math.sign(p.x) === sx && Math.sign(p.z) === sz),
        ).toBe(true);
      }
    }
  });

  it("every spawn looks at the arena centre", () => {
    for (const point of points) {
      // Camera forward is (-sin yaw, -cos yaw): it should point at the origin.
      const fx = -Math.sin(point.yaw);
      const fz = -Math.cos(point.yaw);
      const length = Math.hypot(point.x, point.z);

      expect(fx * -point.x + fz * -point.z).toBeCloseTo(length);
    }
  });

  it("validateSpawnPoint rejects unsafe positions", () => {
    const unsafe = (x: number, z: number) =>
      validateSpawnPoint({ id: "t", label: "T", x, y: 0, z, yaw: 0 }, world);

    expect(unsafe(0, 0)).not.toEqual([]); // on the central platform
    expect(unsafe(-9, -9)).not.toEqual([]); // inside cover
    expect(unsafe(19.5, 0)).not.toEqual([]); // against the wall
    expect(unsafe(30, 0)).not.toEqual([]); // outside the arena
    expect(unsafe(5.4, 0)).not.toEqual([]); // beside a platform edge
  });
});

describe("Spawn assignment", () => {
  it.each([2, 3, 4, 5, 6, 7, 8])(
    "%i players each get a unique point",
    (count) => {
      const result = assignSpawns(ids(count), { rng: seeded(count) });
      const used = Object.values(result).map((p) => p.id);

      expect(Object.keys(result)).toHaveLength(count);
      expect(new Set(used).size).toBe(count);
    },
  );

  it("only hands out predefined points (never arbitrary coordinates)", () => {
    const valid = new Set(points.map((p) => p.id));

    for (let seed = 1; seed <= 30; seed++) {
      for (const point of Object.values(
        assignSpawns(ids(8), { rng: seeded(seed) }),
      )) {
        expect(valid.has(point.id)).toBe(true);
      }
    }
  });

  it("keeps small groups apart by the minimum spawn distance", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const spawned = Object.values(
        assignSpawns(ids(4), { rng: seeded(seed) }),
      );

      for (let i = 0; i < spawned.length; i++) {
        for (let j = i + 1; j < spawned.length; j++) {
          expect(
            Math.hypot(
              spawned[i].x - spawned[j].x,
              spawned[i].z - spawned[j].z,
            ),
          ).toBeGreaterThanOrEqual(MIN_SPAWN_DISTANCE);
        }
      }
    }
  });

  it("relaxes the distance instead of failing when the arena is full", () => {
    const result = assignSpawns(ids(8), { rng: seeded(5) });
    const used = Object.values(result);

    expect(used).toHaveLength(8);

    // Even then nobody starts right next to someone else.
    for (let i = 0; i < used.length; i++) {
      for (let j = i + 1; j < used.length; j++) {
        expect(
          Math.hypot(used[i].x - used[j].x, used[i].z - used[j].z),
        ).toBeGreaterThanOrEqual(7);
      }
    }
  });

  it("never gives two players the same point, even with no distance rule", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const result = assignSpawns(ids(8), {
        rng: seeded(seed),
        minDistance: 0,
      });

      expect(new Set(Object.values(result).map((p) => p.id)).size).toBe(8);
    }
  });

  it("works with every point in use", () => {
    const result = assignSpawns(ids(points.length), { rng: seeded(9) });

    expect(new Set(Object.values(result).map((p) => p.id)).size).toBe(
      points.length,
    );
  });

  it("throws only when there are more players than points", () => {
    expect(() => assignSpawns(ids(points.length + 1))).toThrow(/spawn points/i);
  });

  it("is random: different seeds give different assignments", () => {
    const seen = new Set<string>();

    for (let seed = 1; seed <= 30; seed++) {
      const result = assignSpawns(ids(8), { rng: seeded(seed) });

      seen.add(
        ids(8)
          .map((id) => result[id].id)
          .join(","),
      );
    }

    expect(seen.size).toBeGreaterThan(20);
  });

  it("does not tie a player's identity to a spawn", () => {
    // Over many rounds every player lands on every point at least once.
    const landed: Record<string, Set<string>> = {
      p1: new Set(),
      p2: new Set(),
    };

    for (let seed = 1; seed <= 300; seed++) {
      const result = assignSpawns(["p1", "p2"], { rng: seeded(seed) });

      landed.p1.add(result.p1.id);
      landed.p2.add(result.p2.id);
    }

    expect(landed.p1.size).toBe(points.length);
    expect(landed.p2.size).toBe(points.length);
  });

  it("a new round never repeats the previous assignment", () => {
    let previous: Record<string, string> | undefined;
    const rng = seeded(3);

    for (let round = 0; round < 200; round++) {
      const result = assignSpawns(ids(2), { rng, previous });
      const mapped = Object.fromEntries(
        Object.entries(result).map(([id, p]) => [id, p.id]),
      );

      if (previous) {
        expect(mapped).not.toEqual(previous);
      }

      previous = mapped;
    }
  });

  it("does not spawn beside a player who is already in the arena", () => {
    const occupant = { x: points[0].x + 1, z: points[0].z + 1 };

    for (let seed = 1; seed <= 40; seed++) {
      const result = assignSpawns(ids(3), {
        rng: seeded(seed),
        occupied: [occupant],
      });

      for (const point of Object.values(result)) {
        expect(
          Math.hypot(point.x - occupant.x, point.z - occupant.z),
        ).toBeGreaterThanOrEqual(SPAWN_OCCUPIED_RADIUS);
      }
    }
  });

  it("shuffle keeps every item exactly once", () => {
    const shuffled = shuffle([1, 2, 3, 4, 5, 6], seeded(1));

    expect([...shuffled].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
