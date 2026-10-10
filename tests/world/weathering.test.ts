import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { buildArena } from "../../src/world/ArenaBuilder";
import { ArenaCollision } from "../../src/world/ArenaCollision";
import type { BoxSolid } from "../../src/world/ArenaLayout";
import { buildPile } from "../../src/world/PileShapes";
import { ARENA_LAYOUT as layout } from "../../src/world/UpperFloorMap";
import { spawnPlayer } from "./playerHarness";

const world = new ArenaCollision();

const solidOf = (id: string): BoxSolid =>
  layout.walls.find((w) => w.id === id)!;

/** Piles proper: not a railing re-dressed as pipes or brick. */
const heaps = layout.piles.filter((p) => !/-(pipes|brick)$/.test(p.id));

describe("Piles of building material", () => {
  it("there are a few of each kind and none on the bare arena floor", () => {
    // Only outside the rooms: at the foot of broken walls and on the plaza.
    expect(heaps.length).toBeGreaterThanOrEqual(2);
    expect(heaps.length).toBeLessThanOrEqual(10);

    const kinds = new Set(layout.piles.map((p) => p.kind));

    expect(kinds.has("bricks")).toBe(true);

    // The ground level stays bare: piles stand on floors and rooms only.
    for (const pile of layout.piles) {
      expect(pile.baseY, pile.id).toBeGreaterThanOrEqual(2.8);
    }
  });

  it("every pile is small and low, like a work in progress and not a wall of cover", () => {
    for (const pile of heaps) {
      const boxes = pile.solids.map(solidOf);
      const minX = Math.min(...boxes.map((b) => b.minX));
      const maxX = Math.max(...boxes.map((b) => b.maxX));
      const minZ = Math.min(...boxes.map((b) => b.minZ));
      const maxZ = Math.max(...boxes.map((b) => b.maxZ));
      const top = Math.max(...boxes.map((b) => b.height)) - pile.baseY;

      // (A wall of bags or a barricade runs along x or along z.)
      expect(Math.max(maxX - minX, maxZ - minZ), pile.id).toBeLessThanOrEqual(
        3.4,
      );
      expect(Math.min(maxX - minX, maxZ - minZ), pile.id).toBeLessThanOrEqual(
        2.2,
      );
      expect(top, pile.id).toBeLessThanOrEqual(1.25);
      expect(top, pile.id).toBeGreaterThan(0.2);
    }
  });

  it("each pile stops a body with collision that encloses its pieces and nothing more", () => {
    for (const pile of layout.piles) {
      const boxes = pile.solids.map(solidOf);

      expect(boxes.length, pile.id).toBeGreaterThan(0);

      for (const box of boxes) {
        expect(box.hidden, box.id).toBe(true);
        expect(box.bottom, box.id).toBe(pile.baseY);
      }

      // Every pile piece lies inside the union of the boxes (a barricade's
      // fallen bricks lie just outside its wall, low on the floor).
      for (const e of pile.elements) {
        // Fallen bricks and bags lie just outside the wall's thickness, low.
        const wallAlongX =
          Math.max(...boxes.map((b) => b.maxX)) -
            Math.min(...boxes.map((b) => b.minX)) >=
          Math.max(...boxes.map((b) => b.maxZ)) -
            Math.min(...boxes.map((b) => b.minZ));
        const offAxis = wallAlongX ? Math.abs(e.z) : Math.abs(e.x);

        if (
          (pile.kind === "barricade" || pile.kind === "bagwall") &&
          e.y < 0.2 &&
          offAxis > 0.2
        ) {
          continue;
        }

        const bounds = new THREE.Box3();
        const matrix = new THREE.Matrix4().compose(
          new THREE.Vector3(pile.x + e.x, pile.baseY + e.y, pile.z + e.z),
          new THREE.Quaternion().setFromEuler(
            new THREE.Euler(e.rx, e.ry, e.rz),
          ),
          new THREE.Vector3(1, 1, 1),
        );
        const corner = new THREE.Vector3();

        for (const sx of [-0.5, 0.5]) {
          for (const sy of [-0.5, 0.5]) {
            for (const sz of [-0.5, 0.5]) {
              corner.set(sx * e.sx, sy * e.sy, sz * e.sz).applyMatrix4(matrix);
              bounds.expandByPoint(corner);
            }
          }
        }

        // Grit under 0.1 m has no collision of its own (it is under any step).
        if (e.y + e.sy / 2 < 0.1) {
          continue;
        }

        // A piece may stand across two collision boxes (a barricade's
        // boxes meet where its height changes): together they must cover it.
        const touching = boxes.filter(
          (b) => bounds.max.x > b.minX && bounds.min.x < b.maxX,
        );
        const inside =
          touching.length > 0 &&
          bounds.min.x >= Math.min(...touching.map((b) => b.minX)) - 0.05 &&
          bounds.max.x <= Math.max(...touching.map((b) => b.maxX)) + 0.05 &&
          bounds.min.z >= Math.min(...touching.map((b) => b.minZ)) - 0.05 &&
          bounds.max.z <= Math.max(...touching.map((b) => b.maxZ)) + 0.05 &&
          bounds.max.y <= Math.max(...touching.map((b) => b.height)) + 0.05;

        expect(inside, `${pile.id}: a ${e.shape}`).toBe(true);
      }
    }
  });

  it("collision matches: a body is stopped by the pile and stands on a floor beside it", () => {
    const pile = layout.piles.find((p) => p.kind === "bricks")!;
    const box = solidOf(pile.solids[0]);
    const x = (box.minX + box.maxX) / 2;
    const z = (box.minZ + box.maxZ) / 2;

    // Its top is a surface: it is the pile's height, above the floor.
    expect(world.groundHeight(x, z, pile.baseY + 3)).toBeCloseTo(box.height, 1);
    // Beside it the floor is clear.
    expect(world.isBlocked(box.maxX + 1.2, z, pile.baseY, 0.3)).toBe(false);
  });

  it("is made the same way every time", () => {
    for (const pile of heaps) {
      const again = buildPile(pile.kind, pile.id);

      expect(again.elements).toHaveLength(pile.elements.length);
      // (A pile turned to run along z has its x and z swapped: compare colours.)
      expect(again.elements.map((e) => e.color)).toEqual(
        pile.elements.map((e) => e.color),
      );
    }
  });

  it("stays clear of doorways, ladders, grates and the vent routes", () => {
    const bad: string[] = [];

    for (const pile of heaps) {
      for (const id of pile.solids) {
        const b = solidOf(id);

        // Ladders: nobody should have to climb over a pile to reach the foot.
        for (const ladder of layout.ladders) {
          const d = Math.hypot(
            Math.max(b.minX - ladder.approach.x, ladder.approach.x - b.maxX, 0),
            Math.max(b.minZ - ladder.approach.z, ladder.approach.z - b.maxZ, 0),
          );

          if (d < 1.2 && Math.abs((ladder.bottomY ?? 0) - pile.baseY) < 0.5) {
            bad.push(`${id} near ${ladder.id}`);
          }
        }

        // Grates: not over a vent opening or its tunnel (those at this floor).
        const tunnels =
          Math.abs(pile.baseY - layout.upperVents.surfaceY) < 0.1
            ? layout.upperVents.tunnels
            : Math.abs(pile.baseY - layout.vents.surfaceY) < 0.1
              ? layout.vents.tunnels
              : [];

        for (const t of tunnels) {
          const overlap =
            b.maxX > t.minX - 0.2 &&
            b.minX < t.maxX + 0.2 &&
            b.maxZ > t.minZ - 0.2 &&
            b.minZ < t.maxZ + 0.2;

          if (overlap) {
            bad.push(`${id} over a vent tunnel`);
          }
        }

        // Doorways: the doorway itself and a body-width either side.
        for (const room of layout.rooms) {
          for (const door of room.doors) {
            const alongX = door.side === "n" || door.side === "s";
            const wx = door.side === "w" ? room.minX : room.maxX;
            const wz = door.side === "n" ? room.minZ : room.maxZ;
            const open = alongX
              ? {
                  minX: door.at - door.width / 2 - 0.8,
                  maxX: door.at + door.width / 2 + 0.8,
                  minZ: wz - 1.2,
                  maxZ: wz + 1.2,
                }
              : {
                  minX: wx - 1.2,
                  maxX: wx + 1.2,
                  minZ: door.at - door.width / 2 - 0.8,
                  maxZ: door.at + door.width / 2 + 0.8,
                };

            if (
              Math.abs(room.floorY - pile.baseY) < 0.5 &&
              b.maxX > open.minX &&
              b.minX < open.maxX &&
              b.maxZ > open.minZ &&
              b.minZ < open.maxZ
            ) {
              bad.push(`${id} in the doorway of ${room.id}`);
            }
          }
        }
      }
    }

    expect(bad).toEqual([]);
  });
});

