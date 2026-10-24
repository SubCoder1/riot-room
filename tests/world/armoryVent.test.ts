import { describe, expect, it } from "vitest";

import { VentDrips } from "../../src/vfx/VentDrips";
import { ROOF_HIGH } from "../../src/world/ArenaLayout";
import {
  ARMORY_VENT_BLOCKS,
  ARMORY_VENT_HOLE,
  ARMORY_VENT_TOP,
  VENT_HATCH_ID,
  grilleBars,
  ventDripPoints,
} from "../../src/world/ArmoryVent";
import { ARMORY } from "../../src/world/ArmoryMechanisms";
import { ARENA_LAYOUT } from "../../src/world/UpperFloorMap";
import { spawnPlayer, world } from "./playerHarness";

const HOLE = ARMORY_VENT_HOLE;
const CX = (HOLE.minX + HOLE.maxX) / 2;
const CZ = (HOLE.minZ + HOLE.maxZ) / 2;

describe("The Armory's overhead vent", () => {
  it("is a hole in the Armory's roof, closed by a hatch that fits it", () => {
    const hatch = ARENA_LAYOUT.hatches.find((h) => h.id === VENT_HATCH_ID)!;

    expect(hatch).toBeDefined();
    // Level with the slab under the roof, in a shallow well.
    expect(hatch.top).toBeCloseTo(ARMORY_VENT_TOP, 6);
    expect(hatch.top).toBeLessThan(ROOF_HIGH - 0.2);
    // Inside the room, clear of every wall.
    expect(HOLE.minX).toBeGreaterThan(-31.7);
    expect(HOLE.maxX).toBeLessThan(-20.5);
    expect(HOLE.minZ).toBeGreaterThan(5.3);
    expect(HOLE.maxZ).toBeLessThan(12);
    // A body (1 m across) fits through it.
    expect(HOLE.maxX - HOLE.minX).toBeGreaterThanOrEqual(1.19);
    expect(HOLE.maxZ - HOLE.minZ).toBeGreaterThanOrEqual(1.19);
  });

  it("is clear of the beams, the duct and the table", () => {
    // Beams at x -30.2, -27.1, -24.0, -21.1 with 0.3 m flanges.
    for (const beam of [-30.2, -27.1, -24.0, -21.1]) {
      expect(HOLE.maxX < beam - 0.15 || HOLE.minX > beam + 0.15).toBe(true);
    }

    // Duct (z 5.55 to 6.35) and table (x -27.55 to -25.05, z 8 to 9.2).
    expect(HOLE.minZ).toBeGreaterThan(9.2);
  });

  it("is solid while shut, and a way down once opened: from the roof into the room", () => {
    const fresh = spawnPlayer(CX, ROOF_HIGH, CZ - 1.4, Math.PI);

    // Shut: walks across the roof and is held up by the grille.
    fresh.input.keys.add("KeyW");
    fresh.step(0.5);
    expect(fresh.feet()).toBeGreaterThan(ARMORY_VENT_TOP - 0.05);

    // Opened: the same walk drops through the hole into the Armory.
    world.setOpen(VENT_HATCH_ID, true);

    const p = spawnPlayer(CX, ROOF_HIGH, CZ - 1.4, Math.PI);

    p.input.keys.add("KeyW");
    p.step(0.45);
    p.input.keys.delete("KeyW");
    p.step(3);

    const { x, z } = p.player.position;

    expect(p.feet()).toBeCloseTo(ARMORY.FLOOR, 1);
    expect(x).toBeGreaterThan(-31.7);
    expect(x).toBeLessThan(-20.5);
    expect(z).toBeGreaterThan(5.3);
    expect(z).toBeLessThan(12);

    // And they can walk off from where they landed: not stuck.
    p.input.yaw = 0;
    p.input.keys.add("KeyW");

    const before = { x, z };

    p.step(1);
    expect(
      Math.hypot(
        p.player.position.x - before.x,
        p.player.position.z - before.z,
      ),
    ).toBeGreaterThan(1);

    world.setOpen(VENT_HATCH_ID, false);
  });

  it("stays open for good: nothing shuts it, and the hole is clear of any collider", () => {
    world.setOpen(VENT_HATCH_ID, true);

    // A body can stand in the opening at any height from the roof to the floor.
    for (let y = ARMORY.FLOOR; y <= ROOF_HIGH; y += 0.5) {
      expect(world.isBlocked(CX, CZ, y, 0.5)).toBe(false);
    }

    world.setOpen(VENT_HATCH_ID, false);
  });

  it("runs full length between the tube lines, with solid concrete on every line", () => {
    const lines = [-30.2, -27.1, -24.0, -21.1];

    // No vent crosses a tube line, and each line has a gap of at least 0.5 m
    // between the vents either side of it.
    for (const line of lines) {
      for (const block of ARMORY_VENT_BLOCKS) {
        expect(block.maxX <= line - 0.2 || block.minX >= line + 0.2).toBe(true);
      }

      const west = ARMORY_VENT_BLOCKS.filter((b) => b.maxX <= line);
      const east = ARMORY_VENT_BLOCKS.filter((b) => b.minX >= line);
      const gap =
        Math.min(...east.map((b) => b.minX)) -
        Math.max(...west.map((b) => b.maxX));

      // (The last line has no vent east of it.)
      if (east.length > 0) {
        expect(gap).toBeGreaterThanOrEqual(0.5);
        expect(gap).toBeLessThan(1);
      }
    }

    // The vents are long: most of them span the stretch between two lines.
    const long = ARMORY_VENT_BLOCKS.filter((b) => b.maxX - b.minX >= 2);

    expect(long.length).toBeGreaterThanOrEqual(2);
  });

  it("is reached from the roof: the ladder up from the terrace tops out on it", () => {
    const ladder = ARENA_LAYOUT.ladders.find((l) => l.id === "secret-terrace")!;

    expect(ladder.topY).toBe(ROOF_HIGH);
  });
});

