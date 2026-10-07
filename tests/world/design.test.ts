import { describe, expect, it } from "vitest";

import { assignSpawns } from "../../src/world/SpawnSystem";
import { rng } from "./playerHarness";

import {
  ARENA_HALF,
  ARENA_LAYOUT,
  allSolids,
  type BoxSolid,
} from "../../src/world/ArenaLayout";
import {
  ARENA_ROUTES,
  ROUTE_END,
  ROUTE_START,
} from "../../src/world/ArenaRoutes";
import {
  CELL,
  COLS,
  SPAWNS,
  canSee,
  cellOf,
  cellX,
  cellZ,
  distanceTo,
  floorCells,
  pathLength,
  pathTo,
  routePath,
  walkField,
  world,
} from "./nav";

/**
 * The layout checked against its own design principles. Each test names the
 * principle it protects; together they stand in for "no dominant position, no
 * endless perimeter run, several real routes, dodgeable heavy punches".
 */

const layout = ARENA_LAYOUT;

/** Free angle (degrees) around a floor point, from rays that reach `radius`. */
function freeArc(x: number, z: number, radius = 3, rays = 36): number {
  let free = 0;

  for (let k = 0; k < rays; k++) {
    const a = (k / rays) * Math.PI * 2;
    const ex = x + Math.cos(a) * radius;
    const ez = z + Math.sin(a) * radius;
    const outside = Math.abs(ex) > ARENA_HALF || Math.abs(ez) > ARENA_HALF;

    if (!outside && !world.segmentBlocked(x, 1.3, z, ex, 1.3, ez)) {
      free++;
    }
  }

  return (free / rays) * 360;
}

const targets: Array<{ x: number; z: number }> = [];

for (let x = -19; x <= 19; x += 2) {
  for (let z = -19; z <= 19; z += 2) {
    if (!world.isBlocked(x, z, 0, 0.5)) {
      targets.push({ x, z });
    }
  }
}

/** On average, how many floor spots can see a point along the path. */
function visibility(
  path: Array<{ x: number; z: number; feet: number }>,
): number {
  let seen = 0;
  let samples = 0;

  for (let k = 0; k < path.length; k += 3) {
    for (const t of targets) {
      if (
        Math.hypot(t.x - path[k].x, t.z - path[k].z) <= 20 &&
        canSee(t.x, t.z, 0, path[k].x, path[k].z, path[k].feet)
      ) {
        seen++;
      }
    }

    samples++;
  }

  return seen / samples;
}

function share(
  a: Array<{ x: number; z: number }>,
  b: Array<{ x: number; z: number }>,
): number {
  let near = 0;

  for (const p of a) {
    if (b.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 3)) near++;
  }

  return near / a.length;
}

describe("Reachability", () => {
  const field = walkField(SPAWNS[0].x, SPAWNS[0].z, 0, { hop: false });

  it("every spawn is reachable on foot from every other", () => {
    for (const s of SPAWNS) {
      expect(distanceTo(field, s.x, s.z), s.label).toBeLessThan(Infinity);
    }
  });

  it("every high platform can be reached on foot (ramps and stairs, no jumping)", () => {
    for (const p of layout.platforms) {
      const x = (p.minX + p.maxX) / 2;
      const z = (p.minZ + p.maxZ) / 2;

      expect(distanceTo(field, x, z), p.id).toBeLessThan(Infinity);
    }
  });

  it("every resource site is reachable on foot", () => {
    for (const r of layout.resourceSites) {
      expect(distanceTo(field, r.x, r.z), r.label).toBeLessThan(Infinity);
    }
  });
});

describe("No safe corners", () => {
  it("every corner is sealed: no walkable spot is a two-wall pocket", () => {
    // A bare 90 degree corner leaves 90 degrees free; anything under 100 is a pocket.
    const pockets = floorCells()
      .filter((_, i) => i % 2 === 0)
      .filter((c) => freeArc(c.x, c.z) < 100);

    expect(pockets).toEqual([]);
  });

  it("each corner holds a column", () => {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        expect(
          layout.pillars.some(
            (p) =>
              p.radius >= 2 &&
              Math.sign(p.x) === sx &&
              Math.sign(p.z) === sz &&
              Math.abs(p.x) + p.radius >= ARENA_HALF - 0.1 &&
              Math.abs(p.z) + p.radius >= ARENA_HALF - 0.1,
          ),
        ).toBe(true);
      }
    }
  });
});