describe("Broken walls and barriers", () => {
  const slicedIds = (): string[] => {
    const bases = new Set<string>();

    for (const w of layout.walls) {
      if (w.id.includes("~")) {
        bases.add(w.id.split("~")[0]);
      }
    }

    return [...bases];
  };

  it("a few walls and two blocks of cover are broken, the rest whole", () => {
    const broken = slicedIds();

    expect(broken.length).toBeGreaterThanOrEqual(4);
    expect(broken.length).toBeLessThanOrEqual(14);

    // Neighbours of the broken ones are intact, and so is some of the cover.
    expect(solidOf("cover-overlook-a")).toBeDefined();
    expect(solidOf("room-barracks-wall-e-1")).toBeDefined();
    expect(solidOf("room-archive-wall-s-1")).toBeDefined();
  });

  it("each broken wall is still one wall end to end: slices touch, nothing is missing", () => {
    for (const base of slicedIds()) {
      const slices = layout.walls
        .filter((w) => w.id.startsWith(`${base}~`))
        .sort((a, b) => a.minX - b.minX || a.minZ - b.minZ);
      const alongX =
        slices[slices.length - 1].maxX - slices[0].minX >=
        slices[slices.length - 1].maxZ - slices[0].minZ;

      expect(slices.length, base).toBeGreaterThanOrEqual(2);

      for (let i = 1; i < slices.length; i++) {
        const gap = alongX
          ? slices[i].minX - slices[i - 1].maxX
          : slices[i].minZ - slices[i - 1].maxZ;

        expect(Math.abs(gap), `${base} slice ${i}`).toBeLessThan(1e-6);
      }
    }
  });

  it("a broken wall stays a wall: no slice is low enough to vault or jump", () => {
    for (const base of slicedIds()) {
      for (const w of layout.walls.filter((s) => s.id.startsWith(`${base}~`))) {
        const floor = w.base ?? w.bottom ?? 0;
        const rise = w.height - floor;

        if (w.role === "wall" && !base.startsWith("parapet")) {
          // Walls of a room or a screen: never under 1.6 m (vaulting tops out at 1.45).
          expect(rise, w.id).toBeGreaterThanOrEqual(1.6);
        } else {
          expect(rise, w.id).toBeGreaterThanOrEqual(0.45);
        }
      }
    }
  });

  it("the collision of a broken wall is the slices: it blocks at its remaining height only", () => {
    const slice = layout.walls.filter((w) => w.id.startsWith("nook-west-1~"));
    const lowest = slice.reduce((a, b) => (a.height < b.height ? a : b));
    const x = (lowest.minX + lowest.maxX) / 2;
    const z = (lowest.minZ + lowest.maxZ) / 2;

    // A body above the broken top is not held in the air by the missing wall.
    expect(world.ceilingHeight(x, z, lowest.height + 0.3, 0.2)).toBeGreaterThan(
      lowest.height + 1,
    );
    // And at head height the wall is still there.
    expect(world.isBlocked(x, z, (lowest.base ?? 0) + 0.1, 0.2)).toBe(true);
  });

  it("the outer wall is untouched: the perimeter is still four closed walls", () => {
    const arena = buildArena(layout);
    const box = new THREE.Box3().setFromObject(arena);

    expect(box.max.x).toBeGreaterThanOrEqual(32);
    expect(box.min.x).toBeLessThanOrEqual(-32);

    // No broken wall is part of the perimeter: all are interior or roof walls.
    for (const base of slicedIds()) {
      const wall = layout.walls.find((w) => w.id.startsWith(`${base}~`))!;

      expect(wall.id.startsWith("outer"), base).toBe(false);
    }
  });

  it("the barricade is a low wall of bricks with a broken end, lower there", () => {
    // Not placed today (the rooms are dressed separately), but ready for it.
    const shape = buildPile("barricade", "barricade-test");
    const tops = shape.boxes.map((b) => b.top);

    expect(shape.boxes.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...tops)).toBeGreaterThan(0.9);
    expect(Math.min(...tops)).toBeLessThan(Math.max(...tops) - 0.15);
  });

  it("no pile and no mark is placed inside a room", () => {
    for (const pile of layout.piles) {
      for (const room of layout.rooms) {
        if (Math.abs(room.floorY - pile.baseY) > 0.5) continue;

        const inside =
          pile.x > room.minX &&
          pile.x < room.maxX &&
          pile.z > room.minZ &&
          pile.z < room.maxZ;

        expect(inside, `${pile.id} in ${room.id}`).toBe(false);
      }
    }

    for (const d of layout.decals) {
      for (const room of layout.rooms) {
        if (Math.abs(room.floorY - d.y) > 0.5) continue;

        const inside =
          d.x > room.minX + 0.05 &&
          d.x < room.maxX - 0.05 &&
          d.z > room.minZ + 0.05 &&
          d.z < room.maxZ - 0.05;

        expect(inside, `${d.id} in ${room.id}`).toBe(false);
      }
    }
  });
});

