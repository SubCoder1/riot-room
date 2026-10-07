import { describe, expect, it } from "vitest";

import { ARENA_LAYOUT } from "../../src/world/ArenaLayout";
import { ARENA_ROUTES } from "../../src/world/ArenaRoutes";
import {
  canSee,
  cellOf,
  cellX,
  cellZ,
  distanceTo,
  pathTo,
  routePath,
  walkField,
  world,
} from "./nav";

/**
 * 1v1 pursuit on the real walkable space. A runner flees round the outside of
 * the arena (the longest loop the routes allow: out by A, back by B). A chaser
 * of the same speed who just trails behind never gets closer, but one who
 * predicts and takes shortcuts across the arena catches the runner. That is the
 * difference between a chase and a foot race.
 */

type Pt = { x: number; z: number; feet: number };

const route = (id: string): Pt[] =>
  routePath(ARENA_ROUTES.find((r) => r.id === id)!.waypoints)!;

const outbound = route("A");
const inbound = route("B").reverse();
const lap = [...outbound, ...inbound.slice(1)];
/** Two laps so a chase never has to wrap around. */
const loop = [...lap, ...lap.slice(1)];
const along: number[] = [0];

for (let k = 1; k < loop.length; k++) {
  along.push(
    along[k - 1] +
      Math.hypot(loop[k].x - loop[k - 1].x, loop[k].z - loop[k - 1].z),
  );
}

/** Metres of path a runner covers each tick (sprint speed over 1/16 s). */
const TICKS_PER_SECOND = 16;
const SPEED = 8.5;
const CATCH = 1.5;

/** Index of the loop point `metres` further on than `from`. */
function ahead(from: number, metres: number): number {
  let k = from;

  while (k < loop.length - 1 && along[k] - along[from] < metres) k++;

  return k;
}

interface Result {
  caught: boolean;
  seconds: number;
  cutAcross: boolean;
}

/**
 * The chaser heads for the first loop point it can reach no later than the
 * runner does (an interception). With `trail` set it only ever follows the
 * runner's path from behind.
 */
function chase(gapMetres: number, trail: boolean): Result {
  let runner = ahead(0, gapMetres);
  let at = { x: loop[0].x, z: loop[0].z, feet: loop[0].feet };
  let plan: Pt[] = [];
  let step = 0;
  let travelled = 0;
  let cutAcross = false;
  const maxTicks = 40 * TICKS_PER_SECOND;

  for (let tick = 0; tick < maxTicks; tick++) {
    travelled += SPEED / TICKS_PER_SECOND;
    runner = ahead(runner, SPEED / TICKS_PER_SECOND);

    if (runner >= loop.length - 1) break;

    if (Math.hypot(loop[runner].x - at.x, loop[runner].z - at.z) < CATCH) {
      return { caught: true, seconds: tick / TICKS_PER_SECOND, cutAcross };
    }

    if (tick % 8 === 0) {
      const field = walkField(at.x, at.z, at.feet, {
        hop: true,
        forbid: () => false,
      });
      let goal = runner;

      if (trail) {
        // Follow the runner's own path: aim for where it was a moment ago.
        goal = Math.max(0, ahead(0, along[runner] - gapMetres));
        goal = Math.max(goal, ahead(0, travelled));
      } else {
        for (let k = runner; k < loop.length; k++) {
          const reach = distanceTo(field, loop[k].x, loop[k].z);

          if (reach <= along[k] - along[runner]) {
            goal = k;
            break;
          }
        }
      }

      plan = pathTo(field, loop[goal].x, loop[goal].z);
      step = 0;

      // Cutting across means the chaser's path leaves the runner's route.
      const mid = plan[Math.floor(plan.length / 2)];

      if (
        mid &&
        loop.every((p) => Math.hypot(p.x - mid.x, p.z - mid.z) > 3.5)
      ) {
        cutAcross = true;
      }
    }

    step = Math.min(plan.length - 1, step + 1);

    if (plan[step]) {
      at = plan[step];
    }
  }

  return { caught: false, seconds: maxTicks / TICKS_PER_SECOND, cutAcross };
}

describe("1v1 chase: the runner and the chaser", () => {
  it("the outside loop is long: a runner on it is far from catching itself", () => {
    expect(along[lap.length - 1]).toBeGreaterThan(100);
  });

  it("a chaser who only trails the runner never closes the gap", () => {
    expect(chase(8, true).caught).toBe(false);
  });

  it.each([6, 12, 20])(
    "a chaser who predicts and cuts across catches a runner on the loop (%i m behind)",
    (gap) => {
      const result = chase(gap, false);

      expect(result.caught).toBe(true);
      expect(result.cutAcross).toBe(true);
      // Caught, and not endlessly: cutting across beats following.
      expect(result.seconds).toBeLessThan(25);
    },
  );
});

describe("1v1 chase: high ground and cover are not safe", () => {
  const platforms = ARENA_LAYOUT.platforms.filter((p) => p.height >= 2);

  it("the chaser can reach every high platform and every platform has a way off in more than one direction", () => {
    const start = ARENA_LAYOUT.spawnPoints[0];
    const field = walkField(start.x, start.z, 0, {});

    for (const p of platforms) {
      const cx = (p.minX + p.maxX) / 2;
      const cz = (p.minZ + p.maxZ) / 2;

      expect(distanceTo(field, cx, cz), p.id).toBeLessThan(Infinity);

      // Platform-edge cells with open floor beside them: ways off (by dropping).
      const sides = [
        [(p.minX + p.maxX) / 2, p.minZ - 1],
        [(p.minX + p.maxX) / 2, p.maxZ + 1],
        [p.minX - 1, (p.minZ + p.maxZ) / 2],
        [p.maxX + 1, (p.minZ + p.maxZ) / 2],
      ].filter(([x, z]) => !world.isBlocked(x, z, 0, 0.5));

      expect(sides.length, p.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("the east tower can be seen from the open floor on at least two sides", () => {
    const tower = ARENA_LAYOUT.platforms.find((p) => p.id === "east-tower")!;
    const sidesSeen = new Set<string>();

    for (let x = -19; x <= 19; x += 1) {
      for (let z = -19; z <= 19; z += 1) {
        if (world.isBlocked(x, z, 0, 0.5)) continue;

        if (
          !canSee(
            x,
            z,
            0,
            (tower.minX + tower.maxX) / 2,
            (tower.minZ + tower.maxZ) / 2,
            tower.height,
          )
        )
          continue;

        const dx = x - (tower.minX + tower.maxX) / 2;
        const dz = z - (tower.minZ + tower.maxZ) / 2;

        sidesSeen.add(
          Math.abs(dx) > Math.abs(dz)
            ? dx > 0
              ? "east"
              : "west"
            : dz > 0
              ? "south"
              : "north",
        );
      }
    }

    expect(sidesSeen.size).toBeGreaterThanOrEqual(2);
  });

  it("the chase graph has no one-exit places: from any spawn a second way out exists", () => {
    for (const s of ARENA_LAYOUT.spawnPoints) {
      const i = cellOf(s.x);
      const j = cellOf(s.z);
      let open = 0;

      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        if (!world.isBlocked(cellX(i + di * 3), cellZ(j + dj * 3), 0, 0.5)) {
          open++;
        }
      }

      expect(open, s.label).toBeGreaterThanOrEqual(2);
    }
  });
});