describe("No endless perimeter run", () => {
  it("the strip along the walls is cut into at least four separate sections", () => {
    const band = new Set<string>();

    for (const c of floorCells()) {
      if (ARENA_HALF - Math.max(Math.abs(c.x), Math.abs(c.z)) <= 4) {
        band.add(
          `${Math.round((c.x + 20) / CELL)},${Math.round((c.z + 20) / CELL)}`,
        );
      }
    }

    const seen = new Set<string>();
    let sections = 0;

    for (const start of band) {
      if (seen.has(start)) continue;

      sections++;

      const stack = [start];

      seen.add(start);

      while (stack.length) {
        const [i, j] = stack.pop()!.split(",").map(Number);

        for (const [di, dj] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const key = `${i + di},${j + dj}`;

          if (band.has(key) && !seen.has(key)) {
            seen.add(key);
            stack.push(key);
          }
        }
      }
    }

    expect(sections).toBeGreaterThanOrEqual(4);
  });

  it("the middle can be crossed on foot: it is not a solid hill to run around", () => {
    for (const [from, to] of [
      [
        [-9, 0],
        [9, 0],
      ],
      [
        [0, -6],
        [0, 6],
      ],
    ]) {
      const field = walkField(from[0], from[1], 0, { hop: false });
      const straight = Math.hypot(to[0] - from[0], to[1] - from[1]);

      expect(distanceTo(field, to[0], to[1]) / straight).toBeLessThan(1.5);
    }
  });
});

describe("Dodgeable heavy punches", () => {
  it("long enough sprint lanes exist for a charge", () => {
    const lanes: number[] = [];
    const clear = (x: number, z: number): boolean =>
      !world.isBlocked(x, z, 0, 0.5);

    for (const axis of ["x", "z"] as const) {
      for (let a = 1; a < COLS - 1; a += 2) {
        let run = 0;

        for (let b = 0; b <= COLS; b++) {
          const i = axis === "x" ? b : a;
          const j = axis === "x" ? a : b;
          const dx = axis === "x" ? 0 : 1;
          const dz = axis === "x" ? 1 : 0;
          const ok =
            b < COLS &&
            clear(cellX(i), cellZ(j)) &&
            clear(cellX(i + dx), cellZ(j + dz)) &&
            clear(cellX(i - dx), cellZ(j - dz));

          if (ok) {
            run++;
          } else {
            if (run * CELL >= 14) lanes.push(run * CELL);

            run = 0;
          }
        }
      }
    }

    expect(lanes.length).toBeGreaterThanOrEqual(6);
  });

  it("but no lane runs unbroken wall to wall: a charge can always be interrupted", () => {
    const clear = (x: number, z: number): boolean =>
      !world.isBlocked(x, z, 0, 0.5);
    let longest = 0;

    for (const axis of ["x", "z"] as const) {
      for (let a = 1; a < COLS - 1; a += 2) {
        let run = 0;

        for (let b = 0; b <= COLS; b++) {
          const i = axis === "x" ? b : a;
          const j = axis === "x" ? a : b;

          if (b < COLS && clear(cellX(i), cellZ(j))) {
            run++;
          } else {
            longest = Math.max(longest, run * CELL);
            run = 0;
          }
        }
      }
    }

    // Arena is 40 m wide, 39 usable: anything near that is wall to wall.
    expect(longest).toBeLessThan(33);
  });

  it("no corridor with a wall on both sides runs longer than 10 m", () => {
    const blocking = (x: number, z: number): boolean =>
      Math.abs(x) > ARENA_HALF - 0.5 ||
      Math.abs(z) > ARENA_HALF - 0.5 ||
      (world.isBlocked(x, z, 0, 0.5) &&
        world.segmentBlocked(x, 1.3, z, x, 1.3, z + 0.01));

    let longest = 0;

    for (const axis of ["x", "z"] as const) {
      for (let a = 0; a < COLS; a++) {
        let run = 0;

        for (let b = 0; b < COLS; b++) {
          const i = axis === "x" ? b : a;
          const j = axis === "x" ? a : b;
          const x = cellX(i);
          const z = cellZ(j);

          if (world.isBlocked(x, z, 0, 0.5)) {
            run = 0;
            continue;
          }

          const dx = axis === "x" ? 0 : 1;
          const dz = axis === "x" ? 1 : 0;
          const side = (s: number): boolean => {
            for (let d = 0.5; d <= 3.5; d += 0.5) {
              if (blocking(x + dx * s * d, z + dz * s * d)) return true;
            }

            return false;
          };

          if (side(1) && side(-1)) {
            run++;
            longest = Math.max(longest, run * CELL);
          } else {
            run = 0;
          }
        }
      }
    }

    expect(longest).toBeLessThanOrEqual(10);
  });
});