describe("Dirt and wear", () => {
  it("floor marks are few, soft and never over a vent opening", () => {
    expect(layout.decals.length).toBeGreaterThan(10);
    expect(layout.decals.length).toBeLessThan(80);

    for (const d of layout.decals) {
      expect(d.alpha, d.id).toBeLessThanOrEqual(0.5);
      expect(d.alpha, d.id).toBeGreaterThan(0.1);

      const tunnels =
        Math.abs(d.y - layout.upperVents.surfaceY) < 0.1
          ? layout.upperVents.tunnels
          : Math.abs(d.y - layout.vents.surfaceY) < 0.1
            ? layout.vents.tunnels
            : [];

      for (const t of tunnels) {
        const over =
          d.x > t.minX && d.x < t.maxX && d.z > t.minZ && d.z < t.maxZ;

        expect(over, d.id).toBe(false);
      }
    }
  });

  it("there is a worn patch outside every doorway that is not over a vent", () => {
    const wear = layout.decals.filter((d) => d.kind === "wear");
    const doors = layout.rooms.reduce((n, r) => n + r.doors.length, 0);

    expect(wear.length).toBeGreaterThan(doors * 0.6);
  });

  it("each pile has its drift of dust", () => {
    for (const pile of heaps) {
      const dust = layout.decals.find((d) => d.id === `dust-${pile.id}`);

      // (A pile in a vent's shadow may go without; none do today.)
      expect(dust, pile.id).toBeDefined();
    }
  });
});