describe("The grille", () => {
  it("is open grating: bars with gaps between, not a plate", () => {
    const bars = grilleBars(HOLE);
    const w = (HOLE.maxX - HOLE.minX) * 0.96;
    const d = (HOLE.maxZ - HOLE.minZ) * 0.96;
    const top = bars.filter(([, y]) => y === -0.04);
    // The bars across the middle (not the frame): thin, with wide gaps.
    const across = top.filter(([, , , sx, , sz]) => sx > w * 0.8 && sz < 0.05);

    expect(across.length).toBeGreaterThanOrEqual(7);

    // The share of the opening covered from above is small.
    const covered = top.reduce((sum, [, , , sx, , sz]) => sum + sx * sz, 0);

    expect(covered / (w * d)).toBeLessThan(0.45);
    expect(covered / (w * d)).toBeGreaterThan(0.15);
  });

  it("drips from gaps in it: each point is between two bars and clear of the straps", () => {
    const hingeX = HOLE.minX + 0.02;
    const d = (HOLE.maxZ - HOLE.minZ) * 0.96;
    const bars = grilleBars(HOLE);

    for (const point of ventDripPoints()) {
      const xl = point.x - hingeX;
      const zl = point.z - CZ;

      expect(Math.abs(zl)).toBeLessThan(d / 2 - 0.05);

      for (const [bx, , bz, sx, , sz] of bars) {
        const insideX = Math.abs(xl - bx) < sx / 2 + 0.01;
        const insideZ = Math.abs(zl - bz) < sz / 2 + 0.01;

        expect(insideX && insideZ).toBe(false);
      }
    }
  });
});

describe("The drips", () => {
  const points = ventDripPoints();
  const ceiling = ARMORY.FLOOR + 6.5;

  function seeded(): () => number {
    let s = 7;

    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;

      return s / 4294967296;
    };
  }

  it("fall one at a time from the grille to the floor, in the room, and are intermittent", () => {
    const drips = new VentDrips(points, ceiling, ARMORY.FLOOR, seeded());
    let falling = 0;
    let most = 0;
    let landings = 0;
    let wasFalling = new Set<number>();

    for (let t = 0; t < 60; t += 1 / 60) {
      drips.update(1 / 60);

      const states = drips.states();
      const now = new Set<number>();

      states.forEach((s, i) => {
        if (s.phase === "fall") {
          now.add(i);
          expect(s.y).toBeLessThanOrEqual(ceiling);
          expect(s.y).toBeGreaterThanOrEqual(ARMORY.FLOOR);
        }
      });
      falling += now.size > 0 ? 1 : 0;
      most = Math.max(most, now.size);

      for (const i of wasFalling) {
        if (!now.has(i)) {
          landings++;
        }
      }

      wasFalling = now;
    }

    // Some drop is in the air some of the time, but far from all the time.
    expect(falling).toBeGreaterThan(60);
    expect(falling).toBeLessThan(60 * 60 * 0.6);
    expect(landings).toBeGreaterThan(8);
    expect(most).toBeLessThan(points.length + 1);
  });

  it("do not start together or keep one rhythm", () => {
    const drips = new VentDrips(points, ceiling, ARMORY.FLOOR, seeded());
    const firstFall: number[] = [];
    const seen = new Set<number>();

    for (let t = 0; t < 12; t += 1 / 60) {
      drips.update(1 / 60);
      drips.states().forEach((s, i) => {
        if (s.phase === "fall" && !seen.has(i)) {
          seen.add(i);
          firstFall.push(t);
        }
      });
    }

    expect(firstFall.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...firstFall) - Math.min(...firstFall)).toBeGreaterThan(
      0.3,
    );
  });
});