describe("High ground is not dominant", () => {
  const platforms = layout.platforms;

  it("there are several high positions, at different heights", () => {
    expect(platforms.length).toBeGreaterThanOrEqual(3);
    expect(new Set(platforms.map((p) => p.height)).size).toBe(platforms.length);
  });

  it("none is in the middle: the centre stays open floor", () => {
    for (const p of platforms) {
      expect(p.minX > 0 || p.maxX < 0 || p.minZ > 0 || p.maxZ < 0, p.id).toBe(
        true,
      );
    }
  });

  it("high ground is a small part of the arena", () => {
    const area = (p: BoxSolid): number => (p.maxX - p.minX) * (p.maxZ - p.minZ);
    const total = platforms.reduce((sum, p) => sum + area(p), 0);

    for (const p of platforms) {
      expect(area(p) / (layout.size * layout.size), p.id).toBeLessThan(0.04);
    }

    expect(total / (layout.size * layout.size)).toBeLessThan(0.12);
  });

  it("each has two or more ways up", () => {
    for (const p of platforms) {
      const touches = (s: {
        minX: number;
        maxX: number;
        minZ: number;
        maxZ: number;
      }): boolean =>
        s.minX <= p.maxX + 0.05 &&
        s.maxX >= p.minX - 0.05 &&
        s.minZ <= p.maxZ + 0.05 &&
        s.maxZ >= p.minZ - 0.05;

      const ramps = layout.ramps.filter(
        (r) => touches(r) && r.height === p.height,
      );
      const stairs = allSolids().filter(
        (s) =>
          s.kind === "box" &&
          s.id.includes("-step") &&
          touches(s) &&
          Math.abs(s.height - p.height) < 0.01,
      );
      // A jump up from the floor (<= 1.3 m) or from a lower platform beside it.
      const jumpFromFloor = p.height <= 1.3 ? 1 : 0;
      const jumpFromLower = platforms.filter(
        (o) =>
          o !== p && touches(o) && p.height - o.height <= 1.3 && o.height > 0,
      ).length;

      expect(
        ramps.length + stairs.length + jumpFromFloor + jumpFromLower,
        p.id,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it("most of each platform's edge is open: it can be attacked, jumped from and knocked off", () => {
    for (const p of platforms) {
      let open = 0;
      let count = 0;
      const ring: Array<[number, number]> = [];

      for (let x = p.minX; x <= p.maxX; x += 0.5) {
        ring.push([x, p.minZ - 0.6], [x, p.maxZ + 0.6]);
      }

      for (let z = p.minZ; z <= p.maxZ; z += 0.5) {
        ring.push([p.minX - 0.6, z], [p.maxX + 0.6, z]);
      }

      for (const [x, z] of ring) {
        count++;

        const wall =
          Math.abs(x) > ARENA_HALF - 0.5 || Math.abs(z) > ARENA_HALF - 0.5;
        const taller = allSolids().some(
          (s) =>
            s.id !== p.id &&
            s.height >= p.height - 0.3 &&
            (s.kind === "cylinder"
              ? Math.hypot(x - s.x, z - s.z) <= s.radius
              : x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ),
        );

        if (!wall && !taller) open++;
      }

      expect(open / count, p.id).toBeGreaterThan(0.5);
    }
  });
});

describe("Routes", () => {
  const routes = ARENA_ROUTES.map((r) => ({
    r,
    path: routePath(r.waypoints)!,
  }));
  const byId = (id: string) => routes.find((x) => x.r.id === id)!;
  const length = (id: string): number => pathLength(byId(id).path);
  const highest = (id: string): number =>
    Math.max(...byId(id).path.map((p) => p.feet));

  it("there are five routes and every one can be walked", () => {
    expect(ARENA_ROUTES).toHaveLength(5);

    for (const { r, path } of routes) {
      expect(path, r.id).not.toBeNull();
      expect(r.advantage.length, r.id).toBeGreaterThan(5);
      expect(r.weakness.length, r.id).toBeGreaterThan(5);
    }
  });

  it("all of them link the same two areas", () => {
    for (const { r, path } of routes) {
      const first = path[0];
      const last = path[path.length - 1];

      expect(
        Math.hypot(first.x - ROUTE_START.x, first.z - ROUTE_START.z),
        r.id,
      ).toBeLessThan(1);
      expect(
        Math.hypot(last.x - ROUTE_END.x, last.z - ROUTE_END.z),
        r.id,
      ).toBeLessThan(1);
    }
  });

  it("the shortcut (D) is the shortest route", () => {
    for (const id of ["A", "B", "C", "E"]) {
      expect(length("D"), id).toBeLessThan(length(id));
    }
  });

  it("the outer routes (A, B) are the slow ones: the shortcut beats them by 25%+", () => {
    expect(length("A") / length("D")).toBeGreaterThan(1.25);
    expect(length("B") / length("D")).toBeGreaterThan(1.25);
  });

  it("no route is more than twice as long as another: none is pointless", () => {
    const lengths = routes.map((x) => pathLength(x.path));

    expect(Math.max(...lengths) / Math.min(...lengths)).toBeLessThan(2);
  });

  it("A, B and C go different ways (little shared ground)", () => {
    for (const [a, b] of [
      ["A", "B"],
      ["A", "C"],
      ["B", "C"],
      ["B", "A"],
      ["C", "A"],
      ["C", "B"],
    ]) {
      expect(share(byId(a).path, byId(b).path), `${a}/${b}`).toBeLessThan(0.35);
    }
  });

  it("only the elevated route (C) climbs onto the walkway", () => {
    expect(highest("C")).toBeGreaterThanOrEqual(2);
    expect(highest("A")).toBeLessThan(0.6);
    expect(highest("B")).toBeLessThan(0.6);
  });

  it("the middle routes (D, E) go through the centre; the outer routes (A, B) stay away from it", () => {
    const closest = (id: string): number =>
      Math.min(...byId(id).path.map((p) => Math.hypot(p.x, p.z)));

    expect(closest("D")).toBeLessThan(6);
    expect(closest("E")).toBeLessThan(6);
    expect(closest("A")).toBeGreaterThan(10);
    expect(closest("B")).toBeGreaterThan(10);
  });

  it("every route trades something: fast ones are exposed, the safer ones are slow", () => {
    const seen = (id: string): number => visibility(byId(id).path);

    // The shortcut and the central route are visible from far more of the arena...
    expect(seen("D")).toBeGreaterThan(seen("A") * 1.4);
    expect(seen("E")).toBeGreaterThan(seen("A") * 1.4);
    // ...the covered route is the most hidden, at the price of being the longest ground route...
    expect(seen("B")).toBeLessThan(seen("A"));
    expect(length("B")).toBeGreaterThan(length("A"));
    // ...and high ground sees the most and is seen the most.
    expect(seen("C")).toBeGreaterThan(seen("A") * 1.4);
  });
});

describe("1v1: running away does not work forever", () => {
  const far: Array<[number, number]> = [];

  for (let a = 0; a < SPAWNS.length; a++) {
    for (let b = a + 1; b < SPAWNS.length; b++) {
      if (
        Math.hypot(SPAWNS[a].x - SPAWNS[b].x, SPAWNS[a].z - SPAWNS[b].z) >= 24
      ) {
        far.push([a, b]);
      }
    }
  }

  it("there are several far-apart spawn pairs to test", () => {
    expect(far.length).toBeGreaterThanOrEqual(10);
  });

  it("between any two far-apart spawns there are at least two distinct routes (the second under twice as long)", () => {
    for (const [a, b] of far) {
      const A = SPAWNS[a];
      const B = SPAWNS[b];
      const blocked = new Set<number>();
      const lengths: number[] = [];

      for (let k = 0; k < 2; k++) {
        const field = walkField(A.x, A.z, 0, {
          hop: false,
          forbid: (x, z) => blocked.has(cellOf(z) * COLS + cellOf(x)),
        });
        const d = distanceTo(field, B.x, B.z);

        if (d === Infinity) break;

        lengths.push(d);

        // Close off a 3 m wide strip along the route just found (except near
        // the two ends), then look for another way.
        for (const q of pathTo(field, B.x, B.z)) {
          if (
            Math.hypot(q.x - A.x, q.z - A.z) <= 7 ||
            Math.hypot(q.x - B.x, q.z - B.z) <= 7
          ) {
            continue;
          }

          for (let dx = -3; dx <= 3; dx += CELL) {
            for (let dz = -3; dz <= 3; dz += CELL) {
              if (Math.hypot(dx, dz) < 3) {
                blocked.add(cellOf(q.z + dz) * COLS + cellOf(q.x + dx));
              }
            }
          }
        }
      }

      expect(lengths.length, `${A.label}-${B.label}`).toBeGreaterThanOrEqual(2);
      expect(lengths[1] / lengths[0], `${A.label}-${B.label}`).toBeLessThan(
        2.0,
      );
    }
  });
});

describe("Spawns", () => {
  it("there are 10 to 12 of them", () => {
    expect(SPAWNS.length).toBeGreaterThanOrEqual(10);
    expect(SPAWNS.length).toBeLessThanOrEqual(12);
  });

  it("nobody starts in the middle: no spawn within 8 m of the centre", () => {
    for (const s of SPAWNS) {
      expect(Math.hypot(s.x, s.z), s.label).toBeGreaterThan(8);
    }
  });

  it("every pair is at least 10 m apart on foot", () => {
    for (let a = 0; a < SPAWNS.length; a++) {
      const field = walkField(SPAWNS[a].x, SPAWNS[a].z, 0, { hop: true });

      for (let b = a + 1; b < SPAWNS.length; b++) {
        expect(
          distanceTo(field, SPAWNS[b].x, SPAWNS[b].z),
          `${SPAWNS[a].label}-${SPAWNS[b].label}`,
        ).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it("two spawns that are close together cannot see each other: you have to search", () => {
    for (let a = 0; a < SPAWNS.length; a++) {
      for (let b = a + 1; b < SPAWNS.length; b++) {
        const gap = Math.hypot(
          SPAWNS[a].x - SPAWNS[b].x,
          SPAWNS[a].z - SPAWNS[b].z,
        );

        if (gap < 10.5) {
          expect(
            canSee(SPAWNS[a].x, SPAWNS[a].z, 0, SPAWNS[b].x, SPAWNS[b].z, 0),
            `${SPAWNS[a].label}-${SPAWNS[b].label}`,
          ).toBe(false);
        }
      }
    }
  });

  it("no spawn sees more than five others", () => {
    for (const a of SPAWNS) {
      const seen = SPAWNS.filter(
        (b) => b !== a && canSee(a.x, a.z, 0, b.x, b.z, 0),
      ).length;

      expect(seen, a.label).toBeLessThanOrEqual(5);
    }
  });

  it("they do not all face the middle", () => {
    const awayFromCentre = SPAWNS.filter((s) => {
      // Camera forward is (-sin yaw, -cos yaw).
      const fx = -Math.sin(s.yaw);
      const fz = -Math.cos(s.yaw);
      const toCentre = Math.hypot(s.x, s.z);
      const cosine = (fx * -s.x + fz * -s.z) / toCentre;

      return (
        Math.acos(Math.min(1, Math.max(-1, cosine))) > (60 * Math.PI) / 180
      );
    });

    expect(awayFromCentre.length).toBeGreaterThanOrEqual(6);
  });
});

describe("Resource sites (valuable, exposed, contestable)", () => {
  const sites = layout.resourceSites;

  it("there are three of them, spread across the middle ground", () => {
    expect(sites).toHaveLength(3);

    for (let a = 0; a < sites.length; a++) {
      for (let b = a + 1; b < sites.length; b++) {
        expect(
          Math.hypot(sites[a].x - sites[b].x, sites[a].z - sites[b].z),
        ).toBeGreaterThan(8);
      }
    }
  });

  it("none is next to a spawn", () => {
    for (const site of sites) {
      for (const s of SPAWNS) {
        expect(
          Math.hypot(site.x - s.x, site.z - s.z),
          `${site.label}/${s.label}`,
        ).toBeGreaterThan(5);
      }
    }
  });

  it("none is a protected corner: each is open ground with room on all sides", () => {
    for (const site of sites) {
      expect(world.clearanceAt(site.x, site.z), site.label).toBeGreaterThan(
        1.5,
      );
      expect(freeArc(site.x, site.z), site.label).toBeGreaterThanOrEqual(200);
    }
  });

  it("each can be seen from high ground, so holding it is risky", () => {
    for (const site of sites) {
      const seenFrom = layout.platforms.filter((p) =>
        canSee(
          (p.minX + p.maxX) / 2,
          (p.minZ + p.maxZ) / 2,
          p.height,
          site.x,
          site.z,
          0,
        ),
      );

      expect(seenFrom.length, site.label).toBeGreaterThanOrEqual(1);
    }
  });

  it("they are not equally safe: how exposed each one is differs clearly", () => {
    const exposure = sites.map((site) => {
      const seen = targets.filter(
        (t) =>
          Math.hypot(t.x - site.x, t.z - site.z) <= 20 &&
          canSee(t.x, t.z, 0, site.x, site.z, 0),
      ).length;

      return seen;
    });
    const spread = Math.max(...exposure) / Math.min(...exposure);

    expect(spread).toBeGreaterThan(1.25);
  });
});

describe("8 players", () => {
  it("every round spreads eight players out, and nobody starts in the middle", () => {
    const random = rng(21);
    const ids = Array.from({ length: 8 }, (_, i) => `p${i + 1}`);
    let closest = Infinity;

    for (let round = 0; round < 300; round++) {
      const spawned = Object.values(assignSpawns(ids, { rng: random }));

      for (const s of spawned) {
        expect(Math.hypot(s.x, s.z)).toBeGreaterThan(8);
      }

      for (let a = 0; a < spawned.length; a++) {
        for (let b = a + 1; b < spawned.length; b++) {
          closest = Math.min(
            closest,
            Math.hypot(
              spawned[a].x - spawned[b].x,
              spawned[a].z - spawned[b].z,
            ),
          );
        }
      }
    }

    // With 8 of 11 points in use two neighbours can be close, but never right beside each other.
    expect(closest).toBeGreaterThanOrEqual(7);
  });

  it("the eight are spread over the whole arena, not one end", () => {
    const random = rng(5);
    const ids = Array.from({ length: 8 }, (_, i) => `p${i + 1}`);

    for (let round = 0; round < 100; round++) {
      const spawned = Object.values(assignSpawns(ids, { rng: random }));

      for (const [axis, sign] of [
        ["x", 1],
        ["x", -1],
        ["z", 1],
        ["z", -1],
      ] as const) {
        expect(
          spawned.filter((s) => Math.sign(s[axis]) === sign).length,
        ).toBeGreaterThanOrEqual(1);
      }
    }
  });
});