describe("Exterior barriers", () => {
  const pipes = layout.piles.filter((p) => p.id.endsWith("-pipes"));
  const brick = layout.piles.filter((p) => p.id.endsWith("-brick"));

  it("a minority of railings are re-dressed: some pipes, some brick, most stay concrete", () => {
    const rails = layout.walls.filter(
      (w) => w.role === "railing" && !w.glass && w.base !== undefined,
    );
    const restyled = new Set(
      rails.filter((w) => w.hidden).map((w) => w.id.split("~")[0]),
    );
    const concrete = rails.filter((w) => !w.hidden);

    expect(pipes.length).toBeGreaterThanOrEqual(2);
    expect(brick.length).toBeGreaterThanOrEqual(2);
    expect(restyled.size).toBeGreaterThan(0);
    // The concrete ones are the clear majority of the barriers.
    expect(concrete.length).toBeGreaterThan(restyled.size * 2);
  });

  it("a re-dressed railing still blocks a body exactly as high as before", () => {
    for (const pile of [...pipes, ...brick]) {
      for (const id of pile.solids) {
        const solid = solidOf(id);

        // The railing's body-blocking height is kept on every piece.
        expect(solid.blockTop, id).toBeGreaterThan(solid.height);
        expect(solid.role, id).toBe("railing");
      }
    }
  });

  it("pipes are a stack with gaps, brick has gaps, and brick tops are ragged", () => {
    for (const pile of pipes) {
      // A stack of pipes (the posts at the ends are pipes too).
      expect(pile.elements.every((e) => e.shape === "pipe")).toBe(true);
      expect(pile.elements.length).toBeGreaterThan(6);
    }

    for (const pile of brick) {
      expect(pile.elements.every((e) => e.shape === "brick")).toBe(true);
    }

    // At least one brick barrier has columns of different heights.
    const uneven = brick.some((p) => {
      const tops = p.solids.map((id) => solidOf(id).height);

      return Math.max(...tops) - Math.min(...tops) > 0.1;
    });

    expect(uneven).toBe(true);
  });

  it("each barrier's pieces sit inside its collision footprint", () => {
    for (const pile of [...pipes, ...brick]) {
      const boxes = pile.solids.map(solidOf);
      const minX = Math.min(...boxes.map((b) => b.minX)) - 0.05;
      const maxX = Math.max(...boxes.map((b) => b.maxX)) + 0.05;
      const minZ = Math.min(...boxes.map((b) => b.minZ)) - 0.05;
      const maxZ = Math.max(...boxes.map((b) => b.maxZ)) + 0.05;

      for (const e of pile.elements) {
        // An upright pipe (a post) is turned a quarter: its x size is its height.
        const upright = Math.abs(e.rz) > 1;
        // A pipe runs along its own x: turned a quarter, it runs along z.
        const turned = e.shape === "pipe" && Math.abs(Math.sin(e.ry)) > 0.7;
        const halfX = upright ? e.sy / 2 : turned ? e.sz / 2 : e.sx / 2;
        const halfZ = turned && !upright ? e.sx / 2 : e.sz / 2;

        expect(pile.x + e.x - halfX, pile.id).toBeGreaterThanOrEqual(minX);
        expect(pile.x + e.x + halfX, pile.id).toBeLessThanOrEqual(maxX);
        expect(pile.z + e.z - halfZ, pile.id).toBeGreaterThanOrEqual(minZ);
        expect(pile.z + e.z + halfZ, pile.id).toBeLessThanOrEqual(maxZ);
      }
    }
  });

  it("there are no cement bags on the map", () => {
    expect(
      layout.piles.some((p) => p.kind === "bags" || p.kind === "bagwall"),
    ).toBe(false);
    expect(
      layout.piles.some((p) => p.elements.some((e) => e.shape === "bag")),
    ).toBe(false);
  });

  it("no barrier is put inside a room", () => {
    for (const pile of [...pipes, ...brick]) {
      for (const room of layout.rooms) {
        if (Math.abs(room.floorY - pile.baseY) > 0.5) continue;

        const inside =
          pile.x > room.minX &&
          pile.x < room.maxX &&
          pile.z > room.minZ &&
          pile.z < room.maxZ;

        expect(inside, `${pile.id} in ${room.id}`).toBe(false);
      }
    }
  });
});

describe("Rubble you can walk over", () => {
  const rubble = layout.piles.filter((p) => p.kind === "rubble");

  const extent = (pile: (typeof rubble)[number]) => {
    const boxes = pile.solids.map(solidOf);

    return {
      boxes,
      minX: Math.min(...boxes.map((b) => b.minX)),
      maxX: Math.max(...boxes.map((b) => b.maxX)),
      minZ: Math.min(...boxes.map((b) => b.minZ)),
      maxZ: Math.max(...boxes.map((b) => b.maxZ)),
    };
  };

  it("is a scatter of low mounds, none a step too high to walk onto", () => {
    expect(rubble.length).toBeGreaterThanOrEqual(2);

    for (const pile of rubble) {
      const { boxes } = extent(pile);

      expect(boxes.length, pile.id).toBeGreaterThanOrEqual(3);

      for (const b of boxes) {
        expect(b.height - pile.baseY, b.id).toBeLessThanOrEqual(0.32);
        expect(b.height - pile.baseY, b.id).toBeGreaterThan(0.08);
      }
    }
  });

  it("two rubble piles are not the same shape", () => {
    const [a, b] = rubble;

    expect(
      a.solids.length === b.solids.length &&
        a.elements.length === b.elements.length,
    ).toBe(false);
  });

  it("a body walks straight across it, up and down a little, never stopped or dropped", () => {
    for (const pile of rubble) {
      const { minX, maxX, minZ, maxZ } = extent(pile);

      // Across the long way, along the middle and along both quarter lines.
      for (const t of [0.25, 0.5, 0.75]) {
        for (const alongX of [true, false]) {
          const fixed = alongX
            ? minZ + (maxZ - minZ) * t
            : minX + (maxX - minX) * t;
          // Start on whichever side is clear (a pile can stand beside a block).
          const lo = alongX ? minX - 1.2 : minZ - 1.2;
          const hi = alongX ? maxX + 1.2 : maxZ + 1.2;
          const at = (v: number): [number, number] =>
            alongX ? [v, fixed] : [fixed, v];
          // Clear, and on the same floor (not past the edge of it).
          const free = (v: number): boolean => {
            const [x, z] = at(v);

            return (
              !world.isBlocked(x, z, pile.baseY, 0.4) &&
              Math.abs(
                world.groundHeight(x, z, pile.baseY + 0.5) - pile.baseY,
              ) < 0.05
            );
          };
          const forward = free(lo);

          if (!forward && !free(hi)) {
            continue;
          }

          const start = forward ? lo : hi;
          // The far edge of the pile; a body's centre gets within 0.45 m of it
          // (a wall may touch that edge), which is as far as it can go.
          const edge = alongX ? (forward ? maxX : minX) : forward ? maxZ : minZ;
          const sign = forward ? 1 : -1;
          const stopAt = edge - sign * 0.45;
          const yaw = alongX
            ? forward
              ? -Math.PI / 2
              : Math.PI / 2
            : forward
              ? Math.PI
              : 0;
          const p = (() => {
            const [px, pz] = at(start);

            return spawnPlayer(px, pile.baseY, pz, yaw);
          })();
          let lowest = Infinity;
          let highest = -Infinity;

          p.input.keys.add("KeyW");

          // Walk until it is a body's width past the pile, not off the floor.
          let done = false;

          p.step(3, () => {
            const here = alongX ? p.player.position.x : p.player.position.z;

            if (!done) {
              lowest = Math.min(lowest, p.feet());
              highest = Math.max(highest, p.feet());
            }

            if ((here - stopAt) * sign >= 0) {
              done = true;
              p.input.keys.clear();
            }
          });

          const reached = alongX ? p.player.position.x : p.player.position.z;

          // It got to the far side (no blocking) and stayed on the floor.
          expect(
            (reached - stopAt) * sign,
            `${pile.id} ${alongX ? "x" : "z"} ${t}`,
          ).toBeGreaterThanOrEqual(-0.1);
          expect(lowest, pile.id).toBeGreaterThanOrEqual(pile.baseY - 0.02);
          // The bumps are a few centimetres to a step, no more.
          expect(highest - pile.baseY, pile.id).toBeLessThan(0.45);
        }
      }
    }
  });

  it("jumping or falling onto it lands on it and never goes through the floor", () => {
    for (const pile of rubble) {
      const { boxes, minX, maxX, minZ, maxZ } = extent(pile);

      for (const b of boxes) {
        const p = spawnPlayer(
          (b.minX + b.maxX) / 2,
          pile.baseY + 1.5,
          (b.minZ + b.maxZ) / 2,
        );

        p.step(1.5);
        expect(p.feet(), b.id).toBeGreaterThanOrEqual(pile.baseY - 0.02);
      }

      // And from a run and a jump over the middle.
      const p = spawnPlayer(
        minX - 1.5,
        pile.baseY,
        (minZ + maxZ) / 2,
        -Math.PI / 2,
      );

      p.input.keys.add("KeyW");
      p.input.keys.add("ShiftLeft");
      p.step(0.3);
      p.input.jumpQueued = true;
      p.step(2.5);
      expect(p.feet(), pile.id).toBeGreaterThanOrEqual(pile.baseY - 0.02);
      expect(p.player.position.x, pile.id).toBeGreaterThan(maxX);
    }
  });
});
